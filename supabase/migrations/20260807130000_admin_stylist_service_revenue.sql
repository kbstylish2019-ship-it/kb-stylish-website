-- Admin visibility into service revenue by stylist.
--
-- The admin had no way to see how much service value each stylist has sold: the
-- admin dashboard runs on hardcoded mock data, and the stylists page shows only a
-- booking count. The bookings table has everything needed; this exposes it as an
-- admin-only aggregate.
--
-- Rollback: DROP FUNCTION public.admin_get_stylist_service_revenue();

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_stylist_service_revenue()
RETURNS TABLE(
  stylist_user_id  uuid,
  display_name     text,
  completed_count  bigint,
  completed_value_cents  bigint,
  upcoming_count   bigint,
  upcoming_value_cents   bigint,
  cancelled_count  bigint,
  total_value_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  PERFORM private.assert_admin();

  RETURN QUERY
  SELECT
    sp.user_id,
    sp.display_name,
    count(*) FILTER (WHERE b.status = 'completed')::bigint,
    COALESCE(sum(b.price_cents) FILTER (WHERE b.status = 'completed'), 0)::bigint,
    count(*) FILTER (WHERE b.status = 'confirmed')::bigint,
    COALESCE(sum(b.price_cents) FILTER (WHERE b.status = 'confirmed'), 0)::bigint,
    count(*) FILTER (WHERE b.status = 'cancelled')::bigint,
    -- Realized + upcoming (excludes cancelled): the service value this stylist has sold.
    COALESCE(sum(b.price_cents) FILTER (WHERE b.status IN ('completed','confirmed')), 0)::bigint
  FROM stylist_profiles sp
  LEFT JOIN bookings b ON b.stylist_user_id = sp.user_id
  WHERE sp.is_active
  GROUP BY sp.user_id, sp.display_name
  ORDER BY 8 DESC, 4 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_stylist_service_revenue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_stylist_service_revenue() TO authenticated;

COMMIT;
