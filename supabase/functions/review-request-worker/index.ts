// ============================================================================
// REVIEW REQUEST WORKER (CRON JOB)
// Purpose: Send review request emails 7 days after order delivery
// Schedule: Daily at 9 AM Nepal time (0 9 * * *)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

Deno.serve(async (req) => {
  try {
    console.log('[ReviewRequest] Cron job started');
    
    // Verify this is a cron request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Query orders delivered 7 days ago (6.5-7.5 day window for daily run)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        order_number,
        delivered_at,
        order_items!inner(
          product_id,
          product_name,
          products(images)
        )
      `)
      .eq('status', 'delivered')
      .is('review_requested_at', null)
      .gte('delivered_at', eightDaysAgo.toISOString())
      .lt('delivered_at', sevenDaysAgo.toISOString())
      .limit(50);
    
    if (error) {
      console.error('[ReviewRequest] Query error:', error);
      throw error;
    }
    
    if (!orders || orders.length === 0) {
      console.log('[ReviewRequest] No orders eligible for review request');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[ReviewRequest] Found ${orders.length} orders`);
    
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const order of orders) {
      try {
        // Check if review already exists
        const shouldRequest = await supabase.rpc('should_request_review', {
          p_order_id: order.id
        });
        
        if (!shouldRequest.data) {
          console.log(`[ReviewRequest] Skipping ${order.id} - already reviewed`);
          skipped++;
          continue;
        }
        
        // Get customer details
        const { data: { user } } = await supabase.auth.admin.getUserById(order.user_id);
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', order.user_id)
          .single();
        
        if (!user?.email) {
          console.log(`[ReviewRequest] No email for order ${order.id}`);
          failed++;
          continue;
        }
        
        // Build review items
        const items = order.order_items.map((item: any) => ({
          product_id: item.product_id,
          name: item.product_name,
          image_url: item.products?.images?.[0] || null,
          review_url: `https://kbstylish.com.np/products/${item.product_id}/review?order=${order.id}`,
        }));
        
        // Send email
        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            email_type: 'review_request',
            recipient_email: user.email,
            recipient_user_id: order.user_id,
            recipient_name: userProfile?.display_name,
            reference_id: order.id,
            reference_type: 'review_request',
            template_data: {
              customerName: userProfile?.display_name || 'Valued Customer',
              orderNumber: order.order_number,
              deliveredDate: new Date(order.delivered_at).toLocaleDateString('en-NP'),
              items: items,
              preferencesUrl: 'https://kbstylish.com.np/account/email-preferences',
            },
          },
        });
        
        if (emailError) throw emailError;
        
        // Mark as sent
        await supabase
          .from('orders')
          .update({ review_requested_at: new Date().toISOString() })
          .eq('id', order.id);
        
        console.log(`[ReviewRequest] Sent for order ${order.order_number}`);
        processed++;
        
      } catch (err) {
        console.error(`[ReviewRequest] Failed for ${order.id}:`, err);
        failed++;
      }
    }
    
    console.log(`[ReviewRequest] Complete: ${processed} sent, ${failed} failed, ${skipped} skipped`);
    
    return new Response(JSON.stringify({ 
      processed, 
      failed,
      skipped,
      total: orders.length 
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[ReviewRequest] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
