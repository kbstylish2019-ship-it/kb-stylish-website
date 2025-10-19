# 🎯 CURATION ADMIN UI - WEEK 4 IMPLEMENTATION PLAN

**Date**: October 17, 2025  
**Mission**: Build Admin UI for Curation & Ranking Engine Management  
**Blueprint**: Fortress Architecture v2.1 - **FINAL MISSION**  

---

## 📋 SUMMARY

### Deliverables
- ✅ 2 API routes (toggle-brand, add-recommendation)
- ✅ 2 admin pages (featured-brands, recommendations)
- ✅ Admin sidebar integration
- ✅ Complete testing guide

---

## 🔍 SYSTEM CONSCIOUSNESS AUDIT COMPLETE

### Existing Admin Architecture Verified

**Pattern 1: Admin Auth Flow** (from users/page.tsx)
```typescript
// 1. Verify authentication
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect('/auth/login');

// 2. Verify admin role
const userRoles = user.user_metadata?.user_roles || [];
if (!userRoles.includes('admin')) redirect('/');
```

**Pattern 2: API Route Auth** (from api/admin/users/search/route.ts)
```typescript
// 1. Create Supabase client
const supabase = createServerClient(...);

// 2. Auth check
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

// 3. Admin role check via RPC
const { data: isAdmin } = await supabase.rpc('user_has_role', {
  user_uuid: user.id,
  role_name: 'admin'
});
if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

**Pattern 3: Admin Page Layout** (from dashboard/page.tsx)
```typescript
<DashboardLayout title="Page Title" sidebar={<AdminSidebar />}>
  {/* Page content */}
</DashboardLayout>
```

### Database Functions Verified

**Function 1: `toggle_brand_featured(p_brand_id, p_is_featured)`**
- Self-defending: Calls `private.assert_admin()`
- Creates audit trail: `featured_at`, `featured_by`
- Returns: void
- Errors: Raises exception if brand not found

**Function 2: `add_product_recommendation(p_source_product_id, p_recommended_product_id, p_display_order)`**
- Self-defending: Calls `private.assert_admin()`
- Validates: Both products exist
- Returns: UUID (recommendation_id)
- Errors: Unique violation, check violation, not found

---

## 📐 ARCHITECTURE DESIGN

### 1. API Routes

#### Route 1: `/api/admin/curation/toggle-brand`

```typescript
// POST /api/admin/curation/toggle-brand
// Body: { brand_id: string, is_featured: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brand_id, is_featured } = body;
    
    // Validation
    if (!brand_id || typeof is_featured !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'Invalid parameters'
      }, { status: 400 });
    }
    
    // Create Supabase client
    const cookieStore = await cookies();
    const supabase = createServerClient(...);
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    // Admin role check
    const { data: isAdmin } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'admin'
    });
    if (!isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Admin access required'
      }, { status: 403 });
    }
    
    // Call database function (self-defending)
    const { error } = await supabase.rpc('toggle_brand_featured', {
      p_brand_id: brand_id,
      p_is_featured: is_featured
    });
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
```

#### Route 2: `/api/admin/curation/add-recommendation`

```typescript
// POST /api/admin/curation/add-recommendation
// Body: { source_product_id: string, recommended_product_id: string, display_order: number }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_product_id, recommended_product_id, display_order } = body;
    
    // Validation
    if (!source_product_id || !recommended_product_id) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters'
      }, { status: 400 });
    }
    
    // Auth + Admin check (same as above)
    
    // Call database function
    const { data: recommendation_id, error } = await supabase.rpc('add_product_recommendation', {
      p_source_product_id: source_product_id,
      p_recommended_product_id: recommended_product_id,
      p_display_order: display_order || 0
    });
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      recommendation_id
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
```

### 2. Admin Pages

#### Page 1: Featured Brands Management

**File**: `src/app/admin/curation/featured-brands/page.tsx`

**Features**:
- List all brands with toggle switches
- Show featured status
- Show product count
- Real-time toggle (optimistic UI)
- Success/error notifications

**Layout**:
```
┌─────────────────────────────────────────────────┐
│ Featured Brands Management                      │
├─────────────────────────────────────────────────┤
│ Brand Name          Products    Featured        │
│ ─────────────────────────────────────────────   │
│ Kailash             25          [ON]  OFF       │
│ Everest Co.         18          ON   [OFF]      │
│ Sajilo              42          [ON]  OFF       │
└─────────────────────────────────────────────────┘
```

#### Page 2: Product Recommendations Management

**File**: `src/app/admin/curation/recommendations/page.tsx`

**Features**:
- Search for source product
- View existing recommendations
- Search for products to recommend
- Add new recommendations
- Set display order
- Delete recommendations

**Layout**:
```
┌─────────────────────────────────────────────────┐
│ Product Recommendations                         │
├─────────────────────────────────────────────────┤
│ Source Product: [Search...] [Select]           │
│                                                 │
│ Current Recommendations:                        │
│ 1. Product A                        [Remove]    │
│ 2. Product B                        [Remove]    │
│                                                 │
│ Add Recommendation: [Search...] [Add]          │
└─────────────────────────────────────────────────┘
```

### 3. Admin Sidebar Integration

Add to `AdminSidebar.tsx`:
```typescript
{ id: "curation", label: "Curation", href: "/admin/curation/featured-brands" },
```

---

## ✅ SUCCESS CRITERIA

- [ ] Admin can toggle brand featured status
- [ ] Changes reflect on homepage immediately (after cache expires)
- [ ] Admin can add product recommendations
- [ ] Recommendations show on product detail pages
- [ ] All operations require admin role
- [ ] Error handling graceful

---

**READY FOR EXECUTION**: YES ✅
