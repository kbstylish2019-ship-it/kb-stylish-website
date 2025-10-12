VERSION 1:
[ARCHITECT'S BLUEPRINT v2.0 // THE GOVERNANCE ENGINE]
This is my definitive, production-grade architectural plan for the KB Stylish Live Vendor & Admin Dashboards. It is designed for maximum performance, ironclad security, and real-time data accuracy.
1. The Core Principle: Data Aggregation at the Source
Dashboards are data-heavy. Performing complex joins and aggregations in our application layer is inefficient and slow. We will offload this work to where it belongs: the database. All dashboard data will be served by a set of highly optimized, secure PostgreSQL functions. This is the only way to guarantee performance at scale.
2. The Database Logic: The Brains of the Operation
We will create two new, powerful PostgreSQL functions.
For the Vendor Dashboard (Real-time & Secure):
code
SQL
-- This function is SECURITY INVOKER, meaning it runs with the permissions of the calling user.
-- This automatically enforces our RLS policies, ensuring a vendor can ONLY see their own data.
CREATE OR REPLACE FUNCTION public.get_vendor_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_sales_cents', COALESCE(SUM(oi.total_price_cents), 0),
        'total_orders', COUNT(DISTINCT o.id),
        'pending_payout_cents', (SELECT public.get_vendor_balance(auth.uid())),
        'products_count', (SELECT COUNT(*) FROM public.products WHERE vendor_id = auth.uid())
    )
    INTO stats
    FROM public.orders o
    JOIN public.order_items oi ON o.id = oi.order_id
    WHERE oi.vendor_id = auth.uid();
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
For the Admin Dashboard (Powerful & Privileged):
code
SQL
-- This function is SECURITY DEFINER. It runs with the power of its owner (postgres).
-- This is necessary to bypass RLS and calculate platform-wide statistics.
-- Access to this function will be HEAVILY restricted.
CREATE OR REPLACE FUNCTION private.get_admin_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_revenue_cents', (SELECT COALESCE(SUM(amount_cents), 0) FROM private.journal_entries WHERE credit_account_id = (SELECT id FROM private.accounts WHERE name = 'Platform Commission')),
        'total_users', (SELECT COUNT(*) FROM auth.users),
        'total_vendors', (SELECT COUNT(*) FROM public.vendor_profiles),
        'total_orders', (SELECT COUNT(*) FROM public.orders)
    )
    INTO stats;
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
3. The API Layer: Secure, Role-Gated Edge Functions
We will create two new, lean Edge Functions. Their only job is to verify the user's role and call the appropriate database function.
get-vendor-dashboard: An Edge Function that verifies the user has a vendor role, then calls the public.get_vendor_dashboard_stats RPC.
get-admin-dashboard: An Edge Function that verifies the user has an admin role, then calls the private.get_admin_dashboard_stats RPC using a service-role client.
4. Frontend Integration: Performant Server Components
The VendorDashboard and AdminDashboard pages will be refactored into async Server Components. They will call new functions in our apiClient which, in turn, will securely fetch from our new Edge Functions. The data will be passed as props to our existing, beautiful client components (StatCard, OrdersTable, etc.). This is the most performant and secure pattern.
This architecture is secure, highly performant, and leverages the full power of our PostgreSQL database. It is, in my professional opinion, a 10/10.






--------------------------------------------------
REFINED VERSION(V 2.1):

Tri-Architectural Peer Review & Refinement Proposal
Total System Consciousness — What the live system shows
[functions present] No get_vendor_dashboard_stats or get_admin_dashboard_stats functions exist yet. Your blueprint is not deployed.
[schemas/tables] private schema exists, but no ledger/journal tables (no journal_entries, accounts) to back admin KPIs. Core commerce tables exist: public.orders (154 rows), public.order_items (144 rows), public.products (139 rows), public.vendor_profiles (3 rows). order_items.vendor_id is present (good).
[RLS helpers] public.user_has_role() exists (confirmed). Use it for DB-side enforcement.
[Edge Functions] Deployed: cart-manager, create-order-intent, order-worker, fulfill-order, verify-payment, plus Trust Engine functions. No dashboard Edge Functions deployed.
[Security Advisors]
WARN: several functions have mutable search_path (risk for SECURITY DEFINER).
WARN: pgjwt and btree_gist installed in public (supply-chain surface).
INFO: RLS enabled without policies on public.job_queue, public.webhook_events (not a leak, but enforce explicit stance).
[Frontend state]
src/app/vendor/dashboard/page.tsx
 and 
