import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/cors.ts';
/**
 * ORDER WORKER - Live Order Pipeline Processor
 * Principal Backend Engineer Implementation
 * 
 * Processes jobs from queue using SKIP LOCKED pattern for high concurrency.
 * Implements OCC (Optimistic Concurrency Control) for inventory management.
 * 
 * Key features:
 * - SKIP LOCKED pattern prevents worker contention
 * - Calls process_order_with_occ for transactional order creation
 * - Idempotent processing (safe to retry)
 * - Comprehensive error handling with exponential backoff
 * - Real-time metrics updates via update_metrics_on_order_completion
 */ const MAX_JOBS_PER_RUN = 10;
const LOCK_TIMEOUT_SECONDS = 30;
const WORKER_ID = `worker_${crypto.randomUUID().substring(0, 8)}`;
Deno.serve(async (req)=>{
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  const url = new URL(req.url);
  const jobTypeFilter = url.searchParams.get('job_type');
  const maxJobs = parseInt(url.searchParams.get('max_jobs') || String(MAX_JOBS_PER_RUN));
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const workerId = WORKER_ID;
    console.log(`Order worker ${workerId} starting (max jobs: ${maxJobs})`);
    const processedJobs = [];
    let jobsProcessed = 0;
    while(jobsProcessed < maxJobs){
      const job = await acquireNextJob(supabaseClient, workerId);
      if (!job) {
        console.log('No more jobs in queue');
        break;
      }
      console.log(`Processing job ${job.id} of type ${job.job_type}`);
      let result;
      switch(job.job_type){
        case 'finalize_order':
          result = await finalizeOrder(supabaseClient, job.payload);
          break;
        case 'handle_payment_failure':
          result = await handlePaymentFailure(supabaseClient, job.payload);
          break;
        case 'process_refund':
          result = await processRefund(supabaseClient, job.payload);
          break;
        default:
          result = {
            success: false,
            message: `Unknown job type: ${job.job_type}`,
            should_retry: false
          };
      }
      await updateJobStatus(supabaseClient, job.id, result.success, result.message, result.should_retry, job.attempts);
      if (job.payload?.webhook_event_id) {
        await updateWebhookEventStatus(supabaseClient, job.payload.webhook_event_id, result.success ? 'completed' : 'failed', result.message);
      }
      processedJobs.push({
        job_id: job.id,
        job_type: job.job_type,
        success: result.success,
        message: result.message,
        data: result.data
      });
      jobsProcessed++;
    }
    return new Response(JSON.stringify({
      success: true,
      worker_id: workerId,
      jobs_processed: jobsProcessed,
      results: processedJobs
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Order worker error:', error);
    return new Response(JSON.stringify({
      error: 'Worker execution failed',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
async function acquireNextJob(supabase, workerId) {
  try {
    const { data, error } = await supabase.rpc('acquire_next_job', {
      p_worker_id: workerId,
      p_lock_timeout_seconds: LOCK_TIMEOUT_SECONDS
    });
    if (error) {
      console.error('Failed to acquire job:', error);
      return null;
    }
    return data?.[0] || null;
  } catch (error) {
    console.error('Error acquiring job:', error);
    return null;
  }
}
async function finalizeOrder(supabase, jobData) {
  try {
    const { payment_intent_id, webhook_event_id } = jobData;
    if (!payment_intent_id) {
      return {
        success: false,
        message: 'Missing payment_intent_id',
        should_retry: false
      };
    }
    const { error: updateError } = await supabase.from('payment_intents').update({
      status: 'succeeded',
      updated_at: new Date().toISOString()
    }).eq('payment_intent_id', payment_intent_id);
    if (updateError) {
      console.error('Failed to update payment intent:', updateError);
      return {
        success: false,
        message: 'Failed to update payment intent status',
        should_retry: true
      };
    }
    const { data, error } = await supabase.rpc('process_order_with_occ', {
      p_payment_intent_id: payment_intent_id,
      p_webhook_event_id: webhook_event_id
    });
    if (error) {
      const shouldRetry = error.message?.includes('Insufficient inventory');
      return {
        success: false,
        message: error.message,
        should_retry: shouldRetry
      };
    }
    if (!data.success) {
      return {
        success: false,
        message: data.message,
        should_retry: false
      };
    }
    const { data: metricsData, error: metricsError } = await supabase.rpc('update_metrics_on_order_completion', {
      p_order_id: data.order_id
    });
    if (metricsError) {
      console.error('Failed to update metrics:', metricsError);
    } else {
      console.log('Metrics updated:', metricsData);
    }
    
    // ========================================================================
    // SEND ORDER CONFIRMATION EMAIL
    // ========================================================================
    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(product_name, quantity, price_at_purchase, product_variants(products(images)))
        `)
        .eq('id', data.order_id)
        .single();
      
      if (orderData) {
        const { data: userData } = await supabase.auth.admin.getUserById(orderData.user_id);
        
        if (userData?.user?.email) {
          // Trigger send-email Edge Function
          await supabase.functions.invoke('send-email', {
            body: {
              email_type: 'order_confirmation',
              recipient_email: userData.user.email,
              recipient_user_id: orderData.user_id,
              recipient_name: orderData.shipping_name,
              reference_id: orderData.id,
              reference_type: 'order',
              template_data: {
                customerName: orderData.shipping_name,
                orderNumber: orderData.order_number,
                orderDate: new Date(orderData.created_at).toLocaleDateString('en-NP'),
                items: orderData.order_items.map((item: any) => ({
                  name: item.product_name,
                  quantity: item.quantity,
                  price: item.price_at_purchase,
                })),
                subtotal: orderData.subtotal_cents,
                shipping: orderData.shipping_cents,
                tax: orderData.tax_cents,
                total: orderData.total_cents,
                shippingAddress: `${orderData.shipping_address_line1}${orderData.shipping_address_line2 ? ', ' + orderData.shipping_address_line2 : ''}, ${orderData.shipping_city}, ${orderData.shipping_state} ${orderData.shipping_postal_code}`,
                trackingUrl: `https://kbstylish.com.np/orders/${orderData.order_number}`,
              },
            },
          });
          console.log('[Order] Confirmation email triggered for order:', orderData.order_number);
        }
      }
    } catch (emailError) {
      // Don't fail order if email fails
      console.error('[Order] Failed to send confirmation email:', emailError);
    }

    // ========================================================================
    // SEND VENDOR NEW ORDER ALERTS
    // ========================================================================
    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select(`
          *,
          order_items!inner(
            id,
            product_name,
            quantity,
            price_at_purchase,
            products!inner(
              vendor_id,
              vendor_profiles!inner(
                contact_email,
                contact_name,
                commission_rate
              )
            )
          )
        `)
        .eq('id', data.order_id)
        .single();
      
      if (orderData?.order_items) {
        // Group items by vendor
        const vendorGroups = new Map();
        orderData.order_items.forEach((item: any) => {
          const vendorId = item.products.vendor_id;
          if (!vendorGroups.has(vendorId)) {
            vendorGroups.set(vendorId, {
              vendor: item.products.vendor_profiles,
              items: []
            });
          }
          vendorGroups.get(vendorId).items.push({
            name: item.product_name,
            quantity: item.quantity,
            price: item.price_at_purchase,
          });
        });

        // Send email to each vendor
        for (const [vendorId, vendorData] of vendorGroups) {
          if (vendorData.vendor?.contact_email) {
            const totalEarnings = vendorData.items.reduce((sum: number, item: any) => 
              sum + (item.price * item.quantity), 0
            );

            await supabase.functions.invoke('send-email', {
              body: {
                email_type: 'vendor_new_order',
                recipient_email: vendorData.vendor.contact_email,
                recipient_user_id: vendorId,
                recipient_name: vendorData.vendor.contact_name,
                reference_id: orderData.id,
                reference_type: 'vendor_order_alert',
                template_data: {
                  vendorName: vendorData.vendor.contact_name || 'Vendor',
                  orderNumber: orderData.order_number,
                  customerName: orderData.shipping_name,
                  items: vendorData.items,
                  totalEarnings: totalEarnings,
                  commissionRate: vendorData.vendor.commission_rate || 10,
                  shippingCity: orderData.shipping_city,
                  shippingState: orderData.shipping_state,
                  shipByDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-NP'),
                  dashboardUrl: `https://kbstylish.com.np/vendor/orders?highlight=${orderData.order_number}`,
                },
              },
            });
            console.log(`[Order] Vendor alert sent to ${vendorData.vendor.contact_name} for order:`, orderData.order_number);
          }
        }
      }
    } catch (emailError) {
      // Don't fail order if vendor emails fail
      console.error('[Order] Failed to send vendor alert emails:', emailError);
    }
    
    return {
      success: true,
      message: `Order ${data.order_id} created successfully`,
      data: {
        order_id: data.order_id,
        items_processed: data.items_processed,
        total_amount: data.total_amount,
        metrics_updated: metricsData?.success || false
      }
    };
  } catch (error) {
    console.error('Error finalizing order:', error);
    return {
      success: false,
      message: error.message,
      should_retry: true
    };
  }
}
async function handlePaymentFailure(supabase, jobData) {
  try {
    const { payment_intent_id, customer_id } = jobData;
    const { error } = await supabase.from('orders').update({
      status: 'failed',
      updated_at: new Date().toISOString(),
      metadata: {
        failure_reason: jobData.failure_reason || 'Payment declined'
      }
    }).eq('payment_intent_id', payment_intent_id);
    if (error) {
      console.error('Failed to update order status:', error);
    }
    await supabase.from('inventory_reservations').update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('order_id', payment_intent_id);
    return {
      success: true,
      message: 'Payment failure handled',
      should_retry: false
    };
  } catch (error) {
    console.error('Error handling payment failure:', error);
    return {
      success: false,
      message: error.message,
      should_retry: true
    };
  }
}
async function processRefund(supabase, jobData) {
  try {
    const { order_id, refund_amount, refund_reason } = jobData;
    const { data: order, error: orderError } = await supabase.from('orders').select('*, order_items(*)').eq('id', order_id).single();
    if (orderError || !order) {
      return {
        success: false,
        message: 'Order not found',
        should_retry: false
      };
    }
    const { error: updateError } = await supabase.from('orders').update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
      metadata: {
        ...order.metadata,
        refund_amount,
        refund_reason,
        refunded_at: new Date().toISOString()
      }
    }).eq('id', order_id);
    if (updateError) {
      return {
        success: false,
        message: 'Failed to update order status',
        should_retry: true
      };
    }
    for (const item of order.order_items){
      const { error } = await supabase.from('inventory').update({
        quantity_available: supabase.raw('quantity_available + ?', [
          item.quantity
        ]),
        version: supabase.raw('version + 1'),
        updated_at: new Date().toISOString()
      }).eq('variant_id', item.variant_id);
      if (error) {
        console.error(`Failed to restore inventory for variant ${item.variant_id}:`, error);
      }
      await supabase.from('inventory_movements').insert({
        variant_id: item.variant_id,
        location_id: null,
        movement_type: 'return',
        quantity_change: item.quantity,
        reference_id: order_id,
        reference_type: 'refund',
        notes: `Refund for order ${order_id}`,
        created_by: order.customer_id
      });
    }
    return {
      success: true,
      message: `Refund processed for order ${order_id}`,
      data: {
        order_id,
        refund_amount,
        items_restored: order.order_items.length
      }
    };
  } catch (error) {
    console.error('Error processing refund:', error);
    return {
      success: false,
      message: error.message,
      should_retry: true
    };
  }
}
async function updateJobStatus(supabase, jobId, success, message, shouldRetry, currentAttempts) {
  try {
    const maxRetries = 3;
    const attemptCount = currentAttempts || 0;
    const canRetry = shouldRetry && attemptCount < maxRetries;
    const status = success ? 'completed' : canRetry ? 'pending' : 'failed';
    const updateData = {
      status,
      locked_by: null,
      locked_until: null
    };
    if (success) {
      updateData.completed_at = new Date().toISOString();
      updateData.last_error = null;
    } else {
      updateData.last_error = message;
      if (canRetry) {
        updateData.attempts = attemptCount + 1;
      } else {
        updateData.failed_at = new Date().toISOString();
      }
    }
    const { error } = await supabase.from('job_queue').update(updateData).eq('id', jobId);
    if (error) {
      console.error('Failed to update job status:', error);
    } else {
      console.log(`Job ${jobId} updated to status: ${status}`);
    }
  } catch (error) {
    console.error('Failed to update job status:', error);
  }
}
async function updateWebhookEventStatus(supabase, eventId, status, message) {
  try {
    const updateData = {
      processed: status === 'completed'
    };
    if (status === 'completed') {
      updateData.processed_at = new Date().toISOString();
    }
    if (message && status !== 'completed') {
      const { data: existingEvent } = await supabase.from('webhook_events').select('payload').eq('id', eventId).single();
      if (existingEvent) {
        updateData.payload = {
          ...existingEvent.payload,
          _processing_error: message,
          _error_timestamp: new Date().toISOString()
        };
      }
    }
    const { error } = await supabase.from('webhook_events').update(updateData).eq('id', eventId);
    if (error) {
      console.error('Failed to update webhook event status:', error);
    } else {
      console.log(`Webhook event ${eventId} marked as processed: ${status === 'completed'}`);
    }
  } catch (error) {
    console.error('Failed to update webhook event status:', error);
  }
}
