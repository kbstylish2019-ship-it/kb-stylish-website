-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Phase 2A+2C: welcome-stamp claim (branch QR) + give-get referrals.
-- NOTE: get_or_create_referral_code here already includes the md5() fix that was applied
-- live as 20260705203538 (original used gen_random_bytes, not on the pinned search_path).
BEGIN;

CREATE FUNCTION private.credit_loyalty_stamps(
  p_user_id uuid, p_stamps integer, p_reason text, p_actor_role text, p_created_by uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_config public.loyalty_config;
  v_current integer;
  v_reward_id uuid;
BEGIN
  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;

  INSERT INTO public.loyalty_ledger (customer_user_id, event_type, stamps_delta, reason, actor_role, created_by)
  VALUES (p_user_id, 'adjustment', p_stamps, p_reason, p_actor_role, p_created_by);

  INSERT INTO public.loyalty_accounts (customer_user_id, current_stamps, lifetime_stamps)
  VALUES (p_user_id, p_stamps, p_stamps)
  ON CONFLICT (customer_user_id) DO UPDATE
    SET current_stamps = public.loyalty_accounts.current_stamps + p_stamps,
        lifetime_stamps = public.loyalty_accounts.lifetime_stamps + p_stamps,
        updated_at = now()
  RETURNING current_stamps INTO v_current;

  WHILE v_current >= v_config.stamps_required LOOP
    INSERT INTO public.loyalty_rewards (customer_user_id) VALUES (p_user_id)
    RETURNING id INTO v_reward_id;
    INSERT INTO public.loyalty_ledger
      (customer_user_id, reward_id, event_type, stamps_delta, reward_delta, reason, actor_role)
    VALUES (p_user_id, v_reward_id, 'adjustment', -v_config.stamps_required, 1, 'voucher_minted', 'system');
    UPDATE public.loyalty_accounts
    SET current_stamps = current_stamps - v_config.stamps_required, updated_at = now()
    WHERE customer_user_id = p_user_id
    RETURNING current_stamps INTO v_current;
  END LOOP;

  RETURN v_current;
END;
$$;
REVOKE ALL ON FUNCTION private.credit_loyalty_stamps(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.loyalty_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyalty_referral_codes IS 'Personal give-get referral codes (format KB-XXXXXX).';
ALTER TABLE public.loyalty_referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own referral code" ON public.loyalty_referral_codes
  FOR SELECT USING (user_id = auth.uid());
REVOKE ALL ON public.loyalty_referral_codes FROM anon, authenticated;
GRANT SELECT ON public.loyalty_referral_codes TO authenticated;

CREATE TABLE public.loyalty_referrals (
  referee_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  device_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz NULL,
  rewarded_booking_id uuid NULL REFERENCES public.bookings(id),
  CHECK (referee_user_id <> referrer_user_id)
);
COMMENT ON TABLE public.loyalty_referrals IS 'Give-get referrals. Referee gets welcome stamp at claim; referrer gets a stamp only when referee completes their first PAID booking (unfarmable).';
CREATE UNIQUE INDEX loyalty_referrals_one_per_device
  ON public.loyalty_referrals (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX loyalty_referrals_referrer_idx ON public.loyalty_referrals (referrer_user_id);
ALTER TABLE public.loyalty_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referee views own referral" ON public.loyalty_referrals
  FOR SELECT USING (referee_user_id = auth.uid());
CREATE POLICY "Referrer views own referrals" ON public.loyalty_referrals
  FOR SELECT USING (referrer_user_id = auth.uid());
CREATE POLICY "Admins view all referrals" ON public.loyalty_referrals
  FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.loyalty_referrals FROM anon, authenticated;
GRANT SELECT ON public.loyalty_referrals TO authenticated;

CREATE FUNCTION private.claim_welcome_stamp(
  p_user_id uuid, p_branch_code text, p_device_id text DEFAULT NULL, p_source text DEFAULT 'code'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_config public.loyalty_config;
  v_branch public.kb_branches;
  v_inserted uuid;
  v_current integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROGRAM_INACTIVE',
      'error', 'The rewards program is not currently active.');
  END IF;

  SELECT * INTO v_branch FROM public.kb_branches
  WHERE upper(referral_code) = upper(trim(p_branch_code)) AND is_active;
  IF v_branch IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_CODE',
      'error', 'That salon code was not recognized. Please check the poster and try again.');
  END IF;

  -- One welcome credit per account ACROSS mechanisms (branch claim + friend referral).
  PERFORM pg_advisory_xact_lock(hashtext('loyalty_welcome:' || p_user_id::text));
  IF EXISTS (SELECT 1 FROM public.loyalty_referrals WHERE referee_user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CLAIMED',
      'error', 'You have already received your welcome stamp.');
  END IF;

  BEGIN
    INSERT INTO public.loyalty_acquisitions (customer_user_id, branch_id, source, device_id)
    VALUES (p_user_id, v_branch.id,
            CASE WHEN p_source IN ('qr','code','staff') THEN p_source ELSE 'code' END,
            NULLIF(trim(p_device_id), ''))
    ON CONFLICT (customer_user_id) DO NOTHING
    RETURNING customer_user_id INTO v_inserted;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'DEVICE_ALREADY_USED',
      'error', 'A welcome stamp has already been claimed on this device.');
  END;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CLAIMED',
      'error', 'You have already received your welcome stamp.');
  END IF;

  v_current := private.credit_loyalty_stamps(p_user_id, 1,
    'welcome_stamp:' || upper(v_branch.referral_code), 'customer', p_user_id);

  RETURN jsonb_build_object('success', true, 'branch_name', v_branch.name,
    'current_stamps', v_current, 'stamps_required', v_config.stamps_required);
