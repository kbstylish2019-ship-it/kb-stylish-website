import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';
import { verifyEsewaTransaction, type EsewaConfig } from '../_shared/esewa.ts';
import { verifyKhaltiTransaction, compareKhaltiAmount } from '../_shared/khalti.ts';

/**
 * VERIFY-PAYMENT - Payment Gateway Callback Handler
 * Principal FinTech Architect Implementation - Phase 3
 * 
 * Security Model:
 * - NEVER trusts client-provided payment confirmations
 * - Performs server-to-server verification with payment gateway
 * - Implements idempotency to prevent duplicate order creation
 * - Records all verification attempts for audit trail
 * - Validates amount matches payment_intent.amount_cents
 * 
 * Flow:
 * 1. User completes payment on eSewa/Khalti
 * 2. Gateway redirects to /payment/callback (frontend page)
 * 3. Frontend calls this Edge Function
 * 4. We verify with gateway API (synchronous)
 * 5. Record verification in database
 * 6. Enqueue job for order-worker
 * 7. Return success/failure to frontend
 * 
 * CRITICAL DEFENSES:
 * - Race condition protection (check if already verified)
 * - Amount tampering detection (compare gateway amount vs payment_intent)
 * - Idempotent job enqueueing (provider-namespaced idempotency_key)
 * - Comprehensive error logging for fraud detection
 */

interface VerifyPaymentRequest {
  provider: 'esewa' | 'khalti';
  // eSewa params
  transaction_uuid?: string;
  // Khalti params
  pidx?: string;
}

interface VerifyPaymentResponse {
  success: boolean;
  payment_intent_id?: string;
  order_id?: string;
  amount_cents?: number;
  already_verified?: boolean;
  error?: string;
  details?: any;
}

function getEsewaConfig(): EsewaConfig {
  return {
    merchantCode: Deno.env.get('ESEWA_MERCHANT_CODE') || 'EPAYTEST',
    secretKey: Deno.env.get('ESEWA_SECRET_KEY') || '8gBm/:&EnhH.1/q',
    testMode: Deno.env.get('ESEWA_TEST_MODE') !== 'false'
  };
}

function getKhaltiSecretKey(): string {
  return Deno.env.get('KHALTI_SECRET_KEY') || 'test_secret_key_xxxxx';
}

