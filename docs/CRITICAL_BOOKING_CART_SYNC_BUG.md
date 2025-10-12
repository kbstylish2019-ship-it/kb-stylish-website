# CRITICAL: Booking Cart Sync Bug - Payment Mismatch

**Date**: 2025-10-05  
**Severity**: 🔴 **CRITICAL - SECURITY & FRAUD RISK**  
**Status**: ✅ **IMMEDIATE FIX APPLIED - PERMANENT FIX NEEDED**

---

## Executive Summary

**Critical security flaw discovered**: Users were being charged for booking reservations that were no longer visible in their cart UI. This creates both a fraud risk (charging for items user didn't intend to buy) and a UX disaster (users lose trust when charged incorrect amounts).

---

## The Bug

### What Happened
1. User adds multiple booking reservations to cart
2. User "removes" some bookings using the trash icon in UI
3. Frontend removes bookings from localStorage and UI
4. **Backend API call to cancel reservation FAILS SILENTLY**
5. Bookings remain `'reserved'` in database
6. User proceeds to checkout seeing: **NPR 3,647**
7. User gets charged: **NPR 14,447** (4x the displayed amount!)
8. Payment gateway shows the higher amount, causing confusion

### Example Case (Today's Incident)
**Cart UI showed**:
- 1 product: NPR 48
- 1 booking (Hair Color): NPR 3,500
- Shipping: NPR 99
- **Total: NPR 3,647**

**Database actually had**:
- 1 product: NPR 48
- 4 bookings: NPR 14,300 (3 hidden!)
- Shipping: NPR 99
- **Total: NPR 14,447**

**User was redirected to eSewa to pay NPR 14,447** despite seeing NPR 3,647 in checkout.

---

## Root Cause Analysis

### 1. Silent API Failure
**File**: `d:/kb-stylish/src/lib/store/decoupledCartStore.ts` (lines 333-350)

```typescript
removeBookingItem: async (reservationId) => {
  try {
    const response = await fetch('/api/bookings/cancel-reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId })
    });
    
    if (!response.ok) {
      console.warn('[DecoupledStore] Failed to cancel reservation in backend:', response.status);
      // ⚠️ BUG: Continues execution even though API failed!
    } else {
      console.log('[DecoupledStore] Successfully cancelled reservation in backend');
    }
  } catch (apiError) {
    console.error('[DecoupledStore] Error cancelling reservation:', apiError);
    // ⚠️ BUG: Continues with local removal even if API fails
  }
  
  // Removes booking from UI regardless of API success
  const updatedBookings = get().bookingItems.filter(b => b.reservation_id !== reservationId);
  set({ bookingItems: updatedBookings });
}
```

**Problem**: The function removes the booking from UI/localStorage even if the backend cancellation fails. This creates a split-brain state:
- Frontend thinks: "Booking removed"
- Backend thinks: "Booking still active and reserved"

### 2. Server-Side Truth Overrides UI
**File**: `d:/kb-stylish/supabase/functions/create-order-intent/index.ts` (lines 162-186)

The payment intent creation uses `get_cart_details_secure()` which returns ALL active reservations from the database, not from the frontend's localStorage. This is architecturally correct (server is source of truth), but it exposes the sync bug.

```typescript
const { data: cartData } = await serviceClient.rpc('get_cart_details_secure', {
  p_user_id: authenticatedUser.id
});

// This returns ALL booking_reservations where:
// - customer_user_id = user.id
// - status = 'reserved'
// - expires_at > NOW()
```

### 3. Why Did 3 Bookings Stay Active?

Query result from database:
```sql
SELECT id, price_cents, status, created_at, expires_at
FROM booking_reservations
WHERE customer_user_id = '8e80ead5-ce95-4bad-ab30-d4f54555584b'
  AND status = 'reserved'
  AND expires_at > NOW();
```

**Result**: 4 active reservations totaling NPR 14,300:
1. `58e8c941...` - NPR 3,500 (Hair Color) - ✅ Shown in UI
2. `6b2543f4...` - NPR 800 - ❌ Hidden (failed to cancel)
3. `cded67ea...` - NPR 5,000 - ❌ Hidden (failed to cancel)
4. `c633b91d...` - NPR 5,000 - ❌ Hidden (failed to cancel)

---

## Immediate Fix Applied

**Action**: Manually deleted the 3 stale reservations from database:

```sql
DELETE FROM booking_reservations
WHERE customer_user_id = '8e80ead5-ce95-4bad-ab30-d4f54555584b'
  AND id IN (
    '6b2543f4-90c6-47ce-a981-552a10886f92',
    'cded67ea-6a30-4f99-a0df-8628b4607d5d',
    'c633b91d-baf7-4f3f-b736-57a1146ceb36'
  );
```

**Result**: User's cart now matches database. Checkout total: NPR 3,647 ✅

---

## Permanent Fix Required

### Option A: Fail-Safe Removal (RECOMMENDED)
**Philosophy**: If backend fails, don't lie to the user. Keep the booking visible.

```typescript
removeBookingItem: async (reservationId) => {
  console.log('[DecoupledStore] Removing booking:', reservationId);
  
  set(state => ({ 
    isRemovingItem: { ...state.isRemovingItem, [reservationId]: true },
    error: null 
  }));
  
  try {
    // CRITICAL: Cancel the reservation in backend FIRST
    const response = await fetch('/api/bookings/cancel-reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server returned ${response.status}`);
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to cancel reservation');
    }
    
    console.log('[DecoupledStore] Successfully cancelled reservation in backend');
    
    // ONLY AFTER BACKEND SUCCESS: Remove from UI
    const bookingToRemove = get().bookingItems.find(b => b.reservation_id === reservationId);
    
    if (bookingToRemove) {
      const updatedBookings = get().bookingItems.filter(b => b.reservation_id !== reservationId);
      
      set(state => ({
        bookingItems: updatedBookings,
        bookingTotal: state.bookingTotal - bookingToRemove.price,
        bookingCount: state.bookingCount - 1,
        isRemovingItem: { ...state.isRemovingItem, [reservationId]: false }
      }));
      
      // Update persist store
      useBookingPersistStore.getState().saveBookings(updatedBookings);
      get().updateGrandTotals();
    }
    
    return true;
  } catch (error) {
    console.error('[DecoupledStore] Failed to remove booking:', error);
    
    // SHOW ERROR TO USER - don't silently fail!
    set(state => ({ 
      isRemovingItem: { ...state.isRemovingItem, [reservationId]: false },
      error: `Failed to remove booking: ${error instanceof Error ? error.message : 'Unknown error'}`,
      lastError: error instanceof Error ? error : null
    }));
    
    // KEEP BOOKING IN CART
    return false;
  }
},
```

**Benefits**:
- ✅ User never sees incorrect totals
- ✅ User is informed if removal fails
- ✅ No phantom charges
- ✅ Maintains data integrity

**Drawbacks**:
- User might see an error if API is down
- Requires retry mechanism for UX

### Option B: Background Reconciliation (COMPLEX)
- Periodically sync frontend cart with backend
- Auto-cancel stale reservations that aren't in localStorage
- Complex to implement correctly
- Risk of race conditions

### Option C: DELETE Instead of Cancel (AGGRESSIVE)
Change the API to DELETE reservations instead of marking as cancelled:

```typescript
// In cancel-reservation/route.ts
const { error } = await supabase
  .from('booking_reservations')
  .delete()
  .eq('id', reservationId)
  .eq('customer_user_id', user.id);
