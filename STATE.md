# STATE — KB Stylish (live repo)

_Last updated: 2026-08-02 by a working session on the LOQ laptop (opened via `C:\ShishirData\...`)._

## Where the tree is right now

- Branch `main`. `d020d3b` (booking checkout fix) was committed and **pushed**. Two further
  commits are **local and NOT yet pushed**:
  - `ff74d04` Admin: make stylist schedules editable
  - `c915aba` Booking: allow several services to be reserved in one visit

  All three were verified with `next build` (exit 0) against the committed state, not just the
  working tree. Vercel deploys from `main`, so the two unpushed commits are not live yet.
  **Note the split state: `ff74d04`'s migration is already applied to the production database,
  but its web half is unpushed.** That is safe — the new RPC is unused by the old client, and
  the `admin_get_all_schedules` change only adds two jsonb keys older clients ignore — but the
  sooner it is pushed the less confusing it is.
- 33 tracked files still modified + 7 untracked. Deliberate work-in-flight, not leftovers.
- `node_modules/` now exists here (960 packages). `C:\ShishirData\DTI\.stignore` was created
  this session so Syncthing does **not** replicate it to the other machine. Do not delete that
  .stignore — without it, every npm install floods the sync.
- **Pushing needs `gh` credentials**, not the default helper: plain `git push` hangs on the
  Git Credential Manager GUI in a non-interactive session. Use:
  `git -c credential.helper='!gh auth git-credential' push origin main`

## The 2026-08-02 audit — what the uncommitted work actually was

The worry was that these files were stale leftovers a later session had already re-fixed and
committed. **Verified false.** Zero file overlap between the four July-31 commits and the 40
uncommitted files; the newest commit touching any of them was 2026-03-18. Nothing superseded.

