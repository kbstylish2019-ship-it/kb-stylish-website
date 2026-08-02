# Phase 4 to Phase 6: Solution Blueprint, Review, and Revision

## Phase 4 Objective
Define a durable repair that restores real web booking checkout using current production code and live Supabase constraints.

## Problem statement
The current booking system visually presents a reservation-to-checkout flow on web, but the actual production contract is broken across three layers:

- web booking reservations are stored locally
- checkout edge functions expect server-backed booking checkout items
- live order finalization logic for bookings is not schema-compatible

Mobile remains on a direct-booking path that bypasses the intended checkout architecture entirely.

## Repair goals
- restore a real, end-to-end web booking checkout contract
- make backend reservation and finalization authoritative
- preserve product checkout behavior
- align mobile to the repaired contract after web is stable
- restore customer appointment history as an authoritative booking feature

## Candidate approaches
### Option 1: Minimal patch on current local-storage design
Patch `create-order-intent` to accept booking items from the client while leaving bookings outside server cart.

#### Advantages
- lower initial frontend churn
- less immediate DB/RPC surface change

#### Risks
- client-submitted booking payload becomes security-sensitive
- reservation ownership and expiry must still be revalidated server-side
- preserves split mental model between products and bookings
- harder long-term parity across web and mobile

### Option 2: Server-backed reservation checkout aggregator
Make checkout consume bookings from an authoritative server-side reservation source for the current user.

#### Advantages
- backend becomes source of truth
- consistent with product checkout principles
- easier observability and recovery
- clean convergence target for mobile

#### Risks
- requires changing edge/database contract
- requires careful migration of checkout/store assumptions

### Option 3: Separate booking-only checkout pipeline
Fork the platform into product checkout and booking checkout as separate systems.

#### Advantages
- simpler booking domain isolation

#### Risks
- duplicates payment and order finalization logic
- increases tech debt
- fights current platform direction

## Selected approach
### Chosen approach
**Option 2: Server-backed reservation checkout aggregator**

### Why this approach wins
It is the only option that resolves the actual root problem rather than wrapping it.

The failure today exists because the backend does not authoritatively know which reservations are in checkout. The repair therefore must make the backend authoritative again.

## Technical design
## Design principle 1: Reservations are the only pre-payment booking object
Before payment, the system should only have temporary reservation rows.

## Design principle 2: Checkout does not trust local booking state
Checkout may cache or display local state, but order creation must derive booking checkout items from server-validated reservation rows.

## Design principle 3: Final bookings are created only during successful order finalization
No mobile or web UI should create payable customer bookings directly outside the payment/COD finalization path.

## Proposed architecture
### A. Reservation creation remains separate from product cart creation
`create_booking_reservation` remains the entry point for reserving a slot.

### B. Add or restore authoritative reservation aggregation for checkout
Introduce one authoritative server contract for active customer reservations, either by:

- extending `get_cart_details_secure` to return `bookings`
- or creating a sibling secure checkout aggregator that returns both product items and active reservations

Preferred design is a dedicated mixed checkout aggregator or a safely extended `get_cart_details_secure`.

### C. Change checkout initialization to trust server reservation state
`decoupledCartStore` and checkout UI should initialize booking items from server-active reservations, not treat local storage as canonical truth.

### D. Fix order finalization to use live-schema-valid booking confirmation
`process_order_with_occ` must stop inserting synthetic booking order items from nonexistent fields.

Instead it should:
- resolve active reservations for the user/payment scope
- confirm each reservation using live-schema-valid logic
- create linked order items using live columns only
- update or preserve reservation state in a way that maintains auditability
- set `bookings.payment_intent_id` and, if modeled, `bookings.order_item_id`

### E. Remove or restrict direct mobile booking creation
After web contract is fixed, mobile should stop calling `create_booking` directly and move to reservation-first checkout.

## Exact problem seams to repair
### Seam 1: Reservation creation route data quality
Current `BookingModal.tsx` creates reservations with placeholder values:

- `customerName: 'Customer'`
- empty phone
- empty email

This is not durable if reservations are later confirmed without a data hydration step.

#### Required repair
Reservation creation must either:
- require authenticated users and use real customer identity data from session/profile, or
- remain partially blank but be guaranteed to hydrate before confirmation

Preferred design is:
- authenticated users only for booking checkout
- reservation carries real user identity and can be updated with shipping/contact data at checkout

### Seam 2: Guest reservations
Current `create-reservation` route can generate synthetic guest UUIDs.

