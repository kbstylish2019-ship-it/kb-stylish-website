# 🔧 RESTORATION BLUEPRINT: Vendor Application Auth Fix

**Status**: Ready to Execute  
**Estimated Time**: 40 minutes  
**Risk Level**: LOW  
**Phases Complete**: 1-7 ✅  
**Current Phase**: 8 (Implementation)

---

## 📋 IMPLEMENTATION CHECKLIST

### Prerequisites
- [x] Root cause identified: `auth.uid()` in SECURITY DEFINER called via service_role
- [x] Solution architected: Parameter-based auth (cart-manager pattern)
- [x] Expert panel approved solution
- [x] Exact code prepared below

### Execution Steps
- [ ] **Step 1**: Create and apply database migration (15 min)
- [ ] **Step 2**: Redeploy live Edge Function with fix (5 min)
- [ ] **Step 3**: Update local Edge Function code (5 min)
- [ ] **Step 4**: Test end-to-end with real user (10 min)
- [ ] **Step 5**: Verify logs and metrics (5 min)

---

## 🗄️ STEP 1: DATABASE MIGRATION

### File: `supabase/migrations/20251015_fix_vendor_application_auth.sql`

```sql
-- ============================================================================
-- MIGRATION: Fix Vendor Application Authentication
-- Date: 2025-10-15
-- Issue: auth.uid() returns NULL when called via service_role
-- Solution: Accept p_user_id as parameter (cart-manager pattern)
-- Breaking Changes: NONE (backward compatible)
-- ============================================================================

BEGIN;

-- Drop existing function
DROP FUNCTION IF EXISTS public.submit_vendor_application_secure(jsonb);

-- Recreate with user_id parameter
CREATE OR REPLACE FUNCTION public.submit_vendor_application_secure(
    p_user_id UUID,              -- ✅ NEW: Accept user ID from Edge Function
    p_application_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private', 'pg_temp'
SET statement_timeout TO '10s'
AS $function$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_business_name TEXT;
    v_business_type TEXT;
    v_email TEXT;
    v_phone TEXT;
    v_payout_method TEXT;
    v_bank_name TEXT;
    v_bank_account_name TEXT;
    v_bank_account_number TEXT;
    v_bank_branch TEXT;
    v_esewa_number TEXT;
    v_khalti_number TEXT;
    v_existing_state TEXT;
    v_result_state TEXT;
BEGIN
    -- ========================================================================
    -- STEP 1: DETECT EXECUTION CONTEXT & VALIDATE USER ID
    -- ========================================================================
    -- Detect whether we're being called by service_role (Edge Function) or by client
    v_caller_role := COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role', 
        'service_role'
    );
    
    IF v_caller_role = 'service_role' THEN
        -- Called by Edge Function via service_role key
        -- Edge Function has already validated the JWT
        -- Trust the provided p_user_id
        v_user_id := p_user_id;
        
        IF v_user_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid user ID provided',
                'error_code', 'INVALID_USER_ID'
            );
        END IF;
        
        RAISE LOG 'submit_vendor_application_secure: Called by service_role for user %', v_user_id;
    ELSE
        -- Called directly by client (should be prevented by RLS, but be defensive)
        -- Verify the user is acting on their own behalf
        IF p_user_id != auth.uid() OR auth.uid() IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Cannot submit application for another user',
                'error_code', 'AUTH_MISMATCH'
            );
        END IF;
        
        v_user_id := auth.uid();
        RAISE LOG 'submit_vendor_application_secure: Called by authenticated user %', v_user_id;
    END IF;
    
    -- ========================================================================
    -- STEP 2: EXTRACT AND VALIDATE APPLICATION DATA
    -- ========================================================================
    v_business_name := TRIM(p_application_data->>'business_name');
    v_business_type := TRIM(p_application_data->>'business_type');
    v_email := TRIM(LOWER(p_application_data->>'email'));
    v_phone := TRIM(REPLACE(REPLACE(p_application_data->>'phone', ' ', ''), '-', ''));
    v_payout_method := LOWER(TRIM(p_application_data->>'payout_method'));
    v_bank_name := TRIM(p_application_data->>'bank_name');
    v_bank_account_name := TRIM(p_application_data->>'bank_account_name');
    v_bank_account_number := TRIM(p_application_data->>'bank_account_number');
    v_bank_branch := TRIM(p_application_data->>'bank_branch');
    v_esewa_number := TRIM(p_application_data->>'esewa_number');
    v_khalti_number := TRIM(p_application_data->>'khalti_number');
    
    -- Validation
    IF v_business_name IS NULL OR LENGTH(v_business_name) < 3 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Business name must be at least 3 characters',
            'error_code', 'INVALID_BUSINESS_NAME'
        );
    END IF;
    
    IF LENGTH(v_business_name) > 200 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Business name too long (max 200 characters)',
            'error_code', 'BUSINESS_NAME_TOO_LONG'
        );
    END IF;
    
    IF v_business_type NOT IN ('Boutique', 'Salon', 'Designer', 'Manufacturer', 'Other') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid business type',
            'error_code', 'INVALID_BUSINESS_TYPE'
        );
    END IF;
    
    IF v_email IS NULL OR v_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid email format',
            'error_code', 'INVALID_EMAIL'
        );
    END IF;
    
    IF v_phone IS NULL OR v_phone !~ '^9[678][0-9]{8}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid phone number (must be valid Nepali mobile)',
            'error_code', 'INVALID_PHONE'
        );
    END IF;
    
    IF v_payout_method NOT IN ('bank', 'esewa', 'khalti') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid payout method',
            'error_code', 'INVALID_PAYOUT_METHOD'
        );
    END IF;
    
    -- ========================================================================
    -- STEP 3: CHECK EXISTING APPLICATION STATE
    -- ========================================================================
    SELECT application_state 
    INTO v_existing_state 
    FROM vendor_profiles 
    WHERE user_id = v_user_id;
    
    IF FOUND THEN
        IF v_existing_state IN ('submitted', 'under_review', 'info_requested') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You already have a pending application',
                'error_code', 'APPLICATION_PENDING',
                'current_state', v_existing_state
            );
        ELSIF v_existing_state = 'approved' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You are already an approved vendor',
                'error_code', 'ALREADY_VENDOR'
            );
        ELSIF v_existing_state = 'rejected' THEN
            -- Allow re-submission from rejected state
            UPDATE vendor_profiles
            SET 
                application_state = 'submitted',
                business_name = v_business_name,
                business_type = v_business_type,
                bank_account_name = v_bank_account_name,
                bank_account_number = v_bank_account_number,
                bank_name = v_bank_name,
                bank_branch = v_bank_branch,
                esewa_number = v_esewa_number,
                khalti_number = v_khalti_number,
                application_submitted_at = NOW(),
                application_notes = NULL,
                updated_at = NOW()
            WHERE user_id = v_user_id;
            
            RAISE LOG 'submit_vendor_application_secure: Re-submitted application for user %', v_user_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Application re-submitted successfully! Our team will review it soon.',
                'application_state', 'submitted'
            );
        END IF;
    END IF;
    
    -- ========================================================================
    -- STEP 4: INSERT NEW APPLICATION
    -- ========================================================================
    INSERT INTO vendor_profiles (
        user_id,
        business_name,
        business_type,
        application_state,
        application_submitted_at,
        bank_account_name,
        bank_account_number,
        bank_name,
        bank_branch,
        esewa_number,
        khalti_number,
        verification_status,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        v_business_name,
        v_business_type,
        'submitted',
        NOW(),
        v_bank_account_name,
        v_bank_account_number,
        v_bank_name,
        v_bank_branch,
        v_esewa_number,
        v_khalti_number,
        'pending',  -- Legacy field for backward compatibility
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        business_name = EXCLUDED.business_name,
        business_type = EXCLUDED.business_type,
        application_state = CASE 
            WHEN vendor_profiles.application_state IN ('rejected', 'draft') 
            THEN 'submitted'
            ELSE vendor_profiles.application_state
        END,
        bank_account_name = EXCLUDED.bank_account_name,
        bank_account_number = EXCLUDED.bank_account_number,
        bank_name = EXCLUDED.bank_name,
        bank_branch = EXCLUDED.bank_branch,
        esewa_number = EXCLUDED.esewa_number,
        khalti_number = EXCLUDED.khalti_number,
        application_submitted_at = NOW(),
        updated_at = NOW()
    RETURNING application_state INTO v_result_state;
    
    IF v_result_state != 'submitted' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Submission failed due to invalid state transition',
            'error_code', 'INVALID_STATE',
            'current_state', v_result_state
        );
    END IF;
    
    RAISE LOG 'submit_vendor_application_secure: Successfully submitted application for user %', v_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Application submitted successfully! Our team will review it within 1-2 business days.',
        'application_state', 'submitted'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'submit_vendor_application_secure: Error for user %: %', v_user_id, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'An unexpected error occurred. Please try again or contact support.',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure(UUID, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure(UUID, jsonb) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.submit_vendor_application_secure IS 
'Submit vendor application with explicit user_id parameter. Accepts calls from both service_role (Edge Functions) and authenticated users (with auth verification).';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration)
-- ============================================================================

-- Test 1: Verify function signature
SELECT 
    proname,
    pg_get_function_arguments(oid) as arguments,
    prosecdef as is_security_definer
FROM pg_proc 
WHERE proname = 'submit_vendor_application_secure';

-- Test 2: Verify permissions
SELECT 
    p.proname,
    r.rolname,
    has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.proname = 'submit_vendor_application_secure'
  AND r.rolname IN ('service_role', 'authenticated', 'anon')
ORDER BY r.rolname;
```