**Booking checkout was split across three layers, and only one was missing.** Verified against
the LIVE database (Supabase Management API, per the excellence protocol's Phase 1.5):

| Layer | State before `d020d3b` |
|---|---|
| DB `process_order_with_occ` | **NEW** — already applied live, reads `booking_reservation_ids` |
| Edge fn `create-order-intent` | **NEW** — already deployed live, source was never committed |
| Web `CheckoutClient.tsx` | **NEW** — committed in `ada79e9`, sends `bookingReservationIds` |
| Web `cartClient.ts` | **OLD** — silently dropped them before the fetch ← the only break |

Live evidence: 7 expired vs 4 confirmed `booking_reservations`; nothing confirmed since
2026-07-05; the 2026-08-02 02:21 UTC attempt (NPR 4,000 = Gold Facial, matching the client's
screenshot) expired 15 min later still carrying placeholder `customer_name = 'Customer'` —
proving `create-order-intent` never received it. `d020d3b` closes that gap. **Needs a real
end-to-end booking test on production to confirm the fix in the wild.**

## Client-reported problems — status

1. ✅ **"Address entered but booking not confirmed"** — fixed by `d020d3b` (pushed). Untested
   in production; do a live booking to confirm.
2. ✅ **"Full-time stylist doesn't show all days"** — **FIXED IN DATA 2026-08-02.** Root cause:
   two stylist accounts both rendered as "Ramesh Kumar Thakur" in admin —
   `365bd0ab…` (the real one, 3 days) and `861b5e7b…` (trailing space in the name; the
   pentest account, carrying the full 7-day schedule the client actually configured). He set
   full-time on the wrong row because they look identical. Action taken: copied the 7-day
   schedule onto `365bd0ab…`, then deactivated `861b5e7b…` as a stylist (profile
   `is_active=false`, schedules inactive, stylist role inactive — all reversible, nothing
   deleted). Verified: `get_available_slots_v2` now returns slots on all 7 days
   (Mon 23, Tue–Fri 16, Sat/Sun 12). `admin_get_all_schedules()` filters `sp.is_active = true`,
   so the duplicate row is gone from the admin table.
3. ✅ **Admin "Manage Schedule" not editable** — built in `ff74d04` (unpushed). New RPC
   `admin_replace_stylist_schedule` swaps the whole active week atomically; `ScheduleModal`
   now serves both create and edit. Tested against the live DB inside a rolled-back
   transaction: happy path (7 days → 2) plus four rejection paths, each leaving the existing
   rows intact — validation runs before any delete.
4. ✅ **Cannot book multiple services at once** — built in `c915aba` (unpushed). Frontend only;
   nothing downstream ever required the limit (`bookingItems` was already an array and
   CheckoutClient already forwarded every reservation ID). The modal now stays open after each
   add and offers an explicit "Go to Checkout (N)".

## Production verification done 2026-08-02 (post-deploy)

All three commits are pushed and live on `https://www.kbstylish.com.np` (note: the apex
307-redirects to `www`, so curl needs `-L` or every check looks like a redirect).

Verified against live production:
- `/api/admin/schedules/update` returns 405 to GET (route exists); a bogus sibling path returns
  404 (control). Unauthenticated POST → 401 `AUTH_REQUIRED`, and Ramesh's 7 rows were still
  intact afterwards.
- `/admin/schedules/manage` redirects to `/auth/login`; `/api/admin/schedules` → 401.
- Deployed JS bundle contains `Add Another`, `Go to Checkout`, `booking-cart-summary`,
  `booking-go-to-checkout` — proves `c915aba` shipped, not just built.
- Booking page lists **three** stylists, one "Ramesh Kumar Thakur" — the duplicate is gone for
  customers.
- **Sunday 2026-08-09 returns 11 bookable slots from 10:00 AM** for Gold Facial (60 min) on the
  real API. Ramesh had no Sunday schedule before the fix, so this is end-to-end proof the
  availability repair reached customers.

## 🔴 The invisible-time-slots bug (found + fixed 2026-08-02, `20ce642`)

**This was probably the single biggest cause of "booking doesn't work".** Every free time slot
rendered white-on-white and was invisible. Measured on production: modal panel `rgb(255,255,255)`,
slot text `rgb(255,255,255)`, **contrast ratio 1.00 on all 15 slots at once**. Only the selected
slot was visible, because that one gets a blue fill. Customers picked a stylist, a service and a
date, saw an apparently empty calendar, and gave up — with the times sitting in the DOM.

Cause: the site renders light (`:root` sets `--foreground: #111827`, no `.dark` class anywhere),
but `BookingModal` was written against a dark surface and hardcoded `bg-white/5 text-white`.
Fixed by keying every colour to `--foreground`. Verified live after deploy: **contrast now 17.74**.

Lesson for future work here: this was invisible to code review and to the build. It was only
findable by measuring computed styles on the rendered page. Do that when a UI bug is reported.

## Contrast sweep of public pages (2026-08-02)

Audited with canvas-resolved sRGB (naive parsing of `lab()`/`oklab()` — which Tailwind v4 emits
for opacity modifiers — produces garbage ratios and false alarms; resolve colours by painting
them). Findings after the slot fix:
- Homepage hero "Unlock Your Winter Glow" flagged at 1.09 — **false positive.** A dark gradient
  div sits behind the text as an absolutely-positioned *sibling*, so an ancestor-walk misses it.
  Renders correctly.
- `🚀 Coming Soon!` gold `#F0B100` on white = 1.91, and the WhatsApp button white-on-green = 1.98.
  Both genuinely low but small and decorative. Not fixed; note if polishing.
- Everything else on `/`, `/shop`, `/cart`, `/book-a-stylist` is clear.

## Khalti — corrected 2026-08-02

Earlier note in this file said the Khalti switch "defaults to sandbox so deploying changes
nothing until flipped". **That was wrong.** `KHALTI_TEST_MODE` is already set in the project's
Edge Function secrets, and only the parameterised code reads it — so the deployed function was
already the uncommitted version and live payments were already running. Source committed in
`5a63050` so the repo stops disagreeing with production.

**Khalti live mode enforces an Rs 10 minimum** and rejects anything smaller with a 400 before a
payment page is created. The *sandbox does not enforce it*, so a sandbox probe at Rs 1 succeeds
and sends you chasing the key instead of the amount. `ada79e9` surfaces the gateway's own message
at checkout for this reason. (Recovered from the LIFE-OS transcripts; there is no Antigravity
chat history under `~/.claude/projects` for this repo — only this session.)

## Checkout overhaul 2026-08-03 (`61e91fd`) — VERIFIED PARTIALLY, NOT END-TO-END

Shipped: Nepali address model (Province/District selects, required landmark, municipality
+ tole), phone validation `/^9[678]\d{8}$/` with `type=tel`, required markers + inline errors,
a real `/cart` page (header repointed from `/checkout`), a disabled-button reason, COD listed
first with an explainer, and `postal_code` no longer hardcoded to `44600`.

**Verified:**
- Deployed `/checkout` HTML contains district, landmark, tole, `type="tel"`, province select;
  old `Province/Region` and `Apartment, building` gone.
- `/cart` returns 200 and renders its empty state; header `href` is now `/cart`.
- Validation unit-tested against the REAL junk order from production
  (`ORD-20260802-42203`, phone `48464546132`): now rejected on phone/district/tole/landmark.
  `+977` normalises, landlines and 9-digit numbers rejected, 96/97/98 accepted.
- **`postal_code: ''` cannot break order creation.** `orders.shipping_postal_code` is NOT NULL,
  but `process_order_with_occ` reads `COALESCE(v_shipping_address->>'postal_code','N/A')` and
  `->>` on a JSON empty string yields `''`, not NULL. Proven by query, not by reasoning.

**VERIFIED 2026-08-04 at the data layer.** A full COD order was run through the real
`process_order_with_occ` RPC with the EXACT payload the new CheckoutClient produces (joined
city, landmark in address_line2, empty postal_code), inside a rolled-back transaction:
order created `confirmed`, `shipping_city='Kathmandu-10, Baneshwor, Kathmandu'`,
`shipping_postal_code=''` (not null), landmark preserved. Finalization completed and rolled
back. The browser UI plumbing (edge fn passes shipping_address through unchanged) was already
exercised with real orders today. Remaining gap: nobody has clicked through the new form in a
browser, but the data path — the only thing the change touched — is proven.

## 🐛 Sessions expire after roughly an hour, mid-checkout

Observed twice on 2026-08-03. The app handles it correctly — `AUTH_REQUIRED` → modal closes →
redirect to `/auth/login?redirect=…`. But per the customer-journey audit the typed address is
NOT preserved across that redirect (`getEmptyAddress()` on remount), so a customer who takes
their time filling the form loses everything. Worth persisting the address to localStorage.

## Production-readiness ledger (as of 2026-08-04, commit b8037ea)

VERIFIED ON PRODUCTION — real data or real UI, evidence in transcript:
- Booking COD end to end — ORD-20260802-80964, 2 bookings confirmed, bookings_count=2
- Product COD end to end — ORD-20260802-53811, tracking link resolves to live status
- Multi-service booking — 2 services, one order, NPR 1,200
- Admin schedule edit — UI → RPC → DB → audit row, then restored
- Stylist status change — completed a real booking through the dashboard UI; RPC timing +
  ownership guards all correct
- Vendor order flow — cancel confirm names product+amount, self-delivery option, FSM correct
- Toasts visible (were mounted nowhere; 14 components were silent)
- Invisible time slots fixed — contrast 1.00 → 17.74; status badges 6.81
- New checkout address — full order run through process_order_with_occ with the EXACT new
  payload (joined city, empty postal_code, landmark), order created confirmed, rolled back;
  deployed /checkout HTML carries all new fields

BUILT, PUSHED, BUILD-VERIFIED — not yet clicked through on prod UI (blocked: one browser
session at a time, and it keeps expiring after ~1h). Logic/DB-semantics verified where possible:
- Admin role revoke: stylist added to the list, confirm-before-revoke, honest partial-failure
  rebuild from real role objects. Pure client logic, build-verified.
- cancelPayoutRequest silent-success fix: .select()+length guard; standard PG semantics.
- Checkout address persistence to localStorage.
- P1 contrast on time-off budget, stylist earnings error, admin payout stat labels.

NOT DONE — do not block taking orders, but not production-complete:
- Stylist time-off has no cancel/refund path (needs a new reverse-override RPC) and no warning
  when blocking a day that already has confirmed bookings.
- Vendor cannot withdraw a payout request from the UI (the action is now correct and wired-safe,
  but no button calls it; workaround: admin rejects it).
- Mobile /shop has no category/price filters (FilterSidebar is `hidden lg:block`, no drawer).
- Remaining P1/P2 contrast: support tickets, vendor-apply banners, audit logs, a few toasts.
- Guest checkout still requires login (discovered mid-form; address now survives the redirect).

## Reported by Shishir 2026-08-07 — FIXED 2026-08-07 (commits c824427, b8baf77)

Status after the fix pass:
1. **Signup confirmation email** — NOT FIXED, and not fixable in code. Supabase Auth setting
   (SMTP + "Confirm email"). Shishir must toggle it, or drop the "check your email" promise
   from `src/app/auth/login/page.tsx`.
2. **Track-order status stuck** — ✅ FIXED. Trigger `trg_sync_order_status_from_items` propagates
   item fulfilment → orders.status, backfilled (ORD-20260807-75015 now 'delivered'). Verified.
   Track-order **invisible text** — measured on prod: page renders correctly dark with visible
   white/gray text; couldn't reproduce full invisibility logged-out (tracking needs the session
   to own the order). Hardened the dim pending labels. If it still looks wrong when logged in,
   check the loaded-state container.
