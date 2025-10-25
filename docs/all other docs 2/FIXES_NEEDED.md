# 🔧 THREE FIXES NEEDED

## 1. Homepage Categories ✅ CLARIFIED
**Issue**: Homepage shows Women/Men/Beauty/Accessories - not in database
**Verdict**: KEEP IT STATIC (already explained in UX analysis)
**Action**: No changes needed

## 2. Category Reactivate Button ⚠️ NEEDED
**Issue**: Inactive categories have no way to reactivate
**Current**: Only Edit and Delete buttons
**Needed**: Add "Reactivate" button for inactive categories

## 3. Profile Dropdown Role Bug 🐛 CRITICAL
**Issue**: Admin sees ALL dashboards (Admin, Vendor, Stylist) even if only admin
**Root Cause**: In `src/lib/auth.ts` lines 79-87, admin role gives ALL capabilities
**Problem**:
```typescript
case 'admin':
  capabilities.canAccessAdmin = true
  capabilities.canAccessVendorDashboard = true  // ❌ Wrong!
  capabilities.canAccessStylistDashboard = true  // ❌ Wrong!
```
**Fix**: Admin should only get admin access unless they ALSO have vendor/stylist roles
