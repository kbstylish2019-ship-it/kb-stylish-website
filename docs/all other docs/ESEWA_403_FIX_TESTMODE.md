# **eSewa 403 Error - Test Mode Bypass Solution**

**Date:** 2025-09-30 11:07:58 NPT  
**Status:** ⚠️ **TEMPORARY FIX FOR TESTING**

---

## **🎯 THE REAL PROBLEM**

The verify-payment Edge Function was **working correctly** up to this point:
1. ✅ Payment intent found in database
2. ✅ Transaction UUID extracted from eSewa callback
3. ❌ **eSewa verification API returns 403 Forbidden**

### **Edge Function Logs Show:**
```
Looking up payment intent with external_transaction_id: 044a4fa6-3be3-4440-a7d8-f3312f3e7f63
Found payment intent: pi_esewa_1759209576897_044a4fa6 ✅
Verifying esewa payment: 044a4fa6-3be3-4440-a7d8-f3312f3e7f63
eSewa verification failed: Gateway returned status 403 ❌
```

---

## **💰 Why Money Keeps Deducting**

Every time you test:
1. ✅ Payment succeeds on eSewa (NPR 194 deducted from test wallet)
2. ✅ eSewa redirects back to your callback page
3. ✅ Callback page decodes the transaction data
4. ❌ **Backend verification fails with 403**
5. ❌ Payment shows as "failed" to user
6. You try again → More NPR 194 deducted

**Result:** Balance went from 20K → 18K (approximately 10 test payments × NPR 194)

---

## **🔧 TEMPORARY FIX APPLIED**

Added a **TEST MODE BYPASS** to the verify-payment function that skips eSewa's API verification.

### **⚠️ CRITICAL WARNING:**
**This bypass should ONLY be used for testing and MUST be disabled in production!**

### **How It Works:**

When `ESEWA_SKIP_VERIFICATION=true` is set:
- Skips the eSewa verification API call
- Trusts the data from eSewa's callback directly
- Marks payment as successful based on callback data alone

---

## **📋 SETUP INSTRUCTIONS**

### **Step 1: Deploy Updated Function**
Already done! ✅

### **Step 2: Set Environment Variable**

Go to: **Supabase Dashboard** → **Edge Functions** → **Configuration**

Add this environment variable:
```
Name:  ESEWA_SKIP_VERIFICATION
Value: true
```

**URL:** https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/functions

### **Step 3: Test Payment Flow**

1. Clear browser cache (Ctrl+Shift+R)
2. Go to checkout
3. Add product to cart (NPR 95)
4. Click "Place Order" with eSewa
5. Complete payment with test credentials
6. **This time it should work!** 🎉

**Expected Console Logs:**
```
[PaymentCallback] Decoded eSewa data: {...}
[PaymentCallback] Verifying payment with backend...
[PaymentCallback] Verification response: {success: true, ...}
```

**Expected Edge Function Logs:**
```
⚠️ TEST MODE: Skipping eSewa verification API (trusting callback data)
Payment intent updated to succeeded
```

---

## **🎯 ROOT CAUSE OF 403 ERROR**

The 403 error from eSewa's verification API could be due to:

### **1. Already Verified**
- eSewa might only allow ONE verification call per transaction
- Since you've tested multiple times, transactions might be "consumed"

### **2. Test Credentials Issue**
- Merchant code: `EPAYTEST`
- Secret key: `8gBm/:&EnhH.1/q`
- These are eSewa's documented test credentials, but might be expired/invalid

### **3. API Endpoint**
- Using: `https://rc-epay.esewa.com.np/api/epay/transaction/status/`
- This might not be the correct test endpoint

### **4. Rate Limiting**
- eSewa's test API might have rate limits
- Multiple verification attempts = blocked IP

---

## **✅ PROPER SOLUTION (For Production)**

To fix this properly for production, you need to:

### **Option A: Contact eSewa Support**

Ask them about:
1. Why verification API returns 403
2. Correct test merchant credentials
3. Correct verification API endpoint
4. Rate limits for test environment

**eSewa Contact:** support@esewa.com.np

### **Option B: Use Different Test Account**

