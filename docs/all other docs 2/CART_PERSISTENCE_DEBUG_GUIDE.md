# 🔍 CART PERSISTENCE BUG - DEBUGGING GUIDE

**Date**: October 21, 2025  
**Status**: 🔍 **INVESTIGATION IN PROGRESS**  
**Priority**: 🔴 **P0 - Critical Bug**

---

## 🐛 REPORTED SYMPTOMS

### **Issue 1: Products Disappearing**
**User Report**: "When I add product first, then service, the product disappears and only service shows"

### **Issue 2: Services Not Persisting**
**User Report**: "Service is getting added but it's not persisting in guest user. Product persists but service doesn't."

---

## 🏗️ CURRENT ARCHITECTURE

### **Products (Server-Side)**
```
Storage: PostgreSQL (carts + cart_items tables)
Flow: Browser → cartAPI → Edge Function → RPC → Database
Persistence: ✅ Automatic (database handles it)
Guest Tracking: Via guest_token in cookies
```

### **Services/Bookings (Client-Side)**
```
Storage: localStorage (kb-stylish-bookings)
Flow: Browser → addBookingItem() → bookingPersistStore → localStorage
Persistence: ⚠️ Manual (client-side only)
Guest Tracking: Via localStorage (no server)
```

---

## 🔬 ROOT CAUSE HYPOTHESES

### **Hypothesis A: localStorage Cleared on Navigation**
**Theory**: Adding a service triggers a navigation or state reset that clears products

**Test**:
```javascript
// In browser console after adding product
localStorage.getItem('kb-stylish-bookings')
// Should return null or empty array

// Add service
// Then check again
localStorage.getItem('kb-stylish-bookings')
// Should now have booking data

// Add product after booking
// Check if booking is still there
```

**Likelihood**: 🟡 **MEDIUM**

---

### **Hypothesis B: initializeCart() Overwrites State**
**Theory**: When booking is added, some component calls `initializeCart()` which re-fetches from server, losing local booking state

**Evidence**:
```typescript
// From decoupledCartStore.ts line 388-487
initializeCart: async (initialData) => {
  // If initialData provided (from server)
  if (initialData) {
    // Products from server
    const productItems = transformApiItemsToProducts(apiItems);
    
    // Bookings from server OR localStorage
    if (initialData.bookings) {
      bookingItems = initialData.bookings; // From server
    } else {
      // Server says no bookings - clear localStorage!
      useBookingPersistStore.getState().saveBookings([]);
    }
  }
}
```

**Problem**: If server doesn't return bookings, localStorage gets cleared!

**Likelihood**: 🔴 **HIGH** - This is probably the bug

---

### **Hypothesis C: Race Condition in State Updates**
**Theory**: Adding product triggers re-fetch from server, which happens before booking is saved to localStorage

**Sequence**:
```
1. User adds product
   → cartAPI.addToCart()
   → Returns full cart
   → Updates productItems state

2. User adds booking  
   → addBookingItem() starts
   → MEANWHILE: Some component triggers syncWithServer()
   → Server returns cart (no bookings)
   → Clears bookingItems state
   → addBookingItem() finishes too late

Result: Booking lost
```

**Likelihood**: 🟡 **MEDIUM**

---

## 🧪 DEBUGGING STEPS

### **Step 1: Add Detailed Logging**

Add this to `decoupledCartStore.ts`:

```typescript
// At start of addBookingItem (line 289)
addBookingItem: async (booking) => {
  console.log('🎯 [addBookingItem START]');
  console.log('  Current products:', get().productItems.length);
  console.log('  Current bookings:', get().bookingItems.length);
  console.log('  Booking to add:', booking.service_name);
  
  // ... existing code
  
  // After state update (before return)
  console.log('🎯 [addBookingItem END]');
  console.log('  New products:', get().productItems.length);
  console.log('  New bookings:', get().bookingItems.length);
  console.log('  LocalStorage:', localStorage.getItem('kb-stylish-bookings'));
},

// At start of initializeCart (line 388)
initializeCart: async (initialData) => {
  console.log('📦 [initializeCart START]');
  console.log('  Current products:', get().productItems.length);
  console.log('  Current bookings:', get().bookingItems.length);
  console.log('  InitialData provided:', !!initialData);
  console.log('  InitialData.bookings:', initialData?.bookings?.length || 0);
  console.log('  localStorage bookings:', useBookingPersistStore.getState().loadBookings().length);
  
  // ... existing code
  
  // After state update
  console.log('📦 [initializeCart END]');
  console.log('  New products:', get().productItems.length);
  console.log('  New bookings:', get().bookingItems.length);
},

// At start of syncWithServer (line 540)
syncWithServer: async () => {
  console.log('🔄 [syncWithServer START]');
  console.log('  Current products:', get().productItems.length);
  console.log('  Current bookings:', get().bookingItems.length);
  
  // ... existing code
  
  console.log('🔄 [syncWithServer END]');
  console.log('  New products:', get().productItems.length);
  console.log('  New bookings:', get().bookingItems.length);
},
```

