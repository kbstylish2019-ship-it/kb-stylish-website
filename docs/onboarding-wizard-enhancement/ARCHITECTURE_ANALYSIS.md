# 🔍 ONBOARDING WIZARD - DEEP ARCHITECTURE ANALYSIS
**Date:** October 16, 2025  
**Status:** 📋 RESEARCH COMPLETE

---

## 🎯 USER REQUEST

**Problem:** When admin goes back to change user selection, if the previously selected user already has a pending promotion, it shows an error. Instead, we should restore their existing promotion state and let the admin continue where they left off.

---

## 📊 CURRENT ARCHITECTURE

### State Management
**Location:** `OnboardingWizardClient.tsx`

```typescript
interface WizardState {
  currentStep: number;              // 1-4 (Select User, Verification, Profile, Review)
  selectedUser: UserSearchResult | null;
  promotionId: string | null;       // UUID of the promotion record
  checkStatus: CheckStatus;         // Verification statuses
  profileData: ProfileData;         // Bio, specialties, etc.
  completed: boolean;
  stylistUserId: string | null;
}
```

**Storage:**
- LocalStorage key: `'stylist_onboarding_wizard_state'`
- Saves on every state change
- Loads on component mount

### Promotion Flow

#### Step 1: User Selection
1. Admin searches for user
2. Admin clicks user → `handleSelectUser(user)`
3. Auto-calls `initiatePromotion(user.id)`
4. RPC: `initiate_stylist_promotion`

#### Step 2: Database Check (RPC)
**File:** `supabase/migrations/20251015170000_create_service_engine_logic.sql`

**Validation Logic:**
```sql
-- Check 1: User must exist
SELECT display_name FROM user_profiles WHERE id = p_user_id;

-- Check 2: User must not already be a stylist
IF EXISTS (SELECT 1 FROM stylist_profiles WHERE user_id = p_user_id)
  THEN RETURN 'ALREADY_STYLIST';

-- Check 3: User must not have pending promotion ⚠️ THIS IS THE ISSUE
IF EXISTS (
  SELECT 1 FROM stylist_promotions 
  WHERE user_id = p_user_id 
    AND status IN ('draft', 'pending_checks', 'pending_training', 'pending_approval')
) THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'User already has a pending promotion',
    'code', 'PROMOTION_EXISTS'  -- ⚠️ This blocks the user
  );
END IF;

-- If all checks pass, create new promotion
INSERT INTO stylist_promotions (user_id, requested_by, status) VALUES (...);
RETURN promotion_id;
```

#### Step 3: State Update
```typescript
setState(prev => ({
  ...prev,
  promotionId: data.promotionId,
  currentStep: 2
}));
```

---

## 🐛 THE PROBLEM

### Scenario
1. Admin selects **User A**
2. Fills form partially (Step 2 or 3)
3. Admin goes back to Step 1
4. Admin tries to select **User A** again (or another user with pending promotion)
5. RPC returns: `PROMOTION_EXISTS`
6. **Current behavior:** Shows error, blocks progress
7. **Desired behavior:** Load existing promotion state, allow continuation

### Why It Happens
The RPC `initiate_stylist_promotion` is designed to **prevent duplicate promotions**, which is good for data integrity. But it doesn't provide a way to **resume** an existing promotion.

---

## 💡 SOLUTION DESIGN

### Expert Panel Consultation

#### Expert #1: Sarah Chen - Frontend Architect (Meta)
**Specialty:** State management, error handling

**Recommendations:**

1. **Detect PROMOTION_EXISTS Error**
   ```typescript
   if (error.code === 'PROMOTION_EXISTS') {
     // Don't show as error - this is expected!
     // Fetch existing promotion instead
   }
   ```

2. **Two-Phase Approach**
   - Phase 1: Try to initiate (fails if exists)
   - Phase 2: If exists, fetch existing promotion
   - Restore state from fetched data

3. **User Feedback**
   - Show toast: "Resuming existing promotion for [User]"
   - Highlight that they're continuing, not starting fresh

#### Expert #2: David Kim - Backend Engineer (Stripe)
**Specialty:** API design, idempotency

**Recommendations:**

