# KB Stylish – Governance Engine Runbook (Single-File Onboarding)

This runbook documents the Governance Engine only: the analytics dashboards (Vendor/Admin), their security model, database functions, metrics pipeline, operational playbooks, testing, and known issues. It is designed so a new developer can continue in a fresh chat without losing context.


## Scope
- Governance Engine dashboards: Vendor and Admin analytics.
- Edge Function API gateway (deployed) and database RPCs.
- Metrics aggregation pipeline and scheduler.
- Security and RLS posture specific to Governance.
- Operational commands, verification, troubleshooting, and known issues.


## High-Level Architecture
```mermaid
flowchart TD
  A[Client Browser] -->|JWT cookie| B[Next.js Server (SSR)]
  B -->|getUser() / JWT| C[API Client (server-side fetch)]
  C -->|Authorization: Bearer <JWT>| D[Edge Functions: vendor-dashboard / admin-dashboard]
  D -->|verifyUser + roles| E[Database RPC]
  E -->|RLS / assert_admin()| F[(Postgres: metrics, orders, roles)]
  F -->|aggregates JSON| D --> C --> B --> A

  subgraph Metrics Pipeline
    G[order-worker / app writes] --> H[private.enqueue_metrics_update(day,vendor_id)]
    I[pg_cron: */5 min] --> J[private.process_metrics_update_queue(batch)]
    J --> K[metrics.vendor_daily]
    J --> L[metrics.platform_daily]
  end
```


## Components Overview
- **[Edge Functions]**
  - `vendor-dashboard` (SECURITY INVOKER RPC path via user JWT)
  - `admin-dashboard` (SECURITY DEFINER RPC path; admin-only)
  - Note: Source is deployed to Supabase. Endpoints are live under `/functions/v1/*`.
- **[Database RPCs]**
  - `public.get_vendor_dashboard_stats_v2_1(v_id uuid DEFAULT auth.uid())`
    - SECURITY INVOKER. Relies on RLS and `auth.uid()` from the caller’s JWT.
  - `private.get_admin_dashboard_stats_v2_1()`
    - SECURITY DEFINER. Performs `assert_admin()` internally for defense-in-depth.
- **[Metrics Aggregation]**
  - Queue-based, deduplicated daily updates with admin-gated worker.
  - Tables: `metrics.vendor_daily`, `metrics.platform_daily`.
  - Functions: `private.enqueue_metrics_update(day, vendor_id)`, `private.process_metrics_update_queue(batch_size)`.
  - Cron: `metrics_queue_processor` every 5 minutes.
- **[Frontend Integration]**
  - Pages: `src/app/vendor/dashboard/page.tsx`, `src/app/admin/dashboard/page.tsx` (async Server Components).
  - Fetch layer: `src/lib/apiClient.ts` calls Edge Functions with `Authorization` header.


## Security Model
- **Authentication**
  - SSR uses Supabase `getUser()` (server-side) to obtain the verified JWT.
  - API calls include `Authorization: Bearer <JWT>` from SSR context.
- **Authorization**
  - Vendor dashboard: SECURITY INVOKER RPC + RLS. Only data for `auth.uid()`.
  - Admin dashboard: Edge Function verifies `admin` role; DB function re-verifies via `assert_admin()`.
- **Defense-in-Depth**
  - Edge role checks + JWT propagation to DB.
  - RLS for vendor paths; admin-only DB function guards.
  - SECURITY DEFINER functions in general should pin `search_path`.


## Data Flow (End-to-End)
1. User opens dashboard.
2. SSR retrieves user via Supabase server client and extracts JWT.
3. Server calls Edge Function endpoint with `Authorization` header.
4. Edge Function verifies JWT and roles, then calls the correct RPC:
   - Vendor: user client (JWT flows to Postgres) → `get_vendor_dashboard_stats_v2_1` (INVOCER + RLS).
   - Admin: service client with caller’s JWT context (or user client) → `get_admin_dashboard_stats_v2_1` (DEFINER + `assert_admin()`).
5. RPC aggregates metrics from `metrics.*` and returns JSON for rendering.


