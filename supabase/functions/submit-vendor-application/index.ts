import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
Deno.serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(req.headers.get('origin'))
    });
  }
  // Only accept POST requests
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', 'METHOD_NOT_ALLOWED', 405, getCorsHeaders(req.headers.get('origin')));
  }
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  try {
    // ========================================================================
    // STEP 1: AUTHENTICATION
    // ========================================================================
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    const user = await verifyUser(authHeader, userClient);
    if (!user) {
      console.error('[submit-vendor-application] Authentication failed');
      return errorResponse('Unauthorized. Please log in to submit an application.', 'AUTH_REQUIRED', 401, corsHeaders);
    }
    console.log('[submit-vendor-application] Authenticated user:', user.id);
    // ========================================================================
    // STEP 2: PARSE AND VALIDATE REQUEST BODY
    // ========================================================================
    let applicationData;
    try {
      applicationData = await req.json();
    } catch (error) {
      console.error('[submit-vendor-application] JSON parse error:', error);
      return errorResponse('Invalid request body. Expected JSON.', 'INVALID_JSON', 400, corsHeaders);
    }
    // Basic validation (RPC does comprehensive validation)
    if (!applicationData.business_name || !applicationData.business_type || !applicationData.email || !applicationData.phone || !applicationData.payout_method) {
      return errorResponse('Missing required fields: business_name, business_type, email, phone, payout_method', 'MISSING_FIELDS', 400, corsHeaders);
    }
    console.log('[submit-vendor-application] Submitting application for:', applicationData.business_name);
    // ========================================================================
    // STEP 3: CALL SECURE RPC USING SERVICE CLIENT
    // ========================================================================
    // Note: RPC is SECURITY DEFINER and locked to service_role execution
    // This prevents users from calling it directly
    // 
    // ✅ FIX APPLIED: Pass validated user.id as parameter instead of relying on auth.uid()
    // auth.uid() returns NULL in service_role context, so we explicitly pass the user ID
    // that was validated by the Edge Function's JWT verification above
    const { data: rpcResult, error: rpcError } = await serviceClient.rpc('submit_vendor_application_secure', {
      p_user_id: user.id,
      p_application_data: {
        business_name: applicationData.business_name,
        business_type: applicationData.business_type,
        contact_name: applicationData.contact_name,
        email: applicationData.email,
        phone: applicationData.phone,
        website: applicationData.website || null,
        payout_method: applicationData.payout_method,
        bank_name: applicationData.bank_name || null,
        bank_account_name: applicationData.bank_account_name || null,
        bank_account_number: applicationData.bank_account_number || null,
        bank_branch: applicationData.bank_branch || null,
        esewa_number: applicationData.esewa_number || null,
        khalti_number: applicationData.khalti_number || null
      }
    });
    if (rpcError) {
      console.error('[submit-vendor-application] RPC error:', rpcError);
      return errorResponse('Failed to submit application. Please try again.', 'RPC_ERROR', 500, corsHeaders);
    }
    // ========================================================================
    // STEP 4: RETURN RESULT
    // ========================================================================
    const result = rpcResult;
    if (!result.success) {
      console.warn('[submit-vendor-application] Application submission failed:', result.error);
      return new Response(JSON.stringify({
        success: false,
        error: result.error || 'Application submission failed',
        error_code: result.error_code || 'SUBMISSION_FAILED'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    console.log('[submit-vendor-application] Application submitted successfully for user:', user.id);
    return new Response(JSON.stringify({
      success: true,
      message: result.message || 'Application submitted successfully!'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('[submit-vendor-application] Unexpected error:', error);
    return errorResponse('An unexpected error occurred. Please try again or contact support.', 'INTERNAL_ERROR', 500, corsHeaders);
  }
});