1. **Make Initiate Endpoint Idempotent**
   ```typescript
   // Option A: Return existing promotion if exists
   POST /api/admin/promotions/initiate
   {
     userId: "abc-123"
   }
   
   Response:
   {
     success: true,
     promotionId: "xyz-789",
     isExisting: true,  // ✅ NEW: Flag indicating resumed
     currentStatus: "pending_checks",
     checkStatus: { ... },
     profileData: { ... }
   }
   ```

2. **Or: Separate Fetch Endpoint**
   ```typescript
   GET /api/admin/promotions/by-user/:userId
   
   Response:
   {
     success: true,
     promotion: {
       id: "xyz-789",
       status: "pending_checks",
       checks: { ... },
       profile: { ... },
       step: 2  // Calculated from status
     }
   }
   ```

3. **Database Function**
   ```sql
   CREATE FUNCTION get_or_create_promotion(p_user_id UUID, p_admin_id UUID)
   RETURNS JSONB AS $$
   DECLARE
     v_existing_promotion stylist_promotions%ROWTYPE;
   BEGIN
     -- Try to find existing
     SELECT * INTO v_existing_promotion
     FROM stylist_promotions
     WHERE user_id = p_user_id
       AND status IN ('draft', 'pending_checks', 'pending_training', 'pending_approval')
     LIMIT 1;
     
     IF FOUND THEN
       -- Return existing with all details
       RETURN jsonb_build_object(
         'success', true,
         'is_existing', true,
         'promotion_id', v_existing_promotion.id,
         'status', v_existing_promotion.status,
         'checks', v_existing_promotion.checks,
         ...
       );
     ELSE
       -- Create new
       INSERT INTO stylist_promotions (...) RETURNING ...;
     END IF;
   END;
   $$ LANGUAGE plpgsql;
   ```

#### Expert #3: Lisa Zhang - UX Designer (Shopify)
**Specialty:** Progressive disclosure, error recovery

**Recommendations:**

1. **Visual Feedback**
   ```tsx
   {isExisting && (
     <div className="alert alert-info">
       <Info icon />
       Continuing existing promotion for {user.name}
       Started by {originalAdmin} on {date}
     </div>
   )}
   ```

2. **Step Indicator Update**
   - Show checkmarks on completed steps
   - Highlight current step
   - Allow navigation to any completed step

3. **Confirm Resume**
   ```tsx
   if (existingPromotion) {
     const confirmed = confirm(
       `${user.name} has an in-progress promotion at Step ${currentStep}.
        
        Resume this promotion?`
     );
     
     if (!confirmed) {
       return; // Let admin select different user
     }
     
     restorePromotionState(existingPromotion);
   }
   ```

---

## 🏗️ IMPLEMENTATION PLAN

### Phase 1: Backend Enhancement (1 hour)

#### 1.1: New RPC Function
**File:** Create new migration

```sql
CREATE OR REPLACE FUNCTION private.get_promotion_by_user(
  p_user_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
LANGUAGE plpgsql
AS $$
DECLARE
  v_promotion stylist_promotions%ROWTYPE;
  v_user_name TEXT;
BEGIN
  -- Verify admin
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Find existing promotion
  SELECT * INTO v_promotion
  FROM public.stylist_promotions
  WHERE user_id = p_user_id
    AND status IN ('draft', 'pending_checks', 'pending_training', 'pending_approval')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending promotion found');
  END IF;
  
  -- Get user name
  SELECT display_name INTO v_user_name FROM user_profiles WHERE id = p_user_id;
  
  -- Return full promotion data
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', v_promotion.id,
    'user_id', v_promotion.user_id,
    'user_name', v_user_name,
    'status', v_promotion.status,
    'checks', v_promotion.checks,
    'stylist_profile_data', v_promotion.stylist_profile_data,
    'created_at', v_promotion.created_at,
    'requested_by', v_promotion.requested_by
  );
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.get_promotion_by_user(
  p_user_id UUID,
  p_admin_id UUID
)
RETURNS JSONB AS $$
BEGIN
  RETURN private.get_promotion_by_user(p_user_id, p_admin_id);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_promotion_by_user TO authenticated;
```

