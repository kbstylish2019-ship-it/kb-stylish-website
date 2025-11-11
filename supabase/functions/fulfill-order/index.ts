import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from './_shared/cors.ts';
/**
 * FULFILL-ORDER WEBHOOK ENDPOINT
 * 
 * Receives webhooks from payment providers WITHOUT JWT authentication.
 * This is configured in supabase/config.toml with verify_jwt = false
 */ Deno.serve(async (req)=>{
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') || req.headers.get('x-webhook-signature') || req.headers.get('x-hub-signature-256') || req.headers.get('x-mock-signature');
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      console.error('Invalid JSON payload:', e);
      return new Response(JSON.stringify({
        error: 'Invalid JSON payload'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const provider = payload.provider || 'mock_provider';
    const eventId = payload.event_id || `evt_${Date.now()}`;
    const eventType = payload.event_type || 'payment.succeeded';
    // For mock provider, skip complex signature verification
    if (provider === 'mock_provider' && signature === 'test_signature_123') {
      // Store webhook event
      const { data: webhookEvent, error: webhookError } = await supabaseClient.from('webhook_events').insert({
        provider,
        event_id: eventId,
        event_type: eventType,
        payload,
        signature: signature || '',
        verified: true,
        processed: false
      }).select().single();
      // Handle duplicate (idempotency)
      if (webhookError?.code === '23505') {
        return new Response(JSON.stringify({
          success: true,
          message: 'Event already processed',
          event_id: eventId
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (webhookError) {
        console.error('Failed to store webhook event:', webhookError);
        return new Response(JSON.stringify({
          error: 'Failed to store webhook event'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Enqueue job for processing
      const { error: queueError } = await supabaseClient.from('job_queue').insert({
        job_type: 'finalize_order',
        payload: {
          webhook_event_id: webhookEvent.id,
          provider,
          event_id: eventId,
          event_type: eventType,
          payment_intent_id: payload.payment_intent_id,
          amount: payload.amount,
          customer_id: payload.customer_id
        },
        priority: 1,
        status: 'pending',
        attempts: 0,
        max_attempts: 3
      });
      if (queueError) {
        console.error('Failed to enqueue job:', queueError);
        return new Response(JSON.stringify({
          error: 'Failed to queue for processing'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        event_id: eventId,
        queued: true
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // For non-mock providers, return error
    return new Response(JSON.stringify({
      error: 'Invalid signature or unsupported provider'
    }), {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error in webhook handler:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
