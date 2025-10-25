# ✅ Onboarding Wizard - Progress Tracking Fix

**Date**: October 15, 2025  
**Issue**: Wizard not updating progress when user completes steps

---

## 🐛 The Problem

After configuring payout details and returning to dashboard:
- ❌ Wizard still showed "1 of 3 completed (33%)"
- ❌ Didn't progress to step 3 (List Your First Product)
- ❌ Didn't mark step 2 as complete
- ❌ Would show forever even after all steps completed

---

## ✅ The Fix

### 1. **Auto-Refresh Status**
Added multiple mechanisms to detect when user returns to dashboard:
- ✅ Visibility change detection (page becomes visible)
- ✅ Window focus detection (tab becomes active)
- ✅ Auto-refresh every 5 seconds while wizard is visible

### 2. **Improved Payout Detection**
Changed from checking only `bank_account_name` to checking ALL payment methods:
```typescript
// Before: Only checked bank account name
const payoutComplete = !!(data.bank_account_name && data.bank_account_name.length > 0);

// After: Checks bank account OR esewa OR khalti
const payoutComplete = !!(
  (data.bank_account_name && data.bank_account_number) ||
  data.esewa_number ||
  data.khalti_number
);
```

### 3. **Session-Based Dismissal**
Changed from `localStorage` to `sessionStorage` for dismiss button:
- Old behavior: Dismissed forever (localStorage)
- New behavior: Dismissed for current session only (sessionStorage)
- Result: Wizard can reappear in new browser sessions until all steps complete

---

## 🎯 Expected Behavior Now

### Step-by-Step Flow

1. **First Login (New Vendor)**
   ```
   ┌─────────────────────────────────┐
   │ Welcome to KB Stylish! 🎉       │
   │ 0 of 3 completed (0%)           │
   │                                 │
   │ ○ Complete Your Profile         │
   │ ○ Setup Payout Details          │
   │ ○ List Your First Product       │
   └─────────────────────────────────┘
   ```

2. **After Completing Profile**
   - Profile has business_name ✅
   - Wizard updates automatically
   ```
   ┌─────────────────────────────────┐
   │ Welcome to KB Stylish! 🎉       │
   │ 1 of 3 completed (33%)          │
   │                                 │
   │ ✅ Complete Your Profile        │
   │ ○ Setup Payout Details  [Start]│ ← Current step
   │ ○ List Your First Product       │
   └─────────────────────────────────┘
   ```

3. **After Setting Up Payout**
   - Navigate to Settings → Configure Payout (bank/esewa/khalti)
   - Return to Dashboard
   - **Wizard auto-refreshes within 5 seconds**
   ```
   ┌─────────────────────────────────┐
   │ Welcome to KB Stylish! 🎉       │
   │ 2 of 3 completed (66%)          │
   │                                 │
   │ ✅ Complete Your Profile        │
   │ ✅ Setup Payout Details         │
   │ ○ List Your First Product [Start]│ ← Auto-advanced!
   └─────────────────────────────────┘
   ```

4. **After Adding First Product**
   - Navigate to Products → Add Product
   - Return to Dashboard
   - **Wizard marks onboarding complete and disappears**
   ```
   ┌─────────────────────────────────┐
   │ Welcome to KB Stylish! 🎉       │
   │ 3 of 3 completed (100%)         │
   │                                 │
   │ ✅ Complete Your Profile        │
   │ ✅ Setup Payout Details         │
   │ ✅ List Your First Product      │
   │                                 │
   │ [Complete Setup 🚀]             │
   └─────────────────────────────────┘
   ```
   
   - Click "Complete Setup" → Wizard disappears forever
   - Database: `onboarding_complete = true`

---

## 🔍 Technical Details

### Auto-Refresh Mechanisms

1. **Visibility Change API**
   ```typescript
   document.addEventListener('visibilitychange', () => {
     if (!document.hidden) {
       fetchStatus(); // Re-check when tab becomes visible
     }
   });
   ```

2. **Window Focus Event**
   ```typescript
   window.addEventListener('focus', () => {
     fetchStatus(); // Re-check when window gains focus
   });
   ```

3. **Auto-Refresh Timer**
   ```typescript
   const interval = setInterval(() => {
     fetchStatus(); // Re-check every 5 seconds
   }, 5000);
   ```

### Database Query
```typescript
const { data } = await supabase
  .from('vendor_profiles')
  .select('onboarding_complete, business_name, bank_account_name, bank_account_number, esewa_number, khalti_number, user_id')
  .eq('user_id', user.id)
  .single();

// Profile complete if business name exists
const profileComplete = !!(data.business_name && data.business_name.length > 0);

// Payout complete if ANY payment method is configured
const payoutComplete = !!(
  (data.bank_account_name && data.bank_account_number) ||
  data.esewa_number ||
  data.khalti_number
);

// Product complete if vendor has at least one product
const { count } = await supabase
  .from('products')
  .select('id', { count: 'exact', head: true })
  .eq('vendor_id', user.id);
const productComplete = count > 0;
```

---

## 🧪 Testing

### Test Scenario 1: Payout Completion
1. Log in as new vendor (approved but onboarding incomplete)
2. See wizard with 0/3 or 1/3 completed
3. Click "Setup Payout Details" → Goes to /vendor/settings
4. Configure bank account (or esewa/khalti)
5. Navigate back to /vendor/dashboard
6. **Expected**: Within 5 seconds, wizard updates to show step 2 complete, step 3 active

### Test Scenario 2: Complete All Steps
1. Complete all 3 steps (profile, payout, product)
2. Return to dashboard
3. **Expected**: Wizard shows 3/3 completed with "Complete Setup" button
4. Click "Complete Setup"
5. **Expected**: Wizard disappears and never shows again

### Test Scenario 3: Dismiss and Return
1. Click "I'll do this later" on wizard
2. Wizard disappears
3. Refresh page
4. **Expected**: Wizard reappears (sessionStorage, not localStorage)

---

## 📊 Completion Tracking

The wizard tracks completion in the database:

```sql
-- When all steps complete
UPDATE vendor_profiles 
SET 
  onboarding_complete = true,
  onboarding_completed_at = NOW()
WHERE user_id = 'xxx';
```

Once `onboarding_complete = true`, the wizard will NEVER show again for that vendor.

---

## ✅ Success Criteria

- [x] Wizard updates automatically when returning to dashboard
- [x] Step 2 marks complete after payout configuration
- [x] Step 3 marks complete after adding first product
- [x] Wizard disappears after all steps complete
- [x] Progress bar updates correctly (0%, 33%, 66%, 100%)
- [x] Current step auto-advances to next incomplete step
- [x] No manual page refresh needed

---

**Status**: ✅ FIXED  
**File Modified**: `src/components/vendor/OnboardingWizard.tsx`  
**Deployment**: Hot reload in development, no rebuild needed
