-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- Admin CRM RPCs (two-layer house pattern). Rollback: DROP FUNCTION public.get_admin_crm_stats_v1(date),
-- private.get_admin_crm_stats_v1(uuid, date), public.admin_update_loyalty_config_v1(integer, boolean, text, integer, boolean),
-- private.admin_update_loyalty_config_v1(uuid, integer, boolean, text, integer, boolean);
BEGIN;

CREATE FUNCTION private.get_admin_crm_stats_v1(p_user_id uuid, p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_month_start date := date_trunc('month', COALESCE(p_month, CURRENT_DATE))::date;
  v_month_end date := (date_trunc('month', COALESCE(p_month, CURRENT_DATE)) + interval '1 month')::date;
  v_signups jsonb;
  v_signup_count bigint;
  v_customers jsonb;
  v_program jsonb;
  v_config public.loyalty_config;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied - admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_signup_count
  FROM auth.users u WHERE u.created_at >= v_month_start AND u.created_at < v_month_end;

  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'created_at' DESC), '[]'::jsonb) INTO v_signups
  FROM (
    SELECT jsonb_build_object(
      'user_id', u.id, 'email', u.email,
      'display_name', up.display_name, 'created_at', u.created_at) AS s
    FROM auth.users u
    LEFT JOIN public.user_profiles up ON up.id = u.id
    WHERE u.created_at >= v_month_start AND u.created_at < v_month_end
    ORDER BY u.created_at DESC LIMIT 100
  ) sub;

  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'total_spend_cents')::bigint DESC), '[]'::jsonb)
  INTO v_customers
  FROM (
    SELECT jsonb_build_object(
      'user_id', u.id, 'email', u.email, 'display_name', up.display_name,
      'signup_at', u.created_at,
      'bookings_total', COALESCE(b.total, 0),
      'bookings_completed', COALESCE(b.completed, 0),
      'booking_spend_cents', COALESCE(b.spend_cents, 0),
      'orders_count', COALESCE(o.cnt, 0),
      'order_spend_cents', COALESCE(o.spend_cents, 0),
      'total_spend_cents', COALESCE(b.spend_cents, 0) + COALESCE(o.spend_cents, 0),
      'current_stamps', COALESCE(la.current_stamps, 0),
      'lifetime_stamps', COALESCE(la.lifetime_stamps, 0),
      'rewards_available', COALESCE(r.available, 0),
      'rewards_redeemed', COALESCE(r.redeemed, 0),
      'redemption_cost_cents', COALESCE(r.cost_cents, 0)) AS c
    FROM auth.users u
    LEFT JOIN public.user_profiles up ON up.id = u.id
    LEFT JOIN (
      SELECT customer_user_id,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             COALESCE(SUM(price_cents) FILTER (WHERE payment_intent_id IS NOT NULL
               AND status NOT IN ('cancelled')), 0) AS spend_cents
      FROM public.bookings GROUP BY customer_user_id
    ) b ON b.customer_user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt, COALESCE(SUM(total_cents), 0) AS spend_cents
      FROM public.orders WHERE status NOT IN ('canceled','cancelled') GROUP BY user_id
    ) o ON o.user_id = u.id
    LEFT JOIN public.loyalty_accounts la ON la.customer_user_id = u.id
    LEFT JOIN (
      SELECT customer_user_id,
             COUNT(*) FILTER (WHERE status = 'available') AS available,
             COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed,
             COALESCE(SUM(redeemed_value_cents) FILTER (WHERE status = 'redeemed'), 0) AS cost_cents
      FROM public.loyalty_rewards GROUP BY customer_user_id
    ) r ON r.customer_user_id = u.id
    WHERE b.customer_user_id IS NOT NULL OR o.user_id IS NOT NULL OR la.customer_user_id IS NOT NULL
    LIMIT 500
  ) sub;

  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  SELECT jsonb_build_object(
    'config', to_jsonb(v_config),
    'stamps_issued', COALESCE((SELECT SUM(stamps_delta) FROM public.loyalty_ledger WHERE event_type = 'earn'), 0),
    'vouchers_minted', COALESCE((SELECT COUNT(*) FROM public.loyalty_rewards), 0),
    'vouchers_available', COALESCE((SELECT COUNT(*) FROM public.loyalty_rewards WHERE status = 'available'), 0),
    'vouchers_redeemed', COALESCE((SELECT COUNT(*) FROM public.loyalty_rewards WHERE status = 'redeemed'), 0),
    'total_redemption_cost_cents', COALESCE((SELECT SUM(redeemed_value_cents)
      FROM public.loyalty_rewards WHERE status = 'redeemed'), 0)
  ) INTO v_program;

  RETURN jsonb_build_object(
    'month', to_char(v_month_start, 'YYYY-MM'),
    'signups', jsonb_build_object('count', v_signup_count, 'list', v_signups),
    'customers', v_customers,
    'program', v_program,
    'generated_at', now(),
    'generated_by', p_user_id
  );
END;
$$;
REVOKE ALL ON FUNCTION private.get_admin_crm_stats_v1(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_admin_crm_stats_v1(uuid, date) TO authenticated;

CREATE FUNCTION public.get_admin_crm_stats_v1(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN private.get_admin_crm_stats_v1(auth.uid(), p_month);
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_crm_stats_v1(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_crm_stats_v1(date) TO authenticated;

CREATE FUNCTION private.admin_update_loyalty_config_v1(
  p_user_id uuid,
  p_stamps_required integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_program_name text DEFAULT NULL,
  p_reward_max_value_cents integer DEFAULT NULL,
  p_clear_reward_cap boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_old public.loyalty_config;
  v_new public.loyalty_config;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied - admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.loyalty_config WHERE id = 1 FOR UPDATE;

  UPDATE public.loyalty_config SET
    stamps_required = COALESCE(p_stamps_required, stamps_required),
    is_active = COALESCE(p_is_active, is_active),
    program_name = COALESCE(NULLIF(TRIM(p_program_name), ''), program_name),
    reward_max_value_cents = CASE WHEN p_clear_reward_cap THEN NULL
                                  ELSE COALESCE(p_reward_max_value_cents, reward_max_value_cents) END,
    updated_at = now(),
    updated_by = p_user_id
  WHERE id = 1
  RETURNING * INTO v_new;

  INSERT INTO public.user_audit_log (user_id, action, resource_type, old_values, new_values)
  VALUES (p_user_id, 'loyalty_config_updated', 'loyalty_config',
          to_jsonb(v_old), to_jsonb(v_new));

  RETURN jsonb_build_object('success', true, 'config', to_jsonb(v_new));
END;
$$;
REVOKE ALL ON FUNCTION private.admin_update_loyalty_config_v1(uuid, integer, boolean, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.admin_update_loyalty_config_v1(uuid, integer, boolean, text, integer, boolean) TO authenticated;

CREATE FUNCTION public.admin_update_loyalty_config_v1(
  p_stamps_required integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_program_name text DEFAULT NULL,
  p_reward_max_value_cents integer DEFAULT NULL,
  p_clear_reward_cap boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN private.admin_update_loyalty_config_v1(auth.uid(), p_stamps_required, p_is_active,
    p_program_name, p_reward_max_value_cents, p_clear_reward_cap);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_loyalty_config_v1(integer, boolean, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_loyalty_config_v1(integer, boolean, text, integer, boolean) TO authenticated;

COMMIT;