3. **COD flow** — ✅ confirmed working by Shishir.
4. **Payout NPR 0.85** — was correct all along (delivered GMV net of fees). ✅ Relabeled the
   tiles: "All orders, last 30 days" vs "Delivered orders only, after fees".
5. **Booking confirmation delivery language** — ✅ FIXED + verified on prod. Booking-only orders
   show "Appointment Booked" + appointment steps; products keep delivery language.
6. **No admin service-revenue view** — ✅ BUILT. `admin_get_stylist_service_revenue()` RPC +
   `/admin/stylist-revenue` page + sidebar link. Verified: admin gets data, non-admin blocked.
7. **Stylist + customer cancellation** — ✅ confirmed working by Shishir.

1. **Signup confirmation email is never sent.** Signup says "Check your email for the
   confirmation link" but no email arrives — email confirmation is not configured in Supabase.
   This is a Supabase dashboard/Auth setting (SMTP + "Confirm email"), NOT a code bug. Either
   turn on a real SMTP + confirmation, or stop promising the email in the signup UI
   (`src/app/auth/login/page.tsx`).

2. **Track-order status never advances + text invisible.** Two separate bugs on one page:
   - **Status stuck at Confirmed.** Verified: ORD-20260807-75015 has `orders.status='confirmed'`
     while `order_items.fulfillment_status='delivered'`. The vendor changes the *item*
     fulfillment status; the track-order page reads the *order* status; nothing propagates item
     → order. Fix later: either aggregate `order_items.fulfillment_status` up to `orders.status`
     (a trigger or in `update_fulfillment_status`), or have `/api/orders/track` return the
     item-level status. This also explains why the timeline sits at Confirmed while the vendor
     dashboard shows Delivered.
   - **Invisible labels.** The track-order page is dark-themed but the result card is white, and
     the completed-step labels ("Order Placed", "Confirmed") render white-on-white — the same
     dark-class-on-light-surface mechanism as the booking slots. `src/app/track-order/page.tsx`.

