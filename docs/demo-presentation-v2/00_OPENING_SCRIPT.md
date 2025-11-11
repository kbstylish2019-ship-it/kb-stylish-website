# Opening Script (90 seconds)

“Sir, before I start, quick market context in Nepal: multi‑vendor platforms like this typically cost 10–15 lakhs to build properly. We delivered all this for 70K — because we built to your vision, not just your budget.

Today I’ll show four full journeys — Customer, Vendor, Stylist, and Admin — each with enterprise‑grade security, performance, and polish. You’ll see how we’ve thought about every detail: trust, speed, data integrity, payouts, audit logs, and future scaling.

Please interrupt me anytime. I’ll explain how each decision saves cost, protects data, and boosts conversions. After the demo, we’ll discuss monitoring and post‑launch operations so your beta runs smoothly.”

Timing: 60–90 seconds. Then jump into the Customer Journey.



# Market Value in Nepal (Lakhs)

Anchors (recent Nepali sources):
- Basic e‑commerce: ~2.5 lakhs (Softbenz)
- Multi‑vendor marketplace: ~5–20 lakhs (range across Nepal agencies and platform vendors)
- Mobile app (per platform): 1.5–2.0+ lakhs for standard apps; complex logistics apps 6–15 lakhs (FlyUp Technology)

Positioning for this platform:
- Complexity: multi‑vendor + service booking + payouts + encryption + trust engine + analytics
- Realistic Nepal value today: 10–15 lakhs (conservative), some stacks 15–25 lakhs
- Delivered amount: 70K → overwhelming value vs market norms

