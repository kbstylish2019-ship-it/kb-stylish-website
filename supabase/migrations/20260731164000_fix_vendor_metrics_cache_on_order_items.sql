-- The vendor metrics cache was never populated for real orders.
--
-- metrics.refresh_vendor_cache_on_order() fires AFTER INSERT ON orders and loops
-- over "order_items WHERE order_id = NEW.id". At that instant the order row exists
-- but its items do not (the order worker inserts the order first, items after), so
-- the loop iterates zero times and the vendor's cache stays at zero. The vendor
-- Orders page reads orders/order_items directly and looked correct, while the
-- vendor Dashboard -- which reads only this cache -- showed no orders and no GMV.
--
-- The platform-level trigger was unaffected: it aggregates from `orders` alone,
-- and that row does exist when it runs.
--
-- Fix: recompute the same aggregate when the ITEMS land. Additive and idempotent;
-- the existing orders-level trigger is left untouched.

CREATE OR REPLACE FUNCTION metrics.refresh_vendor_cache_on_order_item()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_date date;
  v_order_status text;
  v_order_count integer;
  v_total_gmv bigint;
  v_total_fees bigint;
BEGIN
  SELECT o.created_at::date, o.status
    INTO v_order_date, v_order_status
  FROM orders o
  WHERE o.id = NEW.order_id;

  IF v_order_status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(DISTINCT oi.order_id),
    COALESCE(SUM(oi.total_price_cents), 0),
    COALESCE(SUM(oi.total_price_cents) * 0.15, 0)
  INTO v_order_count, v_total_gmv, v_total_fees
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.vendor_id = NEW.vendor_id
    AND o.created_at::date = v_order_date
    AND o.status = 'confirmed';

  INSERT INTO metrics.vendor_realtime_cache (
    vendor_id, cache_date, orders, gmv_cents, platform_fees_cents, refunds_cents, updated_at
  ) VALUES (
    NEW.vendor_id, v_order_date, v_order_count, v_total_gmv, v_total_fees, 0, NOW()
  )
  ON CONFLICT (vendor_id, cache_date) DO UPDATE SET
    orders = EXCLUDED.orders,
    gmv_cents = EXCLUDED.gmv_cents,
    platform_fees_cents = EXCLUDED.platform_fees_cents,
    updated_at = NOW();

  INSERT INTO metrics.vendor_daily (
    vendor_id, day, orders, gmv_cents, platform_fees_cents,
    pending_payout_cents, payouts_cents, refunds_cents
  ) VALUES (
    NEW.vendor_id, v_order_date, v_order_count, v_total_gmv, v_total_fees,
    v_total_gmv - v_total_fees, 0, 0
  )
  ON CONFLICT (vendor_id, day) DO UPDATE SET
    orders = EXCLUDED.orders,
    gmv_cents = EXCLUDED.gmv_cents,
    platform_fees_cents = EXCLUDED.platform_fees_cents,
    pending_payout_cents = EXCLUDED.pending_payout_cents;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS refresh_vendor_metrics_on_order_item ON public.order_items;

CREATE TRIGGER refresh_vendor_metrics_on_order_item
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION metrics.refresh_vendor_cache_on_order_item();

-- Backfill for orders already confirmed before this trigger existed.
-- vendor_realtime_cache carries a today-only check constraint, so history goes to
-- vendor_daily and only the current day is written to the realtime cache.
WITH agg AS (
  SELECT oi.vendor_id,
         o.created_at::date AS day,
         COUNT(DISTINCT oi.order_id)::int AS orders,
         COALESCE(SUM(oi.total_price_cents), 0)::bigint AS gmv_cents,
         (COALESCE(SUM(oi.total_price_cents), 0) * 0.15)::bigint AS fees_cents
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status = 'confirmed'
  GROUP BY oi.vendor_id, o.created_at::date
)
INSERT INTO metrics.vendor_daily (
  vendor_id, day, orders, gmv_cents, platform_fees_cents,
  pending_payout_cents, payouts_cents, refunds_cents
)
SELECT vendor_id, day, orders, gmv_cents, fees_cents, gmv_cents - fees_cents, 0, 0 FROM agg
ON CONFLICT (vendor_id, day) DO UPDATE SET
  orders = EXCLUDED.orders,
  gmv_cents = EXCLUDED.gmv_cents,
  platform_fees_cents = EXCLUDED.platform_fees_cents,
  pending_payout_cents = EXCLUDED.pending_payout_cents;

WITH agg AS (
  SELECT oi.vendor_id,
         COUNT(DISTINCT oi.order_id)::int AS orders,
         COALESCE(SUM(oi.total_price_cents), 0)::bigint AS gmv_cents,
         (COALESCE(SUM(oi.total_price_cents), 0) * 0.15)::bigint AS fees_cents
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status = 'confirmed' AND o.created_at::date = CURRENT_DATE
  GROUP BY oi.vendor_id
)
INSERT INTO metrics.vendor_realtime_cache (
  vendor_id, cache_date, orders, gmv_cents, platform_fees_cents, refunds_cents, updated_at
)
SELECT vendor_id, CURRENT_DATE, orders, gmv_cents, fees_cents, 0, NOW() FROM agg
ON CONFLICT (vendor_id, cache_date) DO UPDATE SET
  orders = EXCLUDED.orders,
  gmv_cents = EXCLUDED.gmv_cents,
  platform_fees_cents = EXCLUDED.platform_fees_cents,
  updated_at = NOW();
