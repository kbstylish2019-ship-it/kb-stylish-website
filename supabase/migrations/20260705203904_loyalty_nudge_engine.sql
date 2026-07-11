-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Phase 2B: nudge tracking table + record fn. The candidate-selection function
-- private.get_loyalty_nudge_candidates was superseded the same day by
-- 20260705204203_loyalty_nudge_consent_flag.sql (final definition lives there).
BEGIN;

CREATE TABLE public.loyalty_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id),
  nudge_type text NOT NULL CHECK (nudge_type IN ('near_reward','voucher_reminder','win_back')),
  sent_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyalty_nudges IS 'Dedup log for loyalty nudge emails (near_reward/voucher_reminder: 14d window; win_back: 30d).';
CREATE INDEX loyalty_nudges_dedup_idx ON public.loyalty_nudges (customer_user_id, nudge_type, sent_at DESC);
ALTER TABLE public.loyalty_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view nudges" ON public.loyalty_nudges
  FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.loyalty_nudges FROM anon, authenticated;

CREATE FUNCTION private.record_loyalty_nudge(p_user_id uuid, p_nudge_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.loyalty_nudges (customer_user_id, nudge_type) VALUES (p_user_id, p_nudge_type);
END;
$$;
REVOKE ALL ON FUNCTION private.record_loyalty_nudge(uuid, text) FROM PUBLIC, anon, authenticated;

COMMIT;
