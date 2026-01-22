import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/cors.ts';
import { prepareEsewaPaymentForm } from '../_shared/esewa.ts';
import { initiateKhaltiPayment } from '../_shared/khalti.ts';
import { getProcessId, prepareNPXPaymentForm, type NPXConfig } from '../_shared/npx.ts';
// Environment configuration helpers
function getBaseUrl() {
  const baseUrl = Deno.env.get('BASE_URL');
  if (baseUrl) return baseUrl;
  const vercelUrl = Deno.env.get('VERCEL_URL');
  if (vercelUrl) return `https://${vercelUrl}`;
  return 'http://localhost:3000';
}
function getEsewaConfig() {
  return {
    merchantCode: Deno.env.get('ESEWA_MERCHANT_CODE') || 'EPAYTEST',
    secretKey: Deno.env.get('ESEWA_SECRET_KEY') || '8gBm/:&EnhH.1/q',
    testMode: Deno.env.get('ESEWA_TEST_MODE') !== 'false'
  };
}
function getKhaltiSecretKey() {
  return Deno.env.get('KHALTI_SECRET_KEY') || 'test_secret_key_xxxxx';
}
function getNPXConfig(): NPXConfig {
  return {
    merchantId: Deno.env.get('NPX_MERCHANT_ID') || '8574',
    apiUsername: Deno.env.get('NPX_API_USERNAME') || 'kbstylishapi',
    apiPassword: Deno.env.get('NPX_API_PASSWORD') || 'Kb$tylish123',
    securityKey: Deno.env.get('NPX_SECURITY_KEY') || 'Tg9#xKp3!rZq7@Lm2S',
    testMode: Deno.env.get('NPX_TEST_MODE') !== 'false'
  };
}
Deno.serve(async (req)=>{
  // Build dynamic CORS headers per request
  const origin = req.headers.get('Origin');
  const baseCors = getCorsHeaders(origin);
  const acrh = req.headers.get('Access-Control-Request-Headers');
  const dynCors = acrh ? {
    ...baseCors,
    'Access-Control-Allow-Headers': `${baseCors['Access-Control-Allow-Headers']}, ${acrh}`
  } : baseCors;
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: dynCors
    });
  }
  // Variables for error context
  let requestData;
  let authenticatedUser = null;
  try {
    // DUAL-CLIENT PATTERN (from our hardened cart-manager)
    // User client for auth verification
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? ''
        }
      }
    });
    // Service client for secure RPC calls
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    // AUTHENTICATION VERIFICATION
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required'
      }), {
        status: 401,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.substring('Bearer '.length);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth verification failed:', authError?.message);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid authentication token'
      }), {
        status: 401,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    authenticatedUser = {
      id: user.id,
      email: user.email
    };
    console.log(`Processing order intent for user: ${authenticatedUser.id}`);
    // Parse request
    requestData = await req.json();
    // Validate payment method
    if (!requestData.payment_method || ![
      'esewa',
      'khalti',
      'npx',
      'cod'
    ].includes(requestData.payment_method)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid payment method. Must be "esewa", "khalti", "npx", or "cod"'
      }), {
        status: 400,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    // GET USER'S CART
    const { data: cartData, error: cartError } = await serviceClient.rpc('get_cart_details_secure', {
      p_user_id: authenticatedUser.id
    });
    if (cartError) {
      console.error('Failed to get cart:', cartError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to retrieve cart'
      }), {
        status: 400,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    const cart = cartData;
    // Validate cart - must have at least products OR bookings
    const hasProducts = cart?.items && cart.items.length > 0;
    const hasBookings = cart?.bookings && cart.bookings.length > 0;
    if (!hasProducts && !hasBookings) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Cart is empty'
      }), {
        status: 400,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    // Calculate total (all values in paisa/cents for precision)
    // CRITICAL: price_snapshot is stored in NPR, must convert to paisa (multiply by 100)
    const product_total = (cart.items || []).reduce((sum, item)=>sum + Math.round(item.price_snapshot * 100) * item.quantity, 0);
    // Bookings already stored in paisa/cents
    const booking_total = (cart.bookings || []).reduce((sum, booking)=>sum + booking.price_cents, 0);
    const subtotal_cents = product_total + booking_total;
    
    // ========================================================================
    // COMBO AVAILABILITY VALIDATION
    // ========================================================================
    // Check if any cart items are part of combos and validate availability
    const comboItems = (cart.items || []).filter((item: any) => item.combo_id);
    if (comboItems.length > 0) {
      // Get unique combo IDs
      const uniqueComboIds = [...new Set(comboItems.map((item: any) => item.combo_id))];
      
      for (const comboId of uniqueComboIds) {
        const { data: availability, error: availError } = await serviceClient.rpc('get_combo_availability', {
          p_combo_id: comboId
        });
        
        if (availError) {
          console.error(`Failed to check combo availability for ${comboId}:`, availError);
          continue; // Don't block checkout for availability check errors
        }
        
        if (availability && !availability.available) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Combo no longer available',
            details: [`The combo "${availability.reason || 'bundle'}" is no longer available. Please remove it from your cart.`]
          }), {
            status: 400,
            headers: {
              ...dynCors,
              'Content-Type': 'application/json'
            }
          });
        }
      }
    }
    
    // TODO: Add tax calculation when frontend displays it
    // For now, match frontend calculation (no tax, just shipping)
    const tax_cents = 0; // Tax not displayed in frontend yet
    const shipping_cents = 9900; // NPR 99 = 9900 paisa (flat rate for MVP)
    const total_cents = subtotal_cents + tax_cents + shipping_cents;
    // ========================================================================
    // PAYMENT GATEWAY INTEGRATION
    // ========================================================================
    const baseUrl = getBaseUrl();
    const paymentMethod = requestData.payment_method;
    let paymentIntentId;
    let externalTransactionId;
    let gatewayPaymentUrl;
    let formFields;
    if (paymentMethod === 'esewa') {
      // eSewa Integration
      const esewaConfig = getEsewaConfig();
      const transactionUuid = crypto.randomUUID();
      const amountNPR = total_cents / 100; // Convert paisa to NPR
      const formData = prepareEsewaPaymentForm(esewaConfig, {
        amount: amountNPR,
        transactionUuid,
        successUrl: `${baseUrl}/payment/callback?provider=esewa`,
        failureUrl: `${baseUrl}/checkout`
      });
      paymentIntentId = `pi_esewa_${Date.now()}_${transactionUuid.substring(0, 8)}`;
      externalTransactionId = transactionUuid;
      gatewayPaymentUrl = formData.action;
      formFields = formData.fields;
    } else if (paymentMethod === 'khalti') {
      // Khalti Integration
      const khaltiSecretKey = getKhaltiSecretKey();
      const amountNPR = total_cents / 100; // Convert paisa to NPR
      const result = await initiateKhaltiPayment(khaltiSecretKey, {
        amount: amountNPR,
        purchase_order_id: `ORDER-${Date.now()}`,
        purchase_order_name: `KB Stylish Order`,
        return_url: `${baseUrl}/payment/callback?provider=khalti`,
        website_url: baseUrl,
        customer_info: requestData.shipping_address ? {
          name: requestData.shipping_address.name,
          email: authenticatedUser.email || '',
          phone: requestData.shipping_address.phone
        } : undefined
      });
      if (!result.success || !result.pidx) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to initiate Khalti payment',
          details: result.error
        }), {
          status: 500,
          headers: {
            ...dynCors,
            'Content-Type': 'application/json'
          }
        });
      }
      paymentIntentId = `pi_khalti_${Date.now()}_${result.pidx.substring(0, 8)}`;
      externalTransactionId = result.pidx;
      gatewayPaymentUrl = result.payment_url;
    } else if (paymentMethod === 'npx') {
      // NPX Integration (Nepal Payment Gateway)
      const npxConfig = getNPXConfig();
      const amountNPR = total_cents / 100; // Convert paisa to NPR
      const merchantTxnId = `pi_npx_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
      
      // Step 1: Get Process ID from NPX
      const processIdResult = await getProcessId(npxConfig, amountNPR, merchantTxnId);
      
      if (!processIdResult.success || !processIdResult.processId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to initiate NPX payment',
          details: processIdResult.error
        }), {
          status: 500,
          headers: {
            ...dynCors,
            'Content-Type': 'application/json'
          }
        });
      }
      
      // Step 2: Prepare gateway form data
      const formData = prepareNPXPaymentForm(npxConfig, {
        amount: amountNPR,
        merchantTxnId,
        processId: processIdResult.processId,
        responseUrl: `${baseUrl}/payment/callback?provider=esewa`
      });
      
      paymentIntentId = merchantTxnId; // Use same ID for consistency
      externalTransactionId = null; // Will be set by gateway later
      gatewayPaymentUrl = formData.action;
      formFields = formData.fields;
      
      // Store ProcessId in metadata for verification
      requestData.npx_process_id = processIdResult.processId;
    } else if (paymentMethod === 'cod') {
      // COD Integration
      paymentIntentId = `pi_cod_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
      externalTransactionId = `cod_${crypto.randomUUID().substring(0, 8)}`;
      gatewayPaymentUrl = null;
      formFields = null;
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unsupported payment method'
      }), {
        status: 400,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    // STORE PAYMENT INTENT IN DATABASE
    const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry
    const { error: insertError } = await serviceClient.from('payment_intents').insert({
      user_id: authenticatedUser.id,
      cart_id: cart.id,
      payment_intent_id: paymentIntentId,
      external_transaction_id: externalTransactionId,
      gateway_payment_url: gatewayPaymentUrl,
      amount_cents: total_cents,
      currency: 'NPR',
      status: paymentMethod === 'cod' ? 'succeeded' : 'pending',
      provider: paymentMethod,
      metadata: {
        subtotal_cents,
        tax_cents,
        shipping_cents,
        shipping_address: requestData.shipping_address,
        items_count: (cart.items || []).length,
        bookings_count: (cart.bookings || []).length,
        ...(requestData.npx_process_id ? { npx_process_id: requestData.npx_process_id } : {})
      },
      expires_at: expires_at.toISOString()
    });
    if (insertError) {
      console.error('Failed to store payment intent:', insertError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to create payment intent'
      }), {
        status: 500,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    // PERFORM SOFT INVENTORY RESERVATION
    const { data: reservationResult, error: reservationError } = await serviceClient.rpc('reserve_inventory_for_payment', {
      p_cart_id: cart.id,
      p_payment_intent_id: paymentIntentId
    });
    if (reservationError || !reservationResult?.success) {
      // Rollback payment intent
      await serviceClient.from('payment_intents').update({
        status: 'failed'
      }).eq('payment_intent_id', paymentIntentId);
      const errors = reservationResult?.errors || [
        'Failed to reserve inventory'
      ];
      return new Response(JSON.stringify({
        success: false,
        error: 'Inventory reservation failed',
        details: errors
      }), {
        status: 400,
        headers: {
          ...dynCors,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Payment intent created: ${paymentIntentId} for ${total_cents} paisa (${total_cents / 100} NPR)`);
    console.log(`External transaction ID: ${externalTransactionId}`);
    console.log(`Payment URL: ${gatewayPaymentUrl}`);

    // ENQUEUE ORDER FINALIZATION FOR COD IMMEDIATELY
    if (paymentMethod === 'cod') {
      const idempotencyKey = `payment_cod_${externalTransactionId}`;
      const { error: jobError } = await serviceClient.from('job_queue').insert({
        job_type: 'finalize_order',
        payload: {
          payment_intent_id: paymentIntentId,
          user_id: authenticatedUser.id,
          cart_id: cart.id,
          provider: 'cod',
          external_transaction_id: externalTransactionId,
          amount_cents: total_cents,
          is_cod: true
        },
        priority: 1,
        status: 'pending',
        idempotency_key: idempotencyKey,
        max_attempts: 3
      });
      
      if (jobError) {
        console.error('Failed to enqueue COD order job:', jobError);
        // This is critical - if we can't enqueue the job, we should probably fail
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to process COD order. Please try again or contact support.'
        }), {
          status: 500,
          headers: {
            ...dynCors,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('COD order finalization job enqueued:', idempotencyKey);

      // IMMEDIATELY trigger order-worker to process COD orders without waiting for cron
      // This eliminates the 2-minute delay from cron schedule
      try {
        const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/order-worker`;
        const workerResponse = await fetch(workerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ max_jobs: 1 })
        });
        const workerResult = await workerResponse.json();
        console.log('COD order-worker triggered immediately:', workerResult);
      } catch (workerError) {
        // Don't fail the request if worker trigger fails - cron will pick it up
        console.error('Failed to trigger order-worker (cron will pick up):', workerError);
      }
    }

    // Return success response
    const response = {
      success: true,
      payment_intent_id: paymentIntentId,
      payment_method: paymentMethod,
      payment_url: gatewayPaymentUrl,
      form_fields: formFields,
      amount_cents: total_cents,
      expires_at: expires_at.toISOString(),
      redirect_to_success: paymentMethod === 'cod'
    };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...dynCors,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    // Production error logging
    const errorContext = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      request: {
        hasAuth: !!authenticatedUser,
        userId: authenticatedUser?.id,
        url: req.url,
        method: req.method
      }
    };
    console.error('Create order intent error:', JSON.stringify(errorContext));
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...dynCors,
        'Content-Type': 'application/json'
      }
    });
  }
});
