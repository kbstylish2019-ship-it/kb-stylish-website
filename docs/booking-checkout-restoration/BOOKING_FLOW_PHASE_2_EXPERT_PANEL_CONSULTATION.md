# Phase 2: 5-Expert Panel Consultation

## Objective
Pressure-test the booking restoration problem from five specialist perspectives before finalizing the repair blueprint.

## 👨‍💻 Expert 1: Senior Security Architect
### Core concern
The current architecture has two dangerous paths:

- direct mobile booking without payment linkage
- local-storage reservation handling without authoritative backend ownership in checkout

### Security review
- Direct `create_booking` allows unpaid bookings to become real `bookings` rows.
- `create_booking` is `SECURITY DEFINER`, which raises the blast radius of misuse if the contract is wrong.
- Client-held booking reservations increase the chance of stale, expired, or manipulated reservation state being presented at checkout.
- A repair that trusts client-submitted booking totals or reservation metadata would be unsafe.

### Security verdict
The durable repair must make the backend authoritative for:

- reservation ownership
- reservation expiry
- reservation price
- payment linkage
- booking creation

### Security requirements
- never trust client booking totals
- never create final bookings outside payment-confirmed or COD-authorized flow
- verify reservation ownership server-side
- lock down or retire direct mobile `create_booking`

## ⚡ Expert 2: Performance Engineer
### Core concern
The system should not fix correctness by introducing slow or chatty checkout behavior.

### Performance review
- A mixed checkout aggregator is acceptable if it reads product cart items and active booking reservations in one server call or one edge orchestration step.
- Current local-storage booking logic is fast, but correctness is poor.
- A server-backed reservation checkout can still scale if:
  - active reservations are indexed by `customer_user_id`, `status`, `expires_at`
  - checkout reads only active reservations for the current user
  - finalization stays in a transactionally safe RPC path

### Performance verdict
A server-backed reservation aggregator is preferred over ad hoc client-side booking payloads, as long as reservation reads are targeted and indexed.

### Performance requirements
- reservation reads must be indexed and filtered to active rows only
- avoid N+1 slot validation loops during checkout where possible
- keep booking confirmation inside the order finalization transaction boundary where practical

## 🗄️ Expert 3: Data Architect
### Core concern
The live schema and live functions are no longer aligned.

### Data review
- `process_order_with_occ` booking branch references non-live fields.
- `bookings` supports `payment_intent_id` and `order_item_id`, but production data shows no usage of those fields for booking flows.
- `booking_reservations` is acting as a temporary state object without being formally integrated into checkout persistence.
- There is a data integrity gap between reservation, payment intent, order item, and confirmed booking.

### Data verdict
The repair must establish one canonical lifecycle:

- reservation created
- payment intent created with reservation linkage
- order finalized
- booking created or confirmed with linkage to payment/order artifacts

### Data requirements
- live function definitions must match live table schemas
- confirmed bookings must link to the payment/order trail
- reservation cleanup must not destroy required auditability without replacement linkage

## 🎨 Expert 4: Frontend and UX Engineer
### Core concern
The current UI is persuasive, but it is not backed by a reliable contract.

### UX review
- Web checkout visually includes bookings, but that visual inclusion is misleading if backend checkout never sees them.
- Mobile’s direct "Confirm Booking" pattern is simpler, but it breaks the business rule that bookings should align with web checkout.
- Customer profile “My Appointments” currently sends users to the wrong destination, causing trust erosion.

### UX verdict
The UI must stop implying a valid mixed checkout until the backend contract is truly authoritative.

### UX requirements
- web booking state shown in checkout must be backed by server-verifiable reservations
- mobile must transition to reserve-then-checkout rather than confirm-immediately
- customer appointment history must become a first-class destination

## 🔬 Expert 5: Principal Engineer (Integration and Systems)
### Core concern
This is an integration drift problem spanning multiple subsystems, not just a booking component bug.

### Systems review
The booking pipeline breaks because these responsibilities were split without a stable integration contract:

- booking reservation creation exists
- local store persistence exists
- checkout UI exists
- payment intent exists
- job queue exists
- booking finalization exists in concept

But there is no single authoritative bridge carrying reservation state from one subsystem to the next.

### Systems verdict
Restoration should be done by re-establishing one end-to-end contract that every layer agrees on.

### Systems requirements
- decide whether checkout consumes server-side reservations or explicit validated reservation IDs
- make that contract visible in both web and mobile
- update edge functions and finalization RPCs to use the same model
- add observability so future drift is visible early

## Expert panel synthesis
### What all experts agree on
- mobile direct booking is not acceptable as the long-term contract
- client-only booking persistence is not durable enough for production checkout
- the backend must become authoritative for reservation-to-order-to-booking conversion
- live schema/function drift must be corrected before mobile alignment

### Strategic implication
The restoration should proceed in this order:

- fix the web booking checkout contract first
- make booking finalization schema-valid and auditable
- then align mobile to the repaired backend contract
- then restore customer appointment history around authoritative booking records
