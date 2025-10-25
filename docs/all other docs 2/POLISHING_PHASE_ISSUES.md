# 🎨 POLISHING PHASE - ISSUE TRACKER

**Date**: October 21, 2025  
**Phase**: Post-Product Management System Launch  
**Status**: Analysis & Prioritization Complete

---

## 📋 ALL ISSUES REPORTED

### **🔴 CRITICAL (P0) - Do First**

#### 1. Cart Persistence Bug for Guest Users
**Status**: 🔍 **INVESTIGATING**

**Symptoms**:
- Product added first → Then service added → Product disappears, only service shows
- Service (bookings) not persisting for guest users
- Products persist correctly for guest users

**Root Cause Hypothesis**:
```typescript
// Current Architecture:
// - Products: Stored via cart API (server-side, DB)
// - Services/Bookings: Stored in localStorage (client-side only)

// Potential Issue:
// When initializeCart() is called, it might be clearing state incorrectly
// OR localStorage is being cleared/blocked by browser
// OR there's a race condition between product + booking state updates
```

**Files to Investigate**:
- `src/lib/store/decoupledCartStore.ts` - Lines 388-487 (initializeCart)
- `src/lib/store/bookingPersistStore.ts` - localStorage persistence
- `src/components/CartInitializer.tsx` - Initialization logic

**Testing Plan**:
1. Open incognito browser (clean state)
2. Add product → Check localStorage, check DB
3. Add service → Check localStorage again
4. Refresh page → Check both persist
5. Close browser, reopen → Check both persist

---

#### 2. Cart/Checkout UX - Missing Variant Details
**Status**: ⏳ **READY TO FIX**

**Current State**:
```tsx
// ProductList.tsx line 53-55
{it.variant && (
  <div className="text-xs text-foreground/70">{it.variant}</div>
)}
```

**Desired State**:
- ✅ Show variant size as badge (e.g., "Size: M")
- ✅ Show variant color as swatch + text (e.g., [●] Black)
- ✅ Display product image (currently shows "No image" placeholder)
- ✅ Better visual hierarchy

**Enhancement Design**:
```tsx
<div className="flex gap-3 py-3">
  {/* Image - 80x80px */}
  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/10">
    <Image src={it.imageUrl} alt={it.name} fill className="object-cover" />
  </div>
  
  <div className="min-w-0 flex-1">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{it.name}</div>
        
        {/* NEW: Enhanced variant display */}
        {it.variantData && (
          <div className="flex items-center gap-2 mt-1">
            {it.variantData.size && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-white/10 text-foreground/80">
                Size: {it.variantData.size}
              </span>
            )}
            {it.variantData.color && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white/10 text-foreground/80">
                <span className="w-3 h-3 rounded-full border border-white/20" 
                      style={{ backgroundColor: it.variantData.colorHex }} />
                {it.variantData.color}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="text-sm font-medium">{formatNPR(it.price)}</div>
    </div>
  </div>
</div>
```

**Files to Update**:
- `src/components/checkout/ProductList.tsx` - Enhanced display
- `src/lib/store/decoupledCartStore.ts` - Extract variant data from API
- `src/lib/types.ts` - Add variantData interface

---

### **🟡 MEDIUM PRIORITY (P1) - Next Batch**

#### 3. Vendor Application Page Logic
**Status**: 📝 **SPEC DEFINED**

**Current Behavior**:
- Vendor A (already approved): Goes to `/vendor/apply` → ✅ Redirects to dashboard (correct)
- Vendor B (application pending): Goes to `/vendor/apply` → ❌ Shows application form again (wrong)
- Regular user: Goes to `/vendor/apply` → ✅ Shows form (correct)

**Expected Behavior**:
```
IF user is authenticated vendor (approved)
  → Redirect to /vendor/dashboard

ELSE IF user has pending application
  → Show "Application Under Review" status page
  → DO NOT show form again

ELSE IF user is regular user (no application)
  → Show vendor application form

ELSE (not logged in)
  → Prompt login first
```

**Fix Location**:
- `src/app/vendor/apply/page.tsx` - Add status check logic

**Implementation**:
```typescript
// Check vendor status from DB
const vendorStatus = await getVendorStatus(userId);

if (vendorStatus === 'approved') {
  redirect('/vendor/dashboard');
} else if (vendorStatus === 'pending') {
  return <ApplicationPendingView />;
} else {
  return <VendorApplicationForm />;
}
```

---

#### 4. Profile Picture Upload
**Status**: 📝 **SPEC DEFINED**

**Required Changes**:
- Add avatar upload to profile page
- Use Supabase Storage bucket: `avatars/`
- RLS policy: Users can upload/update their own avatar
- Image optimization: Max 512×512px, compress to <100KB
- Display in navbar, profile dropdown, booking cards

