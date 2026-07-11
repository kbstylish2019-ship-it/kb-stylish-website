# KB Stylish — Loyalty (Stamp Card) + CRM — Build Plan

**Status:** APPROVED for planning (product decisions locked). Author: DTI. Date: 2026-07-05.
**Read this fully, then produce your own implementation plan and get it reviewed BEFORE writing code.**

---

## 0. Product decisions (LOCKED — do not re-litigate)

1. **Model = Stamp card.** Each *completed, paid* stylist booking = **1 stamp**. At **N stamps
   (default 5, admin-configurable)** the customer earns **1 free-booking voucher**.
2. **Stylist bookings only.** Product orders never earn stamps (products are B2B).
3. **Redeemed free bookings do NOT earn a stamp** (prevents an infinite free loop; protects margin).
4. **Referral / acquisition hooks = Phase 2**, not now. Ship the earn→redeem loop + visibility first.
5. Customer must see progress ("3/5 to your free booking") + available vouchers.
6. Admin must see CRM: new signups this month, bookings & spend per customer, loyalty status,
   redemption cost — and edit the program config (threshold, active on/off).

### Surfaces (IMPORTANT)
- **Customer-facing = MOBILE app** (`kb_stylish_mobile`, Expo / React Native) — the progress,
  vouchers, and "use your free booking" flow live here.
- **Admin CRM = WEB app** (`kb-stylish`, Next.js). Admin is NOT built on mobile — do not add it there.
- **Backend is shared** (one Supabase project) — schema, RLS, triggers, RPCs, edge functions serve
  both. Build the backend once; wire mobile (customer) + web (admin) to it.

---

## 1. Non-negotiable methodology (the client's system is mature — respect it)

**Live production. Do NOT move fast and break things.**

**FOLLOW THE HOUSE PROTOCOL — it already encodes all of this:**
- `kb-stylish/docs/all other docs/UNIVERSAL_AI_EXCELLENCE_PROMPT.md` (v2.0) + its
  `HOW_TO_USE_AI_EXCELLENCE_PROTOCOL.md`. Phases 1–7 (immersion → 5-expert panel → consistency →
  blueprint → reviews) come BEFORE any code. Get explicit approval before Phase 8 (implementation).
- `kb_stylish_mobile/docs/AI_AGENT_ONBOARDING.md` for the mobile side.

**THE LIVE DATABASE IS THE ONLY SOURCE OF TRUTH — NOT the migration files.**
- Supabase MCP is connected to the live project (ref `poxjcaogjupsplrcliau`). Migration/source
  files are often stale or diverge from prod (things get changed directly in production).
- **READ** the real schema/RLS/functions/secrets via the MCP. **APPLY** all DB changes THROUGH the
  MCP against the live DB. Do not design from, or trust, the `supabase/migrations/*` files — use
  them only as loose historical hints, and verify every assumption against the live DB via MCP.

1. **Discovery first (via MCP on the live DB).** Before designing, inspect and summarize how these
   actually work IN PRODUCTION:
   - `supabase/migrations/*booking*` — the `bookings` table, status FSM, `update_booking_status`,
     `booking_status_history`, and the booking **checkout finalization** RPC
     (`20260310143000_restore_booking_checkout_finalization.sql` + related).
   - `supabase/functions/admin-dashboard/index.ts` + its RPC `get_admin_dashboard_stats_v2_1`
     (defined in `20251007074500_create_governance_logic.sql`).
   - `supabase/functions/_shared/auth.ts` (`createDualClients`, `verifyUser`) and `_shared/cors.ts`.
   - `supabase/config.toml` — **understand WHY** each function sets `verify_jwt` true/false.
     Some are `false` ON PURPOSE (manual auth + CORS inside the function). There is a `CRITICAL`
     comment there. **Do not flip any existing `verify_jwt` value.** New functions copy the
     established pattern.
   - The vendor **payout/governance ledger** — mirror its immutability + idempotency + audit pattern
     for the loyalty ledger.
   - RLS patterns on existing user-facing tables.
2. **Check-if-already-implemented** for every piece before building it.
3. **Adversarial review gate = the protocol's 5-expert panel + Codex review.** After the blueprint,
   attack it wearing security/DBA hats: RLS holes, idempotency/double-award races, live-DB change
   safety, and any way it breaks existing bookings/checkout. Revise, THEN code.
4. **Additive, reversible DB changes applied via the MCP on the live DB.** New tables; add columns to
   existing tables only as NULLABLE with defaults. No destructive changes. Keep each change small and
   reversible; record what you applied (write a matching migration file for history AFTER applying,
   so the repo catches up — but the live DB via MCP is what you build and test against).
5. **Prove nothing breaks.** WEB (admin): run the existing jest + Playwright suites and add new ones.
   MOBILE (customer): Playwright does NOT drive the Expo app — validate via Expo Go on-device
   (Shishir keeps a device on USB debugging) and/or the agent driving the Expo dev client; write
   RN component/logic tests where possible. Backend logic is testable directly against the live DB
   via MCP (earn/redeem/idempotency/RLS). Work on a branch.
