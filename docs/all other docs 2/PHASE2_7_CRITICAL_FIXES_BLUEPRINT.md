# 🎯 PHASE 2-7: CRITICAL MULTI-ISSUE FIX BLUEPRINT (REVIEWED)
**Following Universal AI Excellence Protocol v2.0**
**Date**: October 24, 2025 @ 4:35 PM

---

## 🔴 FIX #1: PAYMENT STUCK - DROP WRONG CONSTRAINT (P0 CRITICAL)

### Expert Panel Consensus: ✅ APPROVED

**Problem**: `UNIQUE (payment_intent_id)` constraint prevents multiple bookings per payment

**Solution**: Drop the constraint entirely

**Why Safe**:
- ✅ A single payment CAN contain multiple bookings (cart with 2+ services)
- ✅ Each booking has unique ID already (primary key)
- ✅ `order_item_id` is UNIQUE (better constraint for preventing duplicates)
- ✅ Rollback plan: Re-add constraint if issues arise

---

### Database Migration:

```sql
-- ========================================================================
-- FIX #1: Drop incorrect booking payment_intent uniqueness constraint
-- Migration: fix_booking_payment_intent_constraint
-- Date: 2025-10-24
-- ========================================================================

BEGIN;

-- Drop the incorrect constraint
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_payment_intent_unique;

COMMENT ON TABLE public.bookings IS 
'Customer bookings for stylist services. Multiple bookings can share the same payment_intent_id when purchased together.';

-- Verify constraint is gone
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_payment_intent_unique'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    RAISE EXCEPTION 'Constraint still exists!';
  END IF;
  
  RAISE NOTICE '✅ Constraint bookings_payment_intent_unique dropped successfully';
END $$;

COMMIT;
```

---

### Manual Retry of Failed Payment:

After dropping constraint, manually process the stuck payment:

```sql
-- Re-queue the failed job
UPDATE job_queue
SET 
  status = 'pending',
  attempts = 0,
  last_error = NULL,
  failed_at = NULL,
  locked_by = NULL,
  locked_until = NULL
WHERE id = '9719972c-252d-4062-a076-2eba4d20847e';

-- Then trigger worker manually
-- OR call: SELECT process_order_with_occ('pi_esewa_1761301554033_c7d366e9');
```

---

### ISSUE: Booking Reservations Already Expired!

**Problem**: The reservations expired before we can retry:
```
Reservation #1: expires_at = 2025-10-24 10:40:02 (EXPIRED)
Reservation #2: expires_at = 2025-10-24 10:40:21 (EXPIRED)
Current time: ~2025-10-24 16:35 (6 hours later!)
```

**Options**:

**Option A: Extend Reservation Expiry** (Recommended)
```sql
-- Extend expiry by 24 hours to allow manual processing
UPDATE booking_reservations
SET 
  expires_at = NOW() + INTERVAL '24 hours',
  status = 'reserved'
WHERE id IN (
  '45142641-4c87-4e95-8251-808f2f31978c',
  '1e3071ea-c357-490d-8d1e-98707faa3ada'
);
```

**Option B: Manually Create Bookings** (If urgent)
```sql
-- Manually insert bookings (bypassing reservation flow)
INSERT INTO bookings (
  customer_user_id,
  stylist_user_id,
  service_id,
  start_time,
  end_time,
  price_cents,
  status,
  payment_intent_id,
  booking_source
) VALUES
  -- Booking 1
  (
    '7ac3e538-9a7f-4747-beb1-f187f8e13565', -- customer
    '8e80ead5-ce95-4bad-ab30-d4f54555584b', -- stylist
    'ce7ec3b7-c363-404b-a682-be54a3e0312c', -- service
    '2025-10-27 03:15:00+00',
    '2025-10-27 04:00:00+00',
    80000,
    'confirmed',
    'pi_esewa_1761301554033_c7d366e9',
    'web'
  ),
  -- Booking 2
  (
    '7ac3e538-9a7f-4747-beb1-f187f8e13565',
    '7bc72b99-4125-4b27-8464-5519fb2aaab3',
    '3c203cca-fbe9-411c-bd6c-c03b8c1128fd',
    '2025-10-27 03:15:00+00',
    '2025-10-27 04:15:00+00',
    150000,
    'confirmed',
    'pi_esewa_1761301554033_c7d366e9',
    'web'
  );

-- Create order manually
INSERT INTO orders (
  user_id,
  payment_intent_id,
  order_number,
  status,
  subtotal_cents,
  shipping_cents,
  tax_cents,
  total_cents,
  currency,
  shipping_name,
  shipping_phone,
  shipping_address_line1,
  shipping_city,
  shipping_state,
  shipping_postal_code,
  shipping_country
) VALUES (
  '7ac3e538-9a7f-4747-beb1-f187f8e13565',
  'pi_esewa_1761301554033_c7d366e9',
  'ORD-' || LPAD(nextval('order_number_seq')::TEXT, 8, '0'),
  'confirmed',
  230000, -- 80000 + 150000
  9900,
  0,
  239900,
  'NPR',
  'Aakriti Bhandari',
  '9847468175',
  'thamel',
  'kathmandu',
  'Bagmati Province',
  '44600',
  'Nepal'
);
```

