# Booking Checkout Restoration Protocol Dossier

## Purpose
This dossier documents the full production-hardening investigation for KB Stylish booking checkout restoration across:

- Web booking reservation and checkout
- Order finalization edge functions and RPCs
- Live Supabase schema and function behavior
- Mobile booking divergence and appointment-history gaps

It follows the protocol in `docs/all other docs/UNIVERSAL_AI_EXCELLENCE_PROMPT.md`, but every conclusion in this dossier is grounded in current repository code and live Supabase evidence rather than stale documentation.

## Why this dossier exists
The web booking path is architecturally intended to work as:

- Reserve appointment
- Carry reservation into checkout
- Create payment intent
- Finalize order
- Confirm booking

But the current production evidence shows a contract split between:

- Web frontend/store assumptions
- Edge function expectations
- Live database function outputs

This dossier is meant to establish one authoritative repair plan and prevent repeated partial fixes.

## Current high-confidence verdict
The primary regression is not a single broken button or missing query.

The real break is a **three-layer contract split**:

- The web frontend/store keeps booking reservations in client state and local storage.
- The checkout edge function expects server-side `cart.bookings` from `get_cart_details_secure`.
- The live order finalization RPC contains a booking branch that does not match the live `order_items` and `booking_reservations` schemas.

As a result:

- Reservations are not entering the payment-intent contract.
- All observed live payment intents have `bookings_count = 0`.
- No booking reservations have been finalized in production.
- Mobile still bypasses checkout entirely through direct `create_booking`.

## Document map
- `BOOKING_FLOW_ARCHITECTURE_MAP.md`
- `BOOKING_FLOW_PHASE_1_CODEBASE_INGESTION.md`
- `BOOKING_FLOW_PHASE_2_EXPERT_PANEL_CONSULTATION.md`
- `BOOKING_FLOW_PHASE_3_CONSISTENCY_REPORT.md`
- `BOOKING_FLOW_PHASE_4_6_SOLUTION_BLUEPRINT.md`
- `BOOKING_FLOW_PHASE_7_FAANG_REVIEW.md`
- `BOOKING_FLOW_PHASE_8_10_IMPLEMENTATION_VALIDATION_PLAN.md`

## Authoritative evidence sources used
### Repositories
- `kb-stylish`
- `kb_stylish_mobile`

### Key web files
- `src/components/booking/BookingModal.tsx`
- `src/components/checkout/CheckoutClient.tsx`
- `src/lib/store/decoupledCartStore.ts`
- `src/lib/api/cartClient.ts`
- `src/app/api/bookings/create-reservation/route.ts`
- `src/lib/api/bookingClient.ts`
- `supabase/functions/create-order-intent/index.ts`
- `supabase/functions/order-worker/index.ts`
- `supabase/functions/verify-payment/index.ts`
- `supabase/functions/cart-manager/index.ts`
- `supabase/migrations/20250923074500_the_great_decoupling.sql`
- `supabase/migrations/20250925000000_fix_booking_cart_clearing.sql`
- `supabase/migrations/20260122170000_fix_process_order_with_occ_missing_columns.sql`
- `db-dump/schema.sql`

### Key mobile files
- `kb_stylish_mobile/src/lib/api/stylists.ts`
- `kb_stylish_mobile/app/(customer)/stylist/[id].tsx`
- `kb_stylish_mobile/app/(customer)/(tabs)/profile.tsx`

### Live Supabase facts verified
- `get_cart_details_secure` returns product cart data only
- `create-order-intent` expects `cart.bookings`
- `process_order_with_occ` references booking fields not present in live schema
- `payment_intents.metadata.bookings_count` is `0` for all observed rows
- `booking_reservations` currently has `0` rows
- `bookings` linked to `payment_intent_id` or `order_item_id` currently total `0`
- `job_queue.finalize_order` completed successfully for product/COD orders only

## North-star outcome
The durable repair target is:

- Web bookings become server-backed reservations visible to checkout and order finalization.
- Paid booking checkout creates linked `orders`, `order_items`, and `bookings` consistently.
- Mobile is aligned to the repaired checkout contract instead of direct booking.
- Customer appointment history becomes a real feature rather than a link to stylist discovery.

## Implementation stance
This dossier intentionally separates:

- What is intended
- What is checked into the repo
- What is live in production
- What should actually be changed

No implementation should be considered production-safe unless it satisfies all four layers.
