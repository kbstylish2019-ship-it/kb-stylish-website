-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- Loyalty Phase 1: core tables (additive; rollback = DROP TABLE loyalty_ledger, loyalty_rewards,
-- loyalty_accounts, loyalty_config CASCADE)
BEGIN;

-- 1.1 singleton config
CREATE TABLE public.loyalty_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  program_name text NOT NULL DEFAULT 'KB Stylish Rewards',
  is_active boolean NOT NULL DEFAULT true,
  stamps_required integer NOT NULL DEFAULT 5 CHECK (stamps_required BETWEEN 1 AND 100),
  reward_max_value_cents integer NULL CHECK (reward_max_value_cents > 0),
  eligible_service_categories text[] NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id)
);
COMMENT ON TABLE public.loyalty_config IS 'Singleton loyalty program config. Writes only via private.admin_update_loyalty_config_v1.';
INSERT INTO public.loyalty_config (id) VALUES (1);

ALTER TABLE public.loyalty_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Loyalty config readable by everyone" ON public.loyalty_config
  FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.loyalty_config FROM anon, authenticated;
GRANT SELECT ON public.loyalty_config TO anon, authenticated;

-- 1.3 accounts cache
CREATE TABLE public.loyalty_accounts (
  customer_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  current_stamps integer NOT NULL DEFAULT 0 CHECK (current_stamps >= 0),
  lifetime_stamps integer NOT NULL DEFAULT 0 CHECK (lifetime_stamps >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyalty_accounts IS 'Stamp balance cache, rebuildable from loyalty_ledger. Writes only via SECURITY DEFINER loyalty functions.';
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own loyalty account" ON public.loyalty_accounts
  FOR SELECT USING (customer_user_id = auth.uid());
CREATE POLICY "Admins view all loyalty accounts" ON public.loyalty_accounts
  FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.loyalty_accounts FROM anon, authenticated;
GRANT SELECT ON public.loyalty_accounts TO authenticated;

-- 1.4 vouchers
CREATE TABLE public.loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','redeemed','expired','cancelled')),
  earned_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz NULL,
  redeemed_booking_id uuid NULL REFERENCES public.bookings(id),
  redeemed_value_cents integer NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyalty_rewards IS 'Free-booking vouchers minted at stamps_required. Writes only via SECURITY DEFINER loyalty functions.';
CREATE UNIQUE INDEX loyalty_rewards_one_per_booking
  ON public.loyalty_rewards (redeemed_booking_id) WHERE redeemed_booking_id IS NOT NULL;
CREATE INDEX loyalty_rewards_customer_idx ON public.loyalty_rewards (customer_user_id, status);
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own rewards" ON public.loyalty_rewards
  FOR SELECT USING (customer_user_id = auth.uid());
CREATE POLICY "Admins view all rewards" ON public.loyalty_rewards
  FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.loyalty_rewards FROM anon, authenticated;
GRANT SELECT ON public.loyalty_rewards TO authenticated;

-- 1.2 immutable ledger
CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id),
  booking_id uuid NULL REFERENCES public.bookings(id),
  reward_id uuid NULL REFERENCES public.loyalty_rewards(id),
  event_type text NOT NULL CHECK (event_type IN ('earn','redeem','reversal','adjustment')),
  stamps_delta integer NOT NULL DEFAULT 0,
  reward_delta integer NOT NULL DEFAULT 0,
  reason text NULL,
  actor_role text NOT NULL DEFAULT 'system'
    CHECK (actor_role IN ('customer','stylist','admin','system')),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loyalty_ledger IS 'Append-only loyalty source of truth. UNIQUE earn per booking = idempotency backstop. REVOKE UPDATE/DELETE mirrors booking_status_history immutability.';
CREATE UNIQUE INDEX loyalty_ledger_one_earn_per_booking
  ON public.loyalty_ledger (booking_id) WHERE event_type = 'earn';
CREATE INDEX loyalty_ledger_customer_idx ON public.loyalty_ledger (customer_user_id, created_at DESC);
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own ledger" ON public.loyalty_ledger
  FOR SELECT USING (customer_user_id = auth.uid());
CREATE POLICY "Admins view all ledger" ON public.loyalty_ledger
  FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.loyalty_ledger FROM anon, authenticated;
GRANT SELECT ON public.loyalty_ledger TO authenticated;
REVOKE UPDATE, DELETE ON public.loyalty_ledger FROM PUBLIC;

COMMIT;
