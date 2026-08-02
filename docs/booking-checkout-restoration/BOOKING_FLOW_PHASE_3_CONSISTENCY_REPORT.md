# Phase 3: Codebase Consistency and Battle Checks

## Objective
Identify where the booking flow diverges from existing platform patterns and where checked-in code is internally inconsistent.

## Consistency model used
For each subsystem, this report compares:

- existing architectural pattern
- checked-in caller behavior
- live database or edge-function behavior
- production consistency verdict

## Pattern set already used elsewhere in KB Stylish
### Commerce pattern
Product commerce already follows a stable pattern:

- server-backed cart
- server-calculated totals
- `payment_intents` as initiation record
- `job_queue` for async finalization
- `process_order_with_occ` for transactional order creation

### Booking pattern in theory
The repository suggests a matching booking pattern should exist:

- `booking_reservations`
- reservation APIs
- checkout display of booking items
- booking-aware total calculation
- booking confirmation during order finalization

## Battle check 1: Is checkout authoritative on the server?
### Expected by pattern
Yes. Product checkout proves the system expects server-backed authority.

### Actual booking behavior
No. Booking items are persisted locally in `decoupledCartStore` and not server-backed in `get_cart_details_secure`.

### Verdict
**Inconsistent with the platform’s own commerce model.**

## Battle check 2: Does the edge function consume the same contract the frontend produces?
### Frontend produces
Local `bookingItems` in Zustand/local storage.

### `create-order-intent` consumes
`cart.bookings` from `get_cart_details_secure`.

### Verdict
**Direct caller-callee contract mismatch.**

## Battle check 3: Does finalization match the live schema?
### Expected
Finalization logic should insert schema-valid order and booking records.

### Actual live function behavior
`process_order_with_occ` booking branch references:
- `booking_reservations.service_name`
- `order_items.metadata`

Neither field exists live in the tables inspected.

### Verdict
**Database-function/schema mismatch.**

## Battle check 4: Does live data prove the booking path works?
### Observed live data
- no live booking reservations in table
- no confirmed reservation rows
- no booking-linked order items
- no payment intents with `bookings_count > 0`
- no bookings linked to order/payment fields

### Verdict
**No evidence of successful booking checkout finalization in production.**

## Battle check 5: Is mobile aligned to web?
### Web intent
Reservation-first checkout design.

### Mobile implementation
Direct `create_booking` RPC.

### Verdict
**Cross-platform contract divergence.**

## Battle check 6: Is customer appointment history implemented consistently?
### Expected
Appointment history should be its own customer feature backed by authoritative booking data.

### Actual mobile behavior
Profile route points to booking discovery rather than history.

### Verdict
**Navigation and domain-model inconsistency.**

## Anti-patterns detected
### Anti-pattern 1: Local-only source of truth for payable booking state
This is the central architectural smell. It makes checkout visually convincing while backend state remains unaware.

### Anti-pattern 2: Schema assumptions embedded in live RPC code
The live function assumes fields that are not present in the live tables.

### Anti-pattern 3: Divergent platform contracts for the same business action
Web and mobile do not agree on what a booking means.

### Anti-pattern 4: Dormant architectural code treated as working production behavior
The presence of migrations and UI support created the appearance that booking checkout was operational, but live data disproves actual usage.

## Regression hypotheses ranked
### Hypothesis 1
The major regression happened when booking reservations were decoupled into client storage without a corresponding server checkout contract.

**Confidence:** high

### Hypothesis 2
A later attempt to patch finalization for booking items updated `process_order_with_occ` in a way that drifted from the actual live schema.

**Confidence:** high

### Hypothesis 3
Because booking checkout was effectively unused, the drift survived unnoticed while product checkout continued working.

**Confidence:** high

## Consistency conclusion
The booking flow is currently inconsistent across all three enforcement layers:

- frontend state layer
- edge-function orchestration layer
- database finalization layer

This confirms that a durable fix must be architectural and contract-level, not just a local UI or route patch.
