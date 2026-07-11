-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Loyalty nudges get their own consent flag (default TRUE: program members receive updates
-- about their own stamps/vouchers; opt-out honored via email_preferences + email footer link).
-- receive_promotional_emails defaults false platform-wide, which would have silenced nudges
-- forever. can_send_optional_email extended with ONE additive CASE branch; all existing
-- behavior identical. Also contains the CURRENT full definition of the candidate selector.
BEGIN;

ALTER TABLE public.email_preferences
  ADD COLUMN receive_loyalty_updates boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.can_send_optional_email(p_user_id uuid, p_email_type text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_can_send BOOLEAN := true;
BEGIN
  IF p_email_type IN (
    'order_confirmation',
    'order_shipped',
    'order_delivered',
    'booking_confirmation',
    'vendor_approved',
    'vendor_rejected'
  ) THEN
    RETURN true;
  END IF;

  SELECT
    CASE p_email_type
      WHEN 'booking_reminder' THEN receive_booking_reminders
      WHEN 'review_request' THEN receive_review_requests
      WHEN 'promotional' THEN receive_promotional_emails
      WHEN 'product_recommendation' THEN receive_product_recommendations
      WHEN 'low_stock_alert' THEN receive_low_stock_alerts
      WHEN 'payout_notification' THEN receive_payout_notifications
      WHEN 'new_order_alert' THEN receive_new_order_alerts
      WHEN 'loyalty_update' THEN receive_loyalty_updates
      ELSE true
    END INTO v_can_send
  FROM public.email_preferences
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_can_send, true);
END;
$$;

CREATE OR REPLACE FUNCTION private.get_loyalty_nudge_candidates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_config public.loyalty_config;
  v_result jsonb;
BEGIN
  SELECT * INTO v_config FROM public.loyalty_config WHERE id = 1;
  IF v_config IS NULL OR NOT v_config.is_active THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_result FROM (
    SELECT jsonb_build_object(
      'nudge_type', 'near_reward',
      'user_id', la.customer_user_id,
      'email', u.email,
      'name', COALESCE(up.display_name, 'there'),
      'current_stamps', la.current_stamps,
      'stamps_required', v_config.stamps_required) AS c
    FROM public.loyalty_accounts la
    JOIN auth.users u ON u.id = la.customer_user_id
    LEFT JOIN public.user_profiles up ON up.id = la.customer_user_id
    WHERE la.current_stamps = v_config.stamps_required - 1
      AND u.email IS NOT NULL
      AND public.can_send_optional_email(la.customer_user_id, 'loyalty_update')
      AND NOT EXISTS (SELECT 1 FROM public.loyalty_nudges n
        WHERE n.customer_user_id = la.customer_user_id AND n.nudge_type = 'near_reward'
          AND n.sent_at > now() - interval '14 days')

    UNION ALL

    SELECT jsonb_build_object(
      'nudge_type', 'voucher_reminder',
      'user_id', r.customer_user_id,
      'email', u.email,
      'name', COALESCE(up.display_name, 'there'),
      'voucher_earned_at', min(r.earned_at)) AS c
    FROM public.loyalty_rewards r
    JOIN auth.users u ON u.id = r.customer_user_id
    LEFT JOIN public.user_profiles up ON up.id = r.customer_user_id
    WHERE r.status = 'available' AND r.earned_at < now() - interval '3 days'
      AND u.email IS NOT NULL
      AND public.can_send_optional_email(r.customer_user_id, 'loyalty_update')
      AND NOT EXISTS (SELECT 1 FROM public.loyalty_nudges n
        WHERE n.customer_user_id = r.customer_user_id AND n.nudge_type = 'voucher_reminder'
          AND n.sent_at > now() - interval '14 days')
    GROUP BY r.customer_user_id, u.email, up.display_name

    UNION ALL

    SELECT jsonb_build_object(
      'nudge_type', 'win_back',
      'user_id', b.customer_user_id,
      'email', u.email,
      'name', COALESCE(up.display_name, 'there'),
      'current_stamps', COALESCE(la.current_stamps, 0),
      'stamps_required', v_config.stamps_required,
      'last_visit', max(b.end_time)) AS c
    FROM public.bookings b
    JOIN auth.users u ON u.id = b.customer_user_id
    LEFT JOIN public.user_profiles up ON up.id = b.customer_user_id
    LEFT JOIN public.loyalty_accounts la ON la.customer_user_id = b.customer_user_id
    WHERE b.status = 'completed' AND b.payment_intent_id IS NOT NULL
      AND u.email IS NOT NULL
      AND public.can_send_optional_email(b.customer_user_id, 'loyalty_update')
      AND NOT EXISTS (SELECT 1 FROM public.bookings b2
        WHERE b2.customer_user_id = b.customer_user_id
          AND (b2.status IN ('pending','confirmed','in_progress')
               OR (b2.status = 'completed' AND b2.end_time > now() - interval '56 days')))
      AND NOT EXISTS (SELECT 1 FROM public.loyalty_nudges n
        WHERE n.customer_user_id = b.customer_user_id AND n.nudge_type = 'win_back'
          AND n.sent_at > now() - interval '30 days')
    GROUP BY b.customer_user_id, u.email, up.display_name, la.current_stamps
  ) sub;

  RETURN v_result;
END;
$$;

COMMIT;
