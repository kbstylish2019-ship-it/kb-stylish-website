-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- NOTE: private.reconcile_loyalty_earnings and public.admin_reconcile_loyalty_v1 as created
-- here were superseded by 20260705091430_loyalty_reconcile_selfdefense_fix.sql (two-layer
-- p_user_id self-defense pattern). Kept verbatim for history.
-- Rollback: DROP TRIGGER trg_loyalty_booking_event ON public.bookings;
-- DROP FUNCTION private.process_loyalty_booking_event, private.award_loyalty_stamp,
-- private.reconcile_loyalty_earnings, public.admin_reconcile_loyalty_v1;
BEGIN;

-- Shared awarding core: used by BOTH the trigger and the reconciliation backfill.
CREATE OR REPLACE FUNCTION private.award_loyalty_stamp(p_booking public.bookings)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_config public.loyalty_config;
  v_ledger_id uuid;
  v_current integer;
  v_reward_id uuid;
  v_minted integer := 0;
  v_category text;
BEGIN
  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN 'skipped_program_inactive';
  END IF;

  IF COALESCE(p_booking.is_reward_redemption, false) THEN
    RETURN 'skipped_reward_redemption';
  END IF;

  -- PAID = linked payment intent that actually succeeded
  IF p_booking.payment_intent_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.payment_intents pi
    WHERE pi.payment_intent_id = p_booking.payment_intent_id AND pi.status = 'succeeded'
  ) THEN
    RETURN 'skipped_unpaid';
  END IF;

  IF v_config.eligible_service_categories IS NOT NULL THEN
    SELECT s.category INTO v_category FROM public.services s WHERE s.id = p_booking.service_id;
    IF v_category IS NULL OR NOT (v_category = ANY (v_config.eligible_service_categories)) THEN
      RETURN 'skipped_category_ineligible';
    END IF;
  END IF;

  -- Idempotency backstop: partial unique index (booking_id) WHERE event_type='earn'
  INSERT INTO public.loyalty_ledger
    (customer_user_id, booking_id, event_type, stamps_delta, reason, actor_role)
  VALUES
    (p_booking.customer_user_id, p_booking.id, 'earn', 1, 'booking_completed', 'system')
  ON CONFLICT (booking_id) WHERE event_type = 'earn' DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN 'skipped_already_earned';
  END IF;

  -- Upsert locks the account row -> concurrent earns for one customer serialize here
  INSERT INTO public.loyalty_accounts (customer_user_id, current_stamps, lifetime_stamps)
  VALUES (p_booking.customer_user_id, 1, 1)
  ON CONFLICT (customer_user_id) DO UPDATE
    SET current_stamps = public.loyalty_accounts.current_stamps + 1,
        lifetime_stamps = public.loyalty_accounts.lifetime_stamps + 1,
        updated_at = now()
  RETURNING current_stamps INTO v_current;

  WHILE v_current >= v_config.stamps_required LOOP
    INSERT INTO public.loyalty_rewards (customer_user_id) VALUES (p_booking.customer_user_id)
    RETURNING id INTO v_reward_id;

    INSERT INTO public.loyalty_ledger
      (customer_user_id, booking_id, reward_id, event_type, stamps_delta, reward_delta, reason, actor_role)
    VALUES
      (p_booking.customer_user_id, p_booking.id, v_reward_id, 'adjustment',
       -v_config.stamps_required, 1, 'voucher_minted', 'system');

    UPDATE public.loyalty_accounts
    SET current_stamps = current_stamps - v_config.stamps_required, updated_at = now()
    WHERE customer_user_id = p_booking.customer_user_id
    RETURNING current_stamps INTO v_current;

    v_minted := v_minted + 1;
  END LOOP;

  RETURN CASE WHEN v_minted > 0 THEN 'earned_and_minted' ELSE 'earned' END;
END;
$$;
REVOKE ALL ON FUNCTION private.award_loyalty_stamp(public.bookings) FROM PUBLIC, anon, authenticated;

-- Trigger body: earn on true transition into completed; idempotent voucher
-- reinstatement on cancellation of a redemption booking. NEVER raises (loyalty
-- must not block booking status changes); failures leave a trace in private.audit_log.
CREATE OR REPLACE FUNCTION private.process_loyalty_booking_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_reward_id uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    PERFORM private.award_loyalty_stamp(NEW);
  ELSIF NEW.status = 'cancelled' AND COALESCE(NEW.is_reward_redemption, false) THEN
    -- Status-guarded UPDATE = idempotent: a second cancel pass matches zero rows
    UPDATE public.loyalty_rewards
    SET status = 'available', redeemed_at = NULL, redeemed_booking_id = NULL,
        redeemed_value_cents = NULL, updated_at = now()
    WHERE redeemed_booking_id = NEW.id AND status = 'redeemed'
    RETURNING id INTO v_reward_id;

    IF v_reward_id IS NOT NULL THEN
      INSERT INTO public.loyalty_ledger
        (customer_user_id, booking_id, reward_id, event_type, reward_delta, reason, actor_role)
      VALUES
        (NEW.customer_user_id, NEW.id, v_reward_id, 'reversal', 1,
         'redemption_booking_cancelled', 'system');
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'loyalty trigger failed for booking % (% -> %): %',
    NEW.id, OLD.status, NEW.status, SQLERRM;
  BEGIN
    INSERT INTO private.audit_log (table_name, record_id, action, new_values, user_id)
    VALUES ('loyalty_ledger', NEW.id, 'loyalty_trigger_error',
            jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE,
                               'old_status', OLD.status, 'new_status', NEW.status),
            NEW.customer_user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'loyalty trigger error-logging also failed for booking %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.process_loyalty_booking_event() FROM PUBLIC, anon, authenticated;

-- WHEN clause guarantees: fires only on a REAL status change into completed/cancelled.
-- completed->completed no-op updates can never re-enter (NEW='completed' + OLD IS DISTINCT => OLD<>'completed').
CREATE TRIGGER trg_loyalty_booking_event
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('completed','cancelled'))
EXECUTE FUNCTION private.process_loyalty_booking_event();

-- Reconciliation backfill (superseded by 20260705091430 — see note at top)
CREATE OR REPLACE FUNCTION private.reconcile_loyalty_earnings(p_dry_run boolean DEFAULT true)
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
REVOKE ALL ON FUNCTION private.reconcile_loyalty_earnings(boolean) FROM PUBLIC, anon, authenticated;

-- Admin-facing wrapper (superseded by 20260705091430)
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
  IF NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied - admin role required' USING ERRCODE = '42501';
  END IF;
  RETURN private.reconcile_loyalty_earnings(p_dry_run);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reconcile_loyalty_v1(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_loyalty_v1(boolean) TO authenticated;

COMMIT;
