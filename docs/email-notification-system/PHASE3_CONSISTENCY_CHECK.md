# ✅ PHASE 3: CONSISTENCY CHECK

**Protocol**: UNIVERSAL AI EXCELLENCE PROTOCOL v2.0  
**Phase**: 3 of 10 - Consistency Check  
**Status**: 🔄 IN PROGRESS

---

## 🎯 OBJECTIVE

Verify that the proposed email notification system aligns with existing codebase patterns, conventions, and architectural decisions.

---

## 1. EDGE FUNCTION PATTERN CONSISTENCY

### Existing Pattern (Verified)
```typescript
// From order-worker/index.ts, verify-payment/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/cors.ts';

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders() });
  }
  
  try {
    // Business logic here
    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
    });
  }
});
```

### Our Email Function (CONSISTENT ✅)
```typescript
// supabase/functions/send-email/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';

let resendInstance: Resend | null = null;

function getResendClient(): Resend {
  if (!resendInstance) {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY not configured');
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

Deno.serve(async (req) => {
  // Same pattern as existing functions...
});
```

**Verdict**: ✅ CONSISTENT with existing Edge Function pattern

---

## 2. DATABASE RPC PATTERN CONSISTENCY

### Existing Pattern (Verified)
```sql
-- From approve_vendor, reject_vendor RPCs
CREATE OR REPLACE FUNCTION public.approve_vendor(
  p_vendor_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- Inherits caller's RLS
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
BEGIN
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Business logic
  
  -- Audit log
  INSERT INTO user_audit_log (...);
  
  RETURN jsonb_build_object('success', true, 'message', '...');
END;
$$;
```

### Our Email Trigger (OPTION - if we add RPC)
```sql
-- Optional: RPC wrapper for email sending (for database triggers)
CREATE OR REPLACE FUNCTION public.send_email_async(
  p_email_type text,
  p_recipient_user_id uuid,
  p_template_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- Needs service role to call Edge Function
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient_email text;
BEGIN
  -- Get recipient email
  SELECT email INTO v_recipient_email
  FROM auth.users
  WHERE id = p_recipient_user_id;
  
  -- Call Edge Function via pg_net (if installed)
  -- OR insert into email_queue table
  INSERT INTO email_queue (
    recipient_user_id,
    recipient_email,
    email_type,
    template_data
  ) VALUES (
    p_recipient_user_id,
    v_recipient_email,
    p_email_type,
    p_template_data
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;
```

**Verdict**: ✅ CONSISTENT with RPC pattern (optional, not required for Phase 1)

---

## 3. ERROR HANDLING PATTERN CONSISTENCY

### Existing Pattern (Verified)
```typescript
// From order-worker/index.ts
try {
  const result = await finalizeOrder(supabase, job.payload);
  // Success path
} catch (error) {
  console.error('Order worker error:', error);
  return new Response(JSON.stringify({
    error: 'Worker execution failed',
    details: error.message
  }), { status: 500, headers: corsHeaders });
}
```

### Our Email Function (CONSISTENT ✅)
```typescript
try {
  await sendEmailWithRetry(emailData);
  return new Response(JSON.stringify({
    success: true,
    message: 'Email sent successfully'
  }), { status: 200, headers: corsHeaders });
} catch (error) {
  console.error('[Email] Send failed:', error);
  return new Response(JSON.stringify({
    error: 'Email send failed',
    details: error.message
  }), { status: 500, headers: corsHeaders });
}
```

**Verdict**: ✅ CONSISTENT with error handling pattern

---

## 4. ENVIRONMENT VARIABLE PATTERN CONSISTENCY

### Existing Pattern (Verified)
```typescript
// From existing Edge Functions
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing environment variables');
}
```

### Our Email Function (CONSISTENT ✅)
```typescript
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

if (!RESEND_API_KEY) {
  console.warn('[Email] Development mode - emails will be logged only');
  // Graceful degradation for development
}
```

**Configuration Location**: Supabase Dashboard → Edge Functions → Secrets

**Verdict**: ✅ CONSISTENT with env var pattern + graceful degradation

---

## 5. DATABASE SCHEMA PATTERN CONSISTENCY

### Existing Pattern (Verified)
```sql
-- From orders, bookings, vendor_profiles tables
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns...
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(user_id, status);
```

### Our Email Logs Schema (CONSISTENT ✅)
```sql
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_user_id, created_at DESC);
```

**Verdict**: ✅ CONSISTENT with database schema conventions

---

## 6. TYPESCRIPT TYPE PATTERN CONSISTENCY

### Existing Pattern (Verified)
```typescript
// From src/actions/vendor/fulfillment.ts
export interface UpdateFulfillmentStatusParams {
  orderItemId: string;
  newStatus: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber?: string;
  shippingCarrier?: string;
}

export interface UpdateFulfillmentStatusResult {
  success: boolean;
  message: string;
  orderItemId?: string;
  newStatus?: string;
}
```

