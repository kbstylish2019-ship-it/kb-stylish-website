-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- Customer-facing loyalty RPCs. Rollback: DROP FUNCTION public.get_my_loyalty_status(),
-- public.redeem_loyalty_reward(uuid), private.redeem_loyalty_reward(uuid, uuid);
BEGIN;

-- Read: SECURITY INVOKER -> RLS does the authorization
CREATE FUNCTION public.get_my_loyalty_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_config public.loyalty_config;
  v_account public.loyalty_accounts;
  v_rewards jsonb;
  v_history jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  SELECT * INTO v_account FROM public.loyalty_accounts WHERE customer_user_id = v_uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'earned_at', r.earned_at, 'expires_at', r.expires_at)
           ORDER BY r.earned_at), '[]'::jsonb)
  INTO v_rewards
  FROM public.loyalty_rewards r
  WHERE r.customer_user_id = v_uid AND r.status = 'available';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'event_type', l.event_type, 'stamps_delta', l.stamps_delta,
           'reward_delta', l.reward_delta, 'reason', l.reason, 'created_at', l.created_at)
           ORDER BY l.created_at DESC), '[]'::jsonb)
  INTO v_history
  FROM (SELECT * FROM public.loyalty_ledger
        WHERE customer_user_id = v_uid ORDER BY created_at DESC LIMIT 10) l;

  RETURN jsonb_build_object(
    'is_active', COALESCE(v_config.is_active, false),
    'program_name', COALESCE(v_config.program_name, 'KB Stylish Rewards'),
    'stamps_required', COALESCE(v_config.stamps_required, 5),
    'reward_max_value_cents', v_config.reward_max_value_cents,
    'current_stamps', COALESCE(v_account.current_stamps, 0),
    'lifetime_stamps', COALESCE(v_account.lifetime_stamps, 0),
    'available_rewards', v_rewards,
    'recent_history', v_history
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_loyalty_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_status() TO authenticated;

-- Redeem: atomic, race-safe. Validation failures return {success:false, code} BEFORE any
-- write; after the first write, failures RAISE so the whole transaction rolls back
-- (voucher can never be spent without the booking confirmed, or vice versa).
CREATE FUNCTION private.redeem_loyalty_reward(p_user_id uuid, p_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_config public.loyalty_config;
  v_reservation public.booking_reservations;
  v_reward_id uuid;
  v_confirm jsonb;
  v_booking_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROGRAM_INACTIVE',
      'error', 'The rewards program is not currently active.');
  END IF;

  SELECT * INTO v_reservation
  FROM public.booking_reservations
  WHERE id = p_reservation_id
    AND customer_user_id = p_user_id
    AND status = 'reserved'
    AND expires_at > NOW()
  FOR UPDATE;
  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'RESERVATION_INVALID',
      'error', 'Reservation not found, expired, or not yours.');
  END IF;

  IF v_config.reward_max_value_cents IS NOT NULL
     AND v_reservation.price_cents > v_config.reward_max_value_cents THEN
    RETURN jsonb_build_object('success', false, 'code', 'REWARD_CAP_EXCEEDED',
      'error', format('Your free-booking voucher covers bookings up to Rs %s. This booking is Rs %s. Please choose the regular payment option.',
        (v_config.reward_max_value_cents / 100)::text,
        (v_reservation.price_cents / 100)::text),
      'max_value_cents', v_config.reward_max_value_cents,
      'booking_price_cents', v_reservation.price_cents);
  END IF;

  -- Status-guarded consumption: two concurrent redeems cannot both spend one voucher
  -- (SKIP LOCKED picks different vouchers; WHERE status='available' guards the update).
  UPDATE public.loyalty_rewards
  SET status = 'redeemed', redeemed_at = NOW(), updated_at = NOW()
  WHERE id = (
    SELECT id FROM public.loyalty_rewards
    WHERE customer_user_id = p_user_id AND status = 'available'
    ORDER BY earned_at, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) AND status = 'available'
  RETURNING id INTO v_reward_id;

  IF v_reward_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_REWARD',
      'error', 'No free-booking voucher available.');
  END IF;

  -- From here on: RAISE on failure => full rollback, voucher stays available.
  v_confirm := public.confirm_booking_reservation(p_reservation_id, NULL);
  IF NOT COALESCE((v_confirm->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Reward redemption failed to confirm booking: %',
      COALESCE(v_confirm->>'error', 'unknown');
  END IF;
  v_booking_id := (v_confirm->>'booking_id')::uuid;

  UPDATE public.bookings
  SET is_reward_redemption = true,
      price_cents = 0,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'loyalty_reward_id', v_reward_id,
        'original_price_cents', v_reservation.price_cents,
        'finalized_by', 'redeem_loyalty_reward')
  WHERE id = v_booking_id;

  UPDATE public.loyalty_rewards
  SET redeemed_booking_id = v_booking_id,
      redeemed_value_cents = v_reservation.price_cents,
      updated_at = NOW()
  WHERE id = v_reward_id;

  INSERT INTO public.loyalty_ledger
    (customer_user_id, booking_id, reward_id, event_type, reward_delta, reason, actor_role, created_by)
  VALUES
    (p_user_id, v_booking_id, v_reward_id, 'redeem', -1, 'free_booking_redeemed', 'customer', p_user_id);

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id, 'reward_id', v_reward_id);
END;
$$;
REVOKE ALL ON FUNCTION private.redeem_loyalty_reward(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.redeem_loyalty_reward(uuid, uuid) TO authenticated;

-- Public wrapper: captures auth.uid(); client can never redeem on behalf of another user
CREATE FUNCTION public.redeem_loyalty_reward(p_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN private.redeem_loyalty_reward(auth.uid(), p_reservation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(uuid) TO authenticated;

COMMIT;
