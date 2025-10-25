
# 🔎 The Final Forensic Audit & Restoration Blueprint (Consolidated)

Date/Time: 2025-09-24T11:39:12+05:45

## 1) Executive Summary

- **[Primary Root Cause]** Server-only logout via `src/app/actions/auth.ts` does not trigger client `onAuthStateChange`, leaving `src/lib/api/cartClient.ts` with a stale cached JWT and without `x-guest-token` on requests. The `cart-manager` Edge Function requires `x-guest-token` to fall back to guest mode when JWT verification fails.
- **[SSR Contract Mismatch]** `src/app/layout.tsx` forwards cookies to the Edge Function and does not set `x-guest-token`; the Edge Function ignores cookies and only reads headers.
- **[Client Token Desync]** `src/components/CartInitializer.tsx` overwrites the server-issued `guest_token` cookie with a stale localStorage token, breaking cart preservation on logout.
- **[FE/BE Drift]** Local repo Edge Function code differs from the deployed v26 (live EF now returns updated cart on mutations; local code previously returned just `{success}`), causing store synchronization issues during development.
- **[Booking Logic Drift]** Live DB `get_available_slots()` returns both `status` and `is_available` columns, while earlier migrations defined only one. Grants to `anon`, `authenticated`, and `service_role` are present in production.
- **[Security & Perf Advisory]** Supabase advisors found RLS and function search_path issues, many unindexed FKs, and a duplicate index.

## 2) Root Cause of Logout Bug (Step-by-Step)

- **[Server Action Logout]** `src/app/actions/auth.ts` `signOut()` converts user cart to guest (`convert_user_cart_to_guest`) and sets a new `guest_token` cookie, then calls server-side `supabase.auth.signOut()` and redirects.
- **[No Client Event]** The browser Supabase client never calls `auth.signOut()`; `src/components/AuthSessionManager.tsx` may not receive `onAuthStateChange('SIGNED_OUT')` in time or at all.
- **[Stale JWT Cache]** `src/lib/api/cartClient.ts` caches `currentSession` and keeps sending the old JWT.
- **[Missing x-guest-token]** `cartClient.getAuthHeaders()` only sets `x-guest-token` for unauthenticated users. With stale JWT present, guest fallback header is omitted.
- **[Edge Function Requirement]** `supabase/functions/cart-manager/index.ts` v26 (live) accepts guest fallback only when `x-guest-token` is present. Without it, and with a failed JWT, the EF returns 401.
- **[SSR/Init Drift]** `src/app/layout.tsx` forwards `cookie` header to EF (ignored by EF) and misses `x-guest-token`; then `src/components/CartInitializer.tsx` overwrites the freshly minted server cookie with the old localStorage token, desynchronizing the preserved cart.

## 3) Additional Findings (Unknown Bugs & Inconsistencies)

- **[Local vs Deployed Edge Function]**
  - Local file `supabase/functions/cart-manager/index.ts` (in repo) originally returned only `{success,message}` for mutations (add/update/remove/clear).
  - Live EF v26 (fetched via MCP) now returns the full updated cart after mutations, which the store expects. Actionable: align repository code with deployed EF to avoid drift.

- **[Store Hydration Mapping]**
  - `src/lib/store/decoupledCartStore.ts` `initializeCart(initialData)` maps `initialData.items` only. EF `get` returns `cart_items` (mapped internally from `items`). Actionable: accept `initialData.cart_items || initialData.items` consistently across all paths.

- **[SSR Cart Fetch Headers]**
  - `src/app/layout.tsx` sets `Authorization` but sends `cookie` instead of `x-guest-token`. EF reads `x-guest-token` only. Actionable: read `guest_token` cookie server-side and set `x-guest-token` header; stop forwarding raw cookies to EF.

- **[Guest Token Utilities]**
  - `src/lib/api/cartClient.ts` contains legacy token helpers and a `clearGuestToken()` that does not actually clear localStorage/cookie. Actionable: remove or unify with `src/lib/cart/guestToken.ts` and use that source of truth only.