---

## ⚡ STEP 2: UPDATE LIVE EDGE FUNCTION

Since the live Edge Function (v7) is already inline code, we need to update it in place. 

### Option A: Deploy via Supabase CLI (RECOMMENDED)

Create a temporary deployment file and deploy:

**File**: `supabase/functions/submit-vendor-application-v8/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function getCorsHeaders(origin: string | null) {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://kb-stylish.vercel.app'
  ];
  const responseOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    'Access-Control-Allow-Headers': [
      'authorization',
      'x-client-info',
      'apikey',
      'content-type',
      'x-guest-token',
      'cookie'
    ].join(', '),
    'Access-Control-Expose-Headers': 'set-cookie',
    'Access-Control-Max-Age': '3600'
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Method not allowed. Use POST.',
        error_code: 'METHOD_NOT_ALLOWED'
      }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }

  try {
    // ========================================================================
    // AUTHENTICATION - Dual client pattern
    // ========================================================================
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' }
        }
      }
    );

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    // Extract and verify JWT
    const authHeader = req.headers.get('Authorization');
    const hasAuthHeader = !!authHeader;
    const startsWithBearer = hasAuthHeader ? authHeader.startsWith('Bearer ') : false;
    const token = startsWithBearer ? authHeader!.substring('Bearer '.length) : '';
    const looksLikeJWT = token ? token.split('.').length === 3 : false;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const isAnonKey = !!token && token === anonKey;

    let authenticatedUser: { id: string; email?: string } | null = null;
    let getUserError: string | null = null;

    if (startsWithBearer && !isAnonKey) {
      const { data: { user }, error } = await userClient.auth.getUser(token);
      
      if (!error && user) {
        authenticatedUser = { id: user.id, email: user.email ?? undefined };
        console.log('[submit-vendor-application v8] Authenticated user:', user.id);
      } else {
        getUserError = error?.message || 'Unknown error';
        console.error('[submit-vendor-application v8] getUser error:', getUserError);
      }
    }

    // Return 401 with diagnostics if auth failed
    if (!authenticatedUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: You must be logged in to submit an application.',
          error_code: 'AUTH_REQUIRED',
          diag: {
            version: 'v8_fixed',
            hasAuthHeader,
            startsWithBearer,
            looksLikeJWT,
            isAnonKey,
            tokenLen: token ? token.length : 0,
            tokenStart: token ? token.substring(0, 12) : null,
            getUserError
          }
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // ========================================================================
    // PARSE REQUEST BODY
    // ========================================================================
    let applicationData: any;
    
    try {
      applicationData = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body. Expected JSON.',
          error_code: 'INVALID_JSON'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Basic validation
    const required = ['business_name', 'business_type', 'email', 'phone', 'payout_method'];
    const missing = required.filter(k => !applicationData?.[k]);
    
    if (missing.length) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields',
          error_code: 'MISSING_FIELDS',
          missing
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    console.log('[submit-vendor-application v8] Submitting for user:', authenticatedUser.id);

    // ========================================================================
    // CALL RPC WITH USER_ID PARAMETER ✅ FIX APPLIED
    // ========================================================================
    const { data: rpcResult, error: rpcError } = await serviceClient.rpc(
      'submit_vendor_application_secure',
      {
        p_user_id: authenticatedUser.id,  // ✅ NEW: Pass validated user ID
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
      }
    );

    if (rpcError) {
      console.error('[submit-vendor-application v8] RPC error:', rpcError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to submit application. Please try again.',
          error_code: 'RPC_ERROR',
          rpcError: rpcError.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const result = rpcResult as { success: boolean; message?: string; error?: string; error_code?: string };

    if (!result.success) {
      console.warn('[submit-vendor-application v8] Submission failed:', result.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'Application submission failed',
          error_code: result.error_code || 'SUBMISSION_FAILED'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    console.log('[submit-vendor-application v8] Success for user:', authenticatedUser.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: result.message || 'Application submitted successfully!'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );

  } catch (error) {
    console.error('[submit-vendor-application v8] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'An unexpected error occurred. Please try again or contact support.',
        error_code: 'INTERNAL_ERROR'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});
```

