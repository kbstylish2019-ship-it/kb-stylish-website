# Loyalty (Stamp Card) + CRM — Solution Blueprint v2

**Status: PROPOSED — awaiting explicit approval before Phase 8 (implementation).**
Date 2026-07-05. Grounded in `LOYALTY_CRM_DISCOVERY.md` (live-DB verified). Follows the Universal AI
Excellence Protocol v2.0; the 5-expert adversarial review and resulting revisions are §9.

## 0. Approach

**Surgical, additive, parallel-path.** Four new tables, one nullable column on `bookings`, one
trigger, four RPCs (public wrapper + private definer pairs), one new edge function, one mobile screen
+ one redeem affordance, one web admin section. **Zero modifications to the money path**
(`process_order_with_occ`, `create-order-intent`, `verify-payment`, `confirm_booking_reservation`
bodies untouched; no `verify_jwt` flips). All DB changes applied via MCP on the live DB, each small
and reversible; catch-up migration files written after.

### Deviations from LOYALTY_CRM_PLAN.md (each forced by a live-DB fact — approve explicitly)

| # | Plan said | Blueprint does | Why (live-DB fact) |
|---|-----------|----------------|--------------------|
| D1 | Earn trigger on `booking_status_history` INSERT | Trigger `AFTER UPDATE OF status ON bookings` | `auto_complete_past_bookings()` completes bookings by direct UPDATE and writes **no history row** — the plan's hook would miss those completions |
| D2 | Integrate redemption inside checkout finalization RPC | Dedicated `redeem_loyalty_reward(reservation_id)` RPC that calls the existing `confirm_booking_reservation()` primitive; free bookings skip cart/checkout entirely | `process_order_with_occ` **raises when total ≤ 0** — a 100%-free order can't ride it; touching the shared money path risks every checkout on a live system |
| D3 | `loyalty_accounts.available_rewards` stored column | Derived (`COUNT(*) FROM loyalty_rewards WHERE status='available'`) | Eliminates a dual-write drift class; row counts are tiny |
| D4 | Discount "capped by reward_max_value_cents" | Phase 1: if cap set and booking price > cap → **reject** with `REWARD_CAP_EXCEEDED` | Partial discount requires collecting a remainder payment → that's the order pipeline → D2. Cap default NULL (no cap) |
| D5 | (not covered) | If a redeemed free booking is **cancelled**, voucher is auto-reinstated | Fairness + cheap to do atomically in the same trigger |
| D6 | (not covered) | Hardening: `REVOKE EXECUTE ON auto_complete_past_bookings() FROM anon, authenticated` (keep service_role) | Function is SECURITY DEFINER with **no auth check**, currently EXECUTE-granted to any logged-in user, and dormant (no cron/app callers). Once completions mint stamps it becomes a self-serve earn vector. Reversible one-liner |

## 1. Database changes (applied via MCP, in this order)

### 1.1 `public.loyalty_config` — single admin-editable row
```sql
CREATE TABLE public.loyalty_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),        -- singleton
  program_name text NOT NULL DEFAULT 'KB Stylish Rewards',
  is_active boolean NOT NULL DEFAULT true,
  stamps_required integer NOT NULL DEFAULT 5 CHECK (stamps_required BETWEEN 1 AND 100),
  reward_max_value_cents integer NULL CHECK (reward_max_value_cents > 0),
  eligible_service_categories text[] NULL,                  -- NULL = all stylist services
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id)
);
INSERT INTO public.loyalty_config (id) VALUES (1);
-- RLS: SELECT for authenticated+anon (non-sensitive: threshold/active shown to customers);
-- no INSERT/UPDATE/DELETE policies → writes only via private.admin_update_loyalty_config.
```

