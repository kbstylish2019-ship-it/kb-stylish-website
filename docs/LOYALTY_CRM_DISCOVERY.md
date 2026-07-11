# Loyalty + CRM — Phase 1 Discovery Findings (LIVE DB verified)

**Date:** 2026-07-05. **Source of truth:** live Supabase DB `poxjcaogjupsplrcliau` via MCP.
Migration files were used only as hints; every fact below was verified against production.

---

## 1. Already implemented?

**No.** Zero loyalty/voucher/reward/stamp/referral tables, functions, or code exist — in the live DB,
the web repo, or the mobile repo. The only artifact is a non-functional voucher-code input in the
mobile product cart (`app/(customer)/(tabs)/cart.tsx:224-244`, alerts "coming soon"). Clean build.

## 2. The bookings system (live)

### Table `public.bookings` (RLS on)
Key columns: `id`, `customer_user_id` (FK auth.users), `stylist_user_id` (FK stylist_profiles),
`service_id`, `start_time/end_time`, `price_cents`, `status` (default 'pending'),
`payment_intent_id TEXT` (nullable, joins `payment_intents.payment_intent_id`), `order_item_id` (UNIQUE),
`booking_source` CHECK in ('web','mobile','admin','phone'), `metadata JSONB default {}`, audit/cancel columns.

### Status FSM — `public.validate_status_transition(old,new)` IMMUTABLE
```
pending    → confirmed | cancelled
confirmed  → in_progress | completed | cancelled | no_show
in_progress→ completed | cancelled
completed / cancelled / no_show = TERMINAL (no transitions out)
```
CHECK constraint on `bookings.status` matches these 6 values.

### ⚠️ CRITICAL: there are TWO paths to `status='completed'`
1. **`public.update_booking_status(p_booking_id, p_new_status, p_reason, p_actor_role)`**
   (SECURITY DEFINER, search_path public,pg_temp). Row-locks FOR UPDATE NOWAIT, authorizes stylist
   actor against `stylist_user_id`, validates FSM + timing guards, updates `bookings`,
   **inserts `booking_status_history`**. Idempotent-ish: same-status returns `ALREADY_SET` without history row.
2. **`public.auto_complete_past_bookings()`** (SECURITY DEFINER, **no auth check**,
   GRANTed to anon+authenticated): direct `UPDATE bookings SET status='completed' WHERE status='confirmed'
   AND end_time < NOW() - 1h`. **Writes NO booking_status_history row.** Currently dormant (not in
   pg_cron, no app callers found) but callable by ANY authenticated user via PostgREST RPC.

**Consequence for the plan:** the proposed earn trigger on `booking_status_history` INSERT would MISS
path 2. The earn hook must be `AFTER UPDATE OF status ON public.bookings` (`WHEN old.status IS DISTINCT
FROM new.status AND new.status='completed'`). That catches both paths deterministically.

Existing triggers on `bookings`: `check_stylist_active_before_booking` (BEFORE INSERT),
`trigger_invalidate_cache_on_booking` (AFTER INSERT/UPDATE/DELETE → private.invalidate_availability_cache_async),
`update_bookings_updated_at` (BEFORE UPDATE). No conflict with an AFTER UPDATE earn trigger.

### `booking_status_history` (RLS on)
Immutable-by-policy audit trail: SELECT policies only (admin all; customer/stylist own via EXISTS on
bookings). Default-privilege GRANTs for INSERT/UPDATE/DELETE exist for anon/authenticated but RLS
default-deny blocks writes (no write policies). House style = RLS-based immutability, not REVOKE.
For the loyalty ledger we should do BOTH (REVOKE + RLS), per the plan.

## 3. Checkout finalization (live) — how bookings actually get created & paid

The real finalizer is **`public.process_order_with_occ(p_payment_intent_id, p_webhook_event_id)`**
(SECURITY DEFINER, search_path public,private,metrics,pg_temp) — proven by live booking rows
(`metadata.finalized_by = 'process_order_with_occ'`). Flow:

1. Mobile/web reserve a slot → `create_booking_reservation(...)` (SECURITY DEFINER, TTL 15 min)
   → `booking_reservations` row, returns `reservation_id`, `price_cents`.
2. Checkout → edge fn `create-order-intent` → `payment_intents` row with
   `metadata.booking_reservation_ids = [uuid...]` (+ `metadata.source='mobile_app'` on mobile).
