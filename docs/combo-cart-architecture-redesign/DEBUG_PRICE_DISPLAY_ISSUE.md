# DEBUG: Combo Price Display Issue

**Date**: January 17, 2026  
**Status**: 🔍 INVESTIGATING  
**Issue**: Cart displays original prices instead of discounted prices

---

## 🎯 PROBLEM STATEMENT

User reports: "it doesn't quite look like what you said I should see but the final price is same"

**Expected**:
- Test product: Rs. 0.50
- Lilium (400ml): Rs. 499.83
- Lilium (300ml): Rs. 499.83
- **Total: Rs. 1,500** ✅

**Actual**:
- Test product: Rs. 1 (or Rs. 50?)
- Lilium products: Rs. 500 (or Rs. 1,000?)
- **Total: Rs. 1,500** ✅ (correct!)

---

## 🔬 INVESTIGATION FINDINGS

### ✅ Database Layer - CORRECT

Query results show correct `price_snapshot` values:

```sql
SELECT price_snapshot, current_price, product_name
FROM cart_items ci
JOIN product_variants pv ON pv.id = ci.variant_id
JOIN products p ON p.id = pv.product_id
WHERE combo_group_id IS NOT NULL;
```

**Results**:
| Product | price_snapshot | current_price |
|---------|---------------|---------------|
| test product | 0.50 | 1.00 |
| Lilium (400ml) | 499.83 | 1000.00 |
| Lilium (300ml) | 499.83 | 1000.00 |

✅ **Database has correct discounted prices in `price_snapshot`**

---

### ✅ Database Function - CORRECT

`get_cart_details_secure` returns both fields:

```sql
jsonb_build_object(
  'price_snapshot', ci.price_snapshot,  -- Discounted price
  'current_price', pv.price             -- Original price
)
```

✅ **Function returns both `price_snapshot` and `current_price`**

---

### ✅ Edge Function - CORRECT

`cart-manager/index.ts` correctly passes through the data:

```typescript
return {
  success: true,
  cart: {
    ...cart,
    cart_items: items  // Contains both price_snapshot and current_price
  }
};
```

✅ **Edge function returns complete data**

---

### ✅ Transform Function - CORRECT (in theory)

`decoupledCartStore.ts` line 869:

```typescript
const price = parseFloat(item.price_snapshot || item.current_price || item.price || '0');
```

✅ **Transform function prioritizes `price_snapshot` first**

---

### ❓ Frontend Display - NEEDS VERIFICATION

`ProductList.tsx` line 76:

```typescript
<div className="text-sm font-medium text-gray-900 whitespace-nowrap">
  {formatNPR(it.price)}
</div>
```

`CheckoutClient.tsx` line 142:

```typescript
price: item.price,  // From store's CartProductItem
```

❓ **Need to verify what `item.price` actually contains**

---

## 🔍 DEBUG LOGGING ADDED

### 1. Edge Function (`cart-manager/index.ts`)
```typescript
console.log('[Edge Function] Cart items from database:', JSON.stringify(items, null, 2));
```

### 2. Transform Function (`decoupledCartStore.ts`)
```typescript
console.log('[transformApiItemsToProducts] Item price data:', {
  product_name: item.product_name,
  price_snapshot: item.price_snapshot,
  current_price: item.current_price,
  price: item.price
});
console.log('[transformApiItemsToProducts] Final price used:', price);
```

### 3. Checkout Client (`CheckoutClient.tsx`)
```typescript
console.log('[CheckoutClient] Transforming item:', {
  id: item.id,
  product_name: item.product_name,
  store_price: item.price,
  quantity: item.quantity
});
```

---

## 🧪 NEXT STEPS FOR USER

### Step 1: Clear Browser Cache
1. Open DevTools (F12)
2. Go to Application tab
3. Clear Storage → Clear site data
4. Refresh page

### Step 2: Check Console Logs
1. Open DevTools Console (F12)
2. Refresh the checkout page
3. Look for these log messages:
   - `[Edge Function] Cart items from database:`
   - `[transformApiItemsToProducts] Item price data:`
   - `[CheckoutClient] Transforming item:`

### Step 3: Share Console Output
Copy and paste the console logs, especially:
- What `price_snapshot` value is returned from edge function
- What `price` value is used in transform function
- What `store_price` value is shown in CheckoutClient

---

## 🤔 POSSIBLE CAUSES

### Theory 1: Stale Frontend State
- Frontend might be caching old cart data
- **Solution**: Clear browser cache and localStorage

### Theory 2: Type Coercion Issue
- `price_snapshot` might be null/undefined for some reason
- **Solution**: Check console logs for actual values

### Theory 3: Multiple Cart Items
- User might have BOTH old (wrong price) and new (correct price) items
- **Solution**: Clear cart and re-add combo

### Theory 4: Display Formatting Issue
- Prices might be correct but displayed wrong
- **Solution**: Check if `formatNPR` is working correctly

---

## 📊 DATA FLOW DIAGRAM

```
Database (cart_items)
  ├─ price_snapshot: 0.50 ✅
  └─ current_price: 1.00
         ↓
get_cart_details_secure()
  ├─ price_snapshot: 0.50 ✅
  └─ current_price: 1.00
         ↓
Edge Function (cart-manager)
  └─ cart_items: [{price_snapshot: 0.50, current_price: 1.00}] ✅
         ↓
cartAPI.getCart()
  └─ response.cart.cart_items ✅
         ↓
transformApiItemsToProducts()
  └─ price = parseFloat(item.price_snapshot || ...) ❓
         ↓
decoupledCartStore.productItems
  └─ item.price = ??? ❓
         ↓
CheckoutClient.products
  └─ price: item.price ❓
         ↓
ProductList
  └─ {formatNPR(it.price)} ❓ DISPLAYS WRONG VALUE
```

---

## 🎯 EXPECTED CONSOLE OUTPUT

If everything is working correctly, you should see:

```
[Edge Function] Cart items from database: [
  {
    "id": "...",
    "price_snapshot": 0.5,
    "current_price": 1,
    "product_name": "test product"
  }
]

[transformApiItemsToProducts] Item price data: {
  product_name: "test product",
  price_snapshot: 0.5,
  current_price: 1,
  price: undefined
}

[transformApiItemsToProducts] Final price used: 0.5

[CheckoutClient] Transforming item: {
  id: "...",
  product_name: "test product",
  store_price: 0.5,
  quantity: 1
}
```

---

## 🚨 ACTION REQUIRED

**Please do the following**:

1. **Refresh your checkout page** (Ctrl+Shift+R to hard refresh)
2. **Open browser console** (F12)
3. **Copy all console logs** that start with:
   - `[Edge Function]`
   - `[transformApiItemsToProducts]`
   - `[CheckoutClient]`
4. **Share the logs** so I can see exactly what values are being used

This will help me identify where in the data flow the prices are getting mixed up!

---

**Status**: ⏳ WAITING FOR USER CONSOLE LOGS
