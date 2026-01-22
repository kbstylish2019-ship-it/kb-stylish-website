# URGENT: Cart Manager Edge Function Deployment

**Date**: January 18, 2026  
**Priority**: P0 - CRITICAL  
**Status**: BLOCKED - Requires Manual Deployment

---

## PROBLEM SUMMARY

The cart API is returning empty responses `{}` because the edge function `cart-manager` has been updated in code but NOT deployed to production.

**Impact**: All cart operations are broken (add, remove, view, checkout).

---

## ROOT CAUSE

1. ✅ Database migrations applied (includes `id` field in cart items)
2. ✅ Edge function code updated (supports `cart_item_id` parameter)
3. ✅ Frontend code updated (expects new response format)
4. ❌ **Edge function NOT deployed** - Still running old version

**Result**: Response format mismatch causing empty `{}` responses.

---

## SOLUTION

Deploy the updated `cart-manager` edge function to production.

---

## DEPLOYMENT OPTIONS

### Option 1: Via Supabase Dashboard (RECOMMENDED)

1. Go to https://supabase.com/dashboard/project/poxjcaogjupsplrcliau
2. Navigate to "Edge Functions"
3. Find "cart-manager" function
4. Click "Deploy new version"
5. Upload the file: `supabase/functions/cart-manager/index.ts`
6. Also upload dependencies:
   - `supabase/functions/cart-manager/_shared/cors.ts`
   - `supabase/functions/_shared/cors.ts`
7. Click "Deploy"
8. Wait for deployment to complete
9. Verify version number increments (should be v67 or higher)

### Option 2: Via Supabase CLI (If you have access token)

```bash
# Set access token
export SUPABASE_ACCESS_TOKEN="your-token-here"

# Deploy function
npx supabase functions deploy cart-manager --project-ref poxjcaogjupsplrcliau

# Verify deployment
npx supabase functions list --project-ref poxjcaogjupsplrcliau
```

### Option 3: Via MCP Tool (Automated)

The MCP tool can deploy but requires the full file content. This is handled automatically by the AI assistant.

---

## POST-DEPLOYMENT VERIFICATION

### Step 1: Check Deployment Status

```bash
# List functions to verify new version
npx supabase functions list --project-ref poxjcaogjupsplrcliau

# Look for cart-manager with version 67 or higher
```

### Step 2: Test Cart API

**Test 1: Get Cart**
```bash
curl -X POST https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "get"}'

# Expected response:
{
  "success": true,
  "cart": {
    "id": "uuid",
    "items": [...],
    "subtotal": 1234,
    "item_count": 4
  }
}

# NOT: {}
```

**Test 2: Add to Cart**
```bash
curl -X POST https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "variant_id": "some-uuid",
    "quantity": 1
  }'

# Expected response:
{
  "success": true,
  "cart": {...},
  "message": "Item added to cart successfully"
}
```

**Test 3: Remove from Cart (NEW FUNCTIONALITY)**
```bash
curl -X POST https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "remove",
    "cart_item_id": "some-uuid"
  }'

# Expected response:
{
  "success": true,
  "cart": {...},
  "message": "Item removed from cart successfully"
}
```

### Step 3: Test in Browser

1. Open https://your-site.com/checkout
2. Open browser console (F12)
3. Check for errors
4. Verify cart items display
5. Try adding a product
6. Try removing a product
7. Verify checkout works

### Step 4: Verify Response Format

Check that each cart item includes the `id` field:

```javascript
// In browser console
fetch('https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ action: 'get' })
})
.then(r => r.json())
.then(data => {
  console.log('Cart response:', data);
  console.log('First item ID:', data.cart?.items?.[0]?.id);
  // Should NOT be undefined
});
```

---

## ROLLBACK PROCEDURE

If deployment causes issues:

```bash
# List all versions
npx supabase functions list --project-ref poxjcaogjupsplrcliau

# Rollback to previous version (e.g., v66)
npx supabase functions deploy cart-manager --version 66 --project-ref poxjcaogjupsplrcliau
```

---

## TROUBLESHOOTING

### Issue: Still getting empty responses after deployment

**Solution**:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Clear localStorage: `localStorage.clear()`
3. Hard refresh (Ctrl+F5)
4. Check edge function logs for errors

### Issue: "cart_item_id or variant_id is required" error

**Solution**:
- This means the old edge function is still deployed
- Verify deployment completed successfully
- Check version number increased
- Wait 1-2 minutes for CDN cache to clear

### Issue: Deployment fails with 401 Unauthorized

**Solution**:
1. Verify access token is correct
2. Check token hasn't expired
3. Try deploying via Supabase Dashboard instead
4. Contact Supabase support if issue persists

---

## MONITORING

After deployment, monitor:

1. **Edge Function Logs**:
   - Go to Supabase Dashboard → Edge Functions → cart-manager → Logs
   - Look for errors or warnings
   - Verify requests are succeeding

2. **Error Rate**:
   - Check for increase in 400/500 errors
   - Monitor response times
   - Watch for timeout errors

3. **User Reports**:
   - Monitor support tickets
   - Check for cart-related complaints
   - Verify checkout completion rate

---

## SUCCESS CRITERIA

✅ Deployment successful when:
- [ ] Edge function version incremented (v67+)
- [ ] Cart API returns proper responses (not `{}`)
- [ ] Each cart item includes `id` field
- [ ] Add to cart works
- [ ] Remove from cart works (with cart_item_id)
- [ ] Checkout page loads without errors
- [ ] No console errors
- [ ] Users can complete checkout

---

## CONTACT

If you need help with deployment:
1. Check Supabase documentation: https://supabase.com/docs/guides/functions
2. Contact Supabase support: https://supabase.com/dashboard/support
3. Review edge function logs for specific errors

---

**URGENT**: This deployment is blocking all cart functionality. Please deploy as soon as possible.

