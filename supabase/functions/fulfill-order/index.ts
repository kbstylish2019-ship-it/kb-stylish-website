import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * FULFILL-ORDER WEBHOOK - Live Order Pipeline
 * Principal Backend Engineer Implementation
 * 
 * High-throughput webhook ingestion with idempotency:
 * 1. Verify webhook signature (supports mock provider for testing)
 * 2. Store event with idempotency guarantee
 * 3. Enqueue job for async processing
 * 4. Return 200 immediately
 * 
 * Prevents "thundering herd" by decoupling webhook arrival from order processing.
 * Supports: Mock Provider, Stripe, eSewa, Khalti, PayPal
 */

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
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

    // Parse request body
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') || 
                     req.headers.get('x-webhook-signature') || 
                     req.headers.get('x-hub-signature-256');
    
    // Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      console.error('Invalid JSON payload:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine provider and event details
    const provider = determineProvider(payload, req.headers);
    const eventId = extractEventId(payload, provider);
    const eventType = extractEventType(payload, provider);

    if (!provider || !eventId || !eventType) {
      console.error('Missing required webhook fields', { provider, eventId, eventType });
      return new Response(
        JSON.stringify({ error: 'Missing required webhook fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify webhook signature (provider-specific)
    const isValid = await verifyWebhookSignature(
      provider,
      body,
      signature,
      Deno.env.get(`${provider.toUpperCase()}_WEBHOOK_SECRET`)
    );

    if (!isValid) {
      console.error('Invalid webhook signature', { provider, eventId });
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store webhook event with idempotency (INSERT ... ON CONFLICT DO NOTHING)
    const { data: webhookEvent, error: webhookError } = await supabaseClient
      .from('webhook_events')
      .insert({
        provider,
        event_id: eventId,
        event_type: eventType,
        payload,
        signature: signature || '',
        verified: isValid,
        processed: false
      })
      .select()
      .single();

    // If insert failed due to duplicate (UNIQUE constraint), that's fine - idempotency
    if (webhookError?.code === '23505') {
      console.log('Duplicate webhook event received (idempotent)', { provider, eventId });
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Event already processed',
          event_id: eventId 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (webhookError) {
      console.error('Failed to store webhook event:', webhookError);
      // Return 500 to trigger provider retry
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enqueue job for async processing
    const jobPayload = {
      webhook_event_id: webhookEvent.id,
      provider,
      event_id: eventId,
      event_type: eventType,
      // Extract critical fields for quick processing decision
      payment_intent_id: extractPaymentIntentId(payload, provider),
      amount: extractAmount(payload, provider),
      customer_id: extractCustomerId(payload, provider)
    };

    const { error: queueError } = await supabaseClient
      .from('job_queue')
      .insert({
        job_type: mapEventTypeToJobType(eventType),
        payload: jobPayload,
        priority: calculatePriority(eventType, payload),
        status: 'pending',
        idempotency_key: `${provider}_${eventId}`, // Prevent duplicate jobs
        max_attempts: 3
      });

    if (queueError) {
      console.error('Failed to enqueue job:', queueError);
      // Update webhook event status
      await supabaseClient
        .from('webhook_events')
        .update({ 
          status: 'failed',
          error_message: 'Failed to enqueue for processing'
        })
        .eq('id', webhookEvent.id);

      // Still return 500 to trigger retry
      return new Response(
        JSON.stringify({ error: 'Failed to queue for processing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success - return 200 immediately
    console.log('Webhook event ingested successfully', { provider, eventId, eventType });
    return new Response(
      JSON.stringify({ 
        success: true,
        event_id: eventId,
        queued: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in webhook handler:', error);
    // Return 500 to trigger provider retry
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions

function determineProvider(payload: any, headers: Headers): string | null {
  // Mock Provider (for testing)
  if (payload.provider === 'mock_provider' && payload.mock_signature) {
    return 'mock_provider';
  }
  
  // Stripe
  if (payload.object === 'event' && payload.api_version) {
    return 'stripe';
  }
  
  // eSewa
  if (payload.product_code && payload.transaction_uuid) {
    return 'esewa';
  }
  
  // Khalti
  if (payload.idx && payload.payment_method === 'Khalti') {
    return 'khalti';
  }
  
  // PayPal
  if (payload.event_type && payload.resource_type) {
    return 'paypal';
  }

  // Check headers as fallback
  if (headers.get('x-mock-signature')) return 'mock_provider';
  if (headers.get('stripe-signature')) return 'stripe';
  if (headers.get('x-esewa-signature')) return 'esewa';
  if (headers.get('x-khalti-signature')) return 'khalti';
  
  return null;
}

function extractEventId(payload: any, provider: string): string | null {
  switch (provider) {
    case 'mock_provider':
      return payload.event_id;
    case 'stripe':
      return payload.id;
    case 'esewa':
      return payload.transaction_uuid;
    case 'khalti':
      return payload.idx;
    case 'paypal':
      return payload.id;
    default:
      return null;
  }
}

function extractEventType(payload: any, provider: string): string | null {
  switch (provider) {
    case 'mock_provider':
      return payload.event_type || 'payment.succeeded';
    case 'stripe':
      return payload.type; // e.g., 'payment_intent.succeeded'
    case 'esewa':
      return payload.status === 'COMPLETE' ? 'payment.succeeded' : 'payment.failed';
    case 'khalti':
      return payload.status === 'Completed' ? 'payment.succeeded' : 'payment.failed';
    case 'paypal':
      return payload.event_type; // e.g., 'PAYMENT.CAPTURE.COMPLETED'
    default:
      return null;
  }
}

function extractPaymentIntentId(payload: any, provider: string): string | null {
  switch (provider) {
    case 'mock_provider':
      return payload.payment_intent_id;
    case 'stripe':
      return payload.data?.object?.id || payload.data?.object?.payment_intent;
    case 'esewa':
      return payload.refId;
    case 'khalti':
      return payload.purchase_order_id;
    case 'paypal':
      return payload.resource?.id;
    default:
      return null;
  }
}

function extractAmount(payload: any, provider: string): number | null {
  switch (provider) {
    case 'stripe':
      return payload.data?.object?.amount || payload.data?.object?.amount_received;
    case 'esewa':
      return parseFloat(payload.total_amount);
    case 'khalti':
      return payload.amount;
    case 'paypal':
      return parseFloat(payload.resource?.amount?.value || '0');
    default:
      return null;
  }
}

function extractCustomerId(payload: any, provider: string): string | null {
  switch (provider) {
    case 'stripe':
      return payload.data?.object?.customer;
    case 'esewa':
      return payload.user_id;
    case 'khalti':
      return payload.user?.id;
    case 'paypal':
      return payload.resource?.payer?.payer_id;
    default:
      return null;
  }
}

async function verifyWebhookSignature(
  provider: string,
  body: string,
  signature: string | null,
  secret: string | undefined
): Promise<boolean> {
  // Mock provider doesn't require signature verification in test mode
  if (provider === 'mock_provider') {
    const payload = JSON.parse(body);
    return payload.mock_signature === 'test_signature_123';
  }

  if (!signature || !secret) {
    console.warn('Missing signature or secret for webhook verification');
    return false;
  }

  switch (provider) {
    case 'stripe':
      // Stripe signature verification
      try {
        const encoder = new TextEncoder();
        const parts = signature.split(',');
        const timestamp = parts.find(p => p.startsWith('t='))?.substring(2);
        const sig = parts.find(p => p.startsWith('v1='))?.substring(3);
        
        if (!timestamp || !sig) return false;
        
        const payload = `${timestamp}.${body}`;
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        
        const expectedSig = await crypto.subtle.sign(
          'HMAC',
          key,
          encoder.encode(payload)
        );
        
        const expectedSigHex = Array.from(new Uint8Array(expectedSig))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        return sig === expectedSigHex;
      } catch (e) {
        console.error('Stripe signature verification failed:', e);
        return false;
      }
    
    case 'esewa':
    case 'khalti':
    case 'paypal':
      // Simplified HMAC verification for other providers
      try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        
        const expectedSig = await crypto.subtle.sign(
          'HMAC',
          key,
          encoder.encode(body)
        );
        
        const expectedSigBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
        return signature === expectedSigBase64;
      } catch (e) {
        console.error(`${provider} signature verification failed:`, e);
        return false;
      }
    
    default:
      console.warn(`Unknown provider for signature verification: ${provider}`);
      return false;
  }
}

function mapEventTypeToJobType(eventType: string): string {
  // Map webhook event types to internal job types
  if (eventType.includes('succeeded') || eventType.includes('completed')) {
    return 'finalize_order';
  }
  if (eventType.includes('failed')) {
    return 'handle_payment_failure';
  }
  if (eventType.includes('refund')) {
    return 'process_refund';
  }
  if (eventType.includes('dispute')) {
    return 'handle_dispute';
  }
  
  return 'process_webhook'; // Generic fallback
}

function calculatePriority(eventType: string, payload: any): number {
  // Priority scale: 1 (highest) to 10 (lowest)
  
  // Payment success is highest priority
  if (eventType.includes('succeeded') || eventType.includes('completed')) {
    // Large amounts get higher priority
    const amount = extractAmount(payload, 'stripe') || 0;
    if (amount > 100000) return 1; // > $1000
    if (amount > 10000) return 2;  // > $100
    return 3;
  }
  
  // Payment failures are high priority
  if (eventType.includes('failed')) {
    return 4;
  }
  
  // Refunds are medium priority
  if (eventType.includes('refund')) {
    return 5;
  }
  
  // Disputes are medium-low priority
  if (eventType.includes('dispute')) {
    return 6;
  }
  
  // Everything else is low priority
  return 7;
}