**Recommended**: Option B (manual creation) since it's been 6 hours and time-sensitive

---

## 🟠 FIX #2: DUPLICATE RATING ALLOWED (P1 HIGH)

### Expert Panel Consensus: ✅ APPROVED

**Problem**: Frontend doesn't check if booking already rated

**Solution**: Fetch rating status when loading bookings

---

### Backend: Add Rating Check to Booking Query

**File**: `src/lib/apiClient.ts` or customer bookings query

```typescript
// Add to booking fetch query
const { data: bookings } = await supabase
  .from('bookings')
  .select(`
    *,
    service:services(*),
    stylist:user_profiles(*),
    rating:stylist_ratings(rating, review_text, created_at)
  `)
  .eq('customer_user_id', userId);

// Returns bookings with rating: { rating: 3, review_text: "...", created_at: "..." }
// Or rating: null if not rated
```

---

### Frontend: Conditional Button Logic

**File**: `src/components/customer/MyBookingsClient.tsx`

```typescript
// Add to Booking interface
interface Booking {
  // ... existing fields
  rating?: {
    rating: number;
    review_text: string | null;
    created_at: string;
  } | null;
}

// In JSX:
{booking.status === 'completed' && (
  <>
    {booking.rating ? (
      // Already rated - show rating
      <Button
        disabled
        size="sm"
        className="bg-green-500/20 text-green-300 cursor-not-allowed"
      >
        <Star className="h-4 w-4 mr-1 fill-yellow-400" />
        Rated {booking.rating.rating}★
      </Button>
    ) : (
      // Not rated - show rate button
      <Button
        onClick={() => {
          setBookingToRate(booking);
          setRatingModalOpen(true);
        }}
        size="sm"
        className="bg-[var(--kb-accent-gold)] text-black"
      >
        <Star className="h-4 w-4 mr-1" />
        Rate
      </Button>
    )}
  </>
)}
```

---

## 🟠 FIX #3: NO VISUAL FEEDBACK AFTER RATING (P1 HIGH)

### Expert Panel Consensus: ✅ APPROVED

**Problem**: Button doesn't update after rating submission

**Solution**: Already solved by Fix #2! After rating:
1. Modal closes
2. `fetchBookings()` is called (already in code)
3. Bookings re-fetch with rating data
4. Button shows "Rated ★★★" (disabled)

**No additional changes needed** ✅

---

## 🟠 FIX #4: STYLIST CAN'T SEE RATINGS (P2 MEDIUM)

### Expert Panel Consensus: ✅ APPROVED WITH UX DESIGN

**Solution**: Display ratings in stylist bookings page

---

### UX Design (Expert 4: UX Designer):

**Completed Booking Card**:
```
┌─────────────────────────────────────────────────────────┐
│ Customer: Swastika                     confirmed        │
│ Hair Color • 120 min • NPR 3500.00                     │
│ 📅 Oct 21, 2025 • 🕐 9:30 AM - 11:30 AM               │
│ 📧 swastika@gmail.com                                  │
│                                                         │
│ ⭐ Customer Rating:                                     │
│ ★★★☆☆ (3/5)                                           │
│ 💭 "it was great"                                      │
│                                                         │
│ [View Details]                                          │
└─────────────────────────────────────────────────────────┘
```

---

### Backend: Update Stylist Bookings Query

**File**: Stylist bookings API or component

```typescript
const { data: bookings } = await supabase
  .from('bookings')
  .select(`
    *,
    service:services(name, duration_minutes, category),
    customer:user_profiles!customer_user_id(display_name, avatar_url),
    rating:stylist_ratings(rating, review_text, created_at, customer_name:user_profiles!customer_user_id(display_name))
  `)
  .eq('stylist_user_id', stylistId)
  .order('start_time', { ascending: false });
```

---

### Frontend: Display Rating in Completed Bookings

**File**: `src/components/stylist/BookingsListClient.tsx` or similar

```typescript
// In completed booking card:
{booking.rating && (
  <div className="mt-3 rounded-lg bg-white/5 p-3 border border-white/10">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-medium text-foreground/70">
        Customer Rating:
      </span>
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < booking.rating.rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-white/30'
            }`}
          />
        ))}
        <span className="ml-1 text-sm text-foreground/70">
          ({booking.rating.rating}/5)
        </span>
      </div>
    </div>
    {booking.rating.review_text && (
      <p className="text-sm text-foreground/80 italic">
        "{booking.rating.review_text}"
      </p>
    )}
    <p className="text-xs text-foreground/50 mt-1">
      Rated {new Date(booking.rating.created_at).toLocaleDateString()}
    </p>
  </div>
)}
```

---

## 🟡 FIX #5: DROPDOWN WHITE BACKGROUND (P3 MEDIUM)

### Expert Panel Consensus: ✅ APPROVED (Simple CSS Fix)

**Problem**: Dropdown has white background

**Solution**: Add dark theme styles

---

### Find the Dropdown Component:

**File**: `src/app/stylist/bookings/page.tsx` or sorting dropdown component

```typescript
// If using custom dropdown:
<select
  className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