```

**Benefits**:
- Cleaner database (no cancelled records)
- Simpler queries

**Drawbacks**:
- Loses audit trail
- Can't track cancellation patterns
- Can't implement "undo" feature

---

## Recommended Implementation Plan

### Phase 1: Immediate Safety (Do Now)
1. ✅ **DONE**: Cleaned stale reservations for affected user
2. ✅ **DONE**: Document the bug
3. ✅ **DONE**: Implement Option A (fail-safe removal)
4. ✅ **DONE**: Fixed cancel-reservation API to handle missing reservations gracefully
5. 🔲 **TODO**: Add user-facing error toast when removal fails
6. 🔲 **TODO**: Add retry button in error state

### Fixes Applied (2025-10-05)

#### 1. Fixed cancel-reservation API (route.ts)
Changed `.select().single()` to `.select()` to avoid throwing errors on 0 rows. Now returns proper 404 status when reservation doesn't exist instead of crashing with 500.

#### 2. Updated removeBookingItem (decoupledCartStore.ts)
- Backend cancellation now happens FIRST before UI removal
- 404 responses are acceptable (means already cancelled)
- Other errors (500, etc.) stop the removal and show error to user
- Prevents split-brain state between frontend and backend

### Phase 2: Monitoring (Next Sprint)
1. Add logging to track cancellation failures
2. Create alert for cancellation API errors
3. Monitor for split-brain states

### Phase 3: Prevention (Future)
1. Add database trigger to auto-expire reservations
2. Implement periodic cleanup job for orphaned reservations
3. Add reconciliation check before checkout

---

## Testing Strategy

### Test Case 1: Happy Path
1. Add booking to cart
2. Remove booking
3. Verify:
   - API returns success
   - Booking removed from UI
   - Booking marked 'cancelled' in DB
   - Checkout total correct

### Test Case 2: API Failure
1. Add booking to cart
2. Mock API to return 500 error
3. Click remove booking
4. Verify:
   - Error message shown to user
   - Booking STAYS in UI
   - Booking still 'reserved' in DB
   - User can retry

### Test Case 3: Network Failure
1. Add booking to cart
2. Disconnect network
3. Click remove booking
4. Verify:
   - Error message shown
   - Booking STAYS in UI
   - On reconnect, user can retry

### Test Case 4: Auth Token Expired
1. Add booking to cart
2. Wait for token expiry
3. Click remove booking
4. Verify:
   - Prompts for re-login
   - After login, removal succeeds
   - No phantom bookings

---

## Security Implications

### Fraud Risk
**Severity**: HIGH

If malicious user discovers this pattern:
1. Add expensive bookings to cart
2. Remove them from UI (but they stay in DB)
3. Add cheap products
4. Checkout - gets charged for hidden bookings
5. Claim they were "overcharged" and demand refund

**Mitigation**: Option A prevents this entirely.

### User Trust Impact
**Severity**: CRITICAL

Users lose all trust if:
- Cart shows NPR 3,500
- Payment gateway shows NPR 14,447
- No explanation provided

This is **worse than a crash** - it makes users think we're scamming them.

---

## Related Files

### Frontend
- `src/lib/store/decoupledCartStore.ts` - Cart state management
- `src/components/checkout/CheckoutClient.tsx` - Checkout UI
- `src/app/api/bookings/cancel-reservation/route.ts` - Cancellation API

### Backend
- `supabase/functions/create-order-intent/index.ts` - Payment intent creation
- `supabase/migrations/*_the_great_decoupling.sql` - Booking schema

### Database
- `booking_reservations` table - Temporary reservations
- `get_cart_details_secure()` function - Cart retrieval

---

## Conclusion

This bug represents a **critical failure in state synchronization** between frontend and backend. The immediate fix prevents further incidents, but the permanent fix (Option A) must be implemented **before the next production deployment**.

**Priority**: 🔴 **P0 - BLOCK RELEASE**

---

**Engineer**: Principal Backend Engineer  
**Reviewed By**: _____________________  
**Deployment**: Immediate hotfix required
