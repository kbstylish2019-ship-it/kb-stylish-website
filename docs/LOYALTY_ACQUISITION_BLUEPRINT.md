# Loyalty Phase 2 — Physical-Shop First-Install Acquisition (QR + Endowed Progress)

**Status: PROPOSED — awaiting approval before any code.** Date 2026-07-05.
Builds on LOYALTY_CRM_BLUEPRINT.md (shipped & verified 2026-07-05). Same non-negotiables:
live DB via MCP is truth; additive/reversible only; no verify_jwt flips; money path untouched.

---

## 1. Discovery (live DB + repos, verified)

- **`kb_branches` is real and populated: 13 active salons** (Bhangal, Bhetghat Chowk, Bojepokhari,
  Gatthaghar, Imadol, Jadibuti, Kaushaltar, Koteshwor, Pepsicola, Shantinagar, Suryabinayak, Thimi,
  Tikathali). Columns: id/name/address/phone/email/manager_name/operating_hours/is_active/
  display_order. **No slug or short-code column yet.**
- **Loyalty layer** (Phase 1, live): config singleton, append-only ledger (event_type includes
  `adjustment` — the natural vehicle for a welcome stamp), accounts cache, rewards. All guards
  proven: earn requires paid+completed+non-redemption booking; unique-earn-per-booking; account-row
  locking.
- **Mobile deep links:** `"scheme": "kbstylish"` in app.json; expo-router auto-routes
  `kbstylish://<path>` to `app/<path>` screens (the OAuth `kbstylish://auth/callback` and payment
  callback patterns confirm this works in Expo Go). So `kbstylish://join/JADIBUTI` → a new
  `app/join/[code].tsx` requires no linking plumbing.
- **Signup flow:** `app/(auth)/register.tsx` → `signUp(email, password, fullName)`; minimal form.
- **`expo-application` is NOT installed** (needed later for Android Install Referrer).
- **REALITY CHECK — the app is NOT on the Play Store / App Store yet** (store phase deferred per
  AI_AGENT_ONBOARDING; distribution today = Expo Go / dev builds). Therefore **install-time
  attribution (Play Install Referrer) is moot until the store launch**. The design below works
  TODAY via code-entry + deep link, and is ready for referrer-based auto-attribution the day the
  Play listing exists.

### Platform attribution facts (honest assessment)
- **Android (future, post-store):** Google Play Install Referrer survives install; landing page
  appends `&referrer=utm_source%3Dbranch_JADIBUTI` to the Play URL; app reads it once on first
  launch via `expo-application`'s `getInstallReferrerAsync()` → auto-attributes silently. Reliable.
- **iOS:** there is NO first-party deferred deep link. Options are paid SDKs (Branch/AppsFlyer),
  clipboard hacks (privacy prompt, unreliable), or **a human-readable salon code on the poster the
  user types/confirms in-app**. We choose the code — it's also the universal fallback for Android,
  works pre-store, and doubles as the staff-assisted path ("enter code JADIBUTI, get your first
  stamp").

## 2. Research verdict (2026 sources + canonical studies)

- **Endowed progress is the right mechanism — strongly supported.** Canonical: Nunes & Drèze (JCR
  2006) car-wash study — 2 pre-filled stamps on a 10-stamp card vs blank 8-stamp card: **34% vs 19%
  completion**, and faster visits. 2026 industry data: pre-loading new members "enough to feel
  meaningful, not enough to redeem" → **40–50% higher program activation** (rayapp behavioral
  round-up); a 23,000-stamp study (FaveCard 2026) explicitly recommends **endowed-progress starter
  stamps for salon-cadence businesses** and notes the first stamp is "the highest-leverage marketing
  moment." Salon-specific: monthly visit cadence means cards must be SHORT — our 5-stamp card is
  exactly in their recommended 3–5 band.
- **QR capture benchmarks (Square 2024 via Regulr 2026):** QR with no incentive: 2–5% of walk-ins.
  QR + welcome offer: **8–14%**. **Staff-assisted prompt + welcome offer: 12–18%.** Implication:
  the poster copy ("Scan → your first stamp is already waiting") and a one-line staff script matter
  as much as the tech. Include both in delivery.
- **Do NOT grant a voucher on install** — confirmed farmable and unnecessary; the welcome stamp is
  worthless without 4 real paid completed bookings, which the existing proven guards police.
