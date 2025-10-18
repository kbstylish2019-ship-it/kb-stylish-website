-- ============================================================================
-- GOVERNANCE ENGINE PHASE 2: COMPLETE METRICS BACKFILL & RECONCILIATION
-- ============================================================================
-- Date: 2025-10-12
-- Purpose: 
--   1. Backfill all historical vendor metrics (last 90 days)
--   2. Backfill all historical platform metrics (last 90 days)
--   3. Create reconciliation function for nightly drift correction
--   4. Schedule reconciliation job via pg_cron
--   5. Update realtime cache for all vendors
-- 
-- Security: All functions are SECURITY DEFINER with proper search_path pinning
-- Performance: Uses idempotent UPSERT pattern, handles zero-order days
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Backfill Vendor Daily Metrics (Last 90 Days)
-- ============================================================================
-- This will populate metrics for all vendors, including those with zero orders

DO $$
DECLARE
    v_vendor record;
    v_day date;
    v_start_date date := CURRENT_DATE - INTERVAL '90 days';
BEGIN
    RAISE NOTICE 'Starting vendor metrics backfill from % to %', v_start_date, CURRENT_DATE;
    
    -- Loop through each vendor
    FOR v_vendor IN SELECT user_id, business_name FROM public.vendor_profiles
    LOOP
        RAISE NOTICE 'Processing vendor: % (%)', v_vendor.business_name, v_vendor.user_id;
        
        -- Loop through each day in the range
        v_day := v_start_date;
        WHILE v_day <= CURRENT_DATE LOOP
            -- Call the fixed update function (handles zero-order days)
            PERFORM private.update_vendor_metrics_for_day(v_day, v_vendor.user_id);
            v_day := v_day + INTERVAL '1 day';
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Vendor metrics backfill complete';
END $$;

-- ============================================================================
-- STEP 2: Backfill Platform Daily Metrics (Last 90 Days)
-- ============================================================================
-- This aggregates platform-wide stats from all orders

DO $$
DECLARE
    v_day date;
    v_start_date date := CURRENT_DATE - INTERVAL '90 days';
    v_days_processed integer := 0;
BEGIN
    RAISE NOTICE 'Starting platform metrics backfill from % to %', v_start_date, CURRENT_DATE;
    
    v_day := v_start_date;
    WHILE v_day <= CURRENT_DATE LOOP
        -- Call the fixed update function (handles zero-order days)
        PERFORM private.update_platform_metrics_for_day(v_day);
        v_days_processed := v_days_processed + 1;
        v_day := v_day + INTERVAL '1 day';
    END LOOP;
    
    RAISE NOTICE 'Platform metrics backfill complete: % days processed', v_days_processed;
END $$;

-- ============================================================================
-- STEP 3: Create Reconciliation Function (Self-Healing Mechanism)
-- ============================================================================
-- This function re-derives metrics for the last 48 hours to fix any drift
-- from late-arriving events, failed updates, or race conditions

CREATE OR REPLACE FUNCTION private.reconcile_metrics_last_48h()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, metrics, public, pg_temp
AS $$
DECLARE
    v_start_date date;
    v_day date;
    v_vendor record;
    v_days_reconciled integer := 0;
    v_vendors_reconciled integer := 0;
    v_result jsonb;
BEGIN
    -- Calculate reconciliation window (last 48 hours)
    v_start_date := CURRENT_DATE - INTERVAL '2 days';
    
    RAISE NOTICE '[reconcile_metrics] Starting reconciliation from % to %', v_start_date, CURRENT_DATE;
    
    -- Reconcile platform metrics
    v_day := v_start_date;
    WHILE v_day <= CURRENT_DATE LOOP
        PERFORM private.update_platform_metrics_for_day(v_day);
        v_days_reconciled := v_days_reconciled + 1;
        v_day := v_day + INTERVAL '1 day';
    END LOOP;
    
    -- Reconcile vendor metrics for each vendor
    FOR v_vendor IN SELECT user_id FROM public.vendor_profiles
    LOOP
        v_day := v_start_date;
        WHILE v_day <= CURRENT_DATE LOOP
            PERFORM private.update_vendor_metrics_for_day(v_day, v_vendor.user_id);
            v_day := v_day + INTERVAL '1 day';
        END LOOP;
        v_vendors_reconciled := v_vendors_reconciled + 1;
    END LOOP;
    
    -- Update realtime cache for all vendors
    FOR v_vendor IN SELECT user_id FROM public.vendor_profiles
    LOOP
        PERFORM private.update_vendor_realtime_cache(v_vendor.user_id);
    END LOOP;
    
    -- Build result JSON
    v_result := jsonb_build_object(
        'success', true,
        'reconciliation_window', jsonb_build_object(
            'start_date', v_start_date,
            'end_date', CURRENT_DATE
        ),
        'stats', jsonb_build_object(
            'days_reconciled', v_days_reconciled,
            'vendors_reconciled', v_vendors_reconciled
        ),
        'timestamp', now()
    );
    
    RAISE NOTICE '[reconcile_metrics] Complete: % days × % vendors reconciled', v_days_reconciled, v_vendors_reconciled;
    
    RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users (for manual triggers)