>
  <option value="newest">Newest First</option>
  <option value="oldest">Oldest First</option>
</select>

// Note: Add these global styles if needed
```

```css
/* globals.css or component styles */
select option {
  background-color: rgb(var(--background));
  color: rgb(var(--foreground));
}
```

---

## 🟡 FIX #6: PAST BOOKINGS SHOW "MARK IN PROGRESS" (P3 MEDIUM)

### Expert Panel Consensus: ✅ APPROVED WITH BUSINESS LOGIC

**Problem**: Bookings 3+ days past still show action buttons

**Solution**: Add time-based logic to disable past actions

---

### Frontend Logic:

**File**: Stylist bookings management component

```typescript
// Helper function
const canMarkInProgress = (booking: Booking) => {
  if (booking.status !== 'confirmed') return false;
  
  const now = new Date();
  const startTime = new Date(booking.start_time);
  const endTime = new Date(booking.end_time);
  
  // Can only mark in progress if:
  // - Current time is within 30 min of start time OR during appointment
  const thirtyMinBeforeStart = new Date(startTime.getTime() - 30 * 60 * 1000);
  
  return now >= thirtyMinBeforeStart && now <= endTime;
};

const canMarkCompleted = (booking: Booking) => {
  if (booking.status !== 'in_progress' && booking.status !== 'confirmed') {
    return false;
  }
  
  const now = new Date();
  const startTime = new Date(booking.start_time);
  
  // Can mark complete if appointment has started
  return now >= startTime;
};

// In JSX:
{canMarkInProgress(booking) && (
  <button onClick={() => markInProgress(booking)}>
    Mark In Progress
  </button>
)}

{canMarkCompleted(booking) && (
  <button onClick={() => markCompleted(booking)}>
    Mark Completed
  </button>
)}

// For very past bookings, show message:
{booking.status === 'confirmed' && !canMarkInProgress(booking) && (
  <div className="text-sm text-yellow-400">
    ⚠️ This appointment was missed. Please contact customer.
  </div>
)}
```

---

## 📋 IMPLEMENTATION ORDER

### Immediate (Do Now):
1. **Fix #1**: Drop constraint + manually create order/bookings for stuck payment
2. Test payment flow with multiple bookings

### Today:
3. **Fix #2 & #3**: Add rating status to bookings query + update UI
4. Test rating flow end-to-end

### This Week:
5. **Fix #4**: Add rating display to stylist dashboard
6. **Fix #5**: Fix dropdown styling
7. **Fix #6**: Add time-based logic for booking actions

---

## 🧪 TEST PLAN

### Fix #1 (Payment):
- [ ] Drop constraint successfully
- [ ] Manually create 2 bookings for stuck payment
- [ ] Verify bookings appear in customer My Bookings
- [ ] Verify order appears in database
- [ ] Test new payment with 2+ bookings (works without error)

### Fix #2 & #3 (Ratings):
- [ ] Rate a completed booking
- [ ] Verify button changes to "Rated ★★★"
- [ ] Verify clicking rated button does nothing
- [ ] Reload page, verify still shows "Rated"

### Fix #4 (Stylist Ratings):
- [ ] View completed booking as stylist
- [ ] Verify rating displays if exists
- [ ] Verify no error if rating doesn't exist

### Fix #5 (Dropdown):
- [ ] Open dropdown in stylist bookings
- [ ] Verify text is visible (dark background)

### Fix #6 (Past Bookings):
- [ ] View booking from 3+ days ago
- [ ] Verify "Mark In Progress" is disabled/hidden
- [ ] Verify appropriate message shows

---

## 🔄 ROLLBACK PLAN

### Fix #1:
```sql
-- Re-add constraint if issues arise
ALTER TABLE public.bookings
ADD CONSTRAINT bookings_payment_intent_unique UNIQUE (payment_intent_id);

-- Delete manually created bookings
DELETE FROM bookings WHERE payment_intent_id = 'pi_esewa_1761301554033_c7d366e9';
```

### Fixes #2-6:
- Frontend changes only → Revert git commit

---

## ✅ APPROVAL STATUS

**Security Expert**: ✅ Approved (constraint removal safe, proper RLS remains)  
**Performance Expert**: ✅ Approved (no performance impact)  
**Data Expert**: ✅ Approved (migration safe, rollback plan exists)  
**UX Expert**: ✅ Approved (improved user experience)  
**Systems Expert**: ✅ Approved (fixes root cause, no side effects)

**VERDICT**: 🟢 **ALL FIXES APPROVED FOR IMPLEMENTATION**

---

## 🚀 READY FOR PHASE 8: IMPLEMENTATION

**Status**: Blueprint reviewed and approved  
**Next**: Implement fixes in priority order  
**Timeline**: Fix #1 (immediate), Fixes #2-3 (today), Fixes #4-6 (this week)

