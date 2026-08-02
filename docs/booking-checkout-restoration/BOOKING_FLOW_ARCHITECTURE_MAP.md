# Booking Flow Architecture Map

## Objective
Map the current booking system as it exists across web, mobile, edge functions, and live Supabase so that repair work targets the real source of failure instead of symptoms.

## System layers
### Layer 1: Customer-facing entry points
#### Web
- `src/components/booking/BookingModal.tsx`
- `src/components/checkout/CheckoutClient.tsx`
- `src/lib/store/decoupledCartStore.ts`
- `src/lib/api/bookingClient.ts`
- `src/lib/api/cartClient.ts`

#### Mobile
- `kb_stylish_mobile/app/(customer)/stylist/[id].tsx`
- `kb_stylish_mobile/src/lib/api/stylists.ts`
- `kb_stylish_mobile/app/(customer)/(tabs)/profile.tsx`

### Layer 2: Web application server and edge functions
#### Next.js API routes
- `src/app/api/bookings/create-reservation/route.ts`
- `src/app/api/bookings/update-reservation/route.ts`
- `src/app/api/bookings/cancel-reservation/route.ts`

#### Supabase Edge Functions
- `supabase/functions/cart-manager/index.ts`
- `supabase/functions/create-order-intent/index.ts`
- `supabase/functions/verify-payment/index.ts`
- `supabase/functions/order-worker/index.ts`

### Layer 3: Database functions and tables
#### Booking-related tables
- `bookings`
- `booking_reservations`
- `services`
- `stylist_profiles`

#### Commerce-related tables
- `carts`
- `cart_items`
- `payment_intents`
- `orders`
- `order_items`
- `job_queue`

#### Key RPCs and functions
- `create_booking`
- `create_booking_reservation`
- `confirm_booking_reservation`
- `get_cart_details_secure`
- `process_order_with_occ`
- `reserve_inventory_for_payment`

## Intended architecture
The intended web architecture, based on checked-in code and migrations, is:

- User selects stylist service and slot
- Web creates `booking_reservation`
- Booking reservation is carried into checkout alongside products
- Checkout creates `payment_intent`
- Payment verification or COD finalizes order via `job_queue`
- `process_order_with_occ` creates order records and confirms bookings
- Confirmed bookings appear in stylist dashboard and customer history

## Actual web implementation
### Reservation creation
`BookingModal.tsx` does this:

- calls `createBookingReservation`
- receives `reservation_id`, `service_name`, `price_cents`, `expires_at`
- stores booking locally in Zustand via `addBookingItem`
- navigates to `/checkout`

### Local booking persistence
`decoupledCartStore.ts` explicitly says:

- booking items are stored locally until checkout
- bookings do not go through cart API
- local storage is the normal source for booking items

### Checkout rendering
`CheckoutClient.tsx` does this:

- reads `bookingItems` from local Zustand state
- renders appointment blocks
- calculates booking total client-side
- calls `cartAPI.createOrderIntent()` without sending booking payload

### Edge checkout expectation
`create-order-intent/index.ts` does this:

- fetches cart from `get_cart_details_secure`
- validates `cart.items` or `cart.bookings`
- calculates totals from `cart.items` and `cart.bookings`
- writes `payment_intents.metadata.bookings_count`
- enqueues `finalize_order`

## Actual live production behavior
### Live cart retrieval contract
`get_cart_details_secure` currently returns:

- `id`
- `user_id`
- `session_id`
- `items`
- `subtotal`
- `item_count`
- `combo_groups`

It does **not** return `bookings`.

### Live payment intent data
Observed live `payment_intents` show:

- `bookings_count = 0` for all rows checked
- active historical usage exists only for product orders
- completed `finalize_order` jobs correspond to product/COD paths only

### Live order finalization function
Live `process_order_with_occ` currently:

- processes product items correctly for live schema
- contains a booking branch
- but that branch references schema fields not present in live production:
  - `booking_reservations.service_name`
  - `order_items.metadata`

This means the live booking branch is structurally incompatible with the live schema.

## Mobile divergence map
### Mobile booking path
Mobile does not use reservations or checkout.

`kb_stylish_mobile/src/lib/api/stylists.ts`:
- calls `supabase.rpc('create_booking')`

`kb_stylish_mobile/app/(customer)/stylist/[id].tsx`:
- collects customer details
- confirms booking directly from stylist detail screen
- shows success alert after direct booking response

### Mobile appointment-history gap
`kb_stylish_mobile/app/(customer)/(tabs)/profile.tsx`:
- `My Appointments` routes to `/(customer)/(tabs)/bookings`
- this is not customer appointment history
- this is stylist discovery/booking entry, not past appointments

## Contract split summary
### Contract A: frontend/store contract
- reservations are client-side booking items
- bookings exist outside the server cart

### Contract B: checkout edge-function contract
- bookings must come from server cart as `cart.bookings`

### Contract C: order finalization contract
- booking finalization assumes booking data exists and matches live DB schema

These three contracts do not currently agree.

## Root-cause topology
### Root cause 1
The reservation-to-checkout bridge is missing.

### Root cause 2
The live booking finalization branch is not schema-compatible.

### Root cause 3
Mobile still uses an obsolete direct-booking contract.

### Root cause 4
Customer appointment history is not implemented as a real end-user flow in mobile.

## Restoration options
### Option A: Server-backed reservation checkout
Make booking reservations first-class server-backed checkout items.

This requires:
- `get_cart_details_secure` or an equivalent checkout aggregator to return bookings
- `create-order-intent` to use that authoritative source
- `process_order_with_occ` to confirm bookings using schema-valid inserts

### Option B: Explicit mixed-checkout payload
Pass booking reservations explicitly from the client to `create-order-intent`.

This reduces dependence on cart RPC shape, but still requires:
- secure server-side validation of reservation ownership and expiry
- schema-valid booking finalization logic

## Recommended architectural direction
Use **server-backed reservation checkout** as the durable target because it:

- gives the backend a single source of truth
- prevents local-storage-only phantom bookings
- improves auditability and recovery
- allows mobile and web to converge on one contract

## Non-negotiable invariants for the repair
- Unpaid reservations must never become real bookings.
- Expired reservations must never be finalized.
- Booking finalization must link to order/payment records.
- Customer and stylist history must read from authoritative booking records.
- Mobile and web must converge on one booking contract.
