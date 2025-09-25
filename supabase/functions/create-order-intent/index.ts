import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

/**
 * CREATE ORDER INTENT - Live Order Pipeline Entry Point
 * Principal Backend Engineer Implementation
 * 
 * Security Model:
 * - Requires authenticated user (verified via dual-client pattern)
 * - Reads user's cart using secure RPC
 * - Performs soft inventory reservation
 * - Generates payment intent with mock provider
 * - Returns payment_intent_id for frontend processing
 */

interface OrderIntentRequest {
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
  client_secret?: string;
  amount_cents?: number;
  expires_at?: string;
  error?: string;
  details?: any;
}

// Mock payment provider SDK
class MockPaymentProvider {
  static async createPaymentIntent(
    amount_cents: number,
    currency: string,
    metadata: Record<string, any>
  ): Promise<{
    id: string;
    client_secret: string;
    status: string;
  }> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Generate mock payment intent
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    
    return {
      id: `pi_mock_${timestamp}_${random}`,
      client_secret: `pi_mock_${timestamp}_${random}_secret_${Math.random().toString(36).substring(2, 15)}`,
      status: 'requires_payment_method'
    };
  }
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
    
    // Validate cart
    if (!cart || !cart.items || cart.items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cart is empty' }),
        { status: 400, headers: { ...dynCors, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total
    const subtotal_cents = cart.items.reduce((sum: number, item: any) => 
      sum + (item.price_snapshot * item.quantity), 0
    );

    // TODO: Add tax and shipping calculation based on address
    const tax_cents = Math.floor(subtotal_cents * 0.13); // 13% VAT for Nepal
    const shipping_cents = 500; // Flat rate for MVP
    const total_cents = subtotal_cents + tax_cents + shipping_cents;

    // CREATE PAYMENT INTENT WITH MOCK PROVIDER
    const paymentIntent = await MockPaymentProvider.createPaymentIntent(
      total_cents,
      'NPR',
      {
        user_id: authenticatedUser.id,
        cart_id: cart.id,
        items: cart.items.length,
        shipping_address: requestData.shipping_address,
        ...requestData.metadata
      }
    );

    // STORE PAYMENT INTENT IN DATABASE
    const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry
    
    const { error: insertError } = await serviceClient
      .from('payment_intents')
      .insert({
        user_id: authenticatedUser.id,
        cart_id: cart.id,
        payment_intent_id: paymentIntent.id,
        amount_cents: total_cents,
        currency: 'NPR',
        status: 'pending',
        provider: 'mock_provider',
        metadata: {
          subtotal_cents,
          tax_cents,
          shipping_cents,
          shipping_address: requestData.shipping_address,
          items_count: cart.items.length
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
        p_payment_intent_id: paymentIntent.id
      }
    );

    if (reservationError || !reservationResult?.success) {
      // Rollback payment intent
      await serviceClient
        .from('payment_intents')
        .update({ status: 'failed' })
        .eq('payment_intent_id', paymentIntent.id);

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

    console.log(`Payment intent created: ${paymentIntent.id} for ${total_cents} NPR`);

    // Return success response
    const response: OrderIntentResponse = {
      success: true,
      payment_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
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