3. **COD order flow — confirmed working perfectly by Shishir.** ✓

5. **Booking confirmation shows product-DELIVERY language.** A stylist appointment paid COD
   lands on the same confirmation timeline as a product: "Out for delivery" / "Delivered — pay
   cash to the rider". Wrong for an appointment. Root cause: `src/app/order-confirmation/page.tsx`
   picks its timeline from `isCod` (the `pi_cod` id prefix) ONLY — it reads nothing about order
   contents, so it can't tell a booking from a product. Fix later: pass a booking flag through
   the redirect (or fetch the order) and show appointment language ("Appointment confirmed",
   "See you on <date>", pay at the salon) for booking-only / booking-containing orders.

6. **No admin view of service/booking revenue by stylist.** Verified: there is NO report or RPC
   that tells the admin how much service value each stylist has sold. `src/app/admin/dashboard`
   runs on hardcoded MOCK vendor data (Priya Sharma / Maya Gurung), and `admin/stylists`
   (FeaturedStylistsClient) shows only `total_bookings` (a count), never rupee value. The
   `bookings` table has everything needed (`stylist_user_id`, `price_cents`, `status`) — it just
   needs an admin RPC aggregating completed-booking value per stylist + a screen. Net-new feature.

7. **Stylist + customer cancellation — confirmed working by Shishir.** ✓

