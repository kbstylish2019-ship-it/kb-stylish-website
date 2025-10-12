-- =====================================================================
-- GOVERNANCE ENGINE FOUNDATION - METRICS SCHEMA
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1
-- Purpose: Event-driven aggregation layer for vendor and admin dashboards
-- Security: Zero-trust RLS with defense-in-depth
-- Performance: Incremental aggregates, BRIN indexes, idempotent upserts
-- =====================================================================

-- =====================================================================
-- SECTION 1: SCHEMA CREATION
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS metrics;
COMMENT ON SCHEMA metrics IS 'Event-driven aggregation layer for vendor and platform dashboards. Updated incrementally by order-worker pipeline.';

-- =====================================================================
-- SECTION 2: METRICS TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vendor Daily Metrics: Per-vendor daily aggregates
-- ---------------------------------------------------------------------
CREATE TABLE metrics.vendor_daily (
    vendor_id uuid NOT NULL REFERENCES public.vendor_profiles(user_id) ON DELETE CASCADE,
    day date NOT NULL,
    orders integer NOT NULL DEFAULT 0,
    gmv_cents bigint NOT NULL DEFAULT 0,
    refunds_cents bigint NOT NULL DEFAULT 0,
    platform_fees_cents bigint NOT NULL DEFAULT 0,
    payouts_cents bigint NOT NULL DEFAULT 0,
    pending_payout_cents bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    PRIMARY KEY (vendor_id, day),
    CONSTRAINT vendor_daily_day_not_future CHECK (day <= CURRENT_DATE)
);

CREATE INDEX idx_vendor_daily_vendor_day ON metrics.vendor_daily(vendor_id, day DESC);
CREATE INDEX idx_vendor_daily_day_brin ON metrics.vendor_daily USING BRIN(day);

COMMENT ON TABLE metrics.vendor_daily IS 'Daily aggregated metrics per vendor. Updated incrementally by order lifecycle events. Primary key (vendor_id, day) enables idempotent UPSERT operations.';
COMMENT ON COLUMN metrics.vendor_daily.gmv_cents IS 'Gross Merchandise Value: sum(order_items.total_price_cents) for this vendor on this day.';
COMMENT ON COLUMN metrics.vendor_daily.pending_payout_cents IS 'GMV minus fees minus already paid out amounts. Updated when payout state changes.';
COMMENT ON COLUMN metrics.vendor_daily.platform_fees_cents IS 'Platform commission calculated from vendor GMV.';
COMMENT ON COLUMN metrics.vendor_daily.refunds_cents IS 'Total refunded amount for this vendor on this day.';
COMMENT ON COLUMN metrics.vendor_daily.payouts_cents IS 'Total amount paid out to vendor on this day.';

-- ---------------------------------------------------------------------
-- Platform Daily Metrics: Platform-wide daily aggregates
-- ---------------------------------------------------------------------
CREATE TABLE metrics.platform_daily (
    day date NOT NULL PRIMARY KEY,
    orders integer NOT NULL DEFAULT 0,
    gmv_cents bigint NOT NULL DEFAULT 0,
    refunds_cents bigint NOT NULL DEFAULT 0,
    platform_fees_cents bigint NOT NULL DEFAULT 0,
    payouts_cents bigint NOT NULL DEFAULT 0,
    pending_payout_cents bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT platform_daily_day_not_future CHECK (day <= CURRENT_DATE)
);

CREATE INDEX idx_platform_daily_day_brin ON metrics.platform_daily USING BRIN(day);

COMMENT ON TABLE metrics.platform_daily IS 'Platform-wide daily aggregates. Rolled up from vendor_daily. Serves admin dashboard.';
COMMENT ON COLUMN metrics.platform_daily.gmv_cents IS 'Total platform GMV across all vendors for this day.';
COMMENT ON COLUMN metrics.platform_daily.platform_fees_cents IS 'Total platform commission revenue for this day.';

-- ---------------------------------------------------------------------
-- Vendor Realtime Cache: Hot cache for today's metrics
-- ---------------------------------------------------------------------
CREATE TABLE metrics.vendor_realtime_cache (
    vendor_id uuid NOT NULL REFERENCES public.vendor_profiles(user_id) ON DELETE CASCADE,
    cache_date date NOT NULL DEFAULT CURRENT_DATE,
    orders integer NOT NULL DEFAULT 0,
    gmv_cents bigint NOT NULL DEFAULT 0,
    refunds_cents bigint NOT NULL DEFAULT 0,
    platform_fees_cents bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    PRIMARY KEY (vendor_id, cache_date),
    CONSTRAINT realtime_cache_today_only CHECK (cache_date = CURRENT_DATE)
);

