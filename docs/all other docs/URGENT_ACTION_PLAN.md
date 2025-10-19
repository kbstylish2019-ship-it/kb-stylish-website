# **🚨 URGENT ACTION PLAN - Payment System Fixes**

**Date:** 2025-09-30 16:45 NPT  
**Critical Issues:** 3 Major | 1 Minor

---

## **📊 SUMMARY OF ISSUES**

### **Issue 1: Orders Not Being Created (CRITICAL ❌)**

**Symptom:**
- ✅ Payments succeed on eSewa
- ✅ Payment intents marked as "succeeded"
- ❌ **NO orders created in database**
- ❌ Order confirmation page shows payment_intent_id but no order_number

**Root Cause:**
The system uses a **background job queue** pattern:
```
Payment Success → Create Job → Worker Processes Job → Create Order
```

**What's failing:**
Either:
1. Job insertion failing
2. Order-worker not deployed/running
3. Order-worker failing to process jobs

**Impact:** **HIGH** - Users pay but get no order!

---

### **Issue 2: Khalti 401 Authentication (CRITICAL ❌)**

**Symptom:**
```
Failed to initiate Khalti payment
Gateway returned status 401
```

**Root Cause:** Missing Khalti secret key in environment variables

**Impact:** **HIGH** - Khalti payments completely broken

---

### **Issue 3: Cart Not Clearing (MAJOR ⚠️)**

**Symptom:** After successful payment, cart still shows items