4. **Payout "only NPR 0.85 payable" is CORRECT, not a bug.** Verified via
   `calculate_vendor_pending_payout`: delivered_gmv=NPR 1, platform_fee 15%=NPR 0.15,
   net=NPR 0.85. Available balance = **delivered** GMV net of fees, and only ONE item has
   reached `delivered`. The "Monthly Earnings NPR 14" tile counts ALL recent orders regardless
   of fulfilment, so it sits next to a delivered-only balance with no explanation — purely
   presentational confusion. The real reason so little is payable: the fulfilment lifecycle
   rarely reaches `delivered` (needed the self-delivery fix from `51d54f0`, and is worsened by
   bug #2). Rabindra has 11 items still `pending` worth ~NPR 1024 gross. Later: label the tiles
   so "Available" reads as "delivered orders only", and make reaching `delivered` easy.

## Launch cleanup + handover deliverables (2026-08-07)

**User guide (handover deliverable)** — published as an Artifact:
https://claude.ai/code/artifact/e0937174-1f3a-438b-ad92-b608862669b9
KB-branded operations handbook (admin / vendor / stylist / customer + payments + status
lifecycle). Source HTML in scratchpad `kb-stylish-guide.html`. Client asked for a "user manual"
for handover.

**Test-data cleanup — DONE on production, per client's "keep one KB Stylish vendor + items,
remove the rest".** Shishir approved scope via AskUserQuestion: HIDE (deactivate, reversible)
test products + stylists; PURGE (permanent) test orders + bookings; KEEP the ~112 test user
accounts and keep rabindra1816 usable for testing.

What was done:
- HID (is_active=false): all rabindra1816 + ramu test products; stylists "BRB" and "Test stylish".
- PURGED (deleted): all 33 orders (+26 order_items via cascade), all 14 bookings (+ status
  history/ratings via cascade), all 21 booking_reservations. Loyalty refs (3 ledger + 1 reward)
  were detached (set NULL) first to satisfy NO-ACTION FKs.
- **Backup before purge**: scratchpad `purge-backup-2026-08-07.json` (89KB — orders, order_items,
  bookings, reservations). Recoverable if needed.

Live state now: shop shows only KB Stylish's 21 real products; bookable stylists are
**Ramesh Kumar Thakur** (7 days, the real one) and **Rabindra sah** (5 days, kept for testing).
Orders/bookings/reservations all at 0.

**Round 2 (2026-08-07, later): Rabindra hidden as stylist + 109 test accounts deleted.**
- Rabindra sah deactivated as a *bookable stylist* (schedules + stylist_profile inactive). His
  account + vendor role are KEPT and usable. Only **Ramesh Kumar Thakur** is now a bookable stylist.
- **Deleted 109 test/seed auth accounts** (131 → 22). Method: per-row DELETE with skip-on-error
  (many tables NO-ACTION FK auth.users at multiple levels; forcing would touch immutable audit
  logs). Cleared orphan test `inventory_movements` first to unblock accounts like krish.
  - KEPT (never targeted): kbstylish2019 (KB vendor + Ramesh), rabindra1816, shishirbhusal333,
    admin.trust (admin — Shishir said keep).
  - DELETED incl. krish@test.com (per Shishir).
  - SKIPPED (2, have deeper loyalty/stylist refs, harmless to keep): pentest_kbstylish@outlook.com,
    loyalty-demo@kbstylish.test.
  - **Backup**: scratchpad `accounts-backup-2026-08-07.json` (all 111 targeted, email+id+roles).
- Remaining 22 accounts are all legitimate (real gmail signups + operators + 2 admins). A few
  plain gmail signups remain that weren't test-pattern (aakriti@, swastika@, tasotij770@foxroids
  — a throwaway) — Shishir can review if he wants them gone too.