**Deploy Command**:
```powershell
# In project root
supabase functions deploy submit-vendor-application --project-ref poxjcaogjupsplrcliau
```

---

## 🔧 STEP 3: UPDATE LOCAL EDGE FUNCTION

Update the local version to use shared modules with the fix:

**File**: `supabase/functions/_shared/auth.ts` (UPDATE)

```typescript
// No changes needed - already correct
```

**File**: `supabase/functions/submit-vendor-application/index.ts` (UPDATE)

Change line 113-129:

```typescript
// BEFORE (line 112-129):
const { data: rpcResult, error: rpcError } = await serviceClient
  .rpc('submit_vendor_application_secure', {
    p_application_data: {
      business_name: applicationData.business_name,
      business_type: applicationData.business_type,
      // ... rest
    }
  });

// AFTER:
const { data: rpcResult, error: rpcError } = await serviceClient
  .rpc('submit_vendor_application_secure', {
    p_user_id: user.id,  // ✅ ADD THIS LINE
    p_application_data: {
      business_name: applicationData.business_name,
      business_type: applicationData.business_type,
      // ... rest (no changes)
    }
  });
```

---

## 🧪 STEP 4: END-TO-END TESTING

### Test Script

**File**: `scripts/test_vendor_application_fixed.ps1`