END;
$$;
REVOKE ALL ON FUNCTION private.claim_welcome_stamp(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.claim_welcome_stamp(uuid, text, text, text) TO authenticated;

CREATE FUNCTION public.claim_welcome_stamp(p_branch_code text, p_device_id text DEFAULT NULL, p_source text DEFAULT 'code')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN private.claim_welcome_stamp(auth.uid(), p_branch_code, p_device_id, p_source);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_welcome_stamp(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_welcome_stamp(text, text, text) TO authenticated;

CREATE FUNCTION private.get_or_create_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code FROM public.loyalty_referral_codes WHERE user_id = p_user_id;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_code := 'KB-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    BEGIN
      INSERT INTO public.loyalty_referral_codes (user_id, code) VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      SELECT code INTO v_code FROM public.loyalty_referral_codes WHERE user_id = p_user_id;
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.get_or_create_referral_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_or_create_referral_code(uuid) TO authenticated;

CREATE FUNCTION public.get_my_referral_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'code', private.get_or_create_referral_code(auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_code() TO authenticated;

CREATE FUNCTION private.claim_referral_code(p_user_id uuid, p_code text, p_device_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_config public.loyalty_config;
  v_referrer uuid;
  v_current integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROGRAM_INACTIVE',
      'error', 'The rewards program is not currently active.');
  END IF;

  SELECT user_id INTO v_referrer FROM public.loyalty_referral_codes
  WHERE upper(code) = upper(trim(p_code));
  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_CODE',
      'error', 'That referral code was not recognized.');
  END IF;
  IF v_referrer = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'SELF_REFERRAL',
      'error', 'You cannot use your own referral code.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('loyalty_welcome:' || p_user_id::text));
  IF EXISTS (SELECT 1 FROM public.loyalty_acquisitions WHERE customer_user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CLAIMED',
      'error', 'You have already received your welcome stamp.');
  END IF;

  BEGIN
    INSERT INTO public.loyalty_referrals (referee_user_id, referrer_user_id, device_id)
    VALUES (p_user_id, v_referrer, NULLIF(trim(p_device_id), ''));
  EXCEPTION
    WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM public.loyalty_referrals WHERE referee_user_id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CLAIMED',
          'error', 'You have already received your welcome stamp.');
      END IF;
      RETURN jsonb_build_object('success', false, 'code', 'DEVICE_ALREADY_USED',
        'error', 'A welcome stamp has already been claimed on this device.');
  END;

  v_current := private.credit_loyalty_stamps(p_user_id, 1, 'referral_welcome', 'customer', p_user_id);

  RETURN jsonb_build_object('success', true, 'current_stamps', v_current,
    'stamps_required', v_config.stamps_required);
END;
$$;
REVOKE ALL ON FUNCTION private.claim_referral_code(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.claim_referral_code(uuid, text, text) TO authenticated;

CREATE FUNCTION public.claim_referral_code(p_code text, p_device_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN private.claim_referral_code(auth.uid(), p_code, p_device_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_referral_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_code(text, text) TO authenticated;

COMMIT;
