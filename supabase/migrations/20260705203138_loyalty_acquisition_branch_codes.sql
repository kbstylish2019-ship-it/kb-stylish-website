-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Phase 2A: per-branch referral codes + acquisition attribution table.
-- Rollback: ALTER TABLE public.kb_branches DROP COLUMN referral_code;
--           DROP TABLE public.loyalty_acquisitions;
BEGIN;

ALTER TABLE public.kb_branches ADD COLUMN referral_code text NULL;
CREATE UNIQUE INDEX kb_branches_referral_code_key ON public.kb_branches (upper(referral_code))
  WHERE referral_code IS NOT NULL;
COMMENT ON COLUMN public.kb_branches.referral_code IS 'Human-readable salon code printed on QR posters (welcome-stamp attribution).';

UPDATE public.kb_branches
SET referral_code = upper(regexp_replace(split_part(name, '_', 2), '[^a-zA-Z0-9]', '', 'g'))
WHERE referral_code IS NULL AND split_part(name, '_', 2) <> '';

CREATE TABLE public.loyalty_acquisitions (
  customer_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  branch_id uuid NOT NULL REFERENCES public.kb_branches(id),
  source text NOT NULL DEFAULT 'code' CHECK (source IN ('qr','code','staff','referrer')),
  device_id text NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyalty_acquisitions IS 'Salon-poster welcome-stamp claims: which branch acquired which customer. One per account (PK) and one per device (partial unique).';
CREATE UNIQUE INDEX loyalty_acquisitions_one_per_device
  ON public.loyalty_acquisitions (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX loyalty_acquisitions_branch_idx ON public.loyalty_acquisitions (branch_id, claimed_at DESC);

ALTER TABLE public.loyalty_acquisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own acquisition" ON public.loyalty_acquisitions
  FOR SELECT USING (customer_user_id = auth.uid());
CREATE POLICY "Admins view all acquisitions" ON public.loyalty_acquisitions
  FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.loyalty_acquisitions FROM anon, authenticated;
GRANT SELECT ON public.loyalty_acquisitions TO authenticated;

COMMIT;