- **Salon retention context for the client pitch:** industry average first-visit return rate is
  ~35%; loyalty + automated nudges pushes best-in-class to 70–80%+ rebooking (Kitomba benchmarks).

## 3. Design (Blueprint answers to the 4 questions)

### Q1 — Attribution path (recommended)
One universal mechanism with three entry ramps, all converging on ONE claim RPC:
1. **Poster QR** encodes `https://www.kbstylish.com.np/join/<CODE>` (web landing, mobile-first):
   shows branch name + "your first stamp is waiting", tries `kbstylish://join/<CODE>` (opens app if
   installed), displays the big human code + install instructions (store badges when live; the
   Play link will carry the referrer param for future silent Android attribution).
2. **Deep link** `kbstylish://join/<CODE>` → new `app/join/[code].tsx` → if logged in, confirm-claim
   screen; if not, sign in/up first (code held in memory), then claim.
3. **Manual code entry** — "Have a salon code?" card on the Rewards screen. Works today, pre-store,
   on both platforms; this is the primary path until store launch.

### Q2 — Reward = endowed progress: **+1 pre-filled stamp** (confirmed)
"Install at the salon → your stamp card starts at 1/5." Ledger `adjustment` (+1, reason
`welcome_stamp`), counts toward current+lifetime; visible immediately on the stamp card (the
research says visible progress is the point). No voucher, no discount, no cash value.
Threshold=1 edge case handled (mint loop runs after credit, same as earn path).

### Q3 — Anti-abuse (layered, reuses proven guards)
- **One claim per account** — `loyalty_acquisitions.customer_user_id` is the PRIMARY KEY; the insert
  IS the lock (`ON CONFLICT DO NOTHING` → `ALREADY_CLAIMED`).