**Files to Create/Modify**:
- `src/components/profile/AvatarUpload.tsx` (new)
- `src/app/profile/page.tsx` (add avatar section)
- `supabase/migrations/XXXXXX_avatars_storage.sql` (new)

**Reuse from Product Images**:
- Image optimization logic from `src/lib/utils/imageOptimization.ts`
- Upload pattern from `src/lib/hooks/useImageUpload.ts`

---

#### 5. Avatar Display Consistency
**Status**: 📝 **SPEC DEFINED**

**Issue**:
- Home page: Shows gradient initial (e.g., "S" with gradient) ✅ Looks good
- Book-a-stylist page: Shows gray initial ❌ Inconsistent

**Fix**:
- Apply same gradient initial avatar style to all pages
- Reuse component: Create `<Avatar>` component with gradient fallback

**Component Design**:
```tsx
// src/components/ui/Avatar.tsx
<Avatar 
  src={user.avatarUrl} 
  alt={user.name}
  fallbackText={user.name[0]} 
  size="md" // sm, md, lg, xl
  gradientSeed={user.id} // Unique gradient per user
/>
```

---

#### 6. Login Modal State Bug
**Status**: 📝 **SPEC DEFINED**

**Issue**:
- User logs in → Modal closes
- User opens modal again (without refresh) → Spinner still showing "Logging in..."

**Root Cause**:
- Login state (`isLoading`) not reset when modal closes

**Fix Location**:
- `src/components/features/AuthModal.tsx` (or wherever login modal is)

**Fix**:
```typescript
useEffect(() => {
  if (!isOpen) {
    // Reset all form state when modal closes
    setIsLoading(false);
    setError(null);
    setEmail('');
    setPassword('');
  }
}, [isOpen]);
```

---

#### 7. Admin Sidebar - Navigation Fixes
**Status**: 📝 **SPEC DEFINED**

**Issue 1: Audit Logs Link Wrong**
- Current: `/audit-logs`
- Expected: `/admin/logs/audit`

**Issue 2: Need Dropdown Grouping**
- Group similar items under dropdowns:
  - **Curation** (dropdown)
    - Curation Brands
    - Curation Stylists
    - Curation Rankings
  - **Schedule** (dropdown)
    - Manage Schedule
    - Override Schedule
  - **Logs** (dropdown)
    - Audit Logs
    - Error Logs

**Files to Modify**:
- `src/components/admin/AdminSidebar.tsx` (or similar)

**Implementation Pattern**:
```tsx
<NavGroup title="Curation" icon={<Sparkles />}>
  <NavItem href="/admin/curation/brands" label="Brands" />
  <NavItem href="/admin/curation/stylists" label="Stylists" />
  <NavItem href="/admin/curation/rankings" label="Rankings" />
</NavGroup>
```

---

### **🟢 LOW PRIORITY (P2) - Future**

#### 8. Google OAuth Sign-In
**Status**: 📝 **BACKLOG**

**Requires**:
- Google Cloud Console setup
- Supabase OAuth provider config
- UI button in login modal

**Estimate**: 2-3 hours

---

#### 9. Redirect After Login Fix
**Status**: 📝 **BACKLOG**

**Issue**:
- Pattern: `/some-page?redirect=/checkout` doesn't work
- Reason: No `/login` page, only modal

**Solutions**:
1. **Option A**: Store redirect in localStorage
   ```typescript
   // Before opening modal
   localStorage.setItem('redirectAfterLogin', '/checkout');
   
   // After successful login
   const redirect = localStorage.getItem('redirectAfterLogin');
   router.push(redirect || '/');
   ```

2. **Option B**: Create actual `/login` page (not modal)

**Recommendation**: Option A (simpler, matches current modal pattern)

---

## 🎯 IMPLEMENTATION PLAN

### **Sprint 1: Critical Fixes (2-3 hours)**

#### Task 1.1: Investigate Cart Persistence Bug
**Time**: 1 hour
1. Add detailed console.logging to decoupledCartStore
2. Test add product → add service flow
3. Check localStorage in DevTools
4. Identify root cause
5. Implement fix

#### Task 1.2: Enhance Cart/Checkout UX
**Time**: 1-2 hours
1. Update `transformApiItemsToProducts()` to extract full variant data
2. Fetch variant attributes from DB (size, color, hex code)
3. Update `ProductList.tsx` with new badge UI
4. Update `CheckoutClient.tsx` to ensure images display
5. Test with real product variants

**Expected Deliverable**: ✅ Cart shows size/color badges + product images

---

### **Sprint 2: Medium Priority (3-4 hours)**

#### Task 2.1: Fix Vendor Application Page Logic
**Time**: 45 min
1. Add `getVendorStatus()` server action
2. Update `/vendor/apply/page.tsx` with status-based logic
3. Create `ApplicationPendingView` component
4. Test all 3 states (approved, pending, new)