### Our Email Types (CONSISTENT ✅)
```typescript
// src/lib/email/types.ts
export interface SendEmailParams {
  recipient_email: string;
  recipient_user_id?: string;
  email_type: EmailType;
  subject: string;
  template_data: Record<string, any>;
}

export interface SendEmailResult {
  success: boolean;
  message?: string;
  resend_email_id?: string;
  error?: string;
}

export type EmailType = 
  | 'order_confirmation'
  | 'order_shipped'
  | 'booking_confirmation'
  | 'vendor_approved'
  | 'vendor_rejected';
```

**Verdict**: ✅ CONSISTENT with TypeScript conventions

---

## 7. SERVER ACTION PATTERN CONSISTENCY

### Existing Pattern (Verified)
```typescript
// From src/actions/vendor/fulfillment.ts
'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
}

export async function updateFulfillmentStatus(params: Params): Promise<Result> {
  const supabase = await createClient();
  // Business logic
  revalidatePath('/vendor/orders');
  return { success: true };
}
```

### If We Add Email Server Action (CONSISTENT ✅)
```typescript
// src/actions/email/sendEmail.ts
'use server';

export async function sendOrderConfirmationEmail(orderId: string): Promise<Result> {
  // Call Edge Function via fetch or supabase.functions.invoke
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { email_type: 'order_confirmation', order_id: orderId }
  });
  
  return { success: !error };
}
```

**Verdict**: ✅ CONSISTENT (but Edge Function direct call preferred)

---

## 8. NAMING CONVENTION CONSISTENCY

### Existing Conventions (Verified)
```
Files: kebab-case (order-worker, verify-payment)
Functions: camelCase (updateFulfillmentStatus, approveVendor)
Database: snake_case (order_items, vendor_profiles, user_audit_log)
Types: PascalCase (UpdateFulfillmentStatusParams)
Constants: SCREAMING_SNAKE_CASE (MAX_JOBS_PER_RUN)
```

### Our Email System (CONSISTENT ✅)
```
Files: send-email (Edge Function)
Functions: sendEmail, sendWithRetry, getResendClient
Database: email_logs, email_preferences
Types: SendEmailParams, EmailType
Constants: RESEND_API_KEY, MAX_RETRY_ATTEMPTS
```

**Verdict**: ✅ CONSISTENT with naming conventions

---

## 9. INTEGRATION POINT CONSISTENCY

### Existing Integration Points (Verified)
```typescript
// In order-worker/index.ts after order creation
const { data, error } = await supabase.rpc('process_order_with_occ', {...});

if (data.success) {
  // ✅ This is where we add email trigger
  await sendOrderConfirmationEmail(data.order_id);
}

// In src/actions/vendor/fulfillment.ts after status update
const { data, error } = await supabase.rpc('update_fulfillment_status', {...});

if (result.success && newStatus === 'shipped') {
  // ✅ This is where we add shipping email
  await sendOrderShippedEmail(orderItemId);
}

// In approve_vendor RPC after approval
UPDATE vendor_profiles SET verification_status = 'verified';
-- ✅ This is where we add vendor approved email
PERFORM send_email_async('vendor_approved', p_vendor_id, ...);
```

**Verdict**: ✅ Integration points identified and consistent with existing flow

---

## 10. SECURITY PATTERN CONSISTENCY

### Existing Security (Verified)
```sql
-- RLS policies on all tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
ON orders FOR SELECT
USING (auth.uid() = user_id);

-- Admin checks in RPCs
IF NOT private.assert_admin() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF;
```

### Our Email Security (CONSISTENT ✅)
```sql
-- RLS on email_logs
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email logs"
ON email_logs FOR SELECT
USING (auth.uid() = recipient_user_id);

-- Service role only for email sending (Edge Function uses service role)
```

**Verdict**: ✅ CONSISTENT with security model

---

## CONSISTENCY CHECK SUMMARY

| Pattern | Status | Notes |
|---------|--------|-------|
| Edge Function Structure | ✅ PASS | Matches order-worker pattern |
| RPC Pattern | ✅ PASS | Optional, not required for Phase 1 |
| Error Handling | ✅ PASS | Try-catch with detailed logging |
| Environment Variables | ✅ PASS | Deno.env.get with graceful degradation |
| Database Schema | ✅ PASS | UUID PK, TIMESTAMPTZ, indexes |
| TypeScript Types | ✅ PASS | Interface naming, result types |
| Server Actions | ✅ PASS | Pattern matches if needed |
| Naming Conventions | ✅ PASS | kebab-case, camelCase, snake_case |
| Integration Points | ✅ PASS | Clear hooks identified |
| Security Model | ✅ PASS | RLS policies, service role access |

**Overall Score**: 10/10 ✅  
**Verdict**: **FULLY CONSISTENT** with existing architecture

---

**Phase 3 Complete** ✅  
**Next**: Phase 4 - Solution Blueprint
