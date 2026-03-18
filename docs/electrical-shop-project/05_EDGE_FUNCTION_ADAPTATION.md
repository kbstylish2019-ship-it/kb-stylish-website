# ⚡ EDGE FUNCTION ADAPTATION
# Backend Function Changes for Electrical Shop

**Date**: January 27, 2026  
**Purpose**: Edge Function modifications needed  
**Status**: COMPLETE

---

## 📋 OVERVIEW

KB Stylish has **24 Edge Functions** deployed. Most are generic enough to work with minimal changes.

### Summary
| Category | Count | Action |
|----------|-------|--------|
| Keep As-Is | 15 | Copy directly |
| Modify | 6 | Update vendor→owner logic |
| Remove | 3 | Not needed |

---

## ✅ KEEP AS-IS (15 Functions)

These functions are generic and work without modification:

| Function | Purpose | Notes |
|----------|---------|-------|
| `cart-manager` | Cart CRUD operations | Generic cart logic |
| `create-order-intent` | Order creation | Works for any product |
| `fulfill-order` | Order fulfillment | Generic order processing |
| `verify-payment` | Payment verification | Payment gateway integration |
| `khalti-webhook` | Khalti payment callbacks | Keep as-is |
| `npx-webhook` | NPX payment callbacks | Keep as-is |
| `review-manager` | Review CRUD | Product reviews |
| `vote-manager` | Review voting | Helpful/not helpful |
| `reply-manager` | Review replies | Owner replies to reviews |
| `ratings-worker` | Rating aggregation | Background job |
| `send-email` | Email dispatch | Generic email sender |
| `order-worker` | Order processing | Background job |
| `metrics-worker` | Metrics updates | Dashboard stats |
| `cache-cleanup-worker` | Cache maintenance | Housekeeping |
| `cache-invalidator` | Cache busting | Performance |

---

## ⚠️ MODIFY (6 Functions)

### 1. `vendor-dashboard` → `owner-dashboard`

#### Current Logic
```typescript
// supabase/functions/vendor-dashboard/index.ts

Deno.serve(async (req) => {
  // Verify JWT
  const user = await verifyUser(req);
  
  // Check vendor role
  if (!user.roles.includes('vendor')) {
    return errorResponse('Unauthorized', 403);
  }
  
  // Get vendor stats
  const { data } = await userClient.rpc('get_vendor_dashboard_stats_v2_1', {
    v_id: user.id
  });
  
  return new Response(JSON.stringify(data));
});
```

#### New Logic
```typescript
// supabase/functions/owner-dashboard/index.ts

Deno.serve(async (req) => {
  // Verify JWT
  const user = await verifyUser(req);
  
  // Check admin role (owner = admin in single-vendor setup)
  if (!user.roles.includes('admin')) {
    return errorResponse('Unauthorized', 403);
  }
  
  // Get shop stats (simplified - no vendor_id needed)
  const { data } = await userClient.rpc('get_shop_dashboard_stats');
  
  return new Response(JSON.stringify(data));
});
```

#### Changes Required
1. Rename function directory
2. Update role check: `vendor` → `admin`
3. Update RPC call to new function name
4. Remove vendor_id parameter

---

### 2. `admin-dashboard`

#### Current Logic
```typescript
// Gets platform-wide stats across all vendors
const { data } = await serviceClient.rpc('get_admin_dashboard_stats_v2_1');
```

#### New Logic
```typescript
// Same stats, but now represents single shop
// Can potentially merge with owner-dashboard
const { data } = await serviceClient.rpc('get_shop_admin_stats');

// Add inventory-specific stats
const inventoryStats = await serviceClient.rpc('get_inventory_alerts');
```

#### Changes Required
1. Add low stock alerts to response
2. Add pending orders count
3. Remove vendor-count stats
4. Simplify for single-shop context

---

### 3. `get-curated-content`