- **[CORS Divergence]**
  - `cart-manager` live EF uses dynamic CORS with `Access-Control-Allow-Credentials: true` and explicit allowed origins (good for `credentials: 'include'`).
  - `create-order-intent`, `order-worker`, `fulfill-order` use wildcard `'*'` CORS without credentials. This is acceptable for their auth patterns (JWT or service role) but consider unifying patterns and explicitly listing origins for defense-in-depth.

- **[Booking Engine Function Drift]**
  - Live DB function signature (via MCP SQL) for `public.get_available_slots(p_stylist_id uuid, p_service_id uuid, p_target_date date, p_customer_timezone text)` returns table columns: `slot_start_utc, slot_end_utc, slot_start_local, slot_end_local, slot_display, status text, is_available boolean, price_cents integer`.
  - This indicates both `status` and `is_available` are present simultaneously in production. Frontend should use `status` but duplication can confuse maintainers. Grants include `anon`, `authenticated`, `service_role`—pre-login browsing remains allowed.

## 4) Supabase MCP Backend Audit (Live)

- **[Projects]** `kbstylish website` (id: `poxjcaogjupsplrcliau`).

- **[Edge Functions]**
  - `cart-manager` v26, `verify_jwt=false`. Live code uses dual-client auth and requires `x-guest-token` for guests. Returns full cart on mutations.
  - `create-order-intent` v1, `verify_jwt=true`. Wildcard CORS (no credentials). Requires user JWT.
  - `order-worker` v1, `verify_jwt=true`. Service role internal operations; wildcard CORS acceptable.
  - `fulfill-order` v3, `verify_jwt=false`. Webhook ingestion; wildcard CORS.
  - `cache-invalidator` v4, `verify_jwt=true`.

- **[Database Functions & Overloads]**
  - No duplicate overloads among critical cart functions (previous migration issues resolved).
  - `verify_guest_session(text)` simplified single-arg implementation present (good).
  - `get_cart_details_secure`, `add_to_cart_secure`, `update_cart_item_secure`, `remove_item_secure`, `clear_cart_secure`, `merge_carts_secure` signatures match hardened expectations.

- **[Function Grants]**
  - `get_available_slots` has EXECUTE for `anon`, `authenticated`, `service_role` (live). This supports browsing before login.

- **[Supabase Advisors — Security]**
  - **RLS Enabled No Policy**: `public.job_queue`, `public.webhook_events` (INFO). If used exclusively via service role, this can be intentional; document it.
  - **RLS Disabled in Public (ERROR)**: `public.product_change_log` has RLS disabled. Action: enable RLS or move to private schema; add policies.
  - **Function search_path mutable (WARN)**: Many public functions without fixed `search_path`. Action: set `SET search_path` for SECURITY DEFINER functions and critical RPCs.
  - **Extensions in public (WARN)**: `pgjwt`, `btree_gist` in `public`. Action: consider moving to `extensions` schema.
  - **Auth leaked password protection (WARN)**: Consider enabling leaked password protection.

- **[Supabase Advisors — Performance]**
  - **Unindexed FKs (INFO)**: Numerous FKs lack covering indexes (e.g., `cart_items.variant_id`, `bookings.service_id`, `orders.payment_intent_id`). Action: add indexes.
  - **Duplicate Index (WARN)**: `stylist_services` has duplicate indexes `{idx_stylist_services_active, idx_stylist_services_lookup}`. Action: drop one.
  - **Multiple permissive policies (WARN)**: Several tables have multiple permissive RLS policies for the same role/action. Action: consolidate policies to reduce evaluation overhead.

## 5) Restoration Plan (Surgical, Phased)

### Phase 1 — Session & Token Synchronization (Fix Logout Bug)

- **[cartClient headers]** Update `src/lib/api/cartClient.ts` `getAuthHeaders()` to always attach `x-guest-token = getOrCreateGuestToken()` for both authenticated and guest requests. Keep `Authorization` as JWT when present, else anon key.
- **[CartInitializer adoption]** In `src/components/CartInitializer.tsx`, on mount, if a `guest_token` cookie exists and differs from localStorage, adopt the cookie value into localStorage (do not overwrite server cookie with stale localStorage). Then call `cartAPI.refreshSession()` before `initializeCart()`.
- **[RootLayout SSR fetch]** In `src/app/layout.tsx`, stop forwarding `cookie` to EF. Read `guest_token` with `cookies()` and set `x-guest-token` header when calling `cart-manager`.
- **[AuthSessionManager as secondary]** Keep listener but also trigger `cartAPI.refreshSession()` and `useDecoupledCartStore.getState().syncWithServer()` on visibility change and on any auth event for robustness.