6. Use `/find-skills` to pull Supabase/Postgres/security-review skills. The Supabase MCP is your
   primary DB tool.

---

## 2. Proposed data model (new migration — VALIDATE against discovery first)

- **`loyalty_config`** (admin-editable, single active row): `stamps_required INT default 5`,
  `is_active BOOL`, `program_name TEXT`, optional `reward_max_value_cents INT` (cap free-booking
  value), optional `eligible_service_categories TEXT[]` (null = all), timestamps.
- **`loyalty_ledger`** (IMMUTABLE source of truth — mirror payout ledger): `id`, `customer_user_id`,
  `booking_id` (nullable), `event_type` (`earn`|`redeem`|`reversal`|`adjustment`),
  `stamps_delta INT`, `reward_delta INT`, `reason TEXT`, `actor_role`, `created_by`, `created_at`.
  `REVOKE UPDATE, DELETE`. **Unique(booking_id) WHERE event_type='earn'** → idempotent earn.
- **`loyalty_accounts`** (fast balance cache, rebuilt from ledger): `customer_user_id` PK,
  `current_stamps INT`, `lifetime_stamps INT`, `available_rewards INT`, timestamps.
- **`loyalty_rewards`** (vouchers): `id`, `customer_user_id`, `status` (`available`|`redeemed`|`expired`),
  `earned_at`, `redeemed_at`, `redeemed_booking_id`, optional `expires_at`.

## 3. Earn logic
- **Trigger** `award_loyalty_on_completion()` on `booking_status_history` INSERT WHERE
  `new_status='completed'` (single, deterministic hook; the FSM guarantees one such row).
- Guard: award only if booking is **paid AND not a reward redemption** (see §4 marker) and no prior
  `earn` ledger row for that `booking_id` (unique constraint enforces idempotency).
- Insert ledger `earn (+1 stamp)`; update `loyalty_accounts`; if `current_stamps >= stamps_required`,
  mint a `loyalty_rewards` voucher and deduct `stamps_required` stamps (ledger keeps full history).
- **Reversal:** if a completed booking is later refunded/disputed via governance, insert a `reversal`
  ledger row and decrement (Phase 1: stub the path + document; wire fully in Phase 2 if time-boxed).

## 4. Redemption logic
- At **booking checkout**, if the customer has an `available` voucher and opts in: apply 100% discount
  (capped by `reward_max_value_cents` if set), mark that booking as a redemption
  (`is_reward_redemption BOOLEAN default false` — new nullable column on `bookings`), consume the
  voucher (`redeem`, `reward_delta -1`). Because of §3's guard, that booking will NOT earn a stamp.
- **Integrate inside the existing checkout finalization RPC** — read it first; keep availability/hold
  logic intact; the free booking still occupies a real slot.

## 5. Customer visibility — MOBILE app (`kb_stylish_mobile`, Expo/RN)
- New RPC `get_my_loyalty_status()` (SECURITY INVOKER, `auth.uid()`) → current/required stamps,
  available vouchers, recent history. Surface via a new edge function following the EXACT
  admin-dashboard pattern (auth + CORS + wrapper RPC), or a direct RLS-guarded query if that's the
  house style — match what the mobile app already does for customer reads.
- Mobile UI: a "Rewards" screen (progress ring `current/required`, voucher list) + a "Use your free
  booking" affordance in the mobile booking flow. Reuse existing mobile patterns/components
  (`AI_AGENT_ONBOARDING.md` names the reference patterns). Validate on Expo Go.

## 6. Admin CRM — WEB app (`kb-stylish`, Next.js)
- Extend `admin-dashboard` (or add `admin-crm` following the same pattern) with, all admin-role-gated
  in-DB: new signups this month (count + list), bookings/spend/completed per customer, per-customer
  loyalty status, redemption count + cost, and a `loyalty_config` editor (set threshold, toggle active).
- Admin UI lives in the web app only. Do NOT build admin screens on mobile.

## 7. RLS
- Loyalty tables: customer `SELECT` own rows only; writes exclusively via SECURITY DEFINER
  triggers/RPCs; admin reads all. Mirror existing RLS conventions exactly.

## 8. Testing / done-definition
- **Backend (via MCP on live DB):** earn-on-completion, threshold→voucher, redeem→free booking, free
  booking does NOT earn, double-completion idempotency, RLS (customer can't see others'). This is the
  core correctness — prove it at the DB layer directly.
- **Web admin:** existing jest + Playwright suites stay green; add e2e for the CRM + config editor.
- **Mobile customer:** Playwright can't drive Expo — validate the Rewards screen + redeem flow on
  Expo Go (Shishir on-device) and/or agent-driven Expo dev client; add RN logic/component tests.
- Existing suites still green. Any DB change is reversible and recorded as a catch-up migration.

## 9. Phasing
- **Phase 1 (ship):** §2 schema, §3 earn trigger, §4 redemption at checkout, §5 customer visibility,
  §6 admin CRM read + config, §7 RLS, §8 tests.
- **Phase 2:** referral/acquisition hooks (codes + signup bonus), full reversal-on-refund, voucher expiry.