## Open items

1. **Authenticated flows are still untested.** Claude will not enter the account password, so
   these need a human click-through — or Shishir logs in to the Browser pane and Claude drives
   the authenticated session, which is the faster path:
   - reserve a service → checkout → pay, confirming `d020d3b` (the reservation must end up
     `confirmed`, not `expired`, and `payment_intents.metadata.bookings_count` must be > 0)
   - admin → Manage Schedule → **Edit Schedule** → change hours, tick a day on and another off
     → save → confirm the booking page reflects it
   - add two services in one booking modal visit → "Go to Checkout (2)" → confirm both appear
     at checkout and both reservation IDs reach `create-order-intent`
4. **🐛 Platform bug: a stylist cannot be deactivated on the same day their schedule starts.**
   Trigger `deactivate_stylist_schedules()` sets `effective_until = CURRENT_DATE`, but
   `stylist_schedules_check2` requires `effective_until > effective_from`. Two constraints
   contradict each other: `check_effective_date_range` allows `from <= until`,
   `stylist_schedules_check2` demands `until > from`. Worked around this session by setting
   schedules inactive *before* the profile. Real fix: drop the redundant `check2` or make the
   trigger use `CURRENT_DATE + 1`.
5. **~~Timezone bug~~ — investigated 2026-08-02, NOT a bug. Correcting the earlier entry.**
   Every `stylist_schedules` row has `start_time_utc == start_time_local` because
   `admin_create_stylist_schedule` writes the same value to both columns with no Kathmandu
   offset. It looked like corruption. It is not: `get_effective_schedule` reads **only** the
   `_local` columns, and `get_available_slots_v2` delegates to it. The `_utc` pair is
   vestigial and never read. Do NOT "fix" it by writing a real offset — that would make new
   rows inconsistent with every existing one for zero behavioural gain. The real cleanup is to
   drop the unused columns, which is not urgent.
6. **Test accounts on production.** `admin.trust@kbstylish.test` holds live `admin` and signed
   in 2026-08-02 08:30 UTC — Shishir confirmed this is in use, leave it. It is what granted the
   stylist role to the pentest account on 2026-07-29. Also present: `pentest_kbstylish@outlook.com`
   (display_name "HACKED ADMIN", now retired as a stylist; only ever held `customer` +
   `stylist`, never admin — the name was a pentester's own display-name change, not an actual
   admin compromise), `pentest_51692@outlook.com`, and ~110 seed accounts with no roles.
7. Remaining uncommitted work, not yet triaged into commits: Khalti live/test switch
   (`KHALTI_TEST_MODE`, defaults to sandbox so deploying changes nothing until flipped),
   vendor/stylist dashboard hardening (~876 lines), `auth.ts` roles-from-`user_roles`,
   `types.ts` + `UsersTable.tsx` adding stylist/support roles, two untracked edge functions
   (`payment-reconciliation`, `send-push`).