**Root Cause:** Cart clearing only happens when order is created (which isn't happening)

**Impact:** **MEDIUM** - Confusing UX, users might think payment failed

---

### **Issue 4: Frontend Error Handler Bug (MINOR ⚠️)**

**Symptom:**
```
TypeError: _response_details.some is not a function
```

**Impact:** **LOW** - Error handling doesn't work for Khalti errors

---

## **✅ IMMEDIATE ACTIONS (Do in Order)**

### **Action 1: Check Job Queue Status**

Run this SQL query in Supabase SQL Editor:

```sql
-- Check if jobs are being created
SELECT 
  id,
  job_type,
  status,
  payload->>'payment_intent_id' as payment_intent_id,
  attempts,
  max_attempts,
  created_at,
  updated_at,
  locked_until,
  error_message
FROM job_queue
WHERE job_type = 'finalize_order'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected outcome:**
- If jobs exist with `status = 'pending'` → Worker not running
- If jobs exist with `status = 'failed'` → Check error_message
- If no jobs → Job insertion failing

---

### **Action 2: Deploy Order Worker**

The order-worker Edge Function might not be deployed!

**Run this command:**
```bash
cd d:\kb-stylish
supabase functions deploy order-worker
```

**Verify deployment:**
```bash
supabase functions list
```

Should show:
```
✓ create-order-intent
✓ verify-payment
✓ order-worker  ← Check this exists!
```

---

### **Action 3: Manually Trigger Order Worker**

Test if the worker can process pending jobs:

```bash
curl -X POST \
  'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/order-worker?max_jobs=5' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

**Check logs:**
https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/logs/edge-functions

Filter by: `order-worker`

---

### **Action 4: Add Khalti Secret Key**

**Go to:** https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/settings/functions

**Click:** "Add Environment Variable"

**Add:**
```
Name:  KHALTI_SECRET_KEY
Value: [Get from https://test-admin.khalti.com → Settings → API Keys]
```

**Format should be:**
```
test_secret_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### **Action 5: Set Up Cron Job for Order Worker**

The order-worker should run automatically to process queued jobs.

**Option A: Supabase Cron (Recommended)**

Add to `supabase/functions/_cron/schedule.ts`:
```typescript
export const schedule = [
  {
    name: 'process-order-queue',
    schedule: '*/2 * * * *', // Every 2 minutes
    function: 'order-worker',
    params: { max_jobs: 20 }
  }
];
```

**Option B: External Cron Service**
- Use Vercel Cron Jobs
- Use GitHub Actions scheduled workflows
- Use any cron service to hit the order-worker URL every 2 minutes

---

### **Action 6: Fix Frontend Error Handler**

**File:** `src/app/checkout/CheckoutClient.tsx`

**Find line ~241:**
```typescript
if (response.details && response.details.some(d => d.includes('authentication'))) {
```

**Replace with:**
```typescript
const hasAuthError = response.details && (
  typeof response.details === 'string' 
    ? response.details.includes('authentication') || response.details.includes('401')
    : Array.isArray(response.details) && response.details.some(d => d.includes('authentication'))
);

if (hasAuthError) {
  setError('Payment gateway authentication failed. Please try again or contact support.');
  return;
}
```

---

## **🧪 TESTING WORKFLOW**

### **Step 1: Fix and Test eSewa**

1. Deploy order-worker
2. Run SQL query to check pending jobs
3. Manually trigger worker: `curl ...`
4. Check if orders appear in database
5. Test new eSewa payment end-to-end

### **Step 2: Fix and Test Khalti**

1. Add KHALTI_SECRET_KEY environment variable
2. Restart Edge Functions (automatic after env var change)
3. Test Khalti payment flow
4. Check job_queue for finalize_order job
5. Verify order creation

### **Step 3: Verify Cart Clearing**

1. Add item to cart
2. Complete payment
3. Check cart is empty after order confirmation
4. Verify cart_items table is empty

---

## **📋 VERIFICATION SQL QUERIES**

### **Check Recent Payment Intents:**
```sql
SELECT 
  payment_intent_id,
  provider,
  status,
  amount_cents,
  external_transaction_id,
  created_at
FROM payment_intents
WHERE provider IN ('esewa', 'khalti')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### **Check Job Queue:**
```sql
SELECT 
  id,
  job_type,
  status,
  payload->>'payment_intent_id' as payment_intent,
  attempts,
  error_message,
  created_at
FROM job_queue
WHERE job_type = 'finalize_order'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### **Check Orders Created:**
```sql
SELECT 
  o.order_number,
  o.status,
  o.total_cents,
  o.payment_intent_id,
  o.created_at,
  COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.created_at > NOW() - INTERVAL '1 hour'
GROUP BY o.id
ORDER BY o.created_at DESC;
```

### **Check Cart Status for User:**
```sql
SELECT 
  ci.id,
  ci.product_id,
  ci.quantity,
  p.title,
  ci.created_at
FROM cart_items ci
JOIN products p ON ci.product_id = p.id
WHERE ci.user_id = 'YOUR_USER_ID_HERE'
OR ci.guest_token = 'YOUR_GUEST_TOKEN_HERE';
```

---

## **🎯 SUCCESS CRITERIA**

### **eSewa Flow:**
- [ ] Payment completes on eSewa
- [ ] Payment intent status = 'succeeded'
- [ ] Job created in job_queue
- [ ] Order created in orders table
- [ ] Order items created
- [ ] Cart cleared
- [ ] User sees order confirmation with order_number
- [ ] Cart badge shows 0 items

### **Khalti Flow:**
- [ ] Payment initiates (no 401 error)
- [ ] User redirected to Khalti
- [ ] Payment completes
- [ ] Payment intent status = 'succeeded'
- [ ] Job created
- [ ] Order created
- [ ] Cart cleared
- [ ] Confirmation shown

---

## **💡 TROUBLESHOOTING TIPS**

### **If Jobs Stuck in Pending:**
```sql
-- Reset stuck jobs (last resort)
UPDATE job_queue
SET status = 'pending',
    locked_by = NULL,
    locked_until = NULL,
    attempts = 0
WHERE job_type = 'finalize_order'
  AND status = 'processing'
  AND locked_until < NOW();
```

### **If Worker Keeps Failing:**
1. Check Edge Function logs for specific error
2. Verify database RLS policies allow service role
3. Check inventory stock availability
4. Verify all referenced products still exist

### **If Cart Not Clearing:**
1. Check cart_items table directly
2. Verify clear_cart RPC function exists
3. Check RLS policies on cart_items
4. Test cart API endpoint manually

---

## **🚀 DEPLOYMENT CHECKLIST**

Before going live with Khalti:
- [ ] Add KHALTI_SECRET_KEY to production environment
- [ ] Remove ESEWA_SKIP_VERIFICATION from production
- [ ] Set up order-worker cron job
- [ ] Test full payment flow (eSewa + Khalti)
- [ ] Verify order creation works
- [ ] Verify cart clearing works
- [ ] Set up email notifications (optional but recommended)
- [ ] Monitor Edge Function logs for first few orders
- [ ] Have rollback plan ready

---

## **📞 NEXT STEPS RIGHT NOW**

**Do these 5 things in the next 30 minutes:**

1. ✅ Run SQL query to check job_queue
2. ✅ Deploy order-worker: `supabase functions deploy order-worker`
3. ✅ Manually trigger worker with curl
4. ✅ Check if orders appear in database  
5. ✅ Test new payment to verify end-to-end

**Then:**
6. Add Khalti secret key
7. Fix frontend error handler
8. Test Khalti flow
9. Set up cron job
10. Document what email service you want to use

---

**Last Updated:** 2025-09-30 16:45 NPT  
**Status:** 🚨 Action Required Immediately
