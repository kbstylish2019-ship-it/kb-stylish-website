# **🚨 CART PERSISTENCE ISSUE IDENTIFIED**

**Date:** 2025-09-30 17:42 NPT  
**Status:** 🔴 Critical - Orders created with 0 items

---

## **🎯 THE PROBLEM**

**Symptom:** Orders are created successfully but have **0 items** despite cart showing items in UI

**Root Cause:** Cart items are NOT being persisted to the database `cart_items` table

---

## **📊 EVIDENCE**

### **Database Inspection:**

```sql
-- User's cart
SELECT * FROM carts WHERE user_id = '8e80ead5-ce95-4bad-ab30-d4f54555584b';
-- Result: 1 cart exists (53795c06-cfe2-49bc-83d7-b4ff5571cd76)

-- Cart items
SELECT * FROM cart_items WHERE cart_id = '53795c06-cfe2-49bc-83d7-b4ff5571cd76';
-- Result: EMPTY (0 rows)

-- Latest cart_items in entire system
SELECT * FROM cart_items ORDER BY updated_at DESC LIMIT 1;
-- Result: Last update was 2025-09-24 14:44:54 (6 days ago)
```

**Conclusion:** No cart items have been written to database since September 24th!

---

## **🔍 THE FLOW (What Should Happen)**

```
User clicks "Add to Cart"
    ↓
ProductActions.tsx → addProductItem()
    ↓
decoupledCartStore.ts → cartAPI.addToCart(variantId, quantity)
    ↓
cartClient.ts → POST /functions/v1/cart-manager
    ↓
cart-manager Edge Function → add_to_cart_secure RPC
    ↓
Database → INSERT INTO cart_items
    ↓
Returns updated cart to client
```

### **What's Actually Happening:**

```
User clicks "Add to Cart"
    ↓
ProductActions.tsx → addProductItem()
    ↓
decoupledCartStore.ts → cartAPI.addToCart(variantId, quantity)
    ↓
cartClient.ts → POST /functions/v1/cart-manager
    ↓
❌ Something fails here - no database write
    ↓
Client state updated (UI shows items)
    ↓
Database remains empty
```

---

## **🔎 WHERE TO LOOK**

### **1. cart-manager Edge Function**

**File:** `supabase/functions/cart-manager/index.ts`

**Check:**
- Is it receiving the `add` action?
- Is it calling `add_to_cart_secure` RPC correctly?
- Are there any errors being logged?
- Is authentication working?

**Likely Issue:**
- RPC call failing silently
- Permission issue with service_role
- Parameter mismatch between Edge Function and RPC

---

### **2. add_to_cart_secure RPC**

**Location:** Database function (check migrations)

**Check:**
- Does the function exist?
- Are parameters correct?
- Is RLS blocking the insert?
- Are there any constraints failing?

**SQL to verify:**
```sql
-- Check if function exists
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_schema='public' 
  AND routine_name LIKE '%cart%';

-- Try calling it manually
SELECT add_to_cart_secure(
  '8e80ead5-ce95-4bad-ab30-d4f54555584b'::uuid,
  'c0ef3daa-f33b-404b-9972-522a385636c8'::uuid,  -- test variant
  1,
  NULL,  -- guest_token
  NULL   -- secret
);
```

---

### **3. Client-Side Logging**

**What user sees:**
- ✅ "Add to Cart" button works
- ✅ Cart badge updates immediately
- ✅ Items show in cart UI
- ✅ Can proceed to checkout
- ✅ Payment succeeds
- ❌ Order has 0 items

**Browser console should show:**
```
[DecoupledStore] Adding product: {variantId: 'xxx', quantity: 1}
[CartAPI] addToCart called with: {variantId: 'xxx', quantity: 1}
[CartAPI] Sending request with body: {...}
```

**If successful, should also show:**
```
[CartAPI] Response: {success: true, cart: {...}}
```

**If failed, would show:**
```
[CartAPI] addToCart error response: {...}
[DecoupledStore] Failed to add product: ...
```

---

## **🔧 IMMEDIATE DEBUGGING STEPS**

### **Step 1: Check Edge Function Logs**

```bash
# In Supabase dashboard:
# Logs → Edge Functions → cart-manager
# Look for recent requests
```

**What to look for:**
- Are requests arriving?
- What's the response status?
- Any error messages?

---

### **Step 2: Test cart-manager Directly**

```bash
# Use PowerShell to test
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjQ1MDUsImV4cCI6MjA3MzE0MDUwNX0.5gcfRhvo4PbfSXVPRsJhbmSn046-yjwaDiC92VGo62w'
    'Content-Type' = 'application/json'
}

$body = @{
    action = 'add'
    variant_id = 'c0ef3daa-f33b-404b-9972-522a385636c8'
    quantity = 1
} | ConvertTo-Json

Invoke-RestMethod -Uri 'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager' -Method POST -Headers $headers -Body $body
```

---

### **Step 3: Check Database Functions**

```sql
-- List all cart-related functions
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema='public' 
  AND routine_name LIKE '%cart%'
ORDER BY routine_name;

-- Check recent errors in logs (if you have logging)
SELECT * FROM pg_stat_activity 
WHERE query LIKE '%cart%' 
  AND state = 'active';
```

---

## **💡 PROBABLE CAUSES (Ranked by Likelihood)**

### **1. Cart-Manager Edge Function Error (80% likely)**
- Function failing silently
- Not calling RPC or calling wrong RPC name
- Authentication issue
- Response not being checked properly

### **2. RLS Policy Blocking Inserts (15% likely)**
- Service role not granted permissions
- RLS preventing cart_items INSERT
- User ID mismatch

### **3. Database Function Missing/Broken (5% likely)**
- RPC doesn't exist
- Parameters changed
- Function has bug

---

## **✅ TEMPORARY WORKAROUND**

**Until fixed, you can:**

1. **Manual order items entry** (not scalable)
2. **Bypass cart persistence** - snapshot cart in payment_intent
3. **Force database write before checkout**

### **Option: Snapshot Cart in Payment Intent**

**Best short-term fix:**

Modify `create-order-intent` Edge Function to:
1. Accept cart items in request payload
2. Store them in `payment_intents.metadata`
3. Modify `order-worker` to read from metadata instead of `cart_items`

---

## **🚀 NEXT STEPS**

1. **Check cart-manager logs** (5 minutes)
2. **Test cart-manager directly** (10 minutes)
3. **Verify database functions exist** (5 minutes)
4. **Add extensive logging** to cart-manager (15 minutes)
5. **Fix the root cause** (30 minutes)
6. **Test end-to-end** (10 minutes)

**Total estimated fix time:** 1-2 hours

---

## **📝 QUESTIONS TO ANSWER**

- [ ] Does cart-manager Edge Function receive add requests?
- [ ] Are requests authenticated correctly?
- [ ] Does add_to_cart_secure function exist in database?
- [ ] Are there any RLS policies blocking inserts?
- [ ] What error (if any) is being returned to client?
- [ ] Why did cart persistence stop on September 24th?

---

**Last Updated:** 2025-09-30 17:42 NPT  
**Status:** 🔴 Needs immediate investigation
