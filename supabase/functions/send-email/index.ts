// ============================================================================
// SEND-EMAIL EDGE FUNCTION
// Purpose: Send emails via Resend API with retry logic and tracking
// Runtime: Deno (Supabase Edge Functions)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { renderEmailTemplate } from '../_shared/email/templates.ts';
import { EmailRequest, EmailResponse } from '../_shared/email/types.ts';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SENDER_EMAIL = 'KB Stylish <noreply@kbstylish.com.np>';
const MAX_RETRY_ATTEMPTS = 3;
const FEATURE_EMAIL_ENABLED = Deno.env.get('FEATURE_EMAIL_ENABLED') !== 'false';

// ============================================================================
// SINGLETON RESEND CLIENT (prevents cold start penalty)
// ============================================================================

let resendInstance: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured - development mode');
    return null;
  }
  
  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
    console.log('[Email] Resend client initialized');
  }
  
  return resendInstance;
}

// ============================================================================
// SUPABASE CLIENT (service role for database access)
// ============================================================================

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    // Parse request
    const payload: EmailRequest = await req.json();
    const { email_type, recipient_email, recipient_user_id, recipient_name, template_data, reference_id, reference_type } = payload;
    
    console.log('[Email] Received request:', {
      email_type,
      recipient_email: recipient_email?.substring(0, 3) + '***', // Partial for privacy
      reference_id,
    });
    
    // Validate input
    if (!email_type || !recipient_email || !template_data) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: email_type, recipient_email, template_data',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check feature flag
    if (!FEATURE_EMAIL_ENABLED) {
      console.log('[Email] Feature disabled - skipping send');
      return new Response(JSON.stringify({
        success: true,
        mode: 'disabled',
        sent: false,
        message: 'Email feature is currently disabled',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = getSupabaseClient();
    
    // Check for duplicate (idempotency)
    if (reference_id) {
      const { data: existing } = await supabase
        .from('email_logs')
        .select('id, resend_email_id')
        .eq('email_type', email_type)
        .eq('recipient_email', recipient_email)
        .eq('reference_id', reference_id)
        .maybeSingle();
      
      if (existing) {
        console.log('[Email] Duplicate detected - skipping send');
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          message: 'Email already sent',
          resend_email_id: existing.resend_email_id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Get Resend client
    const resend = getResendClient();
    
    if (!resend) {
      // Development mode - log instead of sending
      console.log('[Email] Development mode - would send:', {
        type: email_type,
        to: recipient_email,
        subject: 'Email preview',
      });
      
      // Still log to database for testing
      await supabase.from('email_logs').insert({
        recipient_user_id: recipient_user_id || null,
        recipient_email: recipient_email,
        recipient_name: recipient_name || null,
        email_type: email_type,
        subject: `[DEV] ${email_type}`,
        template_name: email_type,
        status: 'sent',
        reference_id: reference_id || null,
        reference_type: reference_type || null,
        sent_at: new Date().toISOString(),
      });
      
      return new Response(JSON.stringify({
        success: true,
        mode: 'development',
        sent: false,
        message: 'Development mode - email logged but not sent',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Render email template
    const template = await renderEmailTemplate(email_type, template_data, recipient_user_id);
    
    // Send email with retry logic
    const result = await sendWithRetry(resend, {
      from: SENDER_EMAIL,
      to: recipient_email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    }, MAX_RETRY_ATTEMPTS);
    
    if (!result.success) {
      // Log failure
      await supabase.from('email_logs').insert({
        recipient_user_id: recipient_user_id || null,
        recipient_email: recipient_email,
        recipient_name: recipient_name || null,
        email_type: email_type,
        subject: template.subject,
        template_name: email_type,
        status: 'failed',
        failure_reason: result.error,
        attempts: MAX_RETRY_ATTEMPTS,
        reference_id: reference_id || null,
        reference_type: reference_type || null,
        failed_at: new Date().toISOString(),
      });
      
      throw new Error(result.error);
    }
    
    // Log success
    await supabase.from('email_logs').insert({
      recipient_user_id: recipient_user_id || null,
      recipient_email: recipient_email,
      recipient_name: recipient_name || null,
      email_type: email_type,
      subject: template.subject,
      template_name: email_type,
      resend_email_id: result.id,
      status: 'sent',
      attempts: result.attempts || 1,
      reference_id: reference_id || null,
      reference_type: reference_type || null,
      sent_at: new Date().toISOString(),
    });
    
    console.log('[Email] Sent successfully:', {
      email_type,
      resend_email_id: result.id,
      attempts: result.attempts,
    });
    
    return new Response(JSON.stringify({
      success: true,
      resend_email_id: result.id,
      message: 'Email sent successfully',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[Email] Send failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to send email',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// RETRY LOGIC WITH EXPONENTIAL BACKOFF
// ============================================================================

async function sendWithRetry(
  resend: Resend,
  email: any,
  maxAttempts: number = 3
): Promise<{ success: boolean; id?: string; error?: string; attempts?: number }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Email] Attempt ${attempt}/${maxAttempts}`);
      
      const result = await resend.emails.send(email);
      
      console.log('[Email] Resend API success:', result);
      
      return {
        success: true,
        id: result.id,
        attempts: attempt,
      };
      
    } catch (error: any) {
      const isLastAttempt = attempt === maxAttempts;
      
      console.error(`[Email] Attempt ${attempt} failed:`, error);
      
      if (isLastAttempt) {
        return {
          success: false,
          error: error.message || 'Unknown error',
          attempts: attempt,
        };
      }
      
      // Exponential backoff with jitter
      // Delays: ~2s, ~5s, ~9s
      const delay = Math.min(
        1000 * Math.pow(2, attempt) + Math.random() * 1000,
        10000
      );
      
      console.log(`[Email] Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return {
    success: false,
    error: 'Max retries exceeded',
    attempts: maxAttempts,
  };
}
