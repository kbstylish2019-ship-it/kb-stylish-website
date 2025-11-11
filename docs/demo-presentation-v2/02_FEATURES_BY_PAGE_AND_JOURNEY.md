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