Citations (examples to mention if asked):
- Softbenz: ecommerce ~2.5 lakhs (https://softbenz.com/blog/website-design-and-development-cost-in-nepal)
- HTMLPanda global ranges (context only): $10k–$300k; translate conservatively to 8–25 lakhs tier for Nepal (https://www.htmlpanda.com/blog/cost-to-build-a-multi-vendor-e-commerce-marketplace/)
- App costs in Nepal: starts ~1.5 lakhs; complex apps 6–15 lakhs (https://flyuptechnology.com/how-much-does-mobile-app-development-cost-in-nepal/)

How to say it in meeting:
- “Comparable projects are 10–15 lakhs in Nepal. We built to your vision for 70K.”
- “Mobile app later: 1.5–2 lakhs for a solid MVP (per platform or cross‑platform equivalent).”


# Features by Page and Journey (Enterprise‑grade)

Use this as your master feature list during the walkthrough. Each item ties to business value.

---

## Common Platform Guarantees
- RLS everywhere on sensitive tables (data isolation by user/vendor)
- Idempotency & race‑condition guards (UNIQUE constraints, advisory locks)
- Auditable admin actions (private logs + role‑filtered RPC viewer)
- Inventory integrity and arithmetic checks (no negative inventory, payout math check)
- Caching layers where it matters (availability cache, realtime metrics cache)

---

## Homepage
- Featured Brands section (only brands with active products; monetizable placement)
- Trending Products (4‑tier fallback: trending → new → top‑rated → active; no empty state)
- Featured Stylists (curated, specialty‑aware, rating‑supported)
- Fast‑first design ( <2s target loads, lazy assets, responsive across devices)

Why it matters: boosts discovery, enables sponsorship revenue, keeps page never-empty under sparse data.

---

## Shop / Category / Search
- Trigram search indices for fast fuzzy search on names/emails (admin/user search)
- Composite indexes for filters/sorting on hot paths
- Only necessary fields fetched (compute and bandwidth savings)
- Server components + cache where safe (protects Supabase compute)

Why it matters: sub‑second query response, lower DB cost, smoother UX.

---

## Product Detail
- Variant‑aware pricing and stock; enterprise inventory checks (>=0)
- Trust Engine hooks: purchase‑verified reviews, vendor replies, helpful votes
- Self‑healing recommendations (filters inactive/out‑of‑stock products)
- Image upload optimization and size limits (storage cost control)

Why it matters: real‑world integrity (no fake reviews), always‑valid recommendations, cost‑aware media.

---

## Cart & Checkout
- Guest cart with signed token (JWT‑verified) + secure merge after login
- Idempotent order creation (payment_intent guard; replay‑safe webhooks)
- Mixed cart support (products + bookings) with full clearing on success
- Transparent totals (subtotal, tax, shipping, discount snapshot)

Why it matters: saves abandoned carts, prevents duplicate orders, handles multi‑domain carts cleanly.

---

## Track Order
- Public and private tracking views
- Item‑level fulfillment status per vendor
- Clear errors and safe messages (no sensitive leakage)

Why it matters: reduces “where is my order?” tickets; higher trust.

---

## Vendor Journey
- Application workflow (verification statuses; role assignment on approval)
- Vendor Dashboard: realtime metrics (today cache) + historical aggregates
- Product Management: variants, pricing snapshots, inventory, media limits
- Payouts: requests + admin approval; arithmetic check and locks prevent mistakes

Why it matters: attracts premium vendors via professionalism and transparency.

---

## Stylist Journey
- Specialty and discovery pages (filters; featured stylists)
- Booking Engine: GiST range conflict checks; advisory locks prevent double‑booking
- TTL reservations and auto‑cleanup (expired holds cleared)
- Schedule Overrides: priorities, business closures, vacations; budget enforcement

Why it matters: “airline‑grade” reliability; no conflicts even under concurrent traffic.

---

## Admin Journey
- Users Management: search, roles, self‑protection (cannot demote/suspend self)
- Vendors Management: approval/rejection; commission updates with audit trail
- Schedules & Overrides: create/update; immutable change log
- Audit Log Viewer: role‑filtered access to governance/security/configuration

Why it matters: complete command center with safety rails and compliance trail.

---

## Security & Integrity (pervasive)
- Vendor PII encryption at rest (bank accounts, wallets) — admin‑gated decrypt
- Payout arithmetic check (net = amount − fees)
- Override duplicate prevention (UNIQUE on stylist/date range)
- Budget advisory lock on overrides; cache invalidation on override/booking/schedule
- Payment gateway replay prevention (UNIQUE on provider + external_txn_id)
- search_path pinned for critical functions; RPC lockdown to service_role only

---

## Performance & Cost Controls
- Availability cache (5‑min TTL) → 72× improvement (2ms vs 145ms)
- Vendor realtime metrics cache (today), rolled into daily aggregates
- Trigram and composite indices across admin/user/vendor hot paths
- Image size limits and optimization to cap storage and bandwidth costs

---

Notes for live demo:
- After each section, pause and tie to rupee impact: higher conversion, lower support, reduced infra costs, fewer bugs.


# Security and Data Integrity (Proof‑backed)

These are not claims — they’re receipts. Each item cites the migration/logic enabling it.

- Vendor PII encryption (bank, tax, wallets)
  - Migration: supabase/migrations/20251018210000_encrypt_vendor_pii.sql
  - Admin‑only decrypt function + audit of access
- Payout arithmetic enforced
  - Migration: 20251018210100_add_payout_arithmetic_constraint.sql
- Override duplication blocked (budget abuse prevention)
  - Migration: 20251018210200_add_schedule_override_unique_constraint.sql
- Override budget race‑condition prevention (advisory locks)
  - Migration: 20251018210300_add_budget_advisory_lock.sql
- Availability cache invalidation on override/schedule/booking
  - Migration: 20251018210400_add_cache_invalidation_trigger.sql (+ Blueprint foundation)
- Booking engine conflict prevention (GiST range + locks)
  - Migrations: 20250923055000_create_booking_schema.sql, 20250923061500_create_booking_logic.sql
- TTL reservation cleanup (stale holds auto‑expire)
  - Migration: 20250923110000_auto_cleanup_expired_reservations.sql
- Payment replay prevention (gateway verification uniqueness)
  - Migration: 20250930073900_create_payment_verification_schema.sql (UNIQUE on provider, external_transaction_id)
- RLS on metrics, reviews, bookings, schedules, etc.
  - See: 20251007071500_create_metrics_schema.sql and Trust Engine migrations
- Admin self‑protection + assert_admin standardization
  - Migration: 20250117180000_fix_p0_admin_assertions.sql
- search_path pinning for critical functions; RPC lockdown to service_role
  - Migrations: 20250924132100_pin_search_paths_exact.sql, 20250919130300_lockdown_rpc_permissions.sql

These controls are the difference between a demo and an enterprise platform.



# Performance and Caching

- Availability Cache (private.availability_cache)
  - 5‑minute TTL, invalidated on booking/schedule/override
  - 72× faster queries (2ms vs 145ms) on repeat lookups
  - Source: Blueprint v3.1 foundation + 20251018210400 trigger

- Realtime + Daily Metrics
  - metrics.vendor_realtime_cache (today) + metrics.vendor_daily/platform_daily (history)
  - Idempotent updates via re‑aggregation to prevent double‑counting
  - Sources: 20251007071500_create_metrics_schema.sql, 20251007083000_create_realtime_metrics_logic.sql

- Search & Filters
  - GIN trigram and composite indices on hot paths for admin/user/vendor search
  - Sources: 20251012210000_admin_users_management.sql, 20251012220000_admin_vendors_management.sql

- Trending & Recommendations (no empty state)
  - 4‑tier fallback (trending → new → rated → active)
  - Self‑healing recommendations exclude inactive/out‑of‑stock
  - Sources: 20251017120100_create_product_trending_scores.sql, 20251017120400_create_trending_functions.sql

- Image/Media Cost Controls
  - Enforced size limits and optimization (avatars and product media)
  - Evidence: src/app/api/upload/avatar/route.ts, src/lib/utils/imageOptimization.ts



# Monetization Opportunities Built‑In

- Featured Brands on Homepage
  - Only brands with active products
  - Sell monthly “featured” slots (tiered pricing)

- Featured Stylists
  - Promote top stylists on landing pages
  - Encourage profile upgrades (photos, reviews) → higher bookings

- Sponsored Placements
  - “Trending” has guardrails, but you can sell “Promoted” tiles alongside

- Commission & Fees
  - Per‑vendor commission adjustable with audit trail
  - Payouts are transparent; arithmetic check prevents leakage

- Vendor Services
  - Photo enhancements, store setup, priority support → chargeable add‑ons

- Data Products
  - Vendor dashboards + PDF statements; future premium analytics add‑on

Tie each to real UI spots during the demo so the client sees new revenue streams, not just features.


# Post‑Launch Operations & SLA (Nepal‑friendly)

Objective: keep beta healthy and prove reliability. This is the ethical upsell.

What we set up:
- Error Tracking: Sentry for Next.js (server + client) with source maps
- Uptime: UptimeRobot/BetterStack checks for web + API + DB health endpoints
- Logs: Supabase logs review + alerts on error spikes
- On‑call: business‑hours or 24/7 escalation path
- Backups/DR: Supabase backups + restore drills

Suggested Retainer (choose one):
- Basic (Rs 15,000/mo): Sentry + uptime + weekly checks + minor fixes (4 hrs)
- Standard (Rs 30,000/mo): + performance/db reviews + security patches + reports (10 hrs)
- Premium (Rs 60,000/mo): + 24/7, incident response, load testing, quarterly pen‑test coordination (24 hrs)

Why it’s fair:
- Sentry events, uptime monitors, and DR drills cost time and money
- Proactive ops prevents costly downtime during beta

Note: Sentry packages and monitor quotas can be tuned to your volume to control cost.



# Demo Flow (45–60 minutes)

- Opening (3 min): 10–15 lakhs anchor; 70K vs vision
- Customer (12 min): discovery → trust → cart → checkout → track order
- Vendor (12 min): approval → products → realtime metrics → payouts
- Stylist (10 min): discovery → slots → reservation TTL → override budget
- Admin (5 min): users/vendor mgmt → audit logs → self‑protection
- Technical Excellence (3 min): receipts (security/perf) → scaling
- Close (5 min): ops plan + next steps

Pro tips:
- Pause after each “wow” moment; tie to rupee impact
- Keep answers simple; offer deeper dive only if asked



# Quick Talking Points

- Built to your vision, not just your budget — typical value 10–15 lakhs
- Four complete journeys with enterprise security and performance
- Purchase‑verified reviews; no fake ratings
- Airline‑grade booking: no double‑bookings; advisory locks + GiST
- Payout integrity: arithmetic check + vendor‑level locks
- Cache everywhere it matters (availability, metrics) → fast & cheap
- Admin safety rails: can’t demote/suspend yourself by mistake
- Transparent vendor earnings → attracts higher‑quality sellers
- Post‑launch ops: Sentry, uptime, on‑call — we’ll keep beta healthy


# FAQ & Objections

Q: Why say 10–15 lakhs if we paid 70K?
- Because that’s what comparable multi‑vendor + booking + payouts + encryption platforms cost in Nepal. We delivered it efficiently and ethically — that’s the over‑delivery.

Q: Is this ready for beta?
- Yes. Security controls, booking integrity, trust engine, and admin safety are in place. Monitoring will make beta even smoother.

Q: What about a mobile app?
- Realistic Nepal pricing: 1.5–2.0 lakhs for a solid cross‑platform MVP. We’ll scope after beta usage confirms priorities.

Q: Ongoing costs?
- Sentry events, uptime monitors, backups, and DR tests have operational costs. Retainer options keep spend predictable.



# Appendix — SQL/Code Evidence Map

Security & Integrity
- Encryption of vendor PII: supabase/migrations/20251018210000_encrypt_vendor_pii.sql
- Payout arithmetic check: 20251018210100_add_payout_arithmetic_constraint.sql
- Override duplicate prevention: 20251018210200_add_schedule_override_unique_constraint.sql
- Advisory lock on override budget: 20251018210300_add_budget_advisory_lock.sql
- Cache invalidation on override: 20251018210400_add_cache_invalidation_trigger.sql
- Payment replay prevention: 20250930073900_create_payment_verification_schema.sql
- Admin assert standardization: 20250117180000_fix_p0_admin_assertions.sql
- search_path pinned: 20250924132100_pin_search_paths_exact.sql
- RPC lockdown to service_role: 20250919130300_lockdown_rpc_permissions.sql

Booking Engine
- Schema (GiST range, policies): 20250923055000_create_booking_schema.sql
- Logic (slot generation, advisory locks): 20250923061500_create_booking_logic.sql
- TTL cleanup: 20250923110000_auto_cleanup_expired_reservations.sql
- Unified availability function (final): 20250924131500_hotfix_booking_slot_logic_final.sql

Trust Engine
- Schema (reviews, votes, replies, flags): 20250925082200_create_trust_engine_schema.sql
- Secure review submission: 20250925093000_trust_engine_review_submission.sql
- Sharded voting + reconciliation: 20250925093100_trust_engine_voting_system.sql
- Rating aggregation + jobs: 20250925093200_trust_engine_rating_aggregation.sql

Performance & Caching
- Metrics schema (vendor_daily/platform_daily): 20251007071500_create_metrics_schema.sql
- Realtime metrics logic (idempotent re‑aggregation): 20251007083000_create_realtime_metrics_logic.sql
- Trending + recommendations: 20251017120100/120400_create_*trending*.sql

Media/Uploads (cost controls)
- Avatar API & image limits/optimization: src/app/api/upload/avatar/route.ts, src/lib/utils/imageOptimization.ts

Use this index live if the client asks “how do you know?” → click and show.



# Exact Numbers and Limits (Receipts)

Use these concrete values during the demo when you want to prove depth of thinking.

## Booking & Scheduling
- Reservation TTL: 15 minutes default
  - booking_reservations.expires_at = NOW() + interval '15 minutes'
  - File: supabase/migrations/20250923074500_the_great_decoupling.sql
- Double‑booking prevention: GiST range overlap + advisory locks in creation
  - Files: 20250923055000_create_booking_schema.sql, 20250923061500_create_booking_logic.sql
- Override constraints
  - Unique per stylist per date range (prevents duplicates)
  - Advisory lock when consuming override budget
  - Files: 20251018210200_add_schedule_override_unique_constraint.sql, 20251018210300_add_budget_advisory_lock.sql
- Availability cache TTL: 5 minutes; auto‑invalidate on booking/schedule/override
  - Files: 20251015160000_blueprint_v3_1_foundation.sql, 20251018210400_add_cache_invalidation_trigger.sql

## Payments & Orders
- Payment replay prevention: UNIQUE(provider, external_transaction_id)
  - eSewa transaction_uuid / Khalti pidx
  - File: 20250930073900_create_payment_verification_schema.sql
- Order idempotency: payment_intent_id used to deduplicate; webhook replays safe
  - File: 20250925000000_fix_booking_cart_clearing.sql

## Images & Uploads
- Accepted types: JPEG, PNG, WebP, GIF
- Max pre‑upload size: 10MB (validation)
- Optimization target: ~0.3–0.5MB after compression; 1920×1920 max dims
- Safe filenames and bucket‑URL validation for product images
  - File: src/lib/utils/imageOptimization.ts

## Payouts & Financial Integrity
- Payout arithmetic check: net = amount − fees (DB constraint)
  - File: 20251018210100_add_payout_arithmetic_constraint.sql
- Vendor‑level advisory lock during payout approval (prevents concurrent approvals)
  - File: 20250117180000_fix_p0_admin_assertions.sql (approve_payout_request)

## Security Baselines
- Vendor PII encryption at rest (bank, wallets); admin‑only decrypt + audit trail
  - File: 20251018210000_encrypt_vendor_pii.sql
- Admin assertion standardized; self‑protection (can’t demote/suspend self)
  - Files: 20250117180000_fix_p0_admin_assertions.sql, 20251012210000_admin_users_management.sql
- search_path pinned for sensitive functions; RPC lockdown to service_role
  - Files: 20250924132100_pin_search_paths_exact.sql, 20250919130300_lockdown_rpc_permissions.sql
- RLS on bookings, metrics, trust engine tables
  - Files: see respective migrations

Keep this page open to answer “how exactly did you do that?” with one line and a file reference.



















# KB Stylish — Demo Presentation v2

Purpose: A crisp, grounded, Nepal-market-ready demo package that proves overwhelming value for 70K and positions the platform’s worth in the 10–15 lakh range, with ethical upsell paths.

Use this folder exclusively during the next client meeting (2–3 days).

---

## Contents
- 00_OPENING_SCRIPT.md — 90-second opener anchored in lakhs (Nepal context)
- 01_MARKET_VALUE_IN_NEPAL.md — Realistic pricing ranges (lakhs), with sources
- 02_FEATURES_BY_PAGE_AND_JOURNEY.md — Enterprise-grade features by section/page
- 03_SECURITY_AND_DATA_INTEGRITY.md — Proof-backed controls (with migration refs)
- 04_PERFORMANCE_AND_CACHING.md — Caching, indices, trending, metrics
- 05_MONETIZATION_OPPORTUNITIES.md — How client monetizes (featured brands, etc.)
- 06_POST_LAUNCH_OPS_AND_SLA.md — Sentry/uptime plan + Nepal-friendly retainer
- 07_DEMO_FLOW_SCRIPT.md — 45–60 min structure with timing
- 08_TALKING_POINTS.md — One-pagers for quick recall
- 09_FAQ_AND_OBJECTIONS.md — Short, confident answers
- 10_APPENDIX_SQL_EVIDENCE.md — Code/migration receipts for every claim

---

## How to present
1) Open with value in lakhs → 10–15 lakh anchor (not USD/millions)
2) Show Customer → Vendor → Stylist → Admin (progressive revelation)
3) Tie every demo moment to business impact (trust, speed, cost-saving)
4) Close with post-launch ops plan + soft upsell (monitoring retainer)

---

## Grounding (what this package relies on)
- Supabase migrations (encryption, advisory locks, cache invalidation, RLS)
- Trust Engine (purchase-verified reviews, sharded voting, moderation)
- Booking Engine (GiST range index, advisory locks, TTL/reservation cleanup)
- Metrics (vendor_daily/platform_daily, realtime cache)

Everything is cited in 10_APPENDIX_SQL_EVIDENCE.md so you can point to receipts instantly.
