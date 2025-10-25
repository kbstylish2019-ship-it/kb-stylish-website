# 03 — Plan and Priorities (Frontend-only)

This plan follows the Excellence Protocol: investigate → design → implement surgically.

## P0 — Critical mobile blockers (fix first)
- Header (mobile):
  - Expose Login/Register on mobile. Current button has `hidden sm:inline-flex`. Replace with always-visible CTA in header or inside mobile sheet top area.
  - Expose Profile actions for authed users on mobile. Current dropdown is `hidden sm:block`. Add a small avatar/profile button that opens the same menu on mobile.
- PDP:
  - Remove non-functional sticky bottom bar CTA in `ProductDetailClient` (lines ~80–92). Keep only `ProductActions`.
  - Reviews section: stack header + sort buttons; reduce button size; ensure rating dist + filters fit via vertical layout.
- Booking Modal:
  - Make modal body scrollable on mobile: add `max-h-[90vh] overflow-y-auto` to the inner content container; ensure focus trap remains.
- Vendor Apply: Business Type select dark mode
  - Apply `[&>option]:bg-[var(--kb-surface-dark)] [&>option]:text-foreground` (like Shop sort select) + `appearance-none` (optional) for consistent dropdown.
- Track Order: Ensure input+button do not overflow at 360px; stack at `sm` or use responsive grid.

## P1 — Major UX improvements
- Shop Filters: turn sections into collapsible accordions on mobile and auto-collapse after Apply; add summary chips row above grid. Keep sidebar sticky only from `lg`.
- Profile page: ensure header block stacks on mobile and primary stats/cards flow vertically.
- My Bookings: ensure action buttons wrap on mobile, card content uses grid; verify no horizontal scroll.
- Admin Sidebar: collapse groups by default on mobile; provide quick jump anchor; constrain max-height with internal scroll.
- Tables (Vendor/Admin/Stylist): wrap dense tables in `overflow-x-auto` and set `min-w-[720px]` or per-table value; add mobile cards for simplest tables where needed.
- Stylist Schedule: adjust “Request Time Off” button size/placement; align to right on `sm+`, full-width on mobile.

## P2 — Polish
- Spacing/typography scale audits per section; ensure consistent `px-4` outer padding and `max-w-7xl` containers.
- Focus ring and interactive target audits.
- About page: confirm all images load; replace any broken image with stable Unsplash source.

## File-level change map (draft)
- Header
  - `src/components/layout/HeaderClientControls.tsx`
    - Make login CTA visible on mobile (remove `hidden sm:inline-flex` or duplicate as icon in mobile sheet).
    - Add mobile profile menu trigger when authed.
- PDP
  - `src/components/product/ProductDetailClient.tsx` — remove sticky bottom bar.
  - `src/components/product/ReviewFilters.tsx` — stack layout at mobile; smaller buttons.
- Shop
  - `src/components/shop/FilterSidebar.tsx` — refactor to collapsible sections on small screens (Accordion), preserve current desktop.
- Booking
  - `src/components/booking/BookingModal.tsx` — add scroll constraints to content wrapper.
- Track Order
  - `src/components/orders/TrackOrderClient.tsx` — stack input + button at `sm` and ensure buttons shrink.
- Vendor Apply
  - `src/components/vendor/onboarding/ApplicationForm.tsx` — dark dropdown options styling.
- Profile
  - `src/components/profile/ProfileView.tsx` — ensure header flex stacks at mobile.
- Dashboards / Tables
  - Add `overflow-x-auto` wrappers and min-widths to: `components/vendor/*` table pages, `components/admin/*` users/vendors/specialties, stylist bookings lists where table-like.
- Admin Sidebar
  - `components/admin/AdminSidebar.tsx` — default collapsed on mobile; optional internal scroll.

## Acceptance checks (per page)
- Validate at 360px, 390px, 414px widths.
- No horizontal scroll.
- All actions reachable without precision taps; touch targets ≥44px.
- Color contrast WCAG AA.

## Rollout strategy
- Implement P0 as separate small PRs (1–2 files each) to minimize risk.
- Add Playwright mobile view snapshots for: header, PDP reviews, booking modal, vendor apply select, track-order form.

## Next session: execution order
1) Header mobile auth controls
2) Remove PDP sticky bar + reviews mobile stack
3) BookingModal scroll fix
4) Vendor Apply select dark options
5) Track Order input/button stack
6) Shop filter accordion (start)
7) Profile, Bookings responsive polish
8) Admin sidebar collapse + table wrappers