- **One claim per device** — `device_id` column (Android ID / iOS identifierForVendor via
  `expo-application`) with a partial UNIQUE index → second account on same phone → `DEVICE_ALREADY_USED`.
  Nullable (older clients / web can't send it) — account-level cap still holds.
- **Cannot corrupt earn logic:** the welcome credit is an `adjustment` with NO booking_id — the
  unique-earn-per-booking index is untouched; free/redeemed bookings still never earn; the +1 is
  worthless without 4 genuinely paid completed bookings.
- Config kill-switch: program `is_active=false` blocks claims too; per-branch off = deactivate its code.
- Codes are non-guessable enough (they're printed publicly anyway — guessing one only ever yields
  the same one stamp per account/device).

### Q4 — Admin (the client-wow layer)
- CRM page gains a **"Branches" section**: per salon — claims (installs attributed), claimants who
  went on to complete ≥1 PAID booking (real-customer conversion %), attributed booking revenue,
  this month + all time. Answers "which salon's poster actually makes money."
- **Printable QR poster sheet**: per-branch page (A5-ready) with QR (client-side `qrcode.react`),
  branch name, the human code, and the offer line — print straight from the admin.

## 4. Changes (all additive/reversible)

**DB via MCP:** `kb_branches.referral_code text UNIQUE` (nullable; backfill 13 friendly codes,
e.g. JADIBUTI, THIMI…); new `public.loyalty_acquisitions` (customer_user_id PK → auth.users,
branch_id FK kb_branches, source CHECK ('qr','code','staff'), device_id text NULL + partial unique
index, claimed_at; RLS: own-read/admin-read, definer-only writes; REVOKE writes); RPCs in the proven
two-layer pattern: `public.claim_welcome_stamp(p_branch_code, p_device_id)` → private definer
(validate → insert acquisition → ledger adjustment +1 → account upsert → mint-check loop);
`get_admin_crm_stats_v1` extended (new `branches` jsonb section — additive key, existing consumers
unaffected). Rollback: drop table/column/functions.

**Mobile:** `expo-application` dependency (referrer + device id); `app/join/[code].tsx` confirm
screen; "Have a salon code?" card + claim flow on Rewards screen; claim API + hook; on future
store build: first-launch referrer check auto-fills the code. Tests: api + native suites.

**Web:** public `/join/[code]` landing page (mobile-first); CRM "Branches" stats section; QR
poster print view (`qrcode.react`); CrmClient tests extended; Playwright e2e for claim RPC
(one-per-account, one-per-device, bad code, inactive program) + branch stats.

**Proof plan (before UI, per house protocol):** claim → +1 stamp ledger/account; duplicate account
claim rejected; duplicate device rejected; bad/inactive code rejected; claim + 4 paid completions →
voucher (endowed math correct); welcome stamp never mints alone (threshold 5); reconciliation
untouched; RLS isolation; advisors clean.

## 5. Overdeliver menu (researched; each rankable after this ships)

| Idea | Evidence | Effort | Verdict |
|---|---|---|---|
| **A. This QR + endowed stamp system** | 34%→19% completion (Nunes & Drèze); 8–18% walk-in capture with welcome offer | ~1 day | **Build now (this blueprint)** |
| **B. "You're 1 stamp away" + win-back nudges** | Expiry/proximity notifications are the top redemption driver in every 2026 source; salons: 65% of lost clients "just forgot" | Low — email system EXISTS (send-email fn + preferences); push plumbing exists (delivery needs EAS/FCM) | **Highest-ROI next; recommend immediately after A** |
| **C. Give-get referral codes** (friend gets stamp, referrer gets stamp when friend completes 1st paid booking) | Standard; the completion-gated trigger reuses our earn guards | Medium — natural extension of A's tables | Phase 2b (already in the original plan) |
| **D. Milestone mini-rewards** (e.g. 10% off product at stamp 3) | "Single highest-leverage change for long cards" (23k-stamp study) — but our card is SHORT (5) | Medium | Later; more valuable if threshold ever rises |
| **E. Birthday reward** | Salon standard; automated | Low-medium (needs birthdate capture) | Nice Phase 3 |
| **F. Bonus stamp for prebooking/add-ons** | Recommended salon behavior-shaping | Low (admin adjustment RPC) | Cheap add-on later |
| **G. Apple/Google Wallet pass card** | The 2026 growth category (free push via wallet) | High (PassKit certs etc.) | Not now; note for store phase |

**Recommendation: A now → B next (it multiplies A: acquisition without reminders leaks — the
research is unanimous that the nudge is where the LTV is) → C after.**

---

## IMPLEMENTATION STATUS (2026-07-05, "GO on everything")

**A — QR acquisition: SHIPPED + PROVEN.** kb_branches.referral_code (13 codes backfilled:
JADIBUTI, THIMI, KOTESHWOR…), loyalty_acquisitions (one-per-account PK + one-per-device partial
unique), claim_welcome_stamp two-layer RPCs, shared private.credit_loyalty_stamps. Proofs green:
claim +1 (endowed 1+4→voucher exact), dup-account, dup-device, bad code, cross-mechanism block
(advisory-locked), post-claim-only branch attribution (1 converted / Rs 500 verified).
Mobile: expo-application (device id), app/join/[code].tsx deep-link screen (kbstylish://join/CODE),
Rewards screen "Have a salon or friend code?" entry. Web: /join/[code] public landing (valid +
invalid paths SSR-verified), CRM "Salon Acquisition" table + /admin/crm/posters printable QR sheet
(qrcode.react).

**B — nudges: SHIPPED + PROVEN.** loyalty_nudges dedup table, candidates RPC (near_reward=N-1,
voucher_reminder=3d-old voucher, win_back=56d inactive), service-role wrappers,
loyalty-nudge-worker edge fn DEPLOYED (verify_jwt=true, self-contained Resend rendering — shared
send-email untouched), pg_cron 'loyalty-nudge-daily' 09:00 NPT (job 12). Proofs: exactly the 3
seeded candidates matched (zero real users), dedup window works, opt-out works, HTTP dry-run OK.
**CONSENT DECISION (flag for override):** receive_promotional_emails defaults false platform-wide
(would silence nudges forever) → added email_preferences.receive_loyalty_updates DEFAULT TRUE +
'loyalty_update' branch in can_send_optional_email; nudges treated as program-service messages
with opt-out. Zero real candidates existed at deploy time.

**C — referrals: SHIPPED + PROVEN.** loyalty_referral_codes (KB-XXXXXX, lazy-created),
loyalty_referrals (one-in per account/device, self-referral CHECK), claim_referral_code, referrer
rewarded EXACTLY once on referee's FIRST paid completed booking (guarded update inside
award_loyalty_stamp; proven with two completions). Mobile: Refer-a-Friend share card on Rewards.
CRM: referrals totals in stats.

**Tests:** mobile 147 native + 35 live-api green; web CrmClient 5/5; Playwright loyalty e2e 10/10.
Catch-up migrations 20260705095645…204500 written (repo follows DB).
**PENDING:** on-device Expo Go pass of claim flow (phone was disconnected); poster PDF print run;
web deploy to Vercel to publish /join/* + admin pages.
