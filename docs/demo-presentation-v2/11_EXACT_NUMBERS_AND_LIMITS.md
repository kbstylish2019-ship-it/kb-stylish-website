# Exact Numbers and Limits (Receipts)

Use these concrete values during the demo when you want to prove depth of thinking.

## Booking & Scheduling
- Reservation TTL: 15 minutes default
  - booking_reservations.expires_at = NOW() + interval '15 minutes'
  - File: supabase/migrations/20250923074500_the_great_decoupling.sql
- Double‑booking prevention: GiST range overlap + advisory locks in creation
  - Files: 20250923055000_create_booking_schema.sql, 20250923061500_create_booking_logic.sql
- Override constraints
  - Unique per stylist per date range (prevents duplicates)
  - Advisory lock when consuming override budget
  - Files: 20251018210200_add_schedule_override_unique_constraint.sql, 20251018210300_add_budget_advisory_lock.sql
- Availability cache TTL: 5 minutes; auto‑invalidate on booking/schedule/override
  - Files: 20251015160000_blueprint_v3_1_foundation.sql, 20251018210400_add_cache_invalidation_trigger.sql

## Payments & Orders
- Payment replay prevention: UNIQUE(provider, external_transaction_id)
  - eSewa transaction_uuid / Khalti pidx
  - File: 20250930073900_create_payment_verification_schema.sql
- Order idempotency: payment_intent_id used to deduplicate; webhook replays safe
  - File: 20250925000000_fix_booking_cart_clearing.sql

## Images & Uploads
- Accepted types: JPEG, PNG, WebP, GIF
- Max pre‑upload size: 10MB (validation)
- Optimization target: ~0.3–0.5MB after compression; 1920×1920 max dims
- Safe filenames and bucket‑URL validation for product images
  - File: src/lib/utils/imageOptimization.ts

## Payouts & Financial Integrity
- Payout arithmetic check: net = amount − fees (DB constraint)
  - File: 20251018210100_add_payout_arithmetic_constraint.sql
- Vendor‑level advisory lock during payout approval (prevents concurrent approvals)
  - File: 20250117180000_fix_p0_admin_assertions.sql (approve_payout_request)

## Security Baselines
- Vendor PII encryption at rest (bank, wallets); admin‑only decrypt + audit trail
  - File: 20251018210000_encrypt_vendor_pii.sql
- Admin assertion standardized; self‑protection (can’t demote/suspend self)
  - Files: 20250117180000_fix_p0_admin_assertions.sql, 20251012210000_admin_users_management.sql
- search_path pinned for sensitive functions; RPC lockdown to service_role
  - Files: 20250924132100_pin_search_paths_exact.sql, 20250919130300_lockdown_rpc_permissions.sql
- RLS on bookings, metrics, trust engine tables
  - Files: see respective migrations

Keep this page open to answer “how exactly did you do that?” with one line and a file reference.
