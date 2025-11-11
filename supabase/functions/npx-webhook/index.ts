import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkTransactionStatus, validateNPXAmount, type NPXConfig } from '../_shared/npx.ts';

/**
 * NPX Webhook Handler
 * 
 * NPX sends GET requests to this endpoint after payment completion:
 * GET /npx-webhook?MerchantTxnId=XXX&GatewayTxnId=YYY
 * 
 * This is a server-to-server notification (not client-facing).
 * 
 * Security: NPX webhooks don't include signature headers.
 * We verify authenticity by calling CheckTransactionStatus API immediately.
 * 
 * Response:
 * - "received" for first notification
 * - "already received" for duplicate notifications
 */

function getNPXConfig(): NPXConfig {
  return {
    merchantId: Deno.env.get('NPX_MERCHANT_ID') || '8574',
    apiUsername: Deno.env.get('NPX_API_USERNAME') || 'kbstylishapi',
    apiPassword: Deno.env.get('NPX_API_PASSWORD') || 'Kb$tylish123',
    securityKey: Deno.env.get('NPX_SECURITY_KEY') || 'Tg9#xKp3!rZq7@Lm2S',
    testMode: Deno.env.get('NPX_TEST_MODE') !== 'false'
  };
}

Deno.serve(async (req) => {
  // CORS headers
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // NPX sends GET requests with query parameters
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Extract query parameters
    const url = new URL(req.url);
    const merchantTxnId = url.searchParams.get('MerchantTxnId');
    const gatewayTxnId = url.searchParams.get('GatewayTxnId');

    console.log('[NPX Webhook] Received notification:', {
      merchantTxnId,
      gatewayTxnId
    });

    // Validate parameters
    if (!merchantTxnId || !gatewayTxnId) {
      console.error('[NPX Webhook] Missing required parameters');
      return new Response('Bad Request: Missing MerchantTxnId or GatewayTxnId', {
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
      .eq('provider', 'npx')
      .eq('external_transaction_id', gatewayTxnId)
      .single();

    if (existingVerification) {
      console.log('[NPX Webhook] Already processed (idempotent):', gatewayTxnId);
      return new Response('already received', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // DEFENSE #2: Lookup payment intent
    // ========================================================================
    const { data: paymentIntent, error: lookupError } = await serviceClient
      .from('payment_intents')
      .select('*')
      .eq('payment_intent_id', merchantTxnId)
      .single();

    if (lookupError || !paymentIntent) {
      console.error('[NPX Webhook] Payment intent not found:', merchantTxnId);
      return new Response('Payment intent not found', {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // DEFENSE #3: Verify with NPX API (server-to-server)
    // NEVER trust webhook data without verification
    // ========================================================================
    const npxConfig = getNPXConfig();
    const verificationResult = await checkTransactionStatus(npxConfig, merchantTxnId);

    if (!verificationResult.success || !verificationResult.data) {
      console.error('[NPX Webhook] Verification failed:', verificationResult.error);
      return new Response('Verification failed', {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // Check if GatewayTxnId matches
    if (verificationResult.gatewayTxnId !== gatewayTxnId) {
      console.error('[NPX Webhook] Gateway TxnId mismatch!', {
        webhook: gatewayTxnId,
        api: verificationResult.gatewayTxnId
      });
      return new Response('Gateway TxnId mismatch', {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // ========================================================================
    // DEFENSE #4: Validate transaction status
    // ========================================================================
    let verificationStatus = 'failed';
    let amountVerified = 0;

    if (verificationResult.status === 'Success') {
      // Validate amount
      const expectedAmountNPR = paymentIntent.amount_cents / 100;
      const amountMatches = validateNPXAmount(
        expectedAmountNPR,
        verificationResult.amount!
      );

      if (!amountMatches) {
        verificationStatus = 'amount_mismatch';
        console.error('[NPX Webhook] FRAUD ALERT: Amount mismatch!', {
          expected: expectedAmountNPR,
          received: verificationResult.amount
        });
      } else {
        verificationStatus = 'success';
        amountVerified = Math.round(parseFloat(verificationResult.amount!) * 100);
        console.log('[NPX Webhook] Verification successful');
      }
    } else if (verificationResult.status === 'Pending') {
      verificationStatus = 'pending';
      console.log('[NPX Webhook] Transaction still pending');
    } else {
      verificationStatus = 'failed';
      console.error('[NPX Webhook] Transaction failed:', verificationResult.data.CbsMessage);
    }

    // ========================================================================
    // RECORD VERIFICATION (Audit Trail)
    // ========================================================================
    const { error: verificationInsertError } = await serviceClient
      .from('payment_gateway_verifications')
      .insert({
        provider: 'npx',
        external_transaction_id: gatewayTxnId,
        payment_intent_id: paymentIntent.payment_intent_id,
        verification_response: verificationResult,
        amount_verified: amountVerified,
        status: verificationStatus
      });

    if (verificationInsertError) {
      console.error('[NPX Webhook] Failed to insert verification:', verificationInsertError);
      // Don't fail - may be duplicate due to race condition
    }

    // Only process successful payments
    if (verificationStatus !== 'success') {
      // Update payment intent status
      await serviceClient
        .from('payment_intents')
        .update({
          status: verificationStatus === 'pending' ? 'pending' : 'failed',
          external_transaction_id: gatewayTxnId,
          metadata: {
            ...paymentIntent.metadata,
            npx_gateway_txn_id: gatewayTxnId,
            npx_transaction_date: verificationResult.transactionDate,
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
        external_transaction_id: gatewayTxnId,
        metadata: {
          ...paymentIntent.metadata,
          npx_gateway_txn_id: gatewayTxnId,
          npx_transaction_date: verificationResult.transactionDate,
          webhook_received_at: new Date().toISOString(),
          gateway_verification: verificationResult
        }
      })
      .eq('payment_intent_id', paymentIntent.payment_intent_id);

    if (updateError) {
      console.error('[NPX Webhook] Failed to update payment intent:', updateError);
    }

    // ========================================================================
    // ENQUEUE ORDER FINALIZATION JOB (with idempotency)
    // ========================================================================
    const idempotencyKey = `payment_npx_${gatewayTxnId}`;
    const { error: jobError } = await serviceClient
      .from('job_queue')
      .insert({
        job_type: 'finalize_order',
        payload: {
          payment_intent_id: paymentIntent.payment_intent_id,
          user_id: paymentIntent.user_id,
          cart_id: paymentIntent.cart_id,
          provider: 'npx',
          external_transaction_id: gatewayTxnId,
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
        console.log('[NPX Webhook] Job already enqueued:', idempotencyKey);
      } else {
        console.error('[NPX Webhook] Failed to enqueue job:', jobError);
        // Don't fail - payment is verified and recorded
      }
    } else {
      console.log('[NPX Webhook] Order finalization job enqueued:', idempotencyKey);
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
      }).catch(err => console.error('[NPX Webhook] Failed to trigger worker:', err));
    } catch (err) {
      console.error('[NPX Webhook] Worker trigger error:', err);
    }

    // Return success response for NPX
    return new Response('received', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });

  } catch (error) {
    console.error('[NPX Webhook] Unexpected error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
});
