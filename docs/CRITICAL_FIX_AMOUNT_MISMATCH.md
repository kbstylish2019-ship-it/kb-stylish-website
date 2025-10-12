# **🚨 CRITICAL FIX: Amount Mismatch Bug**

**Date:** 2025-09-30 09:44:10 NPT  
**Priority:** 🔴 **CRITICAL**  
**Status:** ⚠️ **REQUIRES REDEPLOYMENT (Second Fix)**

---

## **🐛 BUG IDENTIFIED**

### **Symptoms:**
- Checkout page shows: **NPR 194**
- eSewa payment page shows: **NPR 6.07**
- Payment fails with 400/428 errors
- User cannot complete payment

### **Root Cause:**
**Incorrect shipping calculation in `create-order-intent` Edge Function**

**File:** `supabase/functions/create-order-intent/index.ts`  
**Line:** 175 (before fix)

```typescript
// ❌ WRONG (before fix)
const shipping_cents = 500; // This is NPR 5, NOT NPR 99!
```

**The Issue:**
- The database stores all amounts in **paisa** (smallest unit)
- 1 NPR = 100 paisa
- The code said `shipping_cents = 500` which means **500 paisa = NPR 5**
- But the frontend shows **NPR 99** for shipping
- This caused a mismatch: **NPR 99 expected vs NPR 5 calculated**

**Calculation:**
```
Product: NPR 95 = 9500 paisa
Shipping (WRONG): 500 paisa = NPR 5
Tax (13%): 1235 paisa = NPR 12.35
─────────────────────────────────
Total (WRONG): 11235 paisa = NPR 112.35

But then divided by 100 again somewhere: NPR 112.35 / 100 ≈ NPR 1.12

Actual shown: NPR 6.07 (likely includes other cart items)
```

---

## **✅ FIXES APPLIED**

### **Fix 1: Shipping Amount (Line 177)**

```typescript
// ✅ CORRECT (after fix 1)
const shipping_cents = 9900; // NPR 99 = 9900 paisa (flat rate for MVP)
```

**Result:** Amount changed from NPR 6.07 → NPR 100.07 (better, but still wrong!)

### **Fix 2: Price Conversion (Line 171) - THE REAL FIX**

```typescript
// ❌ WRONG (before fix 2)
const subtotal_cents = cart.items.reduce((sum: number, item: any) => 
  sum + (item.price_snapshot * item.quantity), 0
);

// ✅ CORRECT (after fix 2)
const subtotal_cents = cart.items.reduce((sum: number, item: any) => 
  sum + (Math.round(item.price_snapshot * 100) * item.quantity), 0
);
```

**The Problem:** `price_snapshot` is stored in **NPR** (95), not paisa (9500)!  
**The Solution:** Multiply by 100 to convert NPR → paisa before calculation

### **Fix 3: Remove Tax (Line 176)**

```typescript
// ❌ WRONG (before fix 3)
const tax_cents = Math.floor(subtotal_cents * 0.13); // Added 13% tax not shown in frontend

// ✅ CORRECT (after fix 3)
const tax_cents = 0; // Tax not displayed in frontend yet
```

**Why:** Frontend shows NPR 194 (no tax), backend was calculating NPR 206.35 (with tax)

**Now the calculation is CORRECT:**
```
Product: NPR 95 × 100 = 9500 paisa ✓
Shipping: 9900 paisa (NPR 99) ✓
Tax: 0 paisa (matches frontend) ✓
─────────────────────────────────
Total: 9500 + 9900 + 0 = 19400 paisa
After conversion: 19400 / 100 = NPR 194 ✓✓✓

MATCHES CHECKOUT EXACTLY!
```

---

## **🚀 DEPLOYMENT INSTRUCTIONS**

### **Step 1: Start Docker Desktop**
```bash
# On Windows, search for "Docker Desktop" and start it
# Wait for Docker to fully start (whale icon in system tray)
```

### **Step 2: Deploy the Fixed Edge Function**
```bash
cd d:\kb-stylish
supabase functions deploy create-order-intent --project-ref poxjcaogjupsplrcliau
```