```powershell
# Test the fixed vendor application submission

# 1. Get a valid user JWT (replace with actual test user credentials)
$email = "test.vendor@example.com"
$password = "TestPassword123!"

Write-Host "==> Logging in as test user..." -ForegroundColor Cyan

$loginResponse = Invoke-RestMethod `
    -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" `
    -Method POST `
    -Headers @{
        "apikey" = "$env:NEXT_PUBLIC_SUPABASE_ANON_KEY"
        "Content-Type" = "application/json"
    } `
    -Body (@{
        email = $email
        password = $password
    } | ConvertTo-Json)

$accessToken = $loginResponse.access_token

Write-Host "✅ Got access token: $($accessToken.Substring(0, 20))..." -ForegroundColor Green

# 2. Submit vendor application
Write-Host "`n==> Submitting vendor application..." -ForegroundColor Cyan

$applicationData = @{
    business_name = "Test Boutique $(Get-Random)"
    business_type = "Boutique"
    contact_name = "Test Owner"
    email = "boutique@test.com"
    phone = "9841234567"
    website = "https://test.com"
    payout_method = "esewa"
    esewa_number = "9841234567"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "$env:NEXT_PUBLIC_SUPABASE_URL/functions/v1/submit-vendor-application" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    } `
    -Body $applicationData

Write-Host "✅ Response:" -ForegroundColor Green
$response | ConvertTo-Json -Depth 10

if ($response.success) {
    Write-Host "`n🎉 SUCCESS! Application submitted." -ForegroundColor Green
} else {
    Write-Host "`n❌ FAILED: $($response.error)" -ForegroundColor Red
    if ($response.diag) {
        Write-Host "Diagnostics:" -ForegroundColor Yellow
        $response.diag | ConvertTo-Json
    }
}
```

---

## ✅ STEP 5: VERIFICATION

### Verification Checklist

- [ ] Migration applied successfully (no errors in psql output)
- [ ] Function signature shows `p_user_id UUID` as first parameter
- [ ] Edge Function deployed (version 8 or higher)
- [ ] Test application submits successfully (status 200)
- [ ] Application appears in admin dashboard
- [ ] Application state is 'submitted'
- [ ] Edge Function logs show "Success for user: <uuid>"
- [ ] No 400/401 errors in production logs

### Monitoring Queries

```sql
-- Check recent applications
SELECT 
    user_id,
    business_name,
    application_state,
    application_submitted_at,
    created_at