#### Task 2.2: Profile Picture Upload
**Time**: 1.5 hours
1. Create migration for `avatars` storage bucket
2. Reuse `imageOptimization.ts` utils
3. Create `AvatarUpload.tsx` component
4. Update profile page
5. Update all avatar displays

#### Task 2.3: Avatar Display Consistency
**Time**: 30 min
1. Create reusable `<Avatar>` component
2. Apply to home page, book-a-stylist, profile dropdown
3. Generate unique gradients based on user ID

#### Task 2.4: Fix Login Modal State
**Time**: 15 min
1. Add `useEffect` to reset state on modal close
2. Test: Login → close → reopen → should be reset

#### Task 2.5: Admin Sidebar Fixes
**Time**: 1 hour
1. Fix audit logs link
2. Implement dropdown navigation groups
3. Update all admin route links
4. Test navigation

---

### **Sprint 3: Polish (Optional)**

#### Task 3.1: Google OAuth
**Time**: 2-3 hours

#### Task 3.2: Redirect After Login
**Time**: 30 min

---

## 🔧 DEBUGGING CART PERSISTENCE

### **Test Script**

```javascript
// Run in browser console after each step

// Step 1: Check initial state
console.log('Cart Products:', useDecoupledCartStore.getState().productItems);
console.log('Cart Bookings:', useDecoupledCartStore.getState().bookingItems);
console.log('LocalStorage Bookings:', localStorage.getItem('kb-stylish-bookings'));

// Step 2: Add product
// (Use UI to add product)
// Then check again
console.log('After adding product:');
console.log('Products:', useDecoupledCartStore.getState().productItems);
console.log('Bookings:', useDecoupledCartStore.getState().bookingItems);

// Step 3: Add service/booking
// (Use UI to add booking)
// Then check again
console.log('After adding booking:');
console.log('Products:', useDecoupledCartStore.getState().productItems);
console.log('Bookings:', useDecoupledCartStore.getState().bookingItems);
console.log('LocalStorage:', localStorage.getItem('kb-stylish-bookings'));

// Step 4: Refresh page
// Then check if both persist
```

### **Expected Results**

✅ **Correct Behavior**:
```
After adding product:
  Products: [{ id: '123', name: 'Test Product', ... }]
  Bookings: []

After adding booking:
  Products: [{ id: '123', name: 'Test Product', ... }]  ← Should NOT disappear
  Bookings: [{ id: '456', service_name: 'Haircut', ... }]
  LocalStorage: [{ reservation_id: '456', ... }]

After refresh:
  Products: [{ id: '123', name: 'Test Product', ... }]  ← From server
  Bookings: [{ id: '456', service_name: 'Haircut', ... }]  ← From localStorage
```

❌ **Bug Behavior** (User's report):
```
After adding booking:
  Products: []  ← BUG: Products disappeared!
  Bookings: [{ id: '456', service_name: 'Haircut', ... }]
```

---

## 📊 PRIORITY MATRIX

| Issue | Impact | Effort | Priority | ETA |
|-------|--------|--------|----------|-----|
| Cart Persistence Bug | 🔴 High | Medium | P0 | 1 hour |
| Cart UX (variants, images) | 🔴 High | Medium | P0 | 1-2 hours |
| Vendor Application Logic | 🟡 Medium | Low | P1 | 45 min |
| Profile Picture Upload | 🟡 Medium | Medium | P1 | 1.5 hours |
| Avatar Consistency | 🟡 Medium | Low | P1 | 30 min |
| Login Modal State | 🟡 Medium | Very Low | P1 | 15 min |
| Admin Sidebar Fixes | 🟡 Medium | Low | P1 | 1 hour |
| Google OAuth | 🟢 Low | High | P2 | 2-3 hours |
| Redirect After Login | 🟢 Low | Low | P2 | 30 min |

**Total Estimated Time**:
- **Sprint 1 (Critical)**: 2-3 hours
- **Sprint 2 (Medium)**: 3-4 hours
- **Sprint 3 (Polish)**: 2-3 hours
- **Grand Total**: 7-10 hours

---

## ✅ NEXT STEPS

1. **Immediate (Now)**: Start Sprint 1
   - Debug cart persistence bug
   - Enhance cart/checkout UX

2. **After Sprint 1 Testing**: Begin Sprint 2
   - Vendor application page
   - Profile picture upload
   - Avatar consistency
   - Login modal fix
   - Admin sidebar

3. **Optional**: Sprint 3 (if time permits)
   - Google OAuth
   - Redirect fix

---

**Status**: 🔍 **READY TO START SPRINT 1**  
**Next Action**: Investigate cart persistence bug with test script  
**Assigned To**: Cascade AI  
**Estimated Completion**: 2-3 hours from now