#### 1.2: New API Endpoint
**File:** `src/app/api/admin/promotions/get-by-user/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  
  const { data, error } = await supabase.rpc('get_promotion_by_user', {
    p_user_id: userId,
    p_admin_id: adminUser.id
  });
  
  if (error || !data.success) {
    return NextResponse.json({ success: false, error: data?.error }, { status: 404 });
  }
  
  return NextResponse.json({
    success: true,
    promotion: data
  });
}
```

### Phase 2: Frontend Enhancement (2 hours)

#### 2.1: Update handleSelectUser
**File:** `OnboardingWizardClient.tsx`

```typescript
const handleSelectUser = async (user: UserSearchResult) => {
  setState(prev => ({ ...prev, selectedUser: user }));
  setSearchResults([]);
  setSearchQuery('');
  
  try {
    // Try to initiate
    await initiatePromotion(user.id);
  } catch (err: any) {
    // Check if error is PROMOTION_EXISTS
    if (err.message?.includes('already has a pending promotion')) {
      // Fetch existing promotion
      try {
        const response = await fetch('/api/admin/promotions/get-by-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Confirm with admin
          const resume = confirm(
            `${user.display_name} has an in-progress promotion.\n\nResume this promotion?`
          );
          
          if (resume) {
            restorePromotionFromData(data.promotion);
            toast.success('Resumed existing promotion');
          } else {
            // Clear selection
            setState(prev => ({ ...prev, selectedUser: null }));
          }
        }
      } catch (fetchErr) {
        setError('Failed to load existing promotion');
      }
    } else {
      // Other error - show it
      setError(err.message);
    }
  }
};
```

#### 2.2: Add restorePromotionFromData Function

```typescript
const restorePromotionFromData = (promotionData: any) => {
  // Calculate current step from status
  let currentStep = 1;
  if (promotionData.status === 'draft') currentStep = 2;
  else if (promotionData.status === 'pending_checks') currentStep = 2;
  else if (promotionData.status === 'pending_training') currentStep = 3;
  else if (promotionData.status === 'pending_approval') currentStep = 4;
  
  // Restore full state
  setState({
    currentStep,
    selectedUser: state.selectedUser, // Already set
    promotionId: promotionData.promotion_id,
    checkStatus: promotionData.checks || INITIAL_STATE.checkStatus,
    profileData: promotionData.stylist_profile_data || INITIAL_STATE.profileData,
    completed: false,
    stylistUserId: null
  });
};
```

#### 2.3: Add Visual Indicator

```tsx
{state.promotionId && isResumed && (
  <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
    <div className="flex items-center gap-2">
      <Info className="w-4 h-4 text-blue-400" />
      <span className="text-blue-400 font-medium">
        Resuming existing promotion
      </span>
    </div>
    <p className="text-foreground/70 mt-1 text-xs">
      Started on {formatDate(promotionData.created_at)}
    </p>
  </div>
)}
```

---

## 📊 COMPARISON

### Before (Current)
```
Admin selects User A → Error: "User already has a pending promotion"
❌ Blocked
❌ Must clear localStorage manually
❌ Loses all progress
```

### After (Enhanced)
```
Admin selects User A → Detects existing promotion
→ Asks: "Resume this promotion?"
→ If YES: Loads all data, jumps to correct step
✅ Can continue where left off
✅ No data loss
✅ Better UX
```

---

## ✅ TESTING CHECKLIST

- [ ] Create promotion for User A (stop at Step 2)
- [ ] Go back to Step 1
- [ ] Click User A again
- [ ] See "Resume?" dialog
- [ ] Click "Resume"
- [ ] Verify:
  - [ ] Jumps to Step 2
  - [ ] All form data restored
  - [ ] Can continue normally
- [ ] Complete promotion
- [ ] Try to resume again → Should say "User is already a stylist"

---

## 🎯 SUCCESS METRICS

- ✅ No more "already has promotion" errors
- ✅ 100% data restoration accuracy
- ✅ Clear visual feedback
- ✅ Backwards compatible
- ✅ No localStorage clearing needed

---

**Ready for Phase 8: Implementation!**

**Time Estimate:** 3-4 hours total  
**Priority:** HIGH (UX Critical)  
**Complexity:** MEDIUM  
**Risk:** LOW (Backwards compatible)
