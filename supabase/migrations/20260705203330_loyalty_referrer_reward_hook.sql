-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Adds the give-get referrer reward to the earn path: when a referee's PAID booking earn
-- succeeds and their referral is unrewarded, credit the referrer +1 stamp exactly once
-- (status-guarded). All pre-existing logic identical to 20260705091357.
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
  v_referrer uuid;
BEGIN
  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN 'skipped_program_inactive';
  END IF;

  IF COALESCE(p_booking.is_reward_redemption, false) THEN
    RETURN 'skipped_reward_redemption';
  END IF;

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

  INSERT INTO public.loyalty_ledger
    (customer_user_id, booking_id, event_type, stamps_delta, reason, actor_role)
  VALUES
    (p_booking.customer_user_id, p_booking.id, 'earn', 1, 'booking_completed', 'system')
  ON CONFLICT (booking_id) WHERE event_type = 'earn' DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    RETURN 'skipped_already_earned';
  END IF;

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

  -- Give-get referrer reward: fires at most once per referee (rewarded_at guard),
  -- and only on a REAL paid earn (we are past all guards above).
  UPDATE public.loyalty_referrals
  SET rewarded_at = now(), rewarded_booking_id = p_booking.id
  WHERE referee_user_id = p_booking.customer_user_id AND rewarded_at IS NULL
  RETURNING referrer_user_id INTO v_referrer;

  IF v_referrer IS NOT NULL THEN
    PERFORM private.credit_loyalty_stamps(v_referrer, 1, 'referral_reward', 'system', NULL);
  END IF;

  RETURN CASE WHEN v_minted > 0 THEN 'earned_and_minted' ELSE 'earned' END;
END;
$$;