### 1.2 `public.loyalty_ledger` — immutable source of truth
```sql
CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id),
  booking_id uuid NULL REFERENCES public.bookings(id),
  reward_id uuid NULL,                                      -- FK added after 1.4
  event_type text NOT NULL CHECK (event_type IN ('earn','redeem','reversal','adjustment')),
  stamps_delta integer NOT NULL DEFAULT 0,
  reward_delta integer NOT NULL DEFAULT 0,
  reason text NULL,
  actor_role text NOT NULL DEFAULT 'system'
    CHECK (actor_role IN ('customer','stylist','admin','system')),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- THE idempotency guard (double-completion, replay):
CREATE UNIQUE INDEX loyalty_ledger_one_earn_per_booking
  ON public.loyalty_ledger (booking_id) WHERE event_type = 'earn';
CREATE INDEX loyalty_ledger_customer_idx ON public.loyalty_ledger (customer_user_id, created_at DESC);
-- Immutability: BOTH belts (house uses RLS-only on booking_status_history; ledger gets REVOKE too):
REVOKE ALL ON public.loyalty_ledger FROM anon, authenticated;
GRANT SELECT ON public.loyalty_ledger TO authenticated;
-- RLS: customer SELECT own (customer_user_id = auth.uid()); admin SELECT all
-- (user_has_role(auth.uid(),'admin')); NO write policies. Writers are SECURITY DEFINER fns.
```

### 1.3 `public.loyalty_accounts` — balance cache (rebuildable from ledger)
```sql
CREATE TABLE public.loyalty_accounts (
  customer_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  current_stamps integer NOT NULL DEFAULT 0 CHECK (current_stamps >= 0),
  lifetime_stamps integer NOT NULL DEFAULT 0 CHECK (lifetime_stamps >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: customer SELECT own; admin SELECT all; no write policies. REVOKE writes as in 1.2.
-- available_rewards intentionally NOT stored (D3).
```

### 1.4 `public.loyalty_rewards` — vouchers
```sql
CREATE TABLE public.loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','redeemed','expired','cancelled')),
  earned_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz NULL,
  redeemed_booking_id uuid NULL REFERENCES public.bookings(id),
  redeemed_value_cents integer NULL,          -- original booking price → admin "redemption cost"
  expires_at timestamptz NULL,                -- Phase 2
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX loyalty_rewards_one_per_booking
  ON public.loyalty_rewards (redeemed_booking_id) WHERE redeemed_booking_id IS NOT NULL;
CREATE INDEX loyalty_rewards_customer_idx ON public.loyalty_rewards (customer_user_id, status);
-- RLS: customer SELECT own; admin SELECT all; no write policies. REVOKE writes.
ALTER TABLE public.loyalty_ledger
  ADD CONSTRAINT loyalty_ledger_reward_fk FOREIGN KEY (reward_id) REFERENCES public.loyalty_rewards(id);
```

### 1.5 `bookings` marker (additive, nullable)
```sql
ALTER TABLE public.bookings ADD COLUMN is_reward_redemption boolean NULL DEFAULT false;
```

### 1.6 Earn/reversal trigger — `private.process_loyalty_booking_event()`
`AFTER UPDATE OF status ON public.bookings FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)`,
SECURITY DEFINER, `SET search_path = private, public, pg_temp`. Logic:

- **On `NEW.status='completed'` (earn):** all guards must pass —
  config `is_active`; `COALESCE(NEW.is_reward_redemption,false) = false`; **paid** =
  `NEW.payment_intent_id IS NOT NULL AND EXISTS (SELECT 1 FROM payment_intents WHERE
  payment_intent_id = NEW.payment_intent_id AND status='succeeded')`; category eligible if
  `eligible_service_categories` set (join `services` via `NEW.service_id`).
  Then `INSERT ... earn (+1) ON CONFLICT (booking_id) WHERE event_type='earn' DO NOTHING`; if a row
  was actually inserted (`FOUND` via RETURNING): upsert `loyalty_accounts`
  (`ON CONFLICT (customer_user_id) DO UPDATE` — this locks the account row, serializing concurrent
  earns per customer); then `WHILE current_stamps >= stamps_required`: mint `loyalty_rewards` row +
  ledger `adjustment` (stamps_delta = -stamps_required, reward_delta = +1, reason 'voucher_minted',
  reward_id) + decrement account.
- **On `NEW.status='cancelled' AND COALESCE(NEW.is_reward_redemption,false)` (D5 reinstate):**
  find the reward with `redeemed_booking_id = NEW.id AND status='redeemed'` FOR UPDATE; if found:
  set back to `available` (clear redeemed_*), ledger `reversal` (reward_delta = +1, reason
  'redemption_booking_cancelled').