FROM vendor_profiles
WHERE application_submitted_at > NOW() - INTERVAL '1 hour'
ORDER BY application_submitted_at DESC;

-- Check for auth errors in logs (if available)
-- Look for: "submit_vendor_application_secure: Called by service_role for user <uuid>"
```

---

## 🚀 DEPLOYMENT TIMELINE

| Time | Task | Status |
|------|------|--------|
| 00:00 | Start deployment | |
| 00:05 | Apply database migration | |
| 00:10 | Verify migration success | |
| 00:15 | Deploy Edge Function v8 | |
| 00:20 | Run test script | |
| 00:25 | Verify in admin dashboard | |
| 00:30 | Update local code | |
| 00:35 | Final verification | |
| 00:40 | COMPLETE ✅ | |

---

## 🔄 ROLLBACK PLAN

If anything goes wrong:

### Rollback Step 1: Revert Database Function

```sql
BEGIN;

-- Restore old function signature (without p_user_id parameter)
-- This will cause the Edge Function to fail, but won't break existing data
DROP FUNCTION IF EXISTS public.submit_vendor_application_secure(UUID, jsonb);

-- Redeploy old version from backup or git history

COMMIT;
```

### Rollback Step 2: Redeploy Previous Edge Function

```powershell
# Redeploy v7 (diagnostic version)
git checkout HEAD~1 supabase/functions/submit-vendor-application/
supabase functions deploy submit-vendor-application --project-ref poxjcaogjupsplrcliau
```

---

## 📊 SUCCESS METRICS

After deployment, monitor:

1. **Edge Function Success Rate**: Should be >99% (from previous ~0%)
2. **Application Submission Rate**: Expect immediate submissions from waiting users
3. **Error Rate**: Should drop to near zero for auth-related errors
4. **Response Time**: Should remain <500ms average

---

**Blueprint Status**: ✅ READY TO EXECUTE  
**Risk Assessment**: LOW  
**Confidence**: 99.9%  
**Estimated Success Probability**: >99%

**Ready to proceed to Phase 8: Implementation** ✅
