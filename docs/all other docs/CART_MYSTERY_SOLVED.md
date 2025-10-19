# **🔍 CART MYSTERY - ROOT CAUSE IDENTIFIED**

**Date:** 2025-09-30 18:31 NPT  
**Status:** 🔴 Critical Bug Found

---

## **🎯 THE SMOKING GUN**

**Database RPC works perfectly:**
- ✅ Called `add_to_cart_secure` directly → Item inserted
- ✅ Verified in database → Item exists
- ✅ Returns success with item_id

**BUT Edge Function returns success WITHOUT inserting:**
- ✅ Client calls cart-manager
- ✅ Gets status 200, success: true
- ❌ **NO row in database!**

---

## **📊 EVIDENCE**

### **Timeline of Your Test Product Checkout:**

```
12:22:43 - Job created (payment_intent)
12:23:xx - You clicked "Pay with eSewa"
12:24:00 - Order-worker ran
12:24:00 - Order created with 0 items
12:25:28 - Floral Maxi added (first item in database!)
```

### **Database History:**

```sql
SELECT * FROM cart_items WHERE cart_id = '...' ORDER BY created_at;
```

**Result:** Only 2 items ever existed:
1. Floral Maxi (12:25:28) - Added AFTER payment
2. Test Product (12:31:08) - Added by ME just now

**The "Test Product" you checked out with was NEVER in the database!**

---

## **🔍 WHY THIS HAPPENS**

**Hypothesis:** The cart-manager Edge Function's RPC call is failing silently.

Looking at the Edge Function code:
```typescript
const { data, error } = await supabase.rpc('add_to_cart_secure', addPayload);

if (error) {
  console.error('RPC error:', error);
  return { success: false, message: error.message };
}

// Step 2: Return the full cart
const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
return {
  success: true,
  cart: cartResponse.cart,
  message: 'Item added to cart successfully'
};
```

**Possible issues:**

1. **RPC call succeeds but doesn't insert** - Due to RLS or constraint
2. **getCart() returns stale/cached data** - Shows old items
3. **Service client permissions** - Can't insert for authenticated users
4. **Race condition** - Item inserted then immediately deleted

---

## **🧪 TEST TO CONFIRM**

**I need you to:**

1. Open a new terminal/PowerShell
2. Run this command to test the Edge Function directly:

```powershell
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjQ1MDUsImV4cCI6MjA3MzE0MDUwNX0.5gcfRhvo4PbfSXVPRsJhbmSn046-yjwaDiC92VGo62w'
    'Content-Type' = 'application/json'
    'x-guest-token' = 'test-token-12345'
}

$body = @{
    action = 'add'
    variant_id = 'c0ef3daa-f33b-404b-9972-522a385636c8'
    quantity = 1
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri 'https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager' -Method POST -Headers $headers -Body $body

$response | ConvertTo-Json -Depth 10
```

3. **Then check database:**

```sql
SELECT * FROM cart_items 
WHERE cart_id = '53795c06-cfe2-49bc-83d7-b4ff5571cd76'
ORDER BY created_at DESC;
```

**If the item appears:** Edge Function works, something else is the issue  
**If NO item appears:** Edge Function RPC call is broken

---

## **💡 LIKELY FIX**

Based on the RLS policies, I suspect the issue is:

**Service role can't insert into authenticated user carts due to RLS!**

The policy says:
```sql
-- Service role can manage ONLY guest cart items
WHERE (auth.jwt() ->> 'role' = 'service_role') 
  AND cart_id IN (SELECT id FROM carts WHERE user_id IS NULL)
```

This BLOCKS service_role from inserting into carts where `user_id IS NOT NULL`!

**But wait...** `add_to_cart_secure` is `SECURITY DEFINER` which should bypass RLS!

Unless... the Edge Function is calling it with the WRONG client (anon instead of service_role)?

---

## **🚀 IMMEDIATE ACTION**

We need to check the Edge Function logs to see if there's an error being swallowed.

Refresh your browser and add another item, then immediately run:

```powershell
# Check Edge Function logs
# Go to: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/logs/edge-functions
# Filter by: cart-manager
# Look for errors in last 5 minutes
```

---

**This is the final piece! Once we see the actual error, we'll fix it in 5 minutes!** 🎯