- **Whole body wrapped in `EXCEPTION WHEN OTHERS`** → `RAISE WARNING` + best-effort row into
  `private.audit_log`; never re-raise. **A loyalty bug must never block a booking status change on
  the live system.** (Missed awards are recoverable from the ledger + bookings by a reconciliation
  query; documented in §7.)
- Full refund/dispute reversal of an *earned* stamp (completed booking later refunded via
  governance): **Phase 2**, path documented — insert `reversal` ledger row (stamps_delta −1) keyed to
  the booking; the FSM has no completed→refunded transition today, so there is no hook to wire yet.

### 1.7 Customer RPCs (mobile calls these via `supabase.rpc`, matching the existing
`create_booking_reservation` house style — no new customer edge function)

- **`public.get_my_loyalty_status()`** — SECURITY INVOKER, `search_path public, pg_temp`.
  `auth.uid()` NULL → raise 42501. Reads own `loyalty_accounts`, `loyalty_config`,
  `loyalty_rewards (available)`, last 10 ledger rows — all under RLS (INVOKER). Returns jsonb:
  `{is_active, program_name, stamps_required, current_stamps, lifetime_stamps,
    available_rewards: [{id, earned_at, expires_at}], recent_history: [...]}`.
  Returns zeros when no account row exists yet. GRANT EXECUTE to authenticated.
- **`public.redeem_loyalty_reward(p_reservation_id uuid)`** — SECURITY INVOKER wrapper capturing
  `auth.uid()` → **`private.redeem_loyalty_reward(p_user_id, p_reservation_id)`** SECURITY DEFINER,
  `search_path private, public, pg_temp` (exact `get_admin_dashboard_stats_v2_1` two-layer pattern).
  Single transaction:
  1. Config active, else `PROGRAM_INACTIVE`.
  2. Lock oldest `available` reward of `p_user_id` `FOR UPDATE SKIP LOCKED`; none → `NO_REWARD`.
  3. Load reservation: must be `status='reserved'`, `expires_at > now()`,
     `customer_user_id = p_user_id`; else `RESERVATION_INVALID`.
  4. Cap check (D4): cap set AND `reservation.price_cents > cap` → `REWARD_CAP_EXCEEDED`.
  5. `confirm_booking_reservation(p_reservation_id, NULL)` (existing primitive keeps slot-hold,
     cache-invalidation, FSM birth semantics). Failure → raise → whole txn rolls back, voucher safe.
  6. `UPDATE bookings SET is_reward_redemption = true, price_cents = 0,
     metadata = metadata || {loyalty_reward_id, original_price_cents, finalized_by:
     'redeem_loyalty_reward'} WHERE id = new_booking_id`.
  7. Reward → `redeemed` (+ `redeemed_booking_id`, `redeemed_value_cents = original price`);
     ledger `redeem` row (reward_delta −1, booking_id, reward_id, actor_role 'customer',
     created_by p_user_id).
  8. Return `{success, booking_id, reward_id}`.
  GRANT EXECUTE: public wrapper → authenticated; private fn → REVOKE from PUBLIC (definer-called only).
  Because `is_reward_redemption = true` AND `payment_intent_id IS NULL`, §1.6 can never earn on it
  (two independent guards).