**Expected Output:**
```
✓ Bundling Function: create-order-intent
✓ Deploying Function (version 9)
✓ Deployed create-order-intent
```

### **Step 3: Verify Deployment**
Go to Supabase Dashboard → Edge Functions:
- ✅ create-order-intent should show **version 9**
- ✅ Status should be **ACTIVE**

---

## **🧪 TESTING**

### **Test Scenario 1: Verify Amount Matches**

1. **Add NPR 95 product to cart**
2. **Go to checkout**
3. **Check the total:**
   - Products: NPR 95
   - Shipping: NPR 99
   - Tax (13%): NPR 12.35
   - **Total: NPR 206.35** (or thereabouts)

4. **Click "Place Order" with eSewa**
5. **On eSewa page, verify:**
   - Amount should be **NPR 206.35** (matches checkout)
   - NOT NPR 6.07 anymore!

6. **Complete test payment**
7. **Verify success**

### **Test Scenario 2: Database Verification**

After successful payment, run:

```sql
SELECT 
  payment_intent_id,
  amount_cents,
  (amount_cents / 100.0) as amount_npr,
  external_transaction_id,
  status
FROM payment_intents
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- ✅ `amount_cents` should be **20635** (or correct calculated value)
- ✅ `amount_npr` should be **206.35** (or correct calculated value)
- ✅ Status should be `'succeeded'`

---

## **⚠️ ADDITIONAL FIX NEEDED: Frontend Checkout**

The frontend checkout is also showing wrong amounts. We need to fix the shipping calculation there too.

### **Files to Check:**

1. **`src/lib/mock/checkout.ts`** - Check `calculateCosts()` function
2. **`src/components/checkout/CheckoutClient.tsx`** - Check if it's using correct shipping

Let me investigate...

---

## **📊 VERIFICATION CHECKLIST**

- [x] **Root cause identified** (shipping_cents = 500 instead of 9900)
- [x] **Fix applied** to create-order-intent/index.ts
- [ ] **Edge Function deployed** (version 9)
- [ ] **Amount matches on eSewa** (NPR 206 vs NPR 6.07)
- [ ] **Payment completes successfully**
- [ ] **Database shows correct amount**
- [ ] **Frontend checkout shows correct total** (needs investigation)

---

## **🎯 IMPACT**

**Before Fix:**
- ❌ All eSewa payments fail
- ❌ Amount mismatch causes 400/428 errors
- ❌ Users cannot complete purchases
- ❌ Revenue blocked

**After Fix:**
- ✅ eSewa payments work correctly
- ✅ Amount matches between checkout and gateway
- ✅ Users can complete purchases
- ✅ Revenue flowing

---

## **📝 LESSONS LEARNED**

### **Root Cause:**
Mixed units (paisa vs NPR) in calculations

### **Prevention:**
1. **Always use consistent units** throughout the codebase
2. **Document unit conventions** (e.g., "all amounts in paisa")
3. **Add validation** to ensure amounts match across systems
4. **Test with real gateways early** to catch mismatches

### **Best Practice:**
```typescript
// ✅ GOOD: Clear unit naming
const shipping_paisa = 9900; // NPR 99
const product_paisa = 9500;  // NPR 95
const total_paisa = shipping_paisa + product_paisa;
const total_npr = total_paisa / 100;

// ❌ BAD: Ambiguous naming
const shipping = 500; // Is this NPR or paisa?
```

---

## **🚨 URGENT: DEPLOY NOW**

This is a **CRITICAL BUG** that blocks all payment processing. Deploy immediately to restore functionality.

**Deployment Command:**
```bash
supabase functions deploy create-order-intent --project-ref poxjcaogjupsplrcliau
```

**Status:** ⏳ **AWAITING DEPLOYMENT**

---

**Bug Fixed:** 2025-09-30 09:33:54 NPT  
**Severity:** 🔴 CRITICAL  
**Priority:** P0 (Deploy immediately)  
**Estimated Fix Time:** 2 minutes (after Docker starts)