#### Current Logic
```typescript
// Returns fashion-specific curated content
const sections = [
  { type: 'featured_products', title: 'Trending Styles' },
  { type: 'featured_stylists', title: 'Top Stylists' },  // REMOVE
  { type: 'categories', title: 'Shop by Category' },
];
```

#### New Logic
```typescript
// Returns electrical shop curated content
const sections = [
  { type: 'featured_products', title: 'Featured Products' },
  { type: 'featured_brands', title: 'Top Brands' },  // NEW
  { type: 'categories', title: 'Shop by Category' },
  { type: 'deals', title: 'Best Deals' },  // NEW
];
```

#### Changes Required
1. Remove stylist-related content
2. Add brand showcase
3. Update category queries for electrical

---

### 4. `user-onboarding`

#### Current Logic
```typescript
// Handles user registration
// Has vendor application path
if (applicationType === 'vendor') {
  // Create vendor application
}
```

#### New Logic
```typescript
// Simplified - only customer registration
// Remove vendor application path entirely
// Just create user profile with 'customer' role
```

#### Changes Required
1. Remove vendor application logic
2. Simplify to customer-only flow
3. Update welcome email template

---

### 5. `support-ticket-manager`

#### Current Logic
```typescript
// Support ticket categories include vendor issues
const categories = ['order', 'payment', 'vendor', 'other'];
```

#### New Logic
```typescript
// Update categories for electrical shop
const categories = ['order', 'payment', 'product', 'delivery', 'other'];
```

#### Changes Required
1. Update ticket categories
2. Update email templates with new branding
3. Remove vendor-specific ticket routing

---

### 6. `review-request-worker`

#### Current Logic
```typescript
// Sends review request emails
// Uses KB Stylish branding
const emailSubject = "How was your KB Stylish order?";
```

#### New Logic
```typescript
// Update branding
const emailSubject = "How was your ElectroPro order?";
// Update email template with new logo/colors
```

#### Changes Required
1. Update email templates
2. Update branding
3. No logic changes needed

---

## ❌ REMOVE (3 Functions)

| Function | Reason |
|----------|--------|
| `submit-vendor-application` | No vendor onboarding |
| `booking-reminder-worker` | No booking system |
| (Potentially) stylist-related | Not applicable |

---

## 📝 NEW FUNCTIONS TO CREATE

### 1. `inventory-manager` (Optional Enhancement)

```typescript
// supabase/functions/inventory-manager/index.ts

import { createDualClients, verifyUser, errorResponse, getCorsHeaders } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders() });
  }
  
  const { userClient, serviceClient } = createDualClients(req.headers.get('Authorization'));
  const user = await verifyUser(userClient);
  
  // Only admin can manage inventory
  if (!user.roles.includes('admin')) {
    return errorResponse('Unauthorized', 403);
  }
  
  const { action, ...params } = await req.json();
  
  switch (action) {
    case 'adjust_stock':
      return await adjustStock(serviceClient, user.id, params);
    case 'get_low_stock':
      return await getLowStock(serviceClient);
    case 'get_movements':
      return await getMovements(serviceClient, params);
    case 'bulk_import':
      return await bulkImport(serviceClient, user.id, params);
    default:
      return errorResponse('Invalid action', 400);
  }
});

async function adjustStock(client, userId, { variantId, quantityChange, movementType, notes }) {
  const { data, error } = await client.rpc('update_inventory_quantity', {
    p_variant_id: variantId,
    p_quantity_change: quantityChange,
    p_movement_type: movementType,
    p_notes: notes
  });
  
  if (error) return errorResponse(error.message, 400);
  return new Response(JSON.stringify(data), { headers: getCorsHeaders() });
}

async function getLowStock(client) {
  const { data, error } = await client
    .from('inventory')
    .select(`
      *,
      variant:product_variants(
        sku,
        product:products(name)
      )
    `)
    .lt('quantity_available', 'reorder_point');
    
  if (error) return errorResponse(error.message, 400);
  return new Response(JSON.stringify(data), { headers: getCorsHeaders() });
}

async function getMovements(client, { variantId, startDate, endDate, limit = 100 }) {
  let query = client
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (variantId) query = query.eq('variant_id', variantId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  
  const { data, error } = await query;
  if (error) return errorResponse(error.message, 400);
  return new Response(JSON.stringify(data), { headers: getCorsHeaders() });
}

async function bulkImport(client, userId, { items, supplier, invoiceNumber }) {
  // items = [{ variantId, quantity, unitCost }]
  const results = [];
  
  for (const item of items) {
    const { data, error } = await client.rpc('update_inventory_quantity', {
      p_variant_id: item.variantId,
      p_quantity_change: item.quantity,
      p_movement_type: 'purchase',
      p_notes: `Supplier: ${supplier}, Invoice: ${invoiceNumber}`
    });
    
    results.push({ variantId: item.variantId, success: !error, error: error?.message });
  }
  
  return new Response(JSON.stringify({ results }), { headers: getCorsHeaders() });
}
```