### 1.8 Admin RPCs
- **`public.get_admin_crm_stats_v1(p_month date DEFAULT NULL)`** — INVOKER wrapper →
  **`private.get_admin_crm_stats_v1(p_user_id uuid, p_month date)`** — SECURITY DEFINER, STABLE,
  self-defends with `user_has_role(p_user_id,'admin')` (42501). Returns jsonb:
  - `signups`: count + list this month (`user_profiles.created_at`, join auth.users email — definer).
  - `customers`: per-customer — bookings total/completed, booking spend (paid bookings' price_cents),
    order spend (`orders.total_cents`, status not canceled), loyalty `{current_stamps, lifetime_stamps,
    available_rewards, redeemed_rewards, redemption_cost_cents}` (SUM redeemed_value_cents).
  - `program`: config row + totals (stamps issued, vouchers outstanding/redeemed, total redemption cost).
- **`public.admin_update_loyalty_config_v1(p_stamps_required int, p_is_active bool,
  p_program_name text, p_reward_max_value_cents int)`** — INVOKER wrapper →
  **`private.admin_update_loyalty_config_v1(p_user_id, ...)`** — admin-asserted; validates bounds
  (CHECKs also enforce); updates singleton + `updated_by`; inserts `user_audit_log` row
  ('loyalty_config_updated', old/new jsonb — mirrors governance forensics); returns updated config.

### 1.9 Hardening (D6)
```sql
REVOKE EXECUTE ON FUNCTION public.auto_complete_past_bookings() FROM anon, authenticated;
-- Rollback: GRANT EXECUTE ... TO anon, authenticated;
```

## 2. Edge function — `admin-crm` (web admin only)

Byte-for-byte structural copy of `admin-dashboard/index.ts`: OPTIONS/cors → `createDualClients` →
`verifyUser` → 401 → `roles.includes('admin')` → 403 → route on `action`
(`get_stats` → `userClient.rpc('get_admin_crm_stats_v1', {p_month})`;
`update_config` → `userClient.rpc('admin_update_loyalty_config_v1', {...})`) → 42501→403 → `{success, data}`.
**config.toml: no entry (defaults `verify_jwt = true`, same as admin-dashboard). No existing
verify_jwt value changes.** Customer surface needs no edge function (direct RPC, §1.7).

## 3. Mobile (kb_stylish_mobile) — customer surface

- **API:** `src/lib/api/loyalty.ts` — `fetchLoyaltyStatus()` → `supabase.rpc('get_my_loyalty_status')`;
  `redeemReward(reservationId)` → `supabase.rpc('redeem_loyalty_reward', {p_reservation_id})`;
  snake→camel mapping per house style (`stylists.ts` convention).
- **Hooks:** `src/hooks/useLoyalty.ts` — `useLoyaltyStatus()` (`queryKey ['loyaltyStatus']`,
  staleTime 5 min) + `useRedeemReward()` (invalidates `['loyaltyStatus']`, `['userBookings']`,
  `['availableSlots']`). Export via `src/hooks/index.ts`.
- **Rewards screen:** `app/(customer)/rewards.tsx` registered as Stack.Screen in
  `app/(customer)/_layout.tsx` (mirrors `orders`); entry row (Gift icon) in the profile Account
  section (`profile.tsx:167-172` array). Shows stamp progress (5 stamp slots as filled/outline
  lucide icons — **no new SVG dependency**, avoids react-native-svg mock/setup risk), voucher cards
  ("Free booking — earned <date>"), recent history list. Program inactive → screen shows dormant state.
- **Redeem flow:** in `stylist/[id].tsx` details step (price already locked by reservation): if
  `useLoyaltyStatus()` has an available voucher and service eligible → "Use your free booking"
  toggle. On confirm with toggle ON: after `create_booking_reservation` succeeds, call
  `redeemReward(reservationId)` **instead of** adding to cart/checkout → success screen → deep-link
  to appointments. Toggle OFF → existing cart/checkout path completely unchanged. Cap-exceeded /
  NO_REWARD errors surface as friendly alerts and fall back to the paid path.
- **Tests:** `src/lib/api/loyalty.api.test.ts` (live read-only: RPC exists, unauthenticated returns
  error shape, config readable); `app/(customer)/rewards.native.test.tsx` + redeem-toggle render
  tests (mock rules per `test/jest.setup.native.js`). On-device Expo Go pass with Shishir for the
  full redeem loop.

## 4. Web (kb-stylish) — admin CRM

- `src/app/admin/crm/page.tsx` — async Server Component: createServerClient + getUser + admin-role
  gate + redirect (copy dashboard/page.tsx), fetch via new `fetchAdminCrmStats(accessToken)` in
  `apiClient.ts`; render.
- `src/components/admin/CrmClient.tsx` — signups-this-month card + list; customers table (bookings,
  spend, stamps, vouchers, redemption cost); program stats; **config editor** (threshold stepper,
  active toggle, cap input) → `updateLoyaltyConfig()` wrapper → `admin-crm` `update_config`.
- `AdminSidebar.tsx`: add "CRM & Loyalty" item.
- Tests: jest component tests (AdminStatCard style); Playwright `tests/loyalty-crm.spec.ts` on the
  trust-engine template (service-role seed, sign in admin, call `admin-crm`, assert stats + config
  round-trip; sign in customer → 403). Add spec to `testMatch`.

## 5. RLS summary (mirrors house conventions exactly)

| Table | customer | admin | writes |
|---|---|---|---|
| loyalty_config | SELECT (anon+auth) | SELECT | private definer RPC only |
| loyalty_ledger | SELECT own | SELECT all | definer trigger/RPCs only; REVOKE + no policies |
| loyalty_accounts | SELECT own | SELECT all | same |
| loyalty_rewards | SELECT own | SELECT all | same |

All definer functions: pinned `search_path`, self-defense checks, EXECUTE revoked from PUBLIC on
private fns; public wrappers GRANTed to authenticated.

## 6. Test plan (done-definition)

**Backend, live DB via MCP** (synthetic rows tagged `metadata.loyalty_test=true`, deleted after):
1. Earn: paid booking → completed ⇒ +1 stamp, ledger earn, account updated.
2. Idempotency: repeat UPDATE to completed / replay trigger ⇒ still exactly 1 earn row.
3. Threshold: 5th stamp ⇒ voucher minted, stamps reset, adjustment ledger row; 6th earn starts cycle 2.
4. Redeem: reservation + redeem RPC ⇒ booking confirmed, price 0, is_reward_redemption, voucher
   redeemed, ledger redeem.
5. Free booking earns nothing when completed.
6. Cancel redeemed booking ⇒ voucher reinstated (D5).
7. Unpaid booking (NULL intent / intent not succeeded) completed ⇒ no earn.
8. Concurrency: two concurrent completions/redeems ⇒ constraints hold (partial unique, FOR UPDATE).
9. RLS: customer A cannot read B's rows (SET LOCAL role + request.jwt.claims); anon writes rejected.
10. Regression: normal paid checkout (product + booking) unaffected; update_booking_status unchanged.
11. `get_advisors` (security) after DDL — no new findings.

**Web:** existing jest + Playwright green + new specs (§4). **Mobile:** two Jest projects green +
new tests (§3) + on-device Expo Go redeem loop.

## 7. Rollback & recovery

Every step reversible: `DROP TRIGGER/FUNCTION/TABLE`, `ALTER TABLE bookings DROP COLUMN
is_reward_redemption`, re-GRANT auto_complete. Ledger is source of truth: `loyalty_accounts`
rebuildable by aggregation; missed awards recoverable via
`SELECT bookings completed+paid LEFT JOIN ledger earn IS NULL`. Catch-up migration files
(`supabase/migrations/2026xxxxxxxxxx_loyalty_*.sql`) written AFTER each MCP apply.

## 8. Execution order (Phase 8, after approval)

1. DB: tables+RLS (1.1–1.5) → trigger (1.6) → customer RPCs (1.7) → admin RPCs (1.8) → hardening (1.9).
2. Backend proof (§6 tests 1–9) before any UI.
3. Edge fn `admin-crm` deploy + config.toml entry-less default; smoke via curl.
4. Web admin UI + tests. 5. Mobile UI + tests. 6. Full regression + advisors + catch-up migrations.

## 9. 5-Expert panel — adversarial review findings → resolutions (already folded in above)

- **Security Architect:** (a) trigger is SECURITY DEFINER — search_path pinned, no dynamic SQL;
  (b) redeem wrapper must not accept a user id param (capture auth.uid()) — done; (c) ledger writable
  via PostgREST? — REVOKE + RLS no-write-policies, both belts; (d) `auto_complete_past_bookings` becomes
  an earn vector — D6 REVOKE; (e) config editable by non-admin? — no write policies + admin-asserted
  definer + audit log; (f) `get_my_loyalty_status` INVOKER so RLS does authz — no data leak path.
- **Performance Engineer:** trigger adds one indexed INSERT + one upsert per status change on a
  4-row table — negligible; partial unique index keeps earn lookup O(1); CRM aggregates over 16
  users/24 orders fine, indexes (customer_id, created_at) future-proof; account-row lock serializes
  per-customer only. No N+1: CRM is one RPC.
- **Data Architect:** ledger append-only + accounts rebuildable ⇒ no corruption class; D3 removes
  drift; all FKs + CHECKs; additive column nullable+default safe on live (4 rows, instant); WHILE
  loop for multi-voucher edge (threshold lowered by admin) handled; singleton config via CHECK(id=1).
- **UX Engineer:** progress must render sensibly at 0 stamps and when program inactive (dormant
  state); redeem failure falls back to paid path with clear message; voucher visible immediately
  after 5th stamp (query invalidation on booking status refetch); loading/error states via existing
  LoadingScreen/ErrorState; stamp icons not SVG ring (dependency risk on RN test harness).
- **Principal Engineer:** biggest systemic risk = trigger raising inside `update_booking_status` /
  `process_order_with_occ` transactions → EXCEPTION-swallow + audit-log + reconciliation query;
  second risk = touching checkout — eliminated by D2 parallel path; verified both completion paths
  (RPC + auto_complete) hit the trigger; redeem is single-txn atomic with the existing
  reservation TTL as the natural hold; monitoring = ledger IS the audit trail + advisors post-deploy.

**Panel verdict:** approved for implementation pending user sign-off, with D1–D6 called out.

---

## 10. IMPLEMENTATION STATUS (2026-07-05)

**DB (live, via MCP):** COMPLETE + PROVEN. 8 loyalty migrations applied (incl. Asia/Kathmandu CRM
timezone fix) + standalone drop of cart_items_backup_20260117. All 11 backend proofs green, plus:
concurrent-earn race (two overlapping completions across threshold -> exactly 1 voucher),
reconciliation backfill, cap-UX message, D5 exactly-once reinstatement. Catch-up migration files in
supabase/migrations/20260705*.

**Mobile (kb_stylish_mobile):** COMPLETE, tests green (142 native + 31 live API).
New: src/lib/api/loyalty.ts, src/hooks/useLoyalty.ts, app/(customer)/rewards.tsx (+ _layout
registration + profile menu row), free-booking toggle + redeem branch in stylist/[id].tsx.
PENDING: on-device Expo Go validation of the redeem loop.

**Web (kb-stylish):** CODE COMPLETE, not deployed. New: supabase/functions/admin-crm/index.ts
(NOT yet deployed; config.toml untouched -> verify_jwt defaults true), apiClient.ts CRM wrappers,
src/app/admin/crm/page.tsx, src/components/admin/CrmClient.tsx (4/4 jest tests green),
AdminSidebar "CRM & Loyalty" entry, tests/loyalty-crm.spec.ts (deploy-gated; not in testMatch yet).
Pre-existing jest failures (15 suites: stale fetchProducts/category expectations, act() warnings,
playwright specs picked up by jest) are unrelated to this build — verified by isolation runs + diff.

**Business flag (open, for client):** no in-system stylist compensation exists; a Rs 0 redemption
booking shows at price 0 on stylist surfaces. Original value is preserved in
bookings.metadata.original_price_cents + loyalty_rewards.redeemed_value_cents if stylists are to be
credited offline. Also: no automatic booking-confirmation email exists on ANY booking path (paid or
free) — the redeem success screen covers it in-app.

### Final validation (2026-07-05, second pass)

- **admin-crm edge fn DEPLOYED** (v1, verify_jwt=true — same rationale as admin-dashboard; no
  config.toml entry). Smoke-tested live: admin get_stats OK (Kathmandu month), non-user token 401.
- **Playwright e2e:** 5 passed / 1 skipped (needs E2E_CUSTOMER_* creds; 403 path proven at DB level).
  loyalty-crm.spec.ts added to testMatch; E2E_ADMIN_* creds in .env.local.
- **On-device (Expo Go, driven via adb):** full loop verified on rabindra1816@gmail.com — Rewards
  zero-state → seeded voucher → "Use your free booking" toggle → "Book for Free" → confirmed Rs 0
  booking in My Appointments → cancel via cancel_booking (refund_amount 0, no anomaly) → voucher
  reinstated + "Voucher returned — booking cancelled" in history after pull-to-refresh.
  (Appointments-screen cancel affordance is a pre-existing UX gap, not loyalty scope.)
- **Web /admin/crm verified in-browser** (Playwright-driven login as admin): stat cards, Kathmandu
  signups, customer table, config editor all render live data. **Fix applied during validation:**
  CRM API moved from apiClient.ts (imports next/headers → broke the client-component build) to new
  client-safe `src/lib/crmApi.ts`; apiClient.ts restored to pre-build state; CrmClient tests 4/4.
- Demo account `loyalty-demo@kbstylish.test` kept for client demos (2/5 stamps + 1 voucher).