#### Required repair
Guest reservations should not be allowed unless the entire downstream checkout contract explicitly supports guest reservation ownership, persistence, and confirmation.

Given the current platform state, the safer approach is:
- require authentication before creating booking reservations

### Seam 3: Cancel-reservation authorization
Current cancel route uses service role and states reservation ID itself is enough authentication.

#### Required repair
Reservation cancellation must verify ownership unless the caller is privileged.

### Seam 4: Checkout aggregator mismatch
Current `create-order-intent` expects `cart.bookings`, but live cart RPC does not provide it.

#### Required repair
Unify this contract on the backend before any UI claims mixed checkout is restored.

### Seam 5: Finalization schema mismatch
Current live booking branch in `process_order_with_occ` assumes nonexistent columns.

#### Required repair
Rewrite booking finalization against the actual live `booking_reservations`, `order_items`, and `bookings` schemas.

## Files expected to change in implementation
### Web
- `src/components/booking/BookingModal.tsx`
- `src/components/checkout/CheckoutClient.tsx`
- `src/lib/store/decoupledCartStore.ts`
- `src/lib/api/cartClient.ts`
- `src/app/api/bookings/create-reservation/route.ts`
- `src/app/api/bookings/cancel-reservation/route.ts`
- possibly `src/app/api/bookings/update-reservation/route.ts`

### Database and edge functions
- `supabase/functions/create-order-intent/index.ts`
- `supabase/functions/cart-manager/index.ts` if cart contract is extended
- `supabase/functions/order-worker/index.ts` only if payload handling needs reinforcement
- new SQL migration for authoritative mixed-checkout contract and live-schema booking finalization

### Mobile
- `kb_stylish_mobile/src/lib/api/stylists.ts`
- `kb_stylish_mobile/app/(customer)/stylist/[id].tsx`
- customer appointment-history screens/routes to be added or rewired

## Impact analysis
### Data impact
- reservation lifecycle becomes authoritative and measurable
- confirmed bookings gain consistent linkage to payments and orders
- no migration of existing finalized bookings is likely needed because live booking finalization appears unused

### UX impact
- web booking flow becomes truthfully payable via checkout
- mobile booking flow will become slightly longer but correct
- appointment history becomes trustworthy

### Security impact
- direct unpaid booking creation is reduced or removed
- reservation cancellation becomes safer
- client-side tampering surface decreases

## Rollback plan
If the repair causes checkout instability:

- keep product checkout intact and isolated
- feature-flag or temporarily disable booking reservation addition to checkout UI
- revert booking-specific aggregator/finalization changes only
- leave direct mobile booking disabled only if replacement is live; otherwise stage that change after web repair is confirmed

## Phase 5: Expert review of blueprint
### Security review findings
- requiring authentication before reservation creation is strongly preferred
- service-role cancellation by reservation ID alone is too permissive
- final booking creation must happen only during payment/COD finalization

### Performance review findings
- aggregator query is safe if active reservations are indexed and filtered
- avoid duplicating slot validation in too many layers

### Data review findings
- finalization must use live columns only
- if booking order items are created, they must use a schema-valid representation
- reservation confirmation should not lose audit traceability

### UX review findings
- placeholder reservation customer values are not acceptable if they can leak into finalized bookings
- mobile appointment history and booking discovery must be separated clearly

### Systems review findings
- mixed checkout must have one backend-owned contract
- web and mobile must converge on that contract over time

## Phase 6: Revised blueprint
### Revision 1
Do not treat local booking persistence as canonical state after this repair.

### Revision 2
Require authenticated booking reservations on web unless a full guest reservation contract is built.

### Revision 3
Rework booking finalization to confirm reservations from live rows and create schema-valid order items/bookings.

### Revision 4
Separate web restoration from mobile alignment in rollout order, but use the same backend contract.

## Final blueprint decision
### Phase 1 of implementation
Restore web reservation-to-checkout-to-finalization using a backend-owned reservation contract.

### Phase 2 of implementation
Fix customer appointment history routing and screens.

### Phase 3 of implementation
Align mobile booking to reservation-first checkout and retire direct `create_booking` path.

## Blueprint acceptance criteria
- web payment intent records can show `bookings_count > 0`
- successful web booking checkout creates linked `bookings`
- live `bookings.payment_intent_id` and/or `order_item_id` are populated for new confirmed bookings
- no placeholder customer data is finalized unintentionally
- mobile no longer creates unpaid real bookings directly
- customer appointment history points to actual booking history views