GRANT EXECUTE ON FUNCTION private.reconcile_metrics_last_48h() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION private.reconcile_metrics_last_48h() IS 
'Reconciliation function that re-derives metrics for the last 48 hours to fix drift from late-arriving events or failed updates. Safe to run multiple times (idempotent). Scheduled to run nightly at 2 AM UTC.';

-- ============================================================================
-- STEP 4: Schedule Nightly Reconciliation Job via pg_cron
-- ============================================================================
-- Runs every day at 2:00 AM UTC (low traffic period)

-- First, ensure pg_cron extension is enabled (it should already be from previous migrations)
-- SELECT cron.schedule(...) will fail gracefully if already scheduled

-- Unschedule any existing reconciliation jobs (cleanup)
DO $$
BEGIN
    -- Remove old reconciliation jobs if they exist
    PERFORM cron.unschedule(job_id)
    FROM cron.job
    WHERE jobname IN ('reconcile-metrics', 'reconcile-metrics-nightly');
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'No existing reconciliation jobs to remove';
END $$;

-- Schedule new reconciliation job
DO $schedule_job$
DECLARE
    v_job_id bigint;
BEGIN
    SELECT cron.schedule(
        'reconcile-metrics-nightly',      -- Job name
        '0 2 * * *',                       -- Cron expression: Every day at 2:00 AM UTC
        $cron_sql$SELECT private.reconcile_metrics_last_48h();$cron_sql$
    ) INTO v_job_id;
    
    RAISE NOTICE 'Scheduled reconcile-metrics-nightly cron job (ID: %) to run at 2 AM UTC daily', v_job_id;
END $schedule_job$;

-- ============================================================================
-- STEP 5: Update Realtime Cache for All Vendors (Today)
-- ============================================================================
-- Ensures today's metrics are fresh in the realtime cache

DO $$
DECLARE
    v_vendor record;
    v_count integer := 0;
BEGIN
    RAISE NOTICE 'Updating realtime cache for all vendors';
    
    FOR v_vendor IN SELECT user_id, business_name FROM public.vendor_profiles
    LOOP
        PERFORM private.update_vendor_realtime_cache(v_vendor.user_id);
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Realtime cache updated for % vendors', v_count;
END $$;

-- ============================================================================
-- STEP 6: Verification Queries (Post-Migration Validation)
-- ============================================================================
-- These queries verify the backfill was successful

DO $$
DECLARE
    v_platform_count integer;
    v_vendor_count integer;
    v_cache_count integer;
    v_vendor_rows integer;
BEGIN
    -- Count platform_daily rows
    SELECT COUNT(*) INTO v_platform_count FROM metrics.platform_daily;
    RAISE NOTICE 'Platform daily metrics: % rows', v_platform_count;
    
    -- Count vendor_daily rows
    SELECT COUNT(*) INTO v_vendor_rows FROM metrics.vendor_daily;
    RAISE NOTICE 'Vendor daily metrics: % rows', v_vendor_rows;
    
    -- Count unique vendors with metrics
    SELECT COUNT(DISTINCT vendor_id) INTO v_vendor_count FROM metrics.vendor_daily;
    RAISE NOTICE 'Unique vendors with metrics: %', v_vendor_count;
    
    -- Count realtime cache entries
    SELECT COUNT(*) INTO v_cache_count FROM metrics.vendor_realtime_cache;
    RAISE NOTICE 'Realtime cache entries: %', v_cache_count;
    
    -- Validation checks
    IF v_platform_count < 90 THEN
        RAISE WARNING 'Expected at least 90 platform_daily rows, found %', v_platform_count;
    END IF;
    
    IF v_vendor_count < 4 THEN
        RAISE WARNING 'Expected 4 vendors with metrics, found %', v_vendor_count;
    END IF;
    
    IF v_cache_count < 4 THEN
        RAISE WARNING 'Expected 4 realtime cache entries, found %', v_cache_count;
    END IF;
    
    RAISE NOTICE '✅ Backfill validation complete';
END $$;

COMMIT;

-- ============================================================================
-- POST-DEPLOYMENT VERIFICATION QUERIES
-- ============================================================================
-- Run these queries after migration to verify everything is working:

-- 1. Check platform metrics coverage
-- SELECT day, orders, gmv_cents, platform_fees_cents 
-- FROM metrics.platform_daily 
-- WHERE day >= CURRENT_DATE - INTERVAL '7 days'
-- ORDER BY day DESC;

-- 2. Check vendor metrics for each vendor
-- SELECT vendor_id, COUNT(*) as days_with_data, 
--        SUM(orders) as total_orders, SUM(gmv_cents) as total_gmv
-- FROM metrics.vendor_daily
-- GROUP BY vendor_id;

-- 3. Check realtime cache is up to date
-- SELECT vp.business_name, vrc.orders, vrc.gmv_cents, vrc.updated_at
-- FROM metrics.vendor_realtime_cache vrc
-- JOIN vendor_profiles vp ON vp.user_id = vrc.vendor_id
-- WHERE cache_date = CURRENT_DATE;

-- 4. Verify reconciliation job is scheduled
-- SELECT jobname, schedule, command 
-- FROM cron.job 
-- WHERE jobname = 'reconcile-metrics-nightly';

-- 5. Test reconciliation function manually
-- SELECT private.reconcile_metrics_last_48h();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
