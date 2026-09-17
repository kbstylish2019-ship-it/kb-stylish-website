-- Account deletion (Google Play data-deletion policy + Apple Guideline 5.1.1(v))
--
-- WHY ANONYMISE INSTEAD OF HARD DELETE
-- Verified against the live schema on 2026-08-10: `orders.user_id` references auth.users
-- with ON DELETE **RESTRICT**, and ~30 further FKs (bookings, loyalty_*, user_audit_log,
-- support_messages, …) are **NO ACTION**. A hard `auth.admin.deleteUser()` therefore FAILS
-- for any customer who has ever ordered or booked — which is every real user. This matches
-- the 2026-08-07 cleanup, where 109 test accounts had to be removed with skip-on-error.
--
-- Both stores accept anonymise-and-disable provided the retention is disclosed in the
-- privacy policy. Financial records are retained (Nepal tax/accounting) with the personal
-- identifiers stripped from the profile that renders them.
--
-- SAFETY: self-service only. The function takes no user id — it acts on auth.uid(), so a
-- caller can never delete somebody else's account.

-- ---------------------------------------------------------------------------
-- 1. Audit trail. Also the evidence trail if a store or a user asks us to prove
--    a deletion happened.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  reason         text,
  source         text NOT NULL DEFAULT 'app',   -- 'app' | 'web' | 'support'
  status         text NOT NULL DEFAULT 'completed',
  anonymised_at  timestamptz,
  notes          text
);

COMMENT ON TABLE public.account_deletion_requests IS
  'Audit trail of user-initiated account deletions. Retained deliberately: it is the proof that a deletion was honoured. Contains no PII beyond the (now orphaned) user id.';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- No user-facing policies: only SECURITY DEFINER functions and service_role touch this.
REVOKE ALL ON public.account_deletion_requests FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user
  ON public.account_deletion_requests (user_id, requested_at DESC);

-- ---------------------------------------------------------------------------
-- 2. The deletion itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account(p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_short        text;
  v_has_business boolean;
  v_addresses    integer := 0;
  v_tokens       integer := 0;
  v_carts        integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  v_short := substr(replace(v_uid::text, '-', ''), 1, 12);

  -- Vendors and stylists carry payout balances and contractual obligations. Deleting
  -- them silently would strand money, so route those to a human instead. The store
  -- requirement is satisfied because a deletion PATH exists (support), and the app
  -- surfaces this message rather than failing opaquely.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND COALESCE(ur.is_active, true)
      AND r.name IN ('vendor', 'stylist', 'admin')
  ) INTO v_has_business;

  IF v_has_business THEN
    RAISE EXCEPTION 'BUSINESS_ACCOUNT'
      USING ERRCODE = '23514',
            HINT = 'Vendor, stylist and admin accounts must be closed by support so pending payouts and bookings can be settled first.';
  END IF;

  -- Record BEFORE mutating, so a mid-way failure still leaves a trace.
  INSERT INTO public.account_deletion_requests (user_id, reason, source, status)
  VALUES (v_uid, p_reason, 'app', 'in_progress');

  -- 2a. Hard-delete the things that are purely personal and carry no accounting value.
  DELETE FROM public.user_addresses WHERE user_id = v_uid;
  GET DIAGNOSTICS v_addresses = ROW_COUNT;

  DELETE FROM public.device_push_tokens WHERE user_id = v_uid;
  GET DIAGNOSTICS v_tokens = ROW_COUNT;

  DELETE FROM public.carts WHERE user_id = v_uid;
  GET DIAGNOSTICS v_carts = ROW_COUNT;

  -- 2b. Strip the identity. reviews/bookings/orders join to user_profiles for the
  --     author name, so anonymising here anonymises everywhere it is displayed.
  UPDATE public.user_profiles
  SET display_name = 'Deleted User',
      username     = 'deleted_' || v_short,
      avatar_url   = NULL,
      bio          = NULL,
      updated_at   = now()
  WHERE id = v_uid;

  UPDATE public.user_private_data
  SET email             = NULL,
      phone             = NULL,
      date_of_birth     = NULL,
      marketing_consent = false,
      updated_at        = now()
  WHERE user_id = v_uid;

  -- 2c. Revoke every role so nothing can be accessed even if a session survives.
  UPDATE public.user_roles
  SET is_active = false
  WHERE user_id = v_uid;

  -- Force JWT invalidation for clients that check role_version.
  UPDATE public.user_profiles
  SET role_version = COALESCE(role_version, 0) + 1
  WHERE id = v_uid;

  UPDATE public.account_deletion_requests
  SET status = 'completed', anonymised_at = now()
  WHERE user_id = v_uid AND status = 'in_progress';

  RETURN jsonb_build_object(
    'success', true,
    'addresses_deleted', v_addresses,
    'push_tokens_deleted', v_tokens,
    'carts_deleted', v_carts
  );
END;
$$;

COMMENT ON FUNCTION public.delete_my_account(text) IS
  'Self-service account deletion for the mobile app and website. Anonymises the profile, deletes personal records, revokes roles. Financial records are retained with identifiers stripped (Nepal accounting law) — this retention is disclosed in the privacy policy. The auth row is disabled separately by the delete-account edge function.';

REVOKE ALL ON FUNCTION public.delete_my_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;