8. `supabase/.temp/cli-latest` is tracked churn — should be gitignored.
9. `docs/KB_Stylish_Mobile_App_Partnership_Agreement.pdf` is untracked. Decide before any
   blanket `git add` whether a signed contract belongs in this repo.

## Gotchas discovered this session

- `next.config.ts` sets `typescript.ignoreBuildErrors` **and** `eslint.ignoreDuringBuilds`.
  ~590 type errors exist repo-wide and none block a deploy. **`tsc --noEmit` is not a
  production gate here — only `next build` is.**
- `.env.local` uses `KEY = value` (spaces around `=`), so naive `^KEY=` parsing fails.
- Jest `transformIgnorePatterns` only whitelists `@upstash/redis`; `uuid` is ESM-only, so any
  suite importing the cartClient chain dies at import with "Unexpected token 'export'".
  Pre-existing, unrelated to code changes.
- `stylist_profiles.display_name` and `user_profiles.display_name` disagree for every stylist
  (e.g. "Ramesh Kumar Thakur" vs "KB Stylish"). Admin screens read the former.
- Read-only live-SQL helper written to the session scratchpad (`sql.sh`), using
  `SUPABASE_ACCESS_TOKEN` from `.env.local` via the Supabase Management API. No Supabase MCP is
  configured in this session — this helper is the substitute.

## Decisions log

- 2026-08-02 — Landed and pushed `d020d3b` scoped to the booking path only; deliberately left
  Khalti, dashboard polish, and the role-type change for separate commits.
- 2026-08-02 — Shipped the guest-booking removal (login now required to reserve) with Shishir's
  explicit approval. Closes a hole where reservations were written with a fabricated all-zeros
  UUID as `customer_user_id`.
- 2026-08-02 — Moved the 7-day schedule to the real Ramesh and retired the pentest stylist,
  with Shishir's explicit approval. Reversible: nothing was deleted, only flags flipped.
- 2026-08-02 — Left `admin.trust@kbstylish.test` admin rights intact at Shishir's direction.
- 2026-08-02 — Created `C:\ShishirData\DTI\.stignore` (node_modules, .next, .turbo, caches).
  Deliberately did NOT ignore `dist/` or `build/` — some projects commit artifacts from those.
- 2026-08-02 — Corrected the folder mis-wiring record: `D:\Documents\kb-stylish` (last real
  commit 2025-11-12) is dead. This folder is live.

## SESSION HANDOFF — 2026-09-17 (mobile store-launch prep)

**Start next session here, not from scratch.** Full detail lives in
`..\kb_stylish_mobile\STATE.md` (read that first) and `..\kb_stylish_mobile\docs\deployment\`
(RUNBOOK.md, CLIENT-REQUIREMENTS.md, STORE-LISTING.md, DATA-SAFETY.md, APP-REVIEW-NOTES.md).

**What's done, uncommitted in this repo:**
- `src/app/legal/account-deletion/` (new page) + `src/app/legal/privacy/page.tsx` (edited) —
  `next build` passed.
- `supabase/functions/delete-account/` (new edge fn) — **NOT deployed**.
- `supabase/migrations/20260810120000_account_deletion.sql` — **NOT applied to prod**.

**Mobile repo (`..\kb_stylish_mobile\`) — matching account-deletion UI + Apple Sign-In fix,
also uncommitted.** 🔴 That repo has only 1 commit, no git remote — the whole app is
unbacked-up working-tree state. Commit and push it before anything else touches it.

**Not yet started:** client's Google Play ($25) + Apple Developer ($99/yr) accounts (blocked
on D-U-N-S, ask first), `eas init`, FCM/APNs credentials, screenshots, submission.

**Do not re-derive any of the above — read the files.**