### Phase 2 — FE/BE Contract Alignment

- **[Edge Function parity]** Align repo `supabase/functions/cart-manager/index.ts` with live v26 behavior (return full updated cart after `add/update/remove/clear`).
- **[Store hydration]** In `decoupledCartStore.initializeCart`, always map `initialData.cart_items || initialData.items || []` and in API responses use `response.cart.cart_items || response.cart.items`.

### Phase 3 — Booking Engine Consistency

- **[Function schema]** Standardize `get_available_slots()` to the latest production schema returning `status` (and if retaining `is_available`, document usage). Ensure break-time fields align with actual table columns (local vs UTC naming) and TZ conversion is consistent.
- **[Grants]** Confirm `anon` access is desired for pre-login UX; otherwise route via an EF with explicit checks.

### Phase 4 — Security Hardening & Hygiene

- **[Cookie flags]** In `src/lib/cart/guestToken.ts`, set `Secure` when `process.env.NODE_ENV === 'production'` and prefer `SameSite=Strict`.
- **[Remove legacy helpers]** Delete unused/duplicate guest token helpers in `cartClient.ts`; rely on `src/lib/cart/guestToken.ts` only.
- **[Advisors remediation]**
  - Enable RLS on `public.product_change_log` or move to private schema. Add explicit policies or limit to service role.
  - Add covering indexes for flagged foreign keys (see advisor list for exact columns).
  - Drop duplicate index on `stylist_services`.
  - Set immutable `search_path` on SECURITY DEFINER and public-facing functions.
  - Consider moving extensions to `extensions` schema.

## 6) Verification (Post-Fix)

- **[Immediate]**
  - Cart calls after logout show `Authorization: Bearer <anon_key>` and `x-guest-token: <uuid>` on network tab without page refresh.
  - `cartAPI.currentSession` is null after redirect; `getCart()` succeeds as guest.
  - SSR cart hydration is populated (no empty flash), using `cart_items`.

- **[Mutations]**
  - Add/Update/Remove return updated cart from EF; store reflects changes without extra fetch.

- **[Slots]**
  - Booking grid renders with `status`-driven UI; if `is_available` remains, it does not conflict with UI logic.

## 7) Reference SQL & Patches

```sql
-- Example: Enable RLS on product_change_log and add a read policy (adjust as needed)
ALTER TABLE public.product_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_change_log_read ON public.product_change_log
FOR SELECT TO authenticated USING (true);

-- Example: Add covering FK index
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON public.cart_items(variant_id);

-- Example: Drop duplicate index
DROP INDEX IF EXISTS public.idx_stylist_services_lookup;

-- Example: Set stable search_path on a SECURITY DEFINER function
ALTER FUNCTION public.get_cart_details_secure(uuid, text)
  OWNER TO postgres; -- ensure correct owner
COMMENT ON FUNCTION public.get_cart_details_secure(uuid, text) IS 'search_path pinned by deployment script';
-- (In creation DDL, include: SET search_path = public, pg_temp;)
```

---

## 8) Execution Plan

- **[Step 1]** Implement Phase 1 changes in `cartClient.ts`, `CartInitializer.tsx`, and `app/layout.tsx`.
- **[Step 2]** Align local `cart-manager` EF with live v26 and redeploy.
- **[Step 3]** Adjust `decoupledCartStore` hydration mapping; quick regression test.
- **[Step 4]** Optionally refine `AuthSessionManager` as a secondary mechanism.
- **[Step 5]** Address booking function schema comments and confirm grants.
- **[Step 6]** Apply RLS/index/search_path cleanups as separate DB migrations.

All steps will be executed incrementally with verification at each stage.