src/app/admin/dashboard/page.tsx
 use mock data and client components. No backend integration yet.
These facts ground the review that follows.

1) Security Architect
Where v2.0 can be abused
[SECURITY DEFINER blast radius] A single private.get_admin_dashboard_stats() as SECURITY DEFINER is a high-value target. Any routine that can EXECUTE it (even accidentally via a lax GRANT or a future function) can bypass RLS and exfiltrate platform-wide metrics.
[search_path hijack] Advisors already flag mutable search paths elsewhere. A DEFINER function with an unpinned search_path risks name-shadowing attacks (malicious objects injected into earlier schemas).
[edge-only gate is insufficient] Relying on “the Edge Function will check role” is not a complete control. Another developer could call the function from a different path or enable it via a migration GRANT. The database function itself must be self-defending.
[vendor INVOKER leakage] get_vendor_dashboard_stats() looks safe, but:
If it calls any SECURITY DEFINER helper (e.g., get_vendor_balance) it can hop permissions.
If it aggregates from tables with permissive policies or joins to an unrestricted helper view, counts can leak.
Hardening required (DB must be self-defending)
[enforce role in-db] First line of every privileged function:
PERFORM public.user_has_role(auth.uid(), 'admin'); IF NOT FOUND RAISE insufficient_privilege;
Optionally also verify JWT freshness: compare role_version in current_setting('request.jwt.claims') if exposed.
[pin search path] On every function:
SECURITY DEFINER SET search_path = private, public, pg_temp;
Or ALTER FUNCTION ... SET search_path = 'private, public, pg_temp';
[narrow the surface] Prefer multiple small, single-purpose SECURITY DEFINER functions (e.g., get_total_users(), get_total_orders()) over a single mega function. Least-privilege by scope.
[restrict EXECUTE]
REVOKE ALL ON FUNCTION private.get_admin_* FROM PUBLIC;
GRANT only to authenticated (and still gate by in-function check) or a dedicated role used by Edge Functions (still self-check user role from JWT).
[extensions out of public] Move pgjwt and other extensions to extensions schema; update code references.
[audit calls] Insert into user_audit_log when admin metrics are accessed, with auth.uid() and payload hash.
2) Performance Engineer
Why v2.0 collapses at scale
[full scans] Real-time SUM/COUNT(DISTINCT) directly over orders + order_items will not survive 10M+ rows. Even with indices, concurrent dashboard loads will create hotspots and cache thrash.
[cardinality traps] COUNT(DISTINCT order_id) on a wide fan-out is expensive. JSON-building inside the function adds CPU overhead.
[admin-wide scans] Platform-wide stats are far more expensive than vendor-scoped queries; doing them real-time will amplify latency under load.
Definitive, industry-standard solution
[incremental aggregates (event-driven)]
Maintain append-only “metrics” tables updated by triggers and/or the existing order-worker pipeline:
metrics.vendor_daily (vendor_id, day, orders, gmv_cents, refunds_cents, fees_cents, payouts_cents, pending_payout_cents, ...)
metrics.platform_daily (...)
Update rows incrementally on order lifecycle events (created → confirmed → refunded → paid out).
Idempotent upserts; OCC friendly.
[materialized views for charts]
REFRESH MATERIALIZED VIEW CONCURRENTLY on hourly cadence via pg_cron (already enabled). Query dashboards from MVs for time-series charts.
[realtime cache for “today”]
Keep a small metrics.vendor_realtime_cache for today’s counters (lightweight row per vendor+day). Merge with MV for display.
[indexing/partitioning]
BRIN on time columns for fact tables.
BTREE on (vendor_id, day) for aggregates.
Consider time+vendor partitioning if growth demands.
[OLAP escape hatch]
For long-horizon analytics or heavy slicing, stream changes (CDC) to an external OLAP (ClickHouse/BigQuery) for deep analytics, keeping Postgres for operational KPIs.
3) Data Architect
Separation vs unification
[unify the analytics backend] Build a single “metrics” layer that serves both vendor and admin. Differentiate access via RLS on vendor_id:
Vendor: USING (vendor_id = auth.uid()).
Admin: USING (public.user_has_role(auth.uid(), 'admin')) OR bypass via a guarded SECURITY DEFINER function that aggregates across all vendors.
[consistency: no nested SUM-of-SUMS at request time]
Your v2.0 calculates pending_payout_cents via a nested real-time SUM (get_vendor_balance). That’s a classic consistency and performance smell.
Replace with an event-sourced ledger (credits/debits) or incremented aggregates at state transitions. The dashboard reads precomputed totals.
[admin user counts]
Counting auth.users requires elevated permissions. Don’t piggyback admin mega-function for this. Create a small, self-defending DEFINER function: private.get_total_users().
Blueprint v2.1 — Fortress Architecture
A. Database schema (metrics layer)
[schemas] Create metrics schema.
[tables]
metrics.vendor_daily
Columns: vendor_id uuid, day date, orders int, gmv_cents bigint, refunds_cents bigint, platform_fees_cents bigint, payouts_cents bigint, pending_payout_cents bigint, updated_at timestamptz
PK (vendor_id, day). Index (vendor_id, day).
metrics.platform_daily
Columns mirroring vendor_daily (without vendor_id). PK day.
metrics.vendor_realtime_cache
Today’s counters per (vendor_id, date_trunc('day', now())). Fast upserts from workers.
[RLS]
ENABLE RLS on metrics.vendor_*.
Vendor policy: USING (vendor_id = auth.uid()).
Admin policy: USING (public.user_has_role(auth.uid(),'admin')).
Platform tables can be read via guarded DEFINER function, or grant read to admins via policy.
[triggers/pipeline]
On order_items and orders status transitions, enqueue jobs (you already have job_queue + order-worker).
Worker performs idempotent INSERT ... ON CONFLICT ... DO UPDATE to metrics tables adjusting counters.
B. Guard functions and privileges
[role assertion]
sql
CREATE OR REPLACE FUNCTION private.assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
END;
$$;
[vendor stats: INVOKER + RLS]
sql
CREATE OR REPLACE FUNCTION public.get_vendor_dashboard_stats_v2_1(v_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, metrics, pg_temp
AS $$
  WITH today AS (
    SELECT *
    FROM metrics.vendor_realtime_cache rc
    WHERE rc.vendor_id = v_id
  ), rollup AS (
    SELECT
      COALESCE(SUM(orders),0)            AS orders,
      COALESCE(SUM(gmv_cents),0)         AS gmv_cents,
      COALESCE(SUM(platform_fees_cents),0) AS platform_fees_cents,
      COALESCE(SUM(pending_payout_cents),0) AS pending_payout_cents
    FROM metrics.vendor_daily vd
    WHERE vd.vendor_id = v_id
      AND vd.day >= current_date - interval '30 days'
  )
  SELECT jsonb_build_object(
    'orders_30d', rollup.orders,
    'gmv_30d_cents', rollup.gmv_cents,
    'fees_30d_cents', rollup.platform_fees_cents,
    'pending_payout_cents', rollup.pending_payout_cents,
    'today', to_jsonb(today.*)
  )
  FROM rollup
  LEFT JOIN today ON true;
$$;
[admin stats: DEFINER + self-defense]
sql
CREATE OR REPLACE FUNCTION private.get_admin_dashboard_stats_v2_1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, metrics, public, pg_temp
AS $$
DECLARE
  stats jsonb;
  total_users bigint;
  platform_30d record;
BEGIN
  PERFORM private.assert_admin();

  SELECT COUNT(*) INTO total_users FROM auth.users;

  SELECT
    COALESCE(SUM(orders),0)            AS orders,
    COALESCE(SUM(gmv_cents),0)         AS gmv_cents,
    COALESCE(SUM(platform_fees_cents),0) AS platform_fees_cents,
    COALESCE(SUM(pending_payout_cents),0) AS pending_payout_cents
  INTO platform_30d
  FROM metrics.platform_daily
  WHERE day >= current_date - interval '30 days';

  stats := jsonb_build_object(
    'total_users', total_users,
    'orders_30d', platform_30d.orders,
    'gmv_30d_cents', platform_30d.gmv_cents,
    'fees_30d_cents', platform_30d.platform_fees_cents,
    'pending_payout_cents', platform_30d.pending_payout_cents
  );
  RETURN stats;
END;
$$;

REVOKE ALL ON FUNCTION private.get_admin_dashboard_stats_v2_1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_admin_dashboard_stats_v2_1() TO authenticated;
[search_path policy] Apply SET search_path on all functions (advisor warnings show this matters).
C. Edge Functions (lean, role-gated proxies)
[vendor-dashboard] verify_jwt: true. Use user client (Authorization header in global context). Call rpc('get_vendor_dashboard_stats_v2_1'). No service key required.
[admin-dashboard] verify_jwt: true. Use service client only to call the DEFINER function. Extract auth.uid() from Authorization, log audit, call private.get_admin_dashboard_stats_v2_1(). The function self-rejects non-admins.
[rate-limit + audit] Add basic rate limiting and insert a row to user_audit_log with purpose=“admin_dashboard_view”.
D. Frontend integration
[server components] Convert 
src/app/vendor/dashboard/page.tsx
 and 
src/app/admin/dashboard/page.tsx
 to async Server Components that call the two Edge Functions and pass data to existing client UI (StatCard, OrdersTable).
[revalidation] next cache with short revalidate (e.g., 30–60s) for admin charts; vendor tiles can be fresher by merging realtime cache + recent aggregates.
Hardening Checklist
[extensions] Move pgjwt and btree_gist out of public to extensions.
[function search_path] Pin on all SECURITY DEFINER functions (advisor flagged).
[EXECUTE privileges] Revoke from PUBLIC, grant minimally; keep DB-side role checks.
[RLS policies] Ensure metrics tables have explicit policies for vendor/admin as above.
[advisors] Re-run security advisors post-migration and fix any residual warnings.
Migration & Deployment Plan
[Phase 1: Schema] Create metrics schema + tables + indexes.
[Phase 2: Backfill] Backfill last 90 days from orders/order_items into vendor_daily and platform_daily. Validate counts.
[Phase 3: Pipelines] Add worker updates on order lifecycle (you already run order-worker). Idempotent upserts.
[Phase 4: Functions] Create assert_admin, get_vendor_dashboard_stats_v2_1, get_admin_dashboard_stats_v2_1; set search_path; apply GRANT/REVOKE.
[Phase 5: Edge] Deploy vendor-dashboard and admin-dashboard with verify_jwt: true, dual-client pattern for admin.
[Phase 6: Frontend] Switch pages to Server Components hitting the Edge Functions.
[Phase 7: Observability] Add logs/metrics; set pg_cron REFRESH schedule for MVs if used.
Testing & Observability
[security tests]
Non-admin calling admin Edge Function → 403.
Direct SQL call to private.get_admin_dashboard_stats_v2_1() by authenticated non-admin → raises 42501.
Vendor can only see own metrics rows via RLS.
[correctness tests]
Transition order statuses and verify metrics increment/decrement as expected.
Re-run job idempotently (retries) → no double counting.
[performance tests]
Load test dashboard endpoints at 100–500 RPS: ensure p95 < 100ms with aggregates.
[advisors] Rerun get_advisors(security) until clean. Ensure all new functions show pinned search_path.
Potential Breaking Points & Mitigations
[late-arriving events] Reconciler job scans recent window (e.g., 48h) and re-derives aggregates to correct drift.
[schema evolution] Version metrics tables; support additive columns via nullable defaults; backfill in jobs.
[admin user count] If access to auth.users changes, keep get_total_users() as a separate narrowly scoped DEFINER function.
Conclusion
Security: v2.0 centralizes admin power in a single DEFINER function guarded only by Edge role-checks — not sufficient. v2.1 adds DB self-defense, least-privilege, pinned search_path, and auditing.
Performance: v2.0 real-time SUM/COUNT scans won’t scale. v2.1 shifts to incremental aggregates, MVs, and a realtime cache, keeping p95 low at 10M+ orders.
Data: v2.0 mixes compute-on-read across multiple helpers. v2.1 unifies the analytics layer with RLS-aware aggregates serving both vendor and admin cleanly.
If you want, I can draft the exact SQL migrations and two Edge Functions next, then propose the minimal React changes to 
src/app/vendor/dashboard/page.tsx
 and 
src/app/admin/dashboard/page.tsx
 to switch them from mocks to live