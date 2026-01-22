# Consistency Report: COD Integration

## Pattern Matching
- **Payment Lifecycle**: The current system uses `payment_intents` as the source of truth for initiation. COD should follow this to maintain consistency in order finalization.
- **Edge Functions**: Must follow the `Dual-client pattern` (user client for auth, service client for schema-level ops).
- **RPC Usage**: All critical state changes (reserving inventory, creating orders) must be done via RPCs to ensure atomicity.
- **Error Handling**: Use `errorResponse()` pattern in Edge Functions.
- **Frontend**: Use `apiClient` and `cartAPI` helpers.

## Dependencies Verified
- **Supabase**: Existing schema supports `payment_intents` with `provider`.
- **Zustand**: `decoupledCartStore` handles products and bookings, already integrated in checkout.

## Anti-Patterns to Avoid
- **Direct DB writes from Edge Functions**: Always use RPCs for complex operations like `process_order_with_occ`.
- **Trusting Client Input**: Ensure `total_cents` is recalculated on the server in `create-order-intent`.
- **Duplicate Orders**: Use `idempotency_key` in `job_queue`.

## Observations
- The `orders` table lacks a `payment_method` column. While `payment_intents` tracks it, having it in `orders` is better for reporting and the Admin/Vendor dashboards.
- `inventory` table needs to be checked for proper indices on `variant_id`.
