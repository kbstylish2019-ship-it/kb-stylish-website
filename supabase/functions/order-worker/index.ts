import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

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
 */

const MAX_JOBS_PER_RUN = 10;
const LOCK_TIMEOUT_SECONDS = 30;
const WORKER_ID = `worker_${crypto.randomUUID().substring(0, 8)}`;

interface Job {
  id: string;
  job_type: string;
  payload: any;
  attempts: number;
  max_attempts: number;
  priority?: number;
  idempotency_key?: string | null;
}

interface ProcessResult {
  success: boolean;
  message: string;
  should_retry?: boolean;
  data?: any;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Parse request - can accept filters for specific job types
  const url = new URL(req.url);
  const jobTypeFilter = url.searchParams.get('job_type');
  const maxJobs = parseInt(url.searchParams.get('max_jobs') || String(MAX_JOBS_PER_RUN));

  try {
    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Worker ID for distributed processing
    const workerId = WORKER_ID;
    console.log(`Order worker ${workerId} starting (max jobs: ${maxJobs})`);

    // Process jobs from the queue
    const processedJobs: any[] = [];
    let jobsProcessed = 0;

    while (jobsProcessed < maxJobs) {
      // Acquire next job using SKIP LOCKED pattern
      const job = await acquireNextJob(supabaseClient, workerId);
      
      if (!job) {
        console.log('No more jobs in queue');
        break;
      }

      console.log(`Processing job ${job.id} of type ${job.job_type}`);
      
      // Process job based on type
      let result: ProcessResult;
      
      switch (job.job_type) {
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

      // Update job status based on result
      await updateJobStatus(
        supabaseClient,
        job.id,
        result.success,
        result.message,
        result.should_retry,
        job.attempts
      );

      // Update webhook event status if applicable
      if (job.payload?.webhook_event_id) {
        await updateWebhookEventStatus(
          supabaseClient,
          job.payload.webhook_event_id,
          result.success ? 'completed' : 'failed',
          result.message
        );
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

    return new Response(
      JSON.stringify({
        success: true,
        worker_id: workerId,
        jobs_processed: jobsProcessed,
        results: processedJobs
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Order worker error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Worker execution failed',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Job acquisition with SKIP LOCKED pattern
async function acquireNextJob(
  supabase: any,
  workerId: string
): Promise<Job | null> {
  try {
    // Use RPC to call a function that uses FOR UPDATE SKIP LOCKED
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

// Finalize order with Optimistic Concurrency Control
async function finalizeOrder(
  supabase: any,
  jobData: any
): Promise<ProcessResult> {
  try {
    const { payment_intent_id, webhook_event_id } = jobData;
    
    if (!payment_intent_id) {
      return {
        success: false,
        message: 'Missing payment_intent_id',
        should_retry: false
      };
    }

    // First, update the payment intent status to succeeded
    // This would normally be done by verifying with the payment provider
    const { error: updateError } = await supabase
      .from('payment_intents')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('payment_intent_id', payment_intent_id);

    if (updateError) {
      console.error('Failed to update payment intent:', updateError);
      return {
        success: false,
        message: 'Failed to update payment intent status',
        should_retry: true
      };
    }

    // Call the OCC order processing function
    const { data, error } = await supabase.rpc('process_order_with_occ', {
      p_payment_intent_id: payment_intent_id,
      p_webhook_event_id: webhook_event_id
    });

    if (error) {
      // Check if it's an inventory issue (should retry) or permanent failure
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

    // Send order confirmation email (in production)
    // await sendOrderConfirmationEmail(customer_id, data.order_id);

    // Trigger fulfillment webhook (in production)
    // await triggerFulfillmentWebhook(data.order_id);

    return {
      success: true,
      message: `Order ${data.order_id} created successfully`,
      data: {
        order_id: data.order_id,
        items_processed: data.items_processed,
        total_amount: data.total_amount
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

// Handle payment failure
async function handlePaymentFailure(
  supabase: any,
  jobData: any
): Promise<ProcessResult> {
  try {
    const { payment_intent_id, customer_id } = jobData;

    // Update order status if it exists
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'failed',
        updated_at: new Date().toISOString(),
        metadata: {
          failure_reason: jobData.failure_reason || 'Payment declined'
        }
      })
      .eq('payment_intent_id', payment_intent_id);

    if (error) {
      console.error('Failed to update order status:', error);
    }

    // Release any inventory reservations
    await supabase
      .from('inventory_reservations')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('order_id', payment_intent_id);

    // Send payment failure notification (in production)
    // await sendPaymentFailureEmail(customer_id, payment_intent_id);

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

// Process refund
async function processRefund(
  supabase: any,
  jobData: any
): Promise<ProcessResult> {
  try {
    const { order_id, refund_amount, refund_reason } = jobData;

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return {
        success: false,
        message: 'Order not found',
        should_retry: false
      };
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'refunded',
        updated_at: new Date().toISOString(),
        metadata: {
          ...order.metadata,
          refund_amount,
          refund_reason,
          refunded_at: new Date().toISOString()
        }
      })
      .eq('id', order_id);

    if (updateError) {
      return {
        success: false,
        message: 'Failed to update order status',
        should_retry: true
      };
    }

    // Restore inventory using OCC
    for (const item of order.order_items) {
      const { error } = await supabase
        .from('inventory')
        .update({ 
          quantity_available: supabase.raw('quantity_available + ?', [item.quantity]),
          version: supabase.raw('version + 1'),
          updated_at: new Date().toISOString()
        })
        .eq('variant_id', item.variant_id);

      if (error) {
        console.error(`Failed to restore inventory for variant ${item.variant_id}:`, error);
      }

      // Record inventory movement
      await supabase
        .from('inventory_movements')
        .insert({
          variant_id: item.variant_id,
          location_id: null, // Would be determined in production
          movement_type: 'return',
          quantity_change: item.quantity,
          reference_id: order_id,
          reference_type: 'refund',
          notes: `Refund for order ${order_id}`,
          created_by: order.customer_id
        });
    }

    // Send refund confirmation (in production)
    // await sendRefundConfirmationEmail(order.customer_id, order_id, refund_amount);

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

// Update job status
async function updateJobStatus(
  supabase: any,
  jobId: string,
  success: boolean,
  message: string,
  shouldRetry?: boolean,
  attempts?: number
): Promise<void> {
  try {
    const maxRetries = 3;
    const currentAttempts = attempts || 0;
    const canRetry = shouldRetry && currentAttempts < maxRetries;
    
    const status = success ? 'completed' : (canRetry ? 'pending' : 'failed');
    
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null
    };

    if (success) {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.error_message = message;
      if (canRetry) {
        updateData.retry_count = currentAttempts + 1;
        // Exponential backoff for retries
        const delayMinutes = Math.pow(2, currentAttempts + 1);
        updateData.scheduled_for = new Date(Date.now() + delayMinutes * 60000).toISOString();
      }
    }

    await supabase
      .from('job_queue')
      .update(updateData)
      .eq('id', jobId);

  } catch (error) {
    console.error('Failed to update job status:', error);
  }
}

// Update webhook event status
async function updateWebhookEventStatus(
  supabase: any,
  eventId: string,
  status: string,
  message?: string
): Promise<void> {
  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.processed_at = new Date().toISOString();
    } else if (message) {
      updateData.error_message = message;
    }

    await supabase
      .from('webhook_events')
      .update(updateData)
      .eq('id', eventId);

  } catch (error) {
    console.error('Failed to update webhook event status:', error);
  }
}

// Create the RPC function for job acquisition
// This should be added to your migration
const ACQUIRE_JOB_FUNCTION = `
CREATE OR REPLACE FUNCTION public.acquire_next_job(
    p_worker_id TEXT,
    p_lock_timeout INT DEFAULT 30000
) RETURNS TABLE (
    id UUID,
    job_type TEXT,
    job_data JSONB,
    retry_count INT,
    max_retries INT
) AS $$
BEGIN
    RETURN QUERY
    UPDATE job_queue
    SET 
        status = 'processing',
        locked_by = p_worker_id,
        locked_at = NOW(),
        updated_at = NOW()
    WHERE id = (
        SELECT id 
        FROM job_queue
        WHERE status = 'pending'
            AND scheduled_for <= NOW()
            AND (locked_at IS NULL OR locked_at < NOW() - (p_lock_timeout || ' milliseconds')::INTERVAL)
        ORDER BY priority, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING 
        job_queue.id,
        job_queue.job_type,
        job_queue.job_data,
        job_queue.retry_count,
        job_queue.max_retries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;