## Database Changes (Governance Engine)
- **Phase 1: Critical Security Fixes**
  - Admin Edge Function JWT propagation fixed (now DB sees `auth.uid()` correctly).
  - RLS policy drift remediated for sensitive tables (admin-only).
  - File: `supabase/migrations/20251007201500_fix_rls_policy_drift.sql`.

- **Phase 2: Architectural Hardening**
  - Introduced dedupe/coalescing queue for metrics recompute:
    - Table: `private.metrics_update_queue` (status, attempts, last_error, unique by day+vendor_id).
    - Functions:
      - `private.enqueue_metrics_update(day date, vendor_id uuid)`
      - `private.process_metrics_update_queue(batch_size int)` with `FOR UPDATE SKIP LOCKED`.
      - `private.update_metrics_on_order_completion(order_id uuid)` refactored to enqueue.
    - Unified commission logic: `metrics.platform_daily.platform_fees_cents` now equals the sum of per-vendor commissions for the day.
  - File: `supabase/migrations/20251008193900_phase2_architectural_hardening.sql`.

- **Phase 2 (Scheduling)**
  - pg_cron job to process queue every 5 minutes:
    - Job: `metrics_queue_processor`
    - Schedule: `*/5 * * * *`
    - Command: `select private.process_metrics_update_queue(50);`
  - File: `supabase/migrations/20251008203900_phase2_cron_schedule_metrics_queue.sql`.

- **Phase 3: Security & Performance Polish**
  - Added covering indexes for advisor-flagged FKs (e.g., `product_images.product_id`, `review_flags.reporter_user_id`, `user_roles.role_id`, etc.).
  - Pinned `search_path` on several SECURITY DEFINER functions for shadowing protection (platform-wide hardening).
  - File: `supabase/migrations/20251008195800_phase3_search_path_and_indexes.sql`.


## Edge Functions (Deployed)
- `vendor-dashboard`
  - Accepts JWT in `Authorization` header.
  - Uses a user client (global headers carry JWT) to call `public.get_vendor_dashboard_stats_v2_1()`.
  - RLS ensures the vendor only sees their own data.

- `admin-dashboard`
  - Verifies `admin` role at edge.
  - Calls `private.get_admin_dashboard_stats_v2_1()` with caller JWT context so `auth.uid()` resolves.
  - `assert_admin()` inside DB function is the final guard.

> Note: The Edge Function source is deployed to Supabase (not present locally). See the documentation files below for deployment details and manual test commands.


## Frontend Integration
- **Vendor Dashboard**: `src/app/vendor/dashboard/page.tsx`
  - Async Server Component.
  - Uses SSR `getUser()` to obtain JWT.
  - Calls `fetchVendorDashboardStats(accessToken, vendorId?)` from `src/lib/apiClient.ts`.
  - Renders live metrics; client components handle interactivity.

- **Admin Dashboard**: `src/app/admin/dashboard/page.tsx`
  - Async Server Component.
  - SSR `getUser()` + role check (`admin`) before fetching.
  - Calls `fetchAdminDashboardStats(accessToken)`.

- **API Client**: `src/lib/apiClient.ts`
  - Exposes governance fetchers to Edge Functions.
  - Uses `noStore` (or `cache: 'no-store'`) for freshness and includes `Authorization` header.


## Operations
- **Manual queue process (on-demand)**
  - Edge Function `metrics-worker` (admin-gated):
    - `GET /functions/v1/metrics-worker?batch_size=25`
    - Headers: `Authorization: Bearer <admin JWT>`
- **Enqueue explicitly**
  - `select private.enqueue_metrics_update(current_date, null);`           — platform day task
  - `select private.enqueue_metrics_update(current_date, '<vendor-uuid>');` — vendor day task
- **Monitor**
  - Queue status: `select status, count(*) from private.metrics_update_queue group by status;`
  - Failures: `select id, day, vendor_id, last_error from private.metrics_update_queue where status='failed' order by updated_at desc limit 50;`
  - Reconciliation: Compare `sum(vendor_fees)` vs `platform_fees` for a day.


