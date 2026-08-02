# Booking Checkout Restoration Implementation Notes

## Immediate high-risk fixes identified before coding
- Booking checkout contract is split between local booking state and server cart contract.
- `cancel-reservation` currently uses service-role mutation without ownership verification.
- `BookingModal` creates reservations with placeholder customer data.
- Mobile direct booking still creates unpaid real bookings.

## High-confidence implementation order
### First
Restore backend-owned reservation checkout for web.

### Second
Harden reservation auth and customer data flow.

### Third
Restore appointment history and customer navigation correctness.

### Fourth
Align mobile to the repaired reservation-first checkout contract.

## Live truths that implementation must preserve
- product checkout and COD finalization are actively working
- `finalize_order` jobs are completing in production for product orders
- all current payment intents observed have `bookings_count = 0`

## Non-goals for the first repair wave
- redesigning the entire product cart architecture
- adding a new parallel booking payment system
- supporting guest booking checkout unless explicitly completed end-to-end

## Observability to add during implementation
- structured logs for reservation aggregation size during checkout
- structured logs for booking finalization count per order
- defensive error messages when reservation payloads are absent, expired, or mismatched
- post-fix live validation queries captured in the phase 8-10 plan