3. Payment success (verify-payment / webhooks / COD immediate) → intent `status='succeeded'`
   → `process_order_with_occ`:
   - Idempotent by `orders.payment_intent_id` (early return if order exists).
   - Requires intent `status='succeeded'`. **RAISES if `v_total_amount <= 0`** ("Order total must be
     greater than zero").
   - Creates `orders` + `order_items` (products), and for each reserved booking id calls
     **`confirm_booking_reservation(reservation_id, payment_intent_id)`** → INSERTs `bookings` with
     `status='confirmed'` (⚠️ direct INSERT — no status_history row for the birth of a booking),
     then stamps `bookings.metadata` with `order_id`, `reservation_id`, `finalized_by`.

**Consequences for the plan:**
- **"PAID" definition:** `bookings.payment_intent_id` → `payment_intents.status='succeeded'`.
  Live data confirms even COD intents are marked `succeeded` at finalization (provider `'cod'`).
  Legacy: 2 old bookings have `payment_intent_id IS NULL` (created via the older direct
  `create_booking` path, status 'pending') — the earn guard must treat NULL-intent bookings as unpaid.
- **A 100%-free redemption booking CANNOT ride the existing order pipeline unchanged** — the
  `<= 0` total check raises. Blueprint must either (a) create the free booking via a dedicated
  SECURITY DEFINER redeem RPC that goes reservation → confirm_booking_reservation directly (keeping
  slot-hold semantics, no payment intent), or (b) thread a discounted-but-nonzero order through.
  Option (a) is cleaner and doesn't touch the money path at all.

## 4. Admin dashboard pattern (live) — the template for loyalty/CRM surfaces

Two-layer RPC pattern, confirmed live:
- `public.get_admin_dashboard_stats_v2_1()` — **SECURITY INVOKER** wrapper, takes `auth.uid()`,
  raises 42501 if NULL, delegates to…
- `private.get_admin_dashboard_stats_v2_1(p_user_id uuid)` — **SECURITY DEFINER**, STABLE,
  search_path 'private, metrics, public, pg_temp', **self-defends**: `IF NOT
  public.user_has_role(p_user_id,'admin') THEN RAISE 'Access denied' 42501`. Reads auth.users +
  metrics.platform_daily, returns a single jsonb.

Edge fn `admin-dashboard` (verify_jwt=true) fronts it. New loyalty RPCs and the CRM RPC must copy
this exact two-layer + self-defense + search_path pattern.

`public.user_has_role(user_uuid, role_name)` = SECURITY DEFINER lookup on user_roles/roles with
is_active + expiry checks. Use it verbatim in RLS policies (matches existing bookings policies).

## 5. RLS conventions (live, verbatim shapes)

- Customer-owned: `USING (customer_user_id = auth.uid())` (bookings SELECT).
- Admin: `USING (user_has_role(auth.uid(),'admin'))` — bookings has admin ALL policy.
- Related-row: EXISTS subquery against parent (booking_status_history).
- Service-role-only: `USING (auth.role() = 'service_role')` (payment_intents ALL).
- Roles array on policies is `{public}` mostly; user_profiles uses `{authenticated}`.

## 6. Ledger/immutability precedents

- `metrics.vendor_daily` — PK (vendor_id, day) idempotent UPSERT pattern; queue-deduped
  (private.metrics_update_queue) — good precedent for the accounts cache.
- `private.payment_gateway_verifications` — UNIQUE(provider, external_transaction_id) as replay/idempotency
  guard — precedent for our `UNIQUE (booking_id) WHERE event_type='earn'` partial unique index.
- `payouts`/`payout_requests` are status-workflow tables (not append-only ledgers); the true
  append-only precedents are `booking_status_history` + `private.audit_log`.
- The payment_intent → process_order idempotency (early-return on existing order) is the
  transactional idempotency template.

## 7. Edge functions + cron (live)

24 deployed functions. Relevant: `admin-dashboard` (verify_jwt=true), `verify-payment`
(**verify_jwt=false — deliberate**, self-secures via gateway verification + idempotency; DO NOT FLIP),
`order-worker` (false, secret-guarded), `create-order-intent` (true), webhooks (npx true/khalti false).
pg_cron: 11 jobs (order queue, metrics, reconciliation, reminders, payment-reconciliation-npx every
3 min). No booking auto-complete job exists.

## 8. Customer stats available for CRM (live)

- Signups: `user_profiles.created_at` (public) / `auth.users.created_at` (definer-only) — admin RPC
  can count/list this month's signups.
- Spend: `orders.total_cents` by `user_id` (products+bookings mixed); bookings spend =
  `bookings.price_cents` where paid. `metrics.*` has no per-customer aggregates — CRM queries go to
  base tables (16 users / 24 orders / 4 bookings today; index accordingly for the future).

## 9. Mobile app patterns (from repo scan; full report in agent log)

- Expo Router; customer tabs at `app/(customer)/(tabs)/_layout.tsx` (5 tabs). New **Rewards** screen
  fits as a stack screen `app/(customer)/rewards.tsx` + profile-menu entry row (mirrors
  orders/appointments), NOT a 6th tab.
- Data access: three coexisting patterns — direct RLS-guarded table reads (orders/bookings), `supabase.rpc`
  (booking reservation flow), edge-fn fetch with anon-key+bearer headers (cart/reviews). Loyalty reads
  fit pattern (a)/(b): direct table reads + `rpc('get_my_loyalty_status')`; add `src/lib/api/loyalty.ts`
  + `src/hooks/useLoyalty.ts` (react-query, invalidate on redeem).
- Booking flow: `stylist/[id].tsx` 3-step wizard → `rpc('create_booking_reservation')` → cart store →
  `checkout.tsx` → `create-order-intent` with `booking_reservation_ids`. Redeem toggle fits in the
  details step or checkout review; **cleanest integration = reservation-based redeem RPC** since price
  locks at reservation time.
- State: zustand (cart) + AuthContext + react-query (5-min staleTime); sign-out clears query cache.
- UI: NativeWind v4, `src/components/ui/*` (Button/EmptyState/ErrorState/LoadingScreen), lucide icons.
  No progress-ring exists — net-new component (verify react-native-svg availability first).
- Tests: two Jest projects — `api` (live read-only) + `native` (jest-expo/RNTL, mock rules in
  `test/jest.setup.native.js`; component mocks must be files under `test/__mocks__/`). Maestro for device E2E.

## 10. Web app patterns (kb-stylish)

- **_shared/auth.ts:** `createDualClients(authHeader)` (auth.ts:19-47) → `{userClient (anon key +
  Authorization header), serviceClient (service-role)}`; `verifyUser(authHeader, userClient)`
  (auth.ts:52-88) → null for guests/anon-key tokens, else `{id, email, roles (from user_metadata/
  app_metadata.user_roles), is_vendor}`; `errorResponse(msg, code, status, corsHeaders)` (auth.ts:93-110).
- **_shared/cors.ts:** `getCorsHeaders(origin)` — allowlist (localhost:3000/3001, vercel preview,
  kbstylish.com.np + www) + env `ALLOWED_ORIGINS`; echoes specific origin, never `*`.
- **admin-dashboard edge fn:** OPTIONS→cors; verifyUser→401; app-layer role check
  `roles.includes('admin')`→403; `userClient.rpc('get_admin_dashboard_stats_v2_1')` (userClient so
  auth.uid() propagates); PG 42501→403; `{success:true, data}`.
- **config.toml verify_jwt:** explicit false = `fulfill-order` (webhooks, no user JWT) and
  `submit-vendor-application` (CRITICAL comment: false allows manual auth handling so the fn controls
  errors/CORS/guest paths). Unlisted functions default TRUE (admin-dashboard). Deployed-function list
  shows more `false` entries set at deploy time (verify-payment, order-worker, review-manager,
  khalti-webhook, send-push, get-curated-content) — each deliberate. **Do not flip any. New loyalty
  admin fn copies admin-dashboard: default verify_jwt=true + internal verifyUser.**
- **Admin UI pattern:** async Server Component `src/app/admin/<section>/page.tsx` (createServerClient
  + getUser + admin-role gate + redirect), typed fetch wrapper per edge fn in `src/lib/apiClient.ts`
  (e.g. `fetchAdminDashboardStats` :1548-1588 — Bearer token, no-store), interactive `*Client.tsx` in
  `src/components/admin/`, nav entry in `AdminSidebar.tsx` groups (:36-99). 16 existing admin pages.
- **Immutability/idempotency precedents in repo:** `booking_status_history` REVOKE UPDATE,DELETE
  (20251016151500:53); `idempotency_key UUID UNIQUE` + ON CONFLICT DO NOTHING (async-commerce infra);
  forensic inserts into `user_audit_log` (governance migration).
- **Testing:** jest (next/jest, jsdom, colocated *.test.tsx); Playwright `testDir ./tests`,
  testMatch currently only `trust-engine.spec.ts`; e2e template = service-role seed client +
  `signInWithPassword` → access_token → `callFunction()` against `/functions/v1/*`.
- **Migration divergence PROVEN:** migrations define `private.get_admin_dashboard_stats_v2_1()` no-arg;
  live DB has `(p_user_id uuid)` + a public SECURITY INVOKER wrapper that exists ONLY in the live DB
  (and db-dump), not in migrations. The "live DB is truth" rule is not theoretical here.

## 11. Security advisories noticed during discovery (pre-existing, NOT loyalty scope)

Surfaced per advisory tooling; decide separately, do not auto-fix:
- 6 tables report RLS disabled: `private.audit_log`, `private.schedule_change_log`,
  `private.availability_cache`, `private.service_management_log`, `private.customer_data_access_log`
  (private schema is not PostgREST-exposed, so practical risk is low) and **`public.cart_items_backup_20260117`**
  (public schema — should be dropped or RLS-enabled).
- `public.auto_complete_past_bookings()` is SECURITY DEFINER with **no auth check** and EXECUTE
  granted to anon/authenticated — any logged-in user can bulk-complete past-due confirmed bookings.
  Today that's cosmetic; **once completions mint stamps it becomes an earn-abuse vector** (customer
  completes their own past booking to earn a stamp without the stylist confirming service). The
  blueprint must address this interaction.
