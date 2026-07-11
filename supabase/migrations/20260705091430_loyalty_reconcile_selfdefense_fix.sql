-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- Align with house two-layer pattern (private fn takes p_user_id, self-defends, EXECUTE
-- granted to authenticated; INVOKER wrapper passes auth.uid()).
BEGIN;

DROP FUNCTION private.reconcile_loyalty_earnings(boolean);

CREATE FUNCTION private.reconcile_loyalty_earnings(p_user_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_found uuid[] := '{}';
  v_awarded jsonb := '[]'::jsonb;
  v_outcome text;
BEGIN
  -- Self-defense: admin JWT context, or server context (MCP/service; no JWT present)
  IF p_user_id IS NOT NULL AND NOT public.user_has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied - admin role required' USING ERRCODE = '42501';
  END IF;

  FOR v_booking IN
    SELECT b.* FROM public.bookings b
    WHERE b.status = 'completed'
      AND COALESCE(b.is_reward_redemption, false) = false
      AND b.payment_intent_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.payment_intents pi
                  WHERE pi.payment_intent_id = b.payment_intent_id AND pi.status = 'succeeded')
      AND NOT EXISTS (SELECT 1 FROM public.loyalty_ledger l
                      WHERE l.booking_id = b.id AND l.event_type = 'earn')
    ORDER BY b.updated_at
  LOOP
    v_found := v_found || v_booking.id;
    IF NOT p_dry_run THEN
      v_outcome := private.award_loyalty_stamp(v_booking);
      v_awarded := v_awarded || jsonb_build_object('booking_id', v_booking.id, 'outcome', v_outcome);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'missing_earn_count', COALESCE(array_length(v_found, 1), 0),
    'missing_booking_ids', to_jsonb(v_found),
    'awarded', v_awarded
  );
END;
$$;
REVOKE ALL ON FUNCTION private.reconcile_loyalty_earnings(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.reconcile_loyalty_earnings(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reconcile_loyalty_v1(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN private.reconcile_loyalty_earnings(auth.uid(), p_dry_run);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reconcile_loyalty_v1(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_loyalty_v1(boolean) TO authenticated;

COMMIT;
