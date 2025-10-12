-- ============================================================================
-- GOVERNANCE ENGINE CRITICAL FIX: Handle Zero-Order Days
-- ============================================================================
-- Problem: Metrics update functions fail when no orders exist for a given day
-- Solution: Ensure CTEs always return a row, even with zeros
-- Impact: Fixes metrics pipeline, allows dashboards to work on quiet days
-- ============================================================================

-- Fix 1: Update platform metrics function to handle zero-order days
CREATE OR REPLACE FUNCTION private.update_platform_metrics_for_day(p_day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, metrics, public, pg_temp
AS $$
BEGIN
    -- Use COALESCE at the outer level to ensure we always have a row
    INSERT INTO metrics.platform_daily (
        day,
        orders,
        gmv_cents,
        refunds_cents,
        platform_fees_cents,
        payouts_cents,
        pending_payout_cents,
        updated_at
    )
    SELECT 
        p_day as day,
        COALESCE(stats.orders, 0) as orders,
        COALESCE(stats.gmv_cents, 0) as gmv_cents,
        COALESCE(stats.refunds_cents, 0) as refunds_cents,
        COALESCE(stats.platform_fees_cents, 0) as platform_fees_cents,
        COALESCE(stats.payouts_cents, 0) as payouts_cents,
        COALESCE(stats.pending_payout_cents, 0) as pending_payout_cents,
        now() as updated_at
    FROM (
        -- This subquery might return no rows
        SELECT 
            COUNT(DISTINCT o.id)::integer as orders,
            COALESCE(SUM(o.total_cents::bigint), 0) as gmv_cents,
            0 as refunds_cents,
            COALESCE(SUM(
                ROUND(COALESCE(vp.commission_rate, 0.15) * oi.total_price_cents::bigint)
            )::bigint, 0) as platform_fees_cents,
            0 as payouts_cents,
            COALESCE(SUM(o.total_cents::bigint), 0) - 
            COALESCE(SUM(
                ROUND(COALESCE(vp.commission_rate, 0.15) * oi.total_price_cents::bigint)
            )::bigint, 0) as pending_payout_cents
        FROM public.orders o
        LEFT JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.vendor_profiles vp ON vp.user_id = oi.vendor_id
        WHERE o.status IN ('confirmed', 'shipped', 'delivered')
          AND DATE(o.created_at) = p_day
    ) AS stats
    -- RIGHT JOIN ensures we always have a row, even if stats is empty
    RIGHT JOIN (SELECT 1) AS dummy ON true
    ON CONFLICT (day) DO UPDATE SET
        orders = EXCLUDED.orders,
        gmv_cents = EXCLUDED.gmv_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        platform_fees_cents = EXCLUDED.platform_fees_cents,
        payouts_cents = EXCLUDED.payouts_cents,
        pending_payout_cents = EXCLUDED.pending_payout_cents,
        updated_at = now();
END;
$$;

-- Fix 2: Update vendor metrics function to handle zero-order days
CREATE OR REPLACE FUNCTION private.update_vendor_metrics_for_day(p_day date, p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, metrics, public, pg_temp
AS $$
BEGIN
    -- Ensure we always insert/update a row, even with zeros
    INSERT INTO metrics.vendor_daily (
        vendor_id,
        day,
        orders,
        gmv_cents,
        refunds_cents,
        platform_fees_cents,
        payouts_cents,
        pending_payout_cents,
        updated_at
    )
    SELECT 
        p_vendor_id as vendor_id,
        p_day as day,
        COALESCE(stats.orders, 0) as orders,
        COALESCE(stats.gmv_cents, 0) as gmv_cents,
        COALESCE(stats.refunds_cents, 0) as refunds_cents,
        COALESCE(stats.platform_fees_cents, 0) as platform_fees_cents,
        COALESCE(stats.payouts_cents, 0) as payouts_cents,
        COALESCE(stats.pending_payout_cents, 0) as pending_payout_cents,
        now() as updated_at
    FROM (
        -- This subquery might return no rows for a vendor with no orders
        SELECT 
            COUNT(DISTINCT o.id)::integer as orders,
            COALESCE(SUM(oi.total_price_cents::bigint), 0) as gmv_cents,
            0 as refunds_cents,
            ROUND(COALESCE(vp.commission_rate, 0.15) * COALESCE(SUM(oi.total_price_cents::bigint), 0))::bigint as platform_fees_cents,
            0 as payouts_cents,
            COALESCE(SUM(oi.total_price_cents::bigint), 0) - 
            ROUND(COALESCE(vp.commission_rate, 0.15) * COALESCE(SUM(oi.total_price_cents::bigint), 0))::bigint as pending_payout_cents
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.vendor_profiles vp ON vp.user_id = p_vendor_id
        WHERE oi.vendor_id = p_vendor_id
          AND o.status IN ('confirmed', 'shipped', 'delivered')
          AND DATE(o.created_at) = p_day
    ) AS stats
    -- RIGHT JOIN ensures we always have a row
    RIGHT JOIN (SELECT 1) AS dummy ON true
    ON CONFLICT (vendor_id, day) DO UPDATE SET
        orders = EXCLUDED.orders,
        gmv_cents = EXCLUDED.gmv_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        platform_fees_cents = EXCLUDED.platform_fees_cents,
        payouts_cents = EXCLUDED.payouts_cents,
        pending_payout_cents = EXCLUDED.pending_payout_cents,
        updated_at = now();
END;
$$;

-- Fix 3: Also create/update realtime cache population function
CREATE OR REPLACE FUNCTION private.update_vendor_realtime_cache(p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, metrics, public, pg_temp
AS $$
BEGIN
    -- Always upsert a row for today, even with zeros
    INSERT INTO metrics.vendor_realtime_cache (
        vendor_id,
        cache_date,
        orders,
        gmv_cents,
        refunds_cents,
        platform_fees_cents,
        updated_at
    )
    SELECT 
        p_vendor_id,
        CURRENT_DATE,
        COALESCE(stats.orders, 0),
        COALESCE(stats.gmv_cents, 0),
        COALESCE(stats.refunds_cents, 0),
        COALESCE(stats.platform_fees_cents, 0),
        now()
    FROM (
        SELECT 
            COUNT(DISTINCT o.id)::integer as orders,
            COALESCE(SUM(oi.total_price_cents::bigint), 0) as gmv_cents,
            0 as refunds_cents,
            ROUND(COALESCE(vp.commission_rate, 0.15) * COALESCE(SUM(oi.total_price_cents::bigint), 0))::bigint as platform_fees_cents
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.vendor_profiles vp ON vp.user_id = p_vendor_id
        WHERE oi.vendor_id = p_vendor_id
          AND o.status IN ('confirmed', 'shipped', 'delivered')
          AND DATE(o.created_at) = CURRENT_DATE
    ) AS stats
    RIGHT JOIN (SELECT 1) AS dummy ON true
    ON CONFLICT (vendor_id, cache_date) DO UPDATE SET
        orders = EXCLUDED.orders,
        gmv_cents = EXCLUDED.gmv_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        platform_fees_cents = EXCLUDED.platform_fees_cents,
        updated_at = now();
END;
$$;

-- Fix 4: Clean up the failed queue entries and reprocess
UPDATE private.metrics_update_queue
SET status = 'pending', attempts = 0, last_error = NULL
WHERE status = 'failed';

-- Fix 5: Populate today's realtime cache for all vendors
DO $$
DECLARE
    v_vendor record;
BEGIN
    FOR v_vendor IN SELECT user_id FROM public.vendor_profiles
    LOOP
        PERFORM private.update_vendor_realtime_cache(v_vendor.user_id);
    END LOOP;
END $$;

-- Fix 6: Ensure today's platform metrics exist
SELECT private.update_platform_metrics_for_day(CURRENT_DATE);

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration)
-- ============================================================================
-- Check queue is processing:
-- SELECT * FROM private.metrics_update_queue ORDER BY updated_at DESC;
-- 
-- Check platform_daily has today:
-- SELECT * FROM metrics.platform_daily WHERE day = CURRENT_DATE;
-- 
-- Check realtime cache populated:
-- SELECT * FROM metrics.vendor_realtime_cache;
-- ============================================================================
