# Phase 1: Codebase Immersion and Production Re-Ingestion

## Goal
Build a current-state mental model of the booking and checkout system using the repository and live Supabase as authoritative sources.

## Scope covered
### Web booking flow
- reservation creation
- booking storage before checkout
- checkout rendering
- payment intent initiation
- payment verification
- job queue finalization

### Mobile booking flow
- stylist discovery and detail page
- direct booking creation
- customer profile appointment navigation

### Database and edge functions
- booking reservation schema
- cart retrieval schema
- order finalization function
- queue processing behavior
- live data validation

## Files inspected
### Protocol source
- `docs/all other docs/UNIVERSAL_AI_EXCELLENCE_PROMPT.md`

### Web flow
- `src/components/booking/BookingModal.tsx`
- `src/components/checkout/CheckoutClient.tsx`
- `src/components/CartInitializer.tsx`
- `src/lib/store/decoupledCartStore.ts`
- `src/lib/api/cartClient.ts`
- `src/lib/api/bookingClient.ts`
- `src/app/api/bookings/create-reservation/route.ts`

### Edge functions
- `supabase/functions/cart-manager/index.ts`
- `supabase/functions/create-order-intent/index.ts`
- `supabase/functions/verify-payment/index.ts`
- `supabase/functions/order-worker/index.ts`

### Migrations and schema snapshots
- `supabase/migrations/20250923074500_the_great_decoupling.sql`
- `supabase/migrations/20250925000000_fix_booking_cart_clearing.sql`
- `supabase/migrations/20260122170000_fix_process_order_with_occ_missing_columns.sql`
- `db-dump/schema.sql`

### Mobile flow
- `kb_stylish_mobile/src/lib/api/stylists.ts`
- `kb_stylish_mobile/app/(customer)/stylist/[id].tsx`
- `kb_stylish_mobile/app/(customer)/(tabs)/profile.tsx`

## Live database verification performed
### Functions read live
- `get_cart_details_secure`
- `process_order_with_occ`
- `create_booking_reservation`
- `confirm_booking_reservation`

### Tables and columns inspected live
- `booking_reservations`
- `bookings`
- `order_items`
- `payment_intents`
- `job_queue`
- `stylist_profiles`

### Live counts and observed facts
- `booking_reservations` rows: `0`
- confirmed booking reservations: `0`
- booking-linked finalized order items: `0`
- bookings with `payment_intent_id` or `order_item_id`: `0`
- payment intents observed: product-only usage with `bookings_count = 0`
- completed `finalize_order` jobs: present for product/COD path

## Reconstructed web flow from code
### Step 1: reservation creation
`BookingModal.tsx` creates reservation via `/api/bookings/create-reservation`.

### Step 2: local storage handoff
Reservation payload is converted into a `bookingItem` and stored in `decoupledCartStore` and booking persistence storage.

### Step 3: checkout rendering
`CheckoutClient.tsx` reads those locally persisted booking items and visually includes them in checkout.

### Step 4: payment-intent creation
`cartAPI.createOrderIntent()` sends shipping and payment metadata to `create-order-intent`.

### Step 5: backend expectation mismatch
`create-order-intent` fetches `get_cart_details_secure` and expects both:
- `cart.items`
- `cart.bookings`

But only `cart.items` are returned live.

### Step 6: finalization
COD and verified gateway payments enqueue `finalize_order` jobs that call `process_order_with_occ`.

## Reconstructed mobile flow from code
### Booking creation
Mobile directly calls `create_booking` from `src/lib/api/stylists.ts`.

### UX behavior
Customer books from stylist detail screen and receives success immediately, without reservation/cart/checkout.

### History behavior
Profile `My Appointments` route points to booking discovery rather than appointment history.

## High-confidence findings
### Finding 1
The web UI and store are built around **local reservation persistence**, not a server-backed mixed cart.

### Finding 2
The live checkout edge function expects a **server-backed mixed cart**.

### Finding 3
The live finalization RPC contains a booking-processing branch that is inconsistent with the live schema.

### Finding 4
The live production dataset shows only product orders moving through the payment-intent and finalization pipeline.

### Finding 5
Mobile is still on a legacy direct-booking path and is not aligned with the web reservation/checkout design.

## Key uncertainty resolved during ingestion
A previous suspicion was that `booking_reservations.customer_user_id` was FK-blocked by `user_profiles` drift. Live FK inspection disproved that. The reservation table is not constrained on `customer_user_id` in the current live schema. That means the dominant issue is contract drift, not that particular foreign-key mismatch.

## Phase 1 conclusion
The system is not suffering from a single isolated bug. The current booking problem is a split-brain architecture problem:

- frontend/store thinks bookings are client-side checkout items
- edge functions think bookings are server-side cart items
- finalization code thinks booking rows contain fields they do not actually contain live

This explains why the intended booking checkout path is effectively dormant in production even though the UI and migrations suggest it should exist.