CREATE INDEX idx_realtime_cache_vendor ON metrics.vendor_realtime_cache(vendor_id);

COMMENT ON TABLE metrics.vendor_realtime_cache IS 'Hot cache for today metrics. Merged with vendor_daily historical data for dashboard display. Lightweight, fast upserts.';
COMMENT ON COLUMN metrics.vendor_realtime_cache.cache_date IS 'Always CURRENT_DATE. Enforced by CHECK constraint for data integrity.';

-- =====================================================================
-- SECTION 3: ROW LEVEL SECURITY
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable RLS on all metrics tables
-- ---------------------------------------------------------------------
ALTER TABLE metrics.vendor_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics.platform_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics.vendor_realtime_cache ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Vendor Access Policies: Vendors can only see their own metrics
-- ---------------------------------------------------------------------
CREATE POLICY vendor_daily_vendor_access 
ON metrics.vendor_daily
FOR SELECT
TO authenticated
USING (vendor_id = auth.uid());

COMMENT ON POLICY vendor_daily_vendor_access ON metrics.vendor_daily IS 'Vendors can only SELECT their own daily metrics. Enforces data isolation at DB level.';

CREATE POLICY vendor_realtime_vendor_access 
ON metrics.vendor_realtime_cache
FOR SELECT
TO authenticated
USING (vendor_id = auth.uid());

COMMENT ON POLICY vendor_realtime_vendor_access ON metrics.vendor_realtime_cache IS 'Vendors can only SELECT their own realtime cache. Prevents cross-vendor data leakage.';

-- ---------------------------------------------------------------------
-- Admin Access Policies: Admins can see all metrics
-- ---------------------------------------------------------------------
CREATE POLICY vendor_daily_admin_access 
ON metrics.vendor_daily
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON POLICY vendor_daily_admin_access ON metrics.vendor_daily IS 'Admins with admin role can SELECT all vendor metrics for platform oversight.';

CREATE POLICY vendor_realtime_admin_access 
ON metrics.vendor_realtime_cache
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON POLICY vendor_realtime_admin_access ON metrics.vendor_realtime_cache IS 'Admins can view all vendor realtime metrics for platform monitoring.';

CREATE POLICY platform_daily_admin_access 
ON metrics.platform_daily
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON POLICY platform_daily_admin_access ON metrics.platform_daily IS 'Only admins can view platform-wide aggregates. Self-defending via user_has_role check.';

-- ---------------------------------------------------------------------
-- Service Role Write Policies: Only service_role can write
-- ---------------------------------------------------------------------
CREATE POLICY vendor_daily_service_write 
ON metrics.vendor_daily
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON POLICY vendor_daily_service_write ON metrics.vendor_daily IS 'Only service_role (order-worker) can INSERT/UPDATE metrics. Prevents user tampering.';

CREATE POLICY platform_daily_service_write 
ON metrics.platform_daily
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON POLICY platform_daily_service_write ON metrics.platform_daily IS 'Only service_role can write platform metrics via order-worker pipeline.';

CREATE POLICY vendor_realtime_service_write 
ON metrics.vendor_realtime_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON POLICY vendor_realtime_service_write ON metrics.vendor_realtime_cache IS 'Only service_role can update realtime cache. Maintains data integrity.';

-- =====================================================================
-- SECTION 4: GRANTS
-- =====================================================================

-- Grant schema usage to authenticated users for reading
GRANT USAGE ON SCHEMA metrics TO authenticated;

-- Grant SELECT on all tables to authenticated (RLS enforces access)
GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO authenticated;

-- Service role already has full access via SUPERUSER-like privileges

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Schema: metrics (created)
-- Tables: vendor_daily, platform_daily, vendor_realtime_cache (created)
-- RLS: Enabled on all tables with 9 policies (vendor, admin, service_role)
-- Indexes: 5 indexes created (BTREE + BRIN for time-series)
-- Foreign Keys: 2 FK constraints to vendor_profiles (CASCADE delete)
-- =====================================================================
