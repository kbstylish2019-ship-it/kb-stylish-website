# **🚀 QUICK START: Testing the Live Payment Gateway**

**Ready to test your live payment integration in 5 minutes!**

---

## **🎯 BEFORE YOU START**

### **Prerequisites:**
- ✅ Backend deployed (create-order-intent v8, verify-payment v1)
- ✅ Frontend code updated (CheckoutClient.tsx, cartClient.ts, callback page)
- ✅ Development server running (`npm run dev`)
- ✅ You have test eSewa credentials

---

## **⚡ 5-MINUTE TEST - eSewa Flow**

### **Step 1: Start Your Dev Server**
```bash
cd d:\kb-stylish
npm run dev
```
Navigate to: http://localhost:3000

### **Step 2: Add Items to Cart**
- Go to Shop page
- Add any product to cart
- Or use existing cart items

### **Step 3: Navigate to Checkout**
- Click cart icon
- Click "Proceed to Checkout"
- URL: http://localhost:3000/checkout

### **Step 4: Fill Shipping Information**
```
Full Name:  Test User
Phone:      9841234567
Region:     Bagmati
City:       Kathmandu
Area:       Thamel
Notes:      (optional)
```

### **Step 5: Select Payment Method**
- Select **"eSewa"** radio button
- Verify button shows green checkmark

### **Step 6: Place Order**
- Click **"Place Order • NPR XXX"** button
- You should see processing spinner briefly
- Then you'll be redirected to eSewa test page

### **Step 7: Complete eSewa Test Payment**

**eSewa Test Credentials:**
```
Login:    9806800001
          (or 9806800002, 003, 004, 005)
Password: Nepal@123
MPIN:     1122
Token:    123456
```

**On eSewa Page:**
1. Enter login credentials
2. Click "Continue"
3. Enter MPIN: `1122`
4. Enter Token: `123456`
5. Click "Submit"

### **Step 8: Verify Callback Works**

**You should be redirected to:**
```
http://localhost:3000/payment/callback?provider=esewa&transaction_uuid=...&transaction_code=0000
```

**You should see:**
1. ⏳ **Loading State** (1-2 seconds)
   - Spinning animation
   - "Verifying Your Payment" message

2. ✅ **Success State**
   - Green checkmark animation
   - "Payment Successful!"
   - Order ID displayed
   - Amount paid displayed
   - Three checkmarks (verified, confirmed, email)
   - "Redirecting..." message

3. 🔄 **Auto-Redirect** (after 3 seconds)
   - Navigates to order confirmation page
   - Shows order timeline
   - Provides next steps

### **Step 9: Verify in Database**

Open Supabase Dashboard → SQL Editor:

