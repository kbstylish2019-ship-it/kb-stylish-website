-- Propagate item fulfilment status up to the order.
--
-- Vendors change order_items.fulfillment_status (pending -> processing -> shipped
-- -> delivered). Nothing wrote that back to orders.status, which stayed 'confirmed'
-- forever. Two visible consequences:
--   1. /track-order reads orders.status, so a customer's tracking never advanced
--      past Confirmed even after the item was delivered (verified: ORD-20260807-75015
--      had order.status='confirmed' while its item was 'delivered').
--   2. The vendor order-status pill and any order-level reporting were frozen too.
--
-- This trigger recomputes orders.status from the aggregate of its items after any
-- fulfilment change, and stamps shipped_at / delivered_at on first entry.
--
-- Deliberately conservative:
--   * Only advances forward (confirmed -> processing -> shipped -> delivered).
--   * Never sets a cancellation state -- order-level cancellation is a separate flow
--     with its own validation trigger, and payouts key off item status, not this.
--   * Never touches an order already 'refunded' or 'canceled'.
--   * The metrics refresh triggers fire only WHEN new.status='confirmed', so moving
--     an order to shipped/delivered does not re-fire them (no double-counting).
--
-- Rollback: DROP TRIGGER trg_sync_order_status_from_items ON public.order_items;
--           DROP FUNCTION private.sync_order_status_from_items();

BEGIN;

CREATE OR REPLACE FUNCTION private.sync_order_status_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_order_id   uuid := NEW.order_id;
  v_total      int;
  v_cancelled  int;
  v_delivered  int;
  v_shipped    int;
  v_processing int;
  v_active     int;
  v_new_status text;
  v_cur_status text;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE fulfillment_status = 'cancelled'),
    count(*) FILTER (WHERE fulfillment_status = 'delivered'),
    count(*) FILTER (WHERE fulfillment_status = 'shipped'),
    count(*) FILTER (WHERE fulfillment_status = 'processing')
  INTO v_total, v_cancelled, v_delivered, v_shipped, v_processing
  FROM order_items
  WHERE order_id = v_order_id;

  v_active := v_total - v_cancelled;

  -- All items cancelled, or no active items: leave order-level status to its own flow.
  IF v_total = 0 OR v_active = 0 THEN
    RETURN NULL;
  ELSIF v_delivered = v_active THEN
    v_new_status := 'delivered';
  ELSIF (v_delivered + v_shipped) = v_active AND v_shipped > 0 THEN
    v_new_status := 'shipped';
  ELSIF (v_delivered + v_shipped + v_processing) > 0 THEN
    v_new_status := 'processing';
  ELSE
    v_new_status := 'confirmed'; -- all active items still pending
  END IF;

  SELECT status INTO v_cur_status FROM orders WHERE id = v_order_id;

  -- Never override a manually terminal order, and never move backwards from delivered.
  IF v_cur_status IN ('refunded', 'canceled', 'delivered') THEN
    RETURN NULL;
  END IF;

  IF v_cur_status IS DISTINCT FROM v_new_status THEN
    -- orders has no updated_at column; only status + the entry timestamps.
    UPDATE orders
    SET status       = v_new_status,
        shipped_at   = CASE WHEN v_new_status = 'shipped'   AND shipped_at   IS NULL THEN now() ELSE shipped_at   END,
        delivered_at = CASE WHEN v_new_status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END
    WHERE id = v_order_id;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_order_status_from_items ON public.order_items;
CREATE TRIGGER trg_sync_order_status_from_items
  AFTER UPDATE OF fulfillment_status ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_order_status_from_items();

-- One-time backfill: existing orders were frozen at 'confirmed' while their items
-- advanced. Recompute the same aggregate the trigger uses, for every non-terminal
-- order, and stamp the entry timestamps. Same forward-only, no-cancellation rules.
WITH agg AS (
  SELECT oi.order_id,
         count(*)                                                AS total,
         count(*) FILTER (WHERE oi.fulfillment_status='cancelled')  AS cancelled,
         count(*) FILTER (WHERE oi.fulfillment_status='delivered')  AS delivered,
         count(*) FILTER (WHERE oi.fulfillment_status='shipped')    AS shipped,
         count(*) FILTER (WHERE oi.fulfillment_status='processing') AS processing
  FROM order_items oi GROUP BY oi.order_id
),
calc AS (
  SELECT order_id,
         CASE
           WHEN total - cancelled = 0 THEN NULL
           WHEN delivered = total - cancelled THEN 'delivered'
           WHEN (delivered + shipped) = total - cancelled AND shipped > 0 THEN 'shipped'
           WHEN (delivered + shipped + processing) > 0 THEN 'processing'
           ELSE 'confirmed'
         END AS new_status
  FROM agg
)
UPDATE orders o
SET status       = c.new_status,
    shipped_at   = CASE WHEN c.new_status IN ('shipped','delivered') AND o.shipped_at   IS NULL THEN now() ELSE o.shipped_at   END,
    delivered_at = CASE WHEN c.new_status = 'delivered'              AND o.delivered_at IS NULL THEN now() ELSE o.delivered_at END
FROM calc c
WHERE o.id = c.order_id
  AND c.new_status IS NOT NULL
  AND o.status NOT IN ('refunded','canceled','delivered')
  AND o.status IS DISTINCT FROM c.new_status;

COMMIT;