Deno.serve(async (req: Request) => {
  // Build dynamic CORS headers
  const origin = req.headers.get('Origin');
  const baseCors = getCorsHeaders(origin);
  const acrh = req.headers.get('Access-Control-Request-Headers');
  const dynCors = acrh
    ? { ...baseCors, 'Access-Control-Allow-Headers': `${baseCors['Access-Control-Allow-Headers']}, ${acrh}` }
    : baseCors;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: dynCors });
  }

  // Service client for all database operations
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );

  try {
    // Parse request
    const requestData = await req.json() as VerifyPaymentRequest;

    // Validate provider
    if (!requestData.provider || !['esewa', 'khalti'].includes(requestData.provider)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid provider. Must be "esewa" or "khalti"' }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    const provider = requestData.provider;
    let externalTxnId: string;

    // Extract transaction identifier based on provider
    if (provider === 'esewa') {
      if (!requestData.transaction_uuid) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing transaction_uuid for eSewa' }),
          { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
        );
      }
      externalTxnId = requestData.transaction_uuid;
    } else {
      if (!requestData.pidx) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing pidx for Khalti' }),
          { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
        );
      }
      externalTxnId = requestData.pidx;
    }

    console.log(`Verifying ${provider} payment:`, externalTxnId);

    // ========================================================================
    // CRITICAL DEFENSE #1: Race Condition Protection
    // Check if this transaction has already been verified
    // ========================================================================
    const { data: existingVerification } = await serviceClient
      .from('payment_gateway_verifications')
      .select('*')
      .eq('provider', provider)
      .eq('external_transaction_id', externalTxnId)
      .single();

    if (existingVerification) {
      console.log('Payment already verified (idempotent check):', existingVerification.id);
      
      // Return cached result
      return new Response(
        JSON.stringify({
          success: existingVerification.status === 'success',
          payment_intent_id: existingVerification.payment_intent_id,
          amount_cents: existingVerification.amount_verified,
          already_verified: true,
          details: existingVerification.verification_response
        } as VerifyPaymentResponse),
        { status: 200, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // CRITICAL DEFENSE #2: Payment Intent Lookup
    // Find the payment_intent record using external_transaction_id
    // ========================================================================
    console.log(`Looking up payment intent with external_transaction_id: ${externalTxnId}`);
    
    const { data: paymentIntent, error: lookupError } = await serviceClient
      .from('payment_intents')
      .select('*')
      .eq('external_transaction_id', externalTxnId)
      .single();

    if (lookupError || !paymentIntent) {
      console.error('Payment intent lookup failed!');
      console.error('- external_transaction_id:', externalTxnId);
      console.error('- Lookup error:', lookupError);
      console.error('- Error code:', lookupError?.code);
      console.error('- Error message:', lookupError?.message);
      
      // Try to find recent payment intents for debugging
      const { data: recentIntents } = await serviceClient
        .from('payment_intents')
        .select('payment_intent_id, external_transaction_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      console.error('Recent payment intents:', JSON.stringify(recentIntents, null, 2));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Payment intent not found for transaction: ${externalTxnId}`,
          details: {
            lookup_error: lookupError?.message,
            transaction_id: externalTxnId
          }
        }),
        { status: 404, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found payment intent:', paymentIntent.payment_intent_id);

    // ========================================================================
    // CRITICAL DEFENSE #3: Gateway Verification (Server-to-Server)
    // NEVER trust client-side payment confirmations
    // ========================================================================
    let gatewayVerificationResult: any;
    let verificationStatus: 'success' | 'failed' | 'amount_mismatch' = 'failed';
    let amountVerified: number = 0;

    if (provider === 'esewa') {
      const esewaConfig = getEsewaConfig();
      const expectedAmountNPR = paymentIntent.amount_cents / 100;

      // TEST MODE: Skip eSewa verification API if test mode is enabled
      // WARNING: This should NEVER be used in production!
      const ESEWA_SKIP_VERIFICATION = Deno.env.get('ESEWA_SKIP_VERIFICATION') === 'true';
      
      if (ESEWA_SKIP_VERIFICATION && esewaConfig.testMode) {
        console.warn('⚠️ TEST MODE: Skipping eSewa verification API (trusting callback data)');
        verificationStatus = 'success';
        amountVerified = paymentIntent.amount_cents;
        gatewayVerificationResult = {
          success: true,
          data: {
            status: 'COMPLETE',
            transaction_uuid: externalTxnId,
            total_amount: expectedAmountNPR.toFixed(2),
            ref_id: 'TEST_MODE_SKIP'
          },
          test_mode_skip: true
        };
      } else {
        const result = await verifyEsewaTransaction(
          esewaConfig,
          externalTxnId,
          expectedAmountNPR
        );

        gatewayVerificationResult = result;

        if (result.success && result.data) {
          // Amount is already verified in verifyEsewaTransaction (integer comparison in paisa)
          verificationStatus = 'success';
          amountVerified = Math.round(parseFloat(result.data.total_amount) * 100);
          console.log('eSewa verification successful:', result.data.ref_id);
        } else {
          console.error('eSewa verification failed:', result.error);
        }
      }

    } else if (provider === 'khalti') {
      const khaltiSecretKey = getKhaltiSecretKey();

      const result = await verifyKhaltiTransaction(khaltiSecretKey, externalTxnId);

      gatewayVerificationResult = result;

      if (result.success && result.data) {
        amountVerified = result.data.total_amount; // Already in paisa

        // ========================================================================
        // CRITICAL DEFENSE #4: Amount Verification
        // Prevent amount tampering attacks
        // ========================================================================
        const expectedAmountNPR = paymentIntent.amount_cents / 100;
        const amountMatches = compareKhaltiAmount(amountVerified, expectedAmountNPR);

        if (!amountMatches) {
          verificationStatus = 'amount_mismatch';
          console.error(
            'FRAUD ALERT: Amount mismatch detected!',
            `Expected: ${paymentIntent.amount_cents} paisa, Gateway: ${amountVerified} paisa`
          );
        } else {
          verificationStatus = 'success';
          console.log('Khalti verification successful:', result.data.transaction_id);
        }
      } else {
        console.error('Khalti verification failed:', result.error);
      }
    }

    // ========================================================================
    // RECORD VERIFICATION IN DATABASE (Audit Trail)
    // ========================================================================
    const { error: verificationInsertError } = await serviceClient
      .from('payment_gateway_verifications')
      .insert({
        provider,
        external_transaction_id: externalTxnId,
        payment_intent_id: paymentIntent.payment_intent_id,
        verification_response: gatewayVerificationResult,
        amount_verified: amountVerified,
        status: verificationStatus
      });

    if (verificationInsertError) {
      // Log error but don't fail the request (UNIQUE constraint may trigger on race conditions)
      console.error('Failed to insert verification record:', verificationInsertError);
    }

    // If verification failed, update payment_intent and return error
    if (verificationStatus !== 'success') {
      await serviceClient
        .from('payment_intents')
        .update({ 
          status: verificationStatus === 'amount_mismatch' ? 'failed' : 'failed',
          metadata: {
            ...paymentIntent.metadata,
            verification_error: gatewayVerificationResult.error || 'Amount mismatch',
            verified_at: new Date().toISOString()
          }
        })
        .eq('payment_intent_id', paymentIntent.payment_intent_id);

      return new Response(
        JSON.stringify({
          success: false,
          payment_intent_id: paymentIntent.payment_intent_id,
          error: verificationStatus === 'amount_mismatch' 
            ? 'Payment amount mismatch - possible fraud attempt'
            : 'Payment verification failed',
          details: gatewayVerificationResult
        } as VerifyPaymentResponse),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // SUCCESS PATH: Update Payment Intent
    // ========================================================================
    const { error: updateError } = await serviceClient
      .from('payment_intents')
      .update({ 
        status: 'succeeded',
        metadata: {
          ...paymentIntent.metadata,
          verified_at: new Date().toISOString(),
          gateway_verification: gatewayVerificationResult
        }
      })
      .eq('payment_intent_id', paymentIntent.payment_intent_id);

    if (updateError) {
      console.error('Failed to update payment intent:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to update payment status'
        }),
        { status: 500, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // CRITICAL DEFENSE #5: Idempotent Job Enqueueing
    // Use provider-namespaced idempotency_key to prevent duplicate orders
    // ========================================================================
    const idempotencyKey = `payment_${provider}_${externalTxnId}`;
    
    const { error: jobError } = await serviceClient
      .from('job_queue')
      .insert({
        job_type: 'finalize_order',
        payload: {
          payment_intent_id: paymentIntent.payment_intent_id,
          user_id: paymentIntent.user_id,
          cart_id: paymentIntent.cart_id,
          provider,
          external_transaction_id: externalTxnId,
          amount_cents: paymentIntent.amount_cents
        },
        priority: 1, // High priority
        status: 'pending',
        idempotency_key: idempotencyKey,
        max_attempts: 3
      });

    if (jobError) {
      // Check if it's a duplicate key error (idempotency protection)
      if (jobError.code === '23505') {
        console.log('Job already enqueued (idempotent):', idempotencyKey);
      } else {
        console.error('Failed to enqueue job:', jobError);
        // Don't fail the request - payment is verified and recorded
        // Job can be manually enqueued if needed
      }
    } else {
      console.log('Order finalization job enqueued:', idempotencyKey);
    }

    // ========================================================================
    // RETURN SUCCESS RESPONSE
    // ========================================================================
    const response: VerifyPaymentResponse = {
      success: true,
      payment_intent_id: paymentIntent.payment_intent_id,
      amount_cents: paymentIntent.amount_cents,
      details: {
        provider,
        external_transaction_id: externalTxnId,
        verified_amount: amountVerified,
        gateway_response: gatewayVerificationResult
      }
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...dynCors, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in verify-payment:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error during payment verification',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...dynCors, 'Content-Type': 'application/json' } }
    );
  }
});
