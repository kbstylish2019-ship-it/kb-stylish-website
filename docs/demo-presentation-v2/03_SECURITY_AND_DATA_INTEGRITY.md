# Security and Data Integrity (Proof‑backed)

These are not claims — they’re receipts. Each item cites the migration/logic enabling it.

- Vendor PII encryption (bank, tax, wallets)
  - Migration: supabase/migrations/20251018210000_encrypt_vendor_pii.sql
  - Admin‑only decrypt function + audit of access
- Payout arithmetic enforced
  - Migration: 20251018210100_add_payout_arithmetic_constraint.sql
- Override duplication blocked (budget abuse prevention)
  - Migration: 20251018210200_add_schedule_override_unique_constraint.sql
- Override budget race‑condition prevention (advisory locks)
  - Migration: 20251018210300_add_budget_advisory_lock.sql
- Availability cache invalidation on override/schedule/booking
  - Migration: 20251018210400_add_cache_invalidation_trigger.sql (+ Blueprint foundation)
- Booking engine conflict prevention (GiST range + locks)
  - Migrations: 20250923055000_create_booking_schema.sql, 20250923061500_create_booking_logic.sql
- TTL reservation cleanup (stale holds auto‑expire)
  - Migration: 20250923110000_auto_cleanup_expired_reservations.sql
- Payment replay prevention (gateway verification uniqueness)
  - Migration: 20250930073900_create_payment_verification_schema.sql (UNIQUE on provider, external_transaction_id)
- RLS on metrics, reviews, bookings, schedules, etc.
  - See: 20251007071500_create_metrics_schema.sql and Trust Engine migrations
- Admin self‑protection + assert_admin standardization
  - Migration: 20250117180000_fix_p0_admin_assertions.sql
- search_path pinning for critical functions; RPC lockdown to service_role
  - Migrations: 20250924132100_pin_search_paths_exact.sql, 20250919130300_lockdown_rpc_permissions.sql

These controls are the difference between a demo and an enterprise platform.
