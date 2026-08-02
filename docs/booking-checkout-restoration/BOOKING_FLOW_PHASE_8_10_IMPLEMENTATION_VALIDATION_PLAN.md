# Phase 8 to Phase 10: Implementation, Validation, and Refinement Plan

## Purpose
Define the implementation order, verification gates, and refinement process required to restore booking checkout safely.

## Phase 8: Implementation plan
### Implementation strategy
Use a staged restoration rather than a large cross-platform blast change.

## Stage 1: Backend contract restoration for web booking checkout
### Target outcomes
- server can return authoritative active booking reservations for checkout
- `create-order-intent` can create payment intents with real `bookings_count`
- `process_order_with_occ` can finalize bookings using live-schema-valid logic

### Candidate implementation tasks
- add or restore authoritative reservation aggregation for current customer checkout
- update edge-function contract to consume that aggregation
- rewrite booking portion of `process_order_with_occ`
- ensure bookings created during finalization carry payment/order linkage

### Verification gate
- new test reservation can appear in checkout through backend contract
- new payment intent can store `bookings_count > 0`

## Stage 2: Web booking UX truthfulness and authorization hardening
### Target outcomes
- reservation creation requires the correct user context
- placeholder customer data is not finalized accidentally
- cancel/update flows respect ownership properly

### Candidate implementation tasks
- tighten `create-reservation` auth policy
- tighten `cancel-reservation` auth checks
- ensure checkout or reservation mutation updates real customer data where required

### Verification gate
- unauthorized reservation mutation fails
- authorized reservation mutation works

## Stage 3: Customer appointment-history restoration
### Target outcomes
- customers have a real booking-history destination
- mobile profile no longer routes to stylist discovery for appointment history

### Candidate implementation tasks
- create or wire customer booking-history API/hooks/screens
- fix profile navigation

### Verification gate
- customer can navigate to past/upcoming appointments from profile and see authoritative booking data

## Stage 4: Mobile booking alignment
### Target outcomes
- mobile no longer creates real bookings directly through `create_booking`
- mobile uses reservation-first checkout contract

### Candidate implementation tasks
- replace direct booking RPC usage with reservation creation plus checkout handoff
- remove or deprecate direct-booking UI flow

### Verification gate
- mobile booking produces reservation first, not real booking
- final booking appears only after the payment/COD finalization path

## Phase 9: Post-implementation review checklist
### Self-review checklist
- every booking mutation path is backed by authoritative server validation
- no client-only state is treated as payable truth
- product checkout behavior remains intact
- order finalization is idempotent for mixed checkout
- reservation expiry is honored consistently

### Expert re-review checklist
#### Security
- can users cancel or mutate others’ reservations?
- can unpaid bookings still become real bookings?

#### Performance
- does mixed checkout remain responsive?
- are reservation lookups indexed and bounded?

#### Data integrity
- do new bookings contain valid payment/order linkage?
- do reservation and booking states transition cleanly?

#### UX
- are customer flows now truthful and understandable?
- is appointment history separated from booking discovery?

#### Systems
- do logs and live data confirm the new contract is actually being exercised?

## Phase 10: Production validation and bug refinement
### Live-data validation queries to run after implementation
- payment intents grouped by `bookings_count`
- count of bookings linked to `payment_intent_id`
- count of bookings linked to `order_item_id`
- booking reservations by status
- job queue finalize-order success/failure counts

### Manual production verification scenarios
#### Scenario 1: Web authenticated booking-only checkout
- reserve a stylist slot
- proceed to checkout
- complete COD or gateway flow
- confirm payment intent shows booking count
- confirm booking row is created with linkage

#### Scenario 2: Web mixed cart checkout
- add products and a booking reservation
- complete checkout
- verify order items and booking both finalize correctly

#### Scenario 3: Reservation expiry
- create reservation
- wait for expiry or simulate expiry
- confirm checkout refuses to finalize expired reservation

#### Scenario 4: Reservation cancellation authorization
- attempt cancel from owner account
- attempt cancel from non-owner path
- verify only valid path succeeds

#### Scenario 5: Mobile booking alignment
- start appointment flow on mobile
- confirm no direct booking row is created pre-payment
- finish through repaired contract

#### Scenario 6: Customer appointment history
- confirm upcoming and past bookings appear in history
- confirm profile route lands on history, not stylist discovery

## Rollback checklist
If web booking checkout restoration introduces production instability:

- disable booking inclusion in checkout UI
- preserve product checkout path
- revert booking-specific aggregator/finalization migration
- temporarily keep reservation creation available only if it does not create real bookings
- postpone mobile alignment until web contract is stable again

## Definition of done
The problem is only solved “once and for all” when all of the following are true:

- web booking checkout is exercised in live data
- payment intents show non-zero booking counts for booking checkouts
- booking finalization is schema-valid and linked to order/payment records
- mobile no longer bypasses checkout with direct payable booking creation
- customer appointment history is a real destination on mobile
- product checkout remains healthy
- observability exists to detect future contract drift early