```sql
-- Check payment_intent was created
SELECT 
  payment_intent_id,
  external_transaction_id,
  gateway_payment_url,
  provider,
  status,
  amount_cents
FROM public.payment_intents
ORDER BY created_at DESC
LIMIT 1;

-- Check verification was recorded  
SELECT 
  provider,
  external_transaction_id,
  status,
  amount_verified,
  verified_at
FROM private.payment_gateway_verifications
ORDER BY verified_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ `external_transaction_id` is populated (UUID)
- ✅ `gateway_payment_url` contains eSewa URL
- ✅ `provider` is `'esewa'`
- ✅ `status` is `'succeeded'`
- ✅ Verification record exists with status `'success'`

---

## **⚡ BONUS TEST - Khalti Flow**

Repeat the same steps, but:
- **Step 5:** Select **"Khalti"** instead
- **Step 7:** Use Khalti test credentials (from Khalti test dashboard)
- Verify same success flow

---

## **🔍 COMMON ISSUES & FIXES**

### **Issue 1: "Authentication required" Error**

**Cause:** Not logged in

**Fix:**
```bash
# Make sure you're logged in
# Click "Sign In" button
# Use test credentials or create account
```

### **Issue 2: "Cart is empty" Error**

**Cause:** No items in cart

**Fix:**
```bash
# Add at least one product to cart
# Navigate back to checkout
```

### **Issue 3: Stuck on "Processing Order..."**

**Cause:** Edge Function error or network issue

**Fix:**
```bash
# Check browser console (F12)
# Check Network tab for failed requests
# Verify Supabase Edge Functions are deployed:
#   - create-order-intent v8
#   - verify-payment v1
```

### **Issue 4: eSewa Page Shows "Invalid Signature"**

**Cause:** Wrong secret key or signature algorithm

**Fix:**
```bash
# Verify in Supabase Dashboard → Edge Functions → Environment Variables:
# ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q (for test mode)
# ESEWA_TEST_MODE=true
```

### **Issue 5: Callback Page Shows Error**

**Possible Causes:**
1. Invalid transaction UUID
2. Gateway verification failed
3. Network timeout

**Debug:**
```bash
# Open browser console
# Look for error messages starting with [PaymentCallback]
# Check Supabase Edge Function logs for verify-payment
```

---

## **🎯 TEST CHECKLIST**

Use this checklist to verify everything works:

### **Frontend:**
- [ ] Checkout page loads without errors
- [ ] Payment method selector shows eSewa and Khalti
- [ ] Can select payment method (green checkmark appears)
- [ ] "Place Order" button is enabled when form valid
- [ ] Clicking button shows processing spinner
- [ ] Browser redirects to gateway (eSewa or Khalti)

### **Gateway (eSewa Test):**
- [ ] eSewa test page loads
- [ ] Can enter test credentials
- [ ] Payment processes successfully
- [ ] Gateway redirects back to callback URL

### **Callback Page:**
- [ ] Loading spinner appears
- [ ] Success checkmark appears after verification
- [ ] Order ID is displayed correctly
- [ ] Amount is displayed correctly
- [ ] Three checkmarks appear
- [ ] Auto-redirects after 3 seconds

### **Order Confirmation:**
- [ ] Order number displays
- [ ] Order date displays
- [ ] Status timeline shows 2 completed stages
- [ ] "Continue Shopping" button works
- [ ] UI is responsive on mobile

### **Database:**
- [ ] payment_intents record created
- [ ] external_transaction_id populated
- [ ] gateway_payment_url populated
- [ ] status is 'succeeded'
- [ ] payment_gateway_verifications record created
- [ ] verification status is 'success'
- [ ] job_queue entry created (finalize_order)

---

## **📊 SUCCESS CRITERIA**

You can consider the integration successful when:

✅ **User Journey Complete:**
- User can complete entire flow without errors
- User sees success message
- User is redirected to order confirmation

✅ **Backend Verification:**
- Database has payment_intent record
- Database has verification record
- No duplicate verifications (idempotency works)

✅ **Security Verified:**
- Amount matches between gateway and database
- Signature is valid (eSewa)
- API verification completed (Khalti)

---

## **🆘 NEED HELP?**

### **Documentation:**
- Full technical details: `PHASE_4_FRONTEND_INTEGRATION_COMPLETE.md`
- Backend details: `PHASE_3_IMPLEMENTATION_REPORT.md`
- Test verification: `PHASE_3_TEST_VERIFICATION_REPORT.md`

### **Logs to Check:**
```bash
# Browser Console (F12)
Look for: [CheckoutClient] and [PaymentCallback] messages

# Supabase Dashboard → Edge Functions → Logs
Filter by: create-order-intent or verify-payment

# Supabase Dashboard → SQL Editor
Run verification queries from Step 9
```

### **Common Debug Commands:**
```bash
# Restart dev server
npm run dev

# Check if all dependencies installed
npm install

# Clear browser cache and cookies
# Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

---

## **🎉 CONGRATULATIONS!**

If you made it here and all checks passed, you've successfully:
- ✅ Integrated a live payment gateway
- ✅ Implemented end-to-end payment flow
- ✅ Secured transactions with 5 layers of defense
- ✅ Created a beautiful user experience
- ✅ Built a production-ready checkout system

**Your Live Financial Engine is operational!** 🚀

---

**Next Steps:**
1. Test Khalti flow (similar to eSewa)
2. Test error scenarios (invalid transactions)
3. Set production credentials
4. Deploy to staging environment
5. Conduct final QA testing
6. Launch to production!

**Happy Testing!** 🎯
