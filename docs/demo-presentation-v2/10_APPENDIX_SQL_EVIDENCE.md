# Appendix — SQL/Code Evidence Map

Security & Integrity
- Encryption of vendor PII: supabase/migrations/20251018210000_encrypt_vendor_pii.sql
- Payout arithmetic check: 20251018210100_add_payout_arithmetic_constraint.sql
- Override duplicate prevention: 20251018210200_add_schedule_override_unique_constraint.sql
- Advisory lock on override budget: 20251018210300_add_budget_advisory_lock.sql
- Cache invalidation on override: 20251018210400_add_cache_invalidation_trigger.sql
- Payment replay prevention: 20250930073900_create_payment_verification_schema.sql
- Admin assert standardization: 20250117180000_fix_p0_admin_assertions.sql
- search_path pinned: 20250924132100_pin_search_paths_exact.sql
- RPC lockdown to service_role: 20250919130300_lockdown_rpc_permissions.sql

Booking Engine
- Schema (GiST range, policies): 20250923055000_create_booking_schema.sql
- Logic (slot generation, advisory locks): 20250923061500_create_booking_logic.sql
- TTL cleanup: 20250923110000_auto_cleanup_expired_reservations.sql
- Unified availability function (final): 20250924131500_hotfix_booking_slot_logic_final.sql

Trust Engine
- Schema (reviews, votes, replies, flags): 20250925082200_create_trust_engine_schema.sql
- Secure review submission: 20250925093000_trust_engine_review_submission.sql
- Sharded voting + reconciliation: 20250925093100_trust_engine_voting_system.sql
- Rating aggregation + jobs: 20250925093200_trust_engine_rating_aggregation.sql

Performance & Caching
- Metrics schema (vendor_daily/platform_daily): 20251007071500_create_metrics_schema.sql
- Realtime metrics logic (idempotent re‑aggregation): 20251007083000_create_realtime_metrics_logic.sql
- Trending + recommendations: 20251017120100/120400_create_*trending*.sql

Media/Uploads (cost controls)
- Avatar API & image limits/optimization: src/app/api/upload/avatar/route.ts, src/lib/utils/imageOptimization.ts

Use this index live if the client asks “how do you know?” → click and show.