## Verification & Testing
- **Manual scenarios (subset)**
  - Vendor unauthenticated → 401 from `vendor-dashboard`.
  - Vendor authenticated → 200 with data for `auth.uid()` only.
  - Admin non-admin access → 403 from `admin-dashboard`.
  - Admin authenticated → 200 with platform aggregates.
  - Data freshness → recent orders reflected after cron (≤5 min) or manual worker run.
- **Seed / Test Users**
  - Test accounts created for dashboards:
    - Admin: `admin.trust@kbstylish.test` / `KBStylish!Admin2025`
    - Vendor: `vendor.demo@kbstylish.test` / `KBStylish!Vendor2025`
  - Profiles exist in `public.user_profiles` with display names and usernames.


## Known Issues & Follow‑ups (Governance Only)
- **Edge source not in repo**
  - Admin/Vendor Edge Functions are deployed but not versioned in this repo. Recommendation: check functions into `supabase/functions/` for local review and CI.
- **SECURITY DEFINER search_path (governance-specific)**
  - Ensure `private.get_admin_dashboard_stats_v2_1()` explicitly sets `search_path` in its definition during next DB function edit.
- **Observability**
  - Add structured logs in Edge Functions (request id, user id, latency). Add DB logs for RPC starts/ends.
- **Vendor orders table on UI**
  - Orders list on Vendor UI may still use mock; wire it to a live query in a follow-up ticket.


## Troubleshooting
- **Admin dashboard shows auth errors**
  - Likely missing JWT propagation to DB context. Confirm the Edge Function sends the user’s JWT in headers (or uses user client) when calling the admin RPC.
- **No metrics update**
  - Check `private.metrics_update_queue` for failed tasks and `cron.job` for `metrics_queue_processor`.
- **Vendor sees no data**
  - Confirm test vendor has at least some orders in the dataset. If not, verify query behavior for zero-activity states.


## Documentation Index (Governance)
- `docs/GOVERNANCE_EDGE_FUNCTIONS_DEPLOYMENT_REPORT.md`
- `docs/GOVERNANCE_FRONTEND_TESTING_PROTOCOL.md`
- `docs/GOVERNANCE_PHASE_6_COMPLETION_REPORT.md`
- `docs/GOVERNANCE_BACKFILL_DEPLOYMENT_REPORT.md`
- `docs/GOVERNANCE_FOUNDATION_DEPLOYMENT_REPORT.md`
- `docs/GOVERNANCE_LOGIC_DEPLOYMENT_REPORT.md`
- `docs/GOVERNANCE_REALTIME_INTEGRATION_REPORT.md`
- `docs/GOVERNANCE_REALTIME_TEST_RESULTS.md`
- `docs/LIVE_DASHBOARD_INTEGRATION_PLAN.md`


## Change Log (Key Files)
- Migrations
  - `supabase/migrations/20251007201500_fix_rls_policy_drift.sql`
  - `supabase/migrations/20251008193900_phase2_architectural_hardening.sql`
  - `supabase/migrations/20251008195800_phase3_search_path_and_indexes.sql`
  - `supabase/migrations/20251008203900_phase2_cron_schedule_metrics_queue.sql`
- Scripts (enablement)
  - `supabase/scripts/admin_setup.ts` (create/update admin/vendor users)
  - `supabase/scripts/seed_reviews.sql` (review data; optional for Trust UI)
- Frontend
  - `src/app/vendor/dashboard/page.tsx` (Server Component)
  - `src/app/admin/dashboard/page.tsx` (Server Component)
  - `src/lib/apiClient.ts` (Edge Function fetchers)


## Appendix: SQL/Commands Reference
- **Queue health**
  ```sql
  select status, count(*)
  from private.metrics_update_queue
  group by status;
  ```
- **Enqueue today**
  ```sql
  select private.enqueue_metrics_update(current_date, null);
  ```
- **Process batch (manual)**
  ```sql
  select private.process_metrics_update_queue(50);
  ```
- **Cron job check**
  ```sql
  select jobid, jobname, schedule, command, active
  from cron.job
  where jobname = 'metrics_queue_processor';
  ```


---

This document is the single source of truth for the Governance Engine. If you find drift between live and local, record it here and create a migration or doc PR to reconcile.