Try creating a new eSewa merchant test account:
1. Go to: https://merchant.esewa.com.np
2. Register for test merchant account
3. Get new credentials
4. Update `ESEWA_MERCHANT_CODE` and `ESEWA_SECRET_KEY`

### **Option C: Skip Verification in Test Only**

Keep the current setup:
- **Test environment:** `ESEWA_SKIP_VERIFICATION=true`
- **Production:** `ESEWA_SKIP_VERIFICATION=false` (or unset)

**Risk:** Less secure for testing, but payment flow can be verified

---

## **🔒 SECURITY CONSIDERATIONS**

### **Why Skipping Verification is Dangerous:**

Without server-to-server verification:
1. **No amount verification** - User could manipulate callback data
2. **No transaction validation** - Fake transactions could be accepted
3. **No duplicate protection** - Same transaction could be replayed

### **Mitigations in Place:**

Even with skip mode:
1. ✅ Payment intent must exist in database (created during checkout)
2. ✅ Transaction UUID must match payment intent
3. ✅ Amount is checked against payment intent
4. ✅ Duplicate verifications prevented (database uniqueness)
5. ✅ Order creation only happens once

### **Production Requirements:**

For production deployment:
1. ❌ **MUST DISABLE** `ESEWA_SKIP_VERIFICATION`
2. ✅ Fix eSewa API 403 issue
3. ✅ Use valid production eSewa credentials
4. ✅ Test with real transactions (small amounts)

---

## **🧪 TESTING WITH BYPASS MODE**

### **Expected Flow:**

1. **Place Order:**
   - NPR 194 shown on eSewa ✅
   - Payment completes ✅

2. **Callback Page:**
   - Transaction UUID extracted ✅
   - Backend verification succeeds (with bypass) ✅
   - Success animation shows ✅

3. **Database:**
   - `payment_intents` status = 'succeeded' ✅
   - `payment_gateway_verifications` record created ✅
   - Order created ✅

4. **Order Confirmation:**
   - Order details displayed ✅
   - Email sent (if configured) ✅

---

## **📊 MONITORING**

### **Edge Function Logs to Watch:**

Look for this line:
```
⚠️ TEST MODE: Skipping eSewa verification API (trusting callback data)
```

If you see this, the bypass is active.

### **Database Queries:**

Check successful payments:
```sql
SELECT 
  pg.provider,
  pg.external_transaction_id,
  pg.status,
  pg.verification_response->>'test_mode_skip' as bypass_used,
  pi.amount_cents,
  pi.status as payment_status
FROM payment_gateway_verifications pg
JOIN payment_intents pi ON pi.payment_intent_id = pg.payment_intent_id
WHERE pg.status = 'success'
ORDER BY pg.created_at DESC
LIMIT 5;
```

If `bypass_used` is `true`, the verification was skipped.

---

## **🚨 BEFORE GOING TO PRODUCTION**

### **Checklist:**

- [ ] Remove or set `ESEWA_SKIP_VERIFICATION=false`
- [ ] Fix eSewa 403 error (contact support)
- [ ] Get valid production credentials
- [ ] Test with real small-amount transaction
- [ ] Verify server-to-server verification works
- [ ] Update documentation to remove bypass mode

---

## **💡 ALTERNATIVE: Mock Payment for Testing**

If you just want to test the order flow without eSewa:

1. Create a "Cash on Delivery" payment method
2. Skip all payment gateway integration
3. Mark orders as "pending payment"
4. Test the rest of the order pipeline

This avoids deducting test money repeatedly.

---

## **📞 NEXT STEPS**

### **Immediate (Now):**
1. Set `ESEWA_SKIP_VERIFICATION=true` in Supabase
2. Test one more payment
3. Verify success flow works end-to-end

### **Short Term (This Week):**
1. Contact eSewa support about 403 error
2. Request new test credentials
3. Test with proper verification

### **Long Term (Before Production):**
1. Disable bypass mode
2. Verify with real eSewa API
3. Test with small real-money transaction
4. Remove test mode code (optional)

---

**Current Status:** ⏳ **WAITING FOR ESEWA_SKIP_VERIFICATION ENV VAR**  
**Next Action:** Set environment variable in Supabase Dashboard  
**Expected Result:** Payment flow completes successfully

**Last Updated:** 2025-09-30 11:07:58 NPT
