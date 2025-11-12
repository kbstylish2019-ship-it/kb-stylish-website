import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyKhaltiTransaction, compareKhaltiAmount } from '../_shared/khalti.ts';

/**
 * Khalti Webhook Handler
 * 
 * Khalti sends GET requests to this endpoint after payment completion:
 * GET /khalti-webhook?pidx=XXX&status=Completed&transaction_id=YYY&amount=ZZZ
 * 
 * This is a server-to-server notification (not client-facing).
 * 
 * Security: Khalti webhooks don't include signature headers.
 * We verify authenticity by calling lookup API immediately.
 * 
 * Response:
 * - "received" for first notification
 * - "already received" for duplicate notifications
 */

function getKhaltiSecretKey() {
  return Deno.env.get('KHALTI_SECRET_KEY') || 'test_secret_key_xxxxx';
}

Deno.serve(async (req) => {
  // CORS headers
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Khalti sends GET requests with query parameters
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Extract query parameters
    const url = new URL(req.url);
    const pidx = url.searchParams.get('pidx');
    const status = url.searchParams.get('status');
    const transactionId = url.searchParams.get('transaction_id');
    const amount = url.searchParams.get('amount');

    console.log('[Khalti Webhook] Received notification:', {
      pidx,
      status,
      transactionId,
      amount
    });

    // Validate parameters
    if (!pidx) {
      console.error('[Khalti Webhook] Missing required parameter: pidx');
      return new Response('Bad Request: Missing pidx', {
        status: 400,
        headers: corsHeaders
      });
    }

    // Service client for database operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // ========================================================================
    // DEFENSE #1: Check for duplicate notifications (idempotency)
    // ========================================================================
    const { data: existingVerification } = await serviceClient
      .from('payment_gateway_verifications')
      .select('*')
      .eq('provider', 'khalti')
      .eq('external_transaction_id', pidx)
      .single();

    if (existingVerification) {
      console.log('[Khalti Webhook] Already processed (idempotent):', pidx);
      return new Response('already received', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // DEFENSE #2: Lookup payment intent by external_transaction_id (pidx)
    // ========================================================================
    const { data: paymentIntent, error: lookupError } = await serviceClient
      .from('payment_intents')
      .select('*')
      .eq('external_transaction_id', pidx)
      .eq('provider', 'khalti')
      .single();

    if (lookupError || !paymentIntent) {
      console.error('[Khalti Webhook] Payment intent not found for pidx:', pidx);
      return new Response('Payment intent not found', {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // DEFENSE #3: Verify with Khalti API (server-to-server)
    // NEVER trust webhook data without verification
    // ========================================================================
    const khaltiSecretKey = getKhaltiSecretKey();
    const verificationResult = await verifyKhaltiTransaction(khaltiSecretKey, pidx);

    if (!verificationResult.success || !verificationResult.data) {
      console.error('[Khalti Webhook] Verification failed:', verificationResult.error);
      return new Response('Verification failed', {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // DEFENSE #4: Validate transaction status and amount
    // ========================================================================
    let verificationStatus = 'failed';
    let amountVerified = 0;

    if (verificationResult.data.status === 'Completed') {
      // Validate amount
      const expectedAmountNPR = paymentIntent.amount_cents / 100;
      const amountMatches = compareKhaltiAmount(
        verificationResult.data.total_amount,
        expectedAmountNPR
      );

      if (!amountMatches) {
        verificationStatus = 'amount_mismatch';
        console.error('[Khalti Webhook] FRAUD ALERT: Amount mismatch!', {
          expected: expectedAmountNPR,
          received: verificationResult.data.total_amount / 100
        });
      } else {
        verificationStatus = 'success';
        amountVerified = verificationResult.data.total_amount;
        console.log('[Khalti Webhook] Verification successful');
      }
    } else {
      verificationStatus = 'failed';
      console.error('[Khalti Webhook] Transaction not completed:', verificationResult.data.status);
    }

    // ========================================================================
    // RECORD VERIFICATION (Audit Trail)
    // ========================================================================
    const { error: verificationInsertError } = await serviceClient
      .from('payment_gateway_verifications')
      .insert({
        provider: 'khalti',
        external_transaction_id: pidx,
        payment_intent_id: paymentIntent.payment_intent_id,
        verification_response: verificationResult,
        amount_verified: amountVerified,
        status: verificationStatus
      });

    if (verificationInsertError) {
      console.error('[Khalti Webhook] Failed to insert verification:', verificationInsertError);
      // Don't fail - may be duplicate due to race condition
    }

    // Only process successful payments
    if (verificationStatus !== 'success') {
      // Update payment intent status
      await serviceClient
        .from('payment_intents')
        .update({
          status: verificationStatus === 'pending' ? 'pending' : 'failed',
          metadata: {
            ...paymentIntent.metadata,
            khalti_transaction_id: verificationResult.data?.transaction_id,
            webhook_received_at: new Date().toISOString(),
            verification_status: verificationStatus
          }
        })
        .eq('payment_intent_id', paymentIntent.payment_intent_id);

      return new Response('received', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // SUCCESS PATH: Update payment intent and enqueue job
    // ========================================================================
    const { error: updateError } = await serviceClient
      .from('payment_intents')
      .update({
        status: 'succeeded',
        metadata: {
          ...paymentIntent.metadata,
          khalti_transaction_id: verificationResult.data.transaction_id,
          webhook_received_at: new Date().toISOString(),
          gateway_verification: verificationResult
        }
      })
      .eq('payment_intent_id', paymentIntent.payment_intent_id);

    if (updateError) {
      console.error('[Khalti Webhook] Failed to update payment intent:', updateError);
    }

    // ========================================================================
    // ENQUEUE ORDER FINALIZATION JOB (with idempotency)
    // ========================================================================
    const idempotencyKey = `payment_khalti_${pidx}`;
    const { error: jobError } = await serviceClient
      .from('job_queue')
      .insert({
        job_type: 'finalize_order',
        payload: {
          payment_intent_id: paymentIntent.payment_intent_id,
          user_id: paymentIntent.user_id,
          cart_id: paymentIntent.cart_id,
          provider: 'khalti',
          external_transaction_id: pidx,
          amount_cents: paymentIntent.amount_cents
        },
        priority: 1,
        status: 'pending',
        idempotency_key: idempotencyKey,
        max_attempts: 3
      });

    if (jobError) {
      if (jobError.code === '23505') {
        // Duplicate key - job already enqueued (idempotent)
        console.log('[Khalti Webhook] Job already enqueued:', idempotencyKey);
      } else {
        console.error('[Khalti Webhook] Failed to enqueue job:', jobError);
        // Don't fail - payment is verified and recorded
      }
    } else {
      console.log('[Khalti Webhook] Order finalization job enqueued:', idempotencyKey);
    }

    // Trigger order worker immediately (fire and forget)
    try {
      const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/order-worker`;
      fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        }
      }).catch(err => console.error('[Khalti Webhook] Failed to trigger worker:', err));
    } catch (err) {
      console.error('[Khalti Webhook] Worker trigger error:', err);
    }

    // Return success response for Khalti
    return new Response('received', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });

  } catch (error) {
    console.error('[Khalti Webhook] Unexpected error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
});