### **Step 2: Test localStorage Health**

Add to `CartInitializer.tsx`:

```typescript
useEffect(() => {
  // Test localStorage
  try {
    const testKey = 'test_' + Date.now();
    localStorage.setItem(testKey, 'value');
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    if (retrieved !== 'value') {
      console.error('❌ localStorage is not working properly!');
    } else {
      console.log('✅ localStorage is working');
    }
  } catch (e) {
    console.error('❌ localStorage is blocked or unavailable:', e);
  }
}, []);
```

### **Step 3: User Testing Script**

```
FRESH START (Incognito Mode):

1. Open DevTools Console
2. Add a product
   → Check console logs
   → Check: Products: 1, Bookings: 0
   → Check localStorage: Should be empty or []

3. Add a service/booking
   → Check console logs CAREFULLY
   → Look for initializeCart or syncWithServer calls
   → Check: Products: 1, Bookings: 1
   → Check localStorage: Should have booking data

4. Refresh page
   → Check console logs
   → Check: Both should persist

5. Close browser, reopen
   → Check: Both should persist

REPORT:
- At what step do products disappear?
- Are there any syncWithServer or initializeCart calls after adding booking?
- Does localStorage show booking data before it disappears?
```

---

## 🔧 POTENTIAL FIXES

### **Fix A: Preserve Bookings in initializeCart**

**Problem**: Server doesn't return bookings, so we clear them

**Solution**: Merge server products with local bookings

```typescript
// In initializeCart
if (initialData) {
  // Always load bookings from localStorage FIRST
  const persistedBookings = useBookingPersistStore.getState().loadBookings();
  
  // Only clear if server explicitly returns an empty array
  // DON'T clear just because server doesn't include bookings field
  if (initialData.bookings !== undefined) {
    // Server explicitly provided bookings (even if empty)
    bookingItems = initialData.bookings;
    useBookingPersistStore.getState().saveBookings(bookingItems);
  } else {
    // Server didn't include bookings - use localStorage
    bookingItems = persistedBookings;
  }
  
  // Process products from server
  const productItems = transformApiItemsToProducts(initialData.items);
  
  set({
    productItems,
    bookingItems, // Use merged bookings
    // ... rest
  });
}
```

### **Fix B: Prevent syncWithServer During Booking Add**

**Problem**: syncWithServer called while adding booking, overwrites state

**Solution**: Add locking mechanism

```typescript
isAddingBooking: boolean; // Already exists

// In syncWithServer
if (get().isAddingBooking) {
  console.log('[DecoupledStore] Skipping sync - booking add in progress');
  return;
}
```

### **Fix C: Store Bookings on Server Too**

**Long-term Solution**: Store bookings in database like products

**Pros**:
- Single source of truth
- Works across devices
- No localStorage issues

**Cons**:
- More complex
- Requires migration
- Changes architecture

**Verdict**: Future enhancement, not immediate fix

---

## 📊 EXPECTED TEST RESULTS

### **If Fix A Works** ✅
```
1. Add product → Products: 1, Bookings: 0
2. Add booking → Products: 1, Bookings: 1
3. Refresh → Products: 1, Bookings: 1
4. Reopen browser → Products: 1, Bookings: 1
```

### **If Still Broken** ❌
```
1. Add product → Products: 1, Bookings: 0
2. Add booking → Products: 0, Bookings: 1  (← BUG!)
OR
2. Add booking → Products: 1, Bookings: 1
3. Refresh → Products: 1, Bookings: 0  (← BUG!)
```

---

## 🎯 NEXT STEPS

1. ✅ Add debug logging (above code snippets)
2. ⏳ User runs test script
3. ⏳ Analyze console logs
4. ⏳ Identify exact point of failure
5. ⏳ Apply appropriate fix (A, B, or both)
6. ⏳ Re-test
7. ⏳ Deploy fix

---

## 📝 NOTES FOR DEVELOPER

### **Why This Architecture?**

**Historical Context**:
- Products: Need server-side tracking (inventory, pricing)
- Bookings: Were designed as "temporary reservations" 
- Bookings have TTL (expires_at), so localStorage seemed sufficient
- Guest users can't have persistent bookings without login

**Problem**: Mixed persistence model creates complexity

**Future**: Consider unified approach

---

## 🔍 INVESTIGATION STATUS

**Current Step**: ⏳ **Awaiting User Test Results**

**Blockers**: Need console logs from live testing

**ETA for Fix**: 30 min after test results received

---

**Status**: 🔍 **DEBUGGING IN PROGRESS**  
**Next Action**: User to run test script with debug logging  
**Assigned To**: Cascade AI + User  
**Priority**: 🔴 **CRITICAL**
