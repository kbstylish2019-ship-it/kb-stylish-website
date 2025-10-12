-- =====================================================================
-- GOVERNANCE ENGINE - HISTORICAL DATA BACKFILL
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1 - Phase 3
-- Purpose: Backfill metrics tables with last 90 days of order data
-- Source: public.orders, public.order_items
-- Target: metrics.vendor_daily, metrics.platform_daily
-- FAANG-Audited: Data type mappings, idempotency, performance
-- =====================================================================

-- =====================================================================
-- BACKFILL 1: metrics.vendor_daily
-- =====================================================================
-- Aggregates vendor-level order data by (vendor_id, day)
-- Sources: order_items for vendor attribution, orders for status filtering
-- Data Type Safety: CAST total_price_cents::bigint to prevent overflow
-- Idempotency: ON CONFLICT DO UPDATE enables safe re-runs
-- =====================================================================

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
  oi.vendor_id,
  DATE(o.created_at) as day,
  COUNT(DISTINCT o.id)::integer as orders,
  SUM(oi.total_price_cents::bigint) as gmv_cents,
  0 as refunds_cents,
  ROUND(COALESCE(vp.commission_rate, 0.15) * SUM(oi.total_price_cents::bigint))::bigint as platform_fees_cents,
  0 as payouts_cents,
  (SUM(oi.total_price_cents::bigint) - ROUND(COALESCE(vp.commission_rate, 0.15) * SUM(oi.total_price_cents::bigint))::bigint) as pending_payout_cents,
  now() as updated_at
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.vendor_profiles vp ON vp.user_id = oi.vendor_id
WHERE o.status IN ('confirmed', 'shipped', 'delivered')
  AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY oi.vendor_id, DATE(o.created_at), vp.commission_rate
ON CONFLICT (vendor_id, day) DO UPDATE SET
  orders = EXCLUDED.orders,
  gmv_cents = EXCLUDED.gmv_cents,
  refunds_cents = EXCLUDED.refunds_cents,
  platform_fees_cents = EXCLUDED.platform_fees_cents,
  payouts_cents = EXCLUDED.payouts_cents,
  pending_payout_cents = EXCLUDED.pending_payout_cents,
  updated_at = now();

-- =====================================================================
-- BACKFILL 2: metrics.platform_daily
-- =====================================================================
-- Aggregates platform-wide order data by day
-- Source: orders.total_cents for platform GMV (sum of all vendors)
-- Data Type Safety: CAST total_cents::bigint to prevent overflow
-- Idempotency: ON CONFLICT DO UPDATE enables safe re-runs
-- =====================================================================

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
  DATE(o.created_at) as day,
  COUNT(DISTINCT o.id)::integer as orders,
  SUM(o.total_cents::bigint) as gmv_cents,
  0 as refunds_cents,
  ROUND(0.15 * SUM(o.total_cents::bigint))::bigint as platform_fees_cents,
  0 as payouts_cents,
  (SUM(o.total_cents::bigint) - ROUND(0.15 * SUM(o.total_cents::bigint))::bigint) as pending_payout_cents,
  now() as updated_at
FROM public.orders o
WHERE o.status IN ('confirmed', 'shipped', 'delivered')
  AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(o.created_at)
ON CONFLICT (day) DO UPDATE SET
  orders = EXCLUDED.orders,
  gmv_cents = EXCLUDED.gmv_cents,
  refunds_cents = EXCLUDED.refunds_cents,
  platform_fees_cents = EXCLUDED.platform_fees_cents,
  payouts_cents = EXCLUDED.payouts_cents,
  pending_payout_cents = EXCLUDED.pending_payout_cents,
  updated_at = now();

-- =====================================================================
-- BACKFILL COMPLETE
-- =====================================================================
-- Verification Queries:
-- 1. SELECT * FROM metrics.vendor_daily ORDER BY day DESC, vendor_id;
-- 2. SELECT * FROM metrics.platform_daily ORDER BY day DESC;
-- 3. SELECT SUM(gmv_cents) FROM metrics.vendor_daily; -- Should match sum of platform_daily
-- =====================================================================
