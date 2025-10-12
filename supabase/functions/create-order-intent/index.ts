import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';
import { prepareEsewaPaymentForm, type EsewaConfig } from '../_shared/esewa.ts';
import { initiateKhaltiPayment, type KhaltiPaymentRequest } from '../_shared/khalti.ts';

/**
 * CREATE ORDER INTENT - Live Order Pipeline Entry Point
 * Principal Backend Engineer Implementation - Phase 3 Refactor
 * 
 * Security Model:
 * - Requires authenticated user (verified via dual-client pattern)
 * - Reads user's cart using secure RPC
 * - Performs soft inventory reservation
 * - Integrates with real payment gateways (eSewa/Khalti)
 * - Returns payment URL and form data for frontend redirect
 * 
 * CRITICAL SECURITY:
 * - Stores external_transaction_id for verification lookup
 * - Never trusts client-side payment confirmations
 * - All verifications happen in verify-payment Edge Function
 */

interface OrderIntentRequest {
  payment_method: 'esewa' | 'khalti'; // REQUIRED: User's selected payment gateway
  shipping_address?: {
    name: string;
    phone: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country?: string;
  };
  metadata?: Record<string, any>;
}

interface OrderIntentResponse {
  success: boolean;
  payment_intent_id?: string;
  payment_method?: 'esewa' | 'khalti';
  payment_url?: string;
  form_fields?: Record<string, string>; // eSewa only
  amount_cents?: number;
  expires_at?: string;
  error?: string;
  details?: any;
}

// Environment configuration helpers
function getBaseUrl(): string {
  const baseUrl = Deno.env.get('BASE_URL');
  if (baseUrl) return baseUrl;
  
  const vercelUrl = Deno.env.get('VERCEL_URL');
  if (vercelUrl) return `https://${vercelUrl}`;
  
  return 'http://localhost:3000';
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
  // Build dynamic CORS headers per request
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

  // Variables for error context
  let requestData: OrderIntentRequest | undefined;
  let authenticatedUser: { id: string; email?: string } | null = null;

  try {
    // DUAL-CLIENT PATTERN (from our hardened cart-manager)
    // User client for auth verification
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );
    
    // Service client for secure RPC calls
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    // AUTHENTICATION VERIFICATION
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring('Bearer '.length);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth verification failed:', authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication token' }),
        { status: 401, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    authenticatedUser = { id: user.id, email: user.email };
    console.log(`Processing order intent for user: ${authenticatedUser.id}`);

    // Parse request
    requestData = await req.json() as OrderIntentRequest;

    // Validate payment method
    if (!requestData.payment_method || !['esewa', 'khalti'].includes(requestData.payment_method)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payment method. Must be "esewa" or "khalti"' }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // GET USER'S CART
    const { data: cartData, error: cartError } = await serviceClient.rpc('get_cart_details_secure', {
      p_user_id: authenticatedUser.id
    });

    if (cartError) {
      console.error('Failed to get cart:', cartError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to retrieve cart' }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    const cart = cartData as any;
    
    // Validate cart - must have at least products OR bookings
    const hasProducts = cart?.items && cart.items.length > 0;
    const hasBookings = cart?.bookings && cart.bookings.length > 0;
    
    if (!hasProducts && !hasBookings) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart is empty' }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total (all values in paisa/cents for precision)
    // CRITICAL: price_snapshot is stored in NPR, must convert to paisa (multiply by 100)
    const product_total = (cart.items || []).reduce((sum: number, item: any) => 
      sum + (Math.round(item.price_snapshot * 100) * item.quantity), 0
    );
    
    // Bookings already stored in paisa/cents
    const booking_total = (cart.bookings || []).reduce((sum: number, booking: any) =>
      sum + booking.price_cents, 0
    );

    const subtotal_cents = product_total + booking_total;

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
    
    let paymentIntentId: string;
    let externalTransactionId: string;
    let gatewayPaymentUrl: string;
    let formFields: Record<string, string> | undefined;

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
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to initiate Khalti payment', 
            details: result.error 
          }),
          { status: 500, headers: { ...dynCors, 'Content-Type': 'application/json' } }
        );
      }

      paymentIntentId = `pi_khalti_${Date.now()}_${result.pidx.substring(0, 8)}`;
      externalTransactionId = result.pidx;
      gatewayPaymentUrl = result.payment_url!;

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Unsupported payment method' }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // STORE PAYMENT INTENT IN DATABASE
    const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry
    
    const { error: insertError } = await serviceClient
      .from('payment_intents')
      .insert({
        user_id: authenticatedUser.id,
        cart_id: cart.id,
        payment_intent_id: paymentIntentId,
        external_transaction_id: externalTransactionId, // CRITICAL for verification lookup
        gateway_payment_url: gatewayPaymentUrl,
        amount_cents: total_cents,
        currency: 'NPR',
        status: 'pending',
        provider: paymentMethod,
        metadata: {
          subtotal_cents,
          tax_cents,
          shipping_cents,
          shipping_address: requestData.shipping_address,
          items_count: (cart.items || []).length,
          bookings_count: (cart.bookings || []).length
        },
        expires_at: expires_at.toISOString()
      });

    if (insertError) {
      console.error('Failed to store payment intent:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create payment intent' }),
        { status: 500, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // PERFORM SOFT INVENTORY RESERVATION
    const { data: reservationResult, error: reservationError } = await serviceClient.rpc(
      'reserve_inventory_for_payment',
      {
        p_cart_id: cart.id,
        p_payment_intent_id: paymentIntentId
      }
    );

    if (reservationError || !reservationResult?.success) {
      // Rollback payment intent
      await serviceClient
        .from('payment_intents')
        .update({ status: 'failed' })
        .eq('payment_intent_id', paymentIntentId);

      const errors = reservationResult?.errors || ['Failed to reserve inventory'];
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Inventory reservation failed',
          details: errors
        }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Payment intent created: ${paymentIntentId} for ${total_cents} paisa (${total_cents/100} NPR)`);
    console.log(`External transaction ID: ${externalTransactionId}`);
    console.log(`Payment URL: ${gatewayPaymentUrl}`);

    // Return success response
    const response: OrderIntentResponse = {
      success: true,
      payment_intent_id: paymentIntentId,
      payment_method: paymentMethod,
      payment_url: gatewayPaymentUrl,
      form_fields: formFields, // Only populated for eSewa
      amount_cents: total_cents,
      expires_at: expires_at.toISOString()
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...dynCors, 'Content-Type': 'application/json' }
      }
    );

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
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...dynCors, 'Content-Type': 'application/json' } }
    );
  }
});