---

## 🔧 SHARED UTILITIES UPDATE

### `_shared/utils.ts`

#### Add Shop-Specific Helpers
```typescript
// Add to existing utils

export async function verifyAdmin(client: SupabaseClient): Promise<User> {
  const user = await verifyUser(client);
  
  if (!user.roles.includes('admin')) {
    throw new Error('Admin access required');
  }
  
  return user;
}

export function getShopSettings(client: SupabaseClient) {
  return client
    .from('shop_settings')
    .select('*')
    .single();
}
```

---

## 📋 DEPLOYMENT CHECKLIST

### For Each Modified Function

1. **Copy to new project**
   ```bash
   cp -r supabase/functions/vendor-dashboard supabase/functions/owner-dashboard
   ```

2. **Update code**
   - Role checks
   - RPC calls
   - Branding

3. **Update config.toml**
   ```toml
   [functions.owner-dashboard]
   verify_jwt = true
   ```

4. **Deploy**
   ```bash
   supabase functions deploy owner-dashboard
   ```

5. **Test**
   - Auth flow
   - Data retrieval
   - Error handling

---

## 📁 FINAL FUNCTION LIST

### New Project Functions
```
supabase/functions/
├── _shared/                    # Shared utilities
├── admin-dashboard/            # Modified
├── owner-dashboard/            # Renamed from vendor-dashboard
├── cart-manager/               # As-is
├── create-order-intent/        # As-is
├── fulfill-order/              # As-is
├── verify-payment/             # As-is
├── khalti-webhook/             # As-is
├── npx-webhook/                # As-is
├── review-manager/             # As-is
├── vote-manager/               # As-is
├── reply-manager/              # As-is
├── ratings-worker/             # As-is
├── send-email/                 # As-is (update templates)
├── order-worker/               # As-is
├── metrics-worker/             # As-is
├── cache-cleanup-worker/       # As-is
├── cache-invalidator/          # As-is
├── get-curated-content/        # Modified
├── user-onboarding/            # Modified
├── support-ticket-manager/     # Modified
├── review-request-worker/      # Modified (templates)
└── inventory-manager/          # NEW (optional)
```

### Removed Functions
```
# Do not copy these to new project
- submit-vendor-application/
- booking-reminder-worker/
```

---

## ⏱️ EFFORT ESTIMATION

| Task | Hours |
|------|-------|
| Copy functions to new project | 0.5 |
| Rename vendor-dashboard → owner-dashboard | 1 |
| Update role checks in all functions | 1 |
| Update admin-dashboard for single-shop | 1 |
| Update get-curated-content | 0.5 |
| Simplify user-onboarding | 0.5 |
| Update email templates | 1 |
| Create inventory-manager (optional) | 2 |
| Deploy all functions | 0.5 |
| Test all functions | 2 |
| **TOTAL** | **10 hours** |

---

**Document Status**: COMPLETE  
**Next Document**: `06_STEP_BY_STEP_IMPLEMENTATION.md`
