import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Ratings Worker - Product Rating Aggregation
 * 
 * This worker processes `update_product_rating` jobs from the job queue.
 * It calls the RPC function to recalculate product ratings based on approved reviews.
 * 
 * Triggered by: Cron job (every 2 minutes)
 * Processes: Up to 10 jobs per invocation
 * 
 * Job Queue Flow:
 * 1. Review submitted/approved → Job created
 * 2. This worker fetches pending jobs
 * 3. Calls update_product_rating_stats RPC
 * 4. Marks job as completed/failed
 */

Deno.serve(async (req) => {
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log('[Ratings Worker] Starting job processing...');

  try {
    // Fetch pending rating update jobs
    const { data: jobs, error: fetchError } = await serviceClient
      .from('job_queue')
      .select('id, payload, attempts')
      .eq('job_type', 'update_product_rating')
      .eq('status', 'pending')
      .is('locked_until', null)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[Ratings Worker] Fetch error:', fetchError);
      return new Response(JSON.stringify({ success: false, error: fetchError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!jobs || jobs.length === 0) {
      console.log('[Ratings Worker] No pending jobs');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Ratings Worker] Processing ${jobs.length} jobs`);

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const productId = job.payload.product_id;
        console.log(`[Ratings Worker] Processing product ${productId}`);

        // Mark job as processing (with lock)
        const lockUntil = new Date(Date.now() + 60000).toISOString(); // 1 min lock
        const { error: lockError } = await serviceClient
          .from('job_queue')
          .update({
            status: 'processing',
            locked_until: lockUntil,
            attempts: (job.attempts || 0) + 1
          })
          .eq('id', job.id)
          .eq('status', 'pending'); // Only lock if still pending

        if (lockError) {
          console.error(`[Ratings Worker] Failed to lock job ${job.id}:`, lockError);
          continue; // Skip this job, another worker might have grabbed it
        }

        // Call the rating aggregation RPC function
        const { data: result, error: rpcError } = await serviceClient
          .rpc('update_product_rating_stats', { p_product_id: productId });

        if (rpcError || !result?.success) {
          console.error(`[Ratings Worker] RPC failed for ${productId}:`, rpcError || result);
          
          // Check if we should retry
          const maxAttempts = 5;
          const shouldRetry = (job.attempts || 0) + 1 < maxAttempts;

          if (shouldRetry) {
            // Mark as pending for retry (with exponential backoff)
            const retryDelay = Math.min(300, Math.pow(2, (job.attempts || 0)) * 60); // Max 5 min
            await serviceClient
              .from('job_queue')
              .update({
                status: 'pending',
                locked_until: null,
                error_message: rpcError?.message || result?.error || 'RPC failed',
              })
              .eq('id', job.id);
            
            console.log(`[Ratings Worker] Job ${job.id} will retry (attempt ${(job.attempts || 0) + 1}/${maxAttempts})`);
          } else {
            // Max attempts reached, mark as failed
            await serviceClient
              .from('job_queue')
              .update({
                status: 'failed',
                error_message: rpcError?.message || result?.error || 'Max attempts reached',
                completed_at: new Date().toISOString()
              })
              .eq('id', job.id);
            
            console.error(`[Ratings Worker] Job ${job.id} failed permanently after ${maxAttempts} attempts`);
          }

          failed++;
          continue;
        }

        // Success! Mark job as completed
        await serviceClient
          .from('job_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            locked_until: null
          })
          .eq('id', job.id);

        processed++;
        console.log(`[Ratings Worker] ✅ Completed product ${productId}: avg=${result.average_rating}, count=${result.review_count}`);

      } catch (jobError) {
        console.error(`[Ratings Worker] Job processing error:`, jobError);
        
        // Mark job as failed
        await serviceClient
          .from('job_queue')
          .update({
            status: 'failed',
            error_message: jobError instanceof Error ? jobError.message : 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);

        failed++;
      }
    }

    const response = {
      success: true,
      processed,
      failed,
      message: `Processed ${processed} jobs successfully, ${failed} failed`
    };

    console.log('[Ratings Worker] Complete:', response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Ratings Worker] Fatal error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
