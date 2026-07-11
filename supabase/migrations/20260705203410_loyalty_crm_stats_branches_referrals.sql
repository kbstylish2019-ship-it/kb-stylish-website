-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- CURRENT full definition of the admin CRM stats fn: Kathmandu month bucketing (from
-- 20260705100113) + new 'branches' (QR poster ROI) and 'referrals' sections (additive keys).
CREATE OR REPLACE FUNCTION private.get_admin_crm_stats_v1(p_user_id uuid, p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_month_start date := date_trunc('month',
    COALESCE(p_month, (now() AT TIME ZONE 'Asia/Kathmandu')::date))::date;
  v_month_end date := (v_month_start + interval '1 month')::date;
  v_signups jsonb;
  v_signup_count bigint;
  v_customers jsonb;
  v_program jsonb;
  v_branches jsonb;
  v_referrals jsonb;
  v_config public.loyalty_config;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied - admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_signup_count
  FROM auth.users u
  WHERE (u.created_at AT TIME ZONE 'Asia/Kathmandu')::date >= v_month_start
    AND (u.created_at AT TIME ZONE 'Asia/Kathmandu')::date < v_month_end;

  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'created_at' DESC), '[]'::jsonb) INTO v_signups
  FROM (
    SELECT jsonb_build_object(
      'user_id', u.id, 'email', u.email,
      'display_name', up.display_name, 'created_at', u.created_at) AS s
    FROM auth.users u
    LEFT JOIN public.user_profiles up ON up.id = u.id
    WHERE (u.created_at AT TIME ZONE 'Asia/Kathmandu')::date >= v_month_start
      AND (u.created_at AT TIME ZONE 'Asia/Kathmandu')::date < v_month_end
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

  SELECT COALESCE(jsonb_agg(br ORDER BY (br->>'claims_total')::bigint DESC), '[]'::jsonb)
  INTO v_branches
  FROM (
    SELECT jsonb_build_object(
      'branch_id', kb.id, 'branch_name', kb.name, 'referral_code', kb.referral_code,
      'claims_total', COALESCE(a.claims_total, 0),
      'claims_this_month', COALESCE(a.claims_month, 0),
      'converted_customers', COALESCE(conv.converted, 0),
      'attributed_revenue_cents', COALESCE(conv.revenue_cents, 0)) AS br
    FROM public.kb_branches kb
    LEFT JOIN (
      SELECT branch_id, COUNT(*) AS claims_total,
             COUNT(*) FILTER (WHERE (claimed_at AT TIME ZONE 'Asia/Kathmandu')::date >= v_month_start
                              AND (claimed_at AT TIME ZONE 'Asia/Kathmandu')::date < v_month_end) AS claims_month
      FROM public.loyalty_acquisitions GROUP BY branch_id
    ) a ON a.branch_id = kb.id
    LEFT JOIN (
      SELECT la.branch_id,
             COUNT(DISTINCT b.customer_user_id) AS converted,
             COALESCE(SUM(b.price_cents), 0) AS revenue_cents
      FROM public.loyalty_acquisitions la
      JOIN public.bookings b ON b.customer_user_id = la.customer_user_id
        AND b.created_at >= la.claimed_at
        AND b.status = 'completed'
        AND b.payment_intent_id IS NOT NULL
        AND COALESCE(b.is_reward_redemption, false) = false
      GROUP BY la.branch_id
    ) conv ON conv.branch_id = kb.id
    WHERE kb.is_active
  ) sub;

  SELECT jsonb_build_object(
    'total', COALESCE((SELECT COUNT(*) FROM public.loyalty_referrals), 0),
    'rewarded', COALESCE((SELECT COUNT(*) FROM public.loyalty_referrals WHERE rewarded_at IS NOT NULL), 0)
  ) INTO v_referrals;

  RETURN jsonb_build_object(
    'month', to_char(v_month_start, 'YYYY-MM'),
    'timezone', 'Asia/Kathmandu',
    'signups', jsonb_build_object('count', v_signup_count, 'list', v_signups),
    'customers', v_customers,
    'program', v_program,
    'branches', v_branches,
    'referrals', v_referrals,
    'generated_at', now(),
    'generated_by', p_user_id
  );
END;
$$;
