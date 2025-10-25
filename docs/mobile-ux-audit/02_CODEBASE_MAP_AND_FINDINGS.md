# 02 — Codebase Map and Initial Findings

This maps the reported pages to owning components and likely change points.

## Global
- Colors/tokens: `src/app/globals.css`
- Root layout: `src/app/layout.tsx`
- Header: `src/components/layout/Header.tsx` + client controls `HeaderClientControls.tsx`
  - Mobile sheet nav rendered in `HeaderClientControls` lines ~168+
  - Login/Register button hidden on small screens via `hidden sm:inline-flex` — explains missing login on mobile.
  - Profile dropdown rendered only on `sm` and up via `hidden sm:block` — explains missing profile controls on mobile.
- Footer: `src/components/layout/Footer.tsx`

## Home
- Uses Header above; any CTA visibility issues are downstream of header.

## Shop
- Page: `src/app/shop/page.tsx`
- Filter Sidebar: `src/components/shop/FilterSidebar.tsx` — not collapsible; always rendered full height. Opportunity: convert sections to accordions; add summary chip row; sticky on desktop only.

## Product Detail (PDP)
- Page: `src/app/product/[slug]/page.tsx`
- Client: `src/components/product/ProductDetailClient.tsx`
  - Sticky mobile bottom bar at lines 80–92 with its own Add to Cart; duplicates `ProductActions` and doesn’t wire to store — remove as requested.
- Actions: `src/components/product/ProductActions.tsx`
- Reviews: `CustomerReviews.tsx` + `ReviewFilters.tsx`
  - Filters header uses `flex items-center justify-between` with two button group — tight on mobile; needs stacked layout and smaller buttons.

## Track Order
- Page: `src/app/track-order/page.tsx`
- Client: `src/components/orders/TrackOrderClient.tsx` — primary form uses `flex gap-3` for input+button; ensure buttons don’t overflow at 360px; make button shrink or stack on `sm`.

## About
- Sections: `components/about/*` — image sources from Unsplash in `AboutMission.tsx` and `AboutHero.tsx`. The “missing image” likely from `AboutMission` grid right column; ensure image URL and Next Image config; provide fallback.

## Book a Stylist
- Page: `src/app/book-a-stylist/page.tsx`
- Client: `components/booking/BookingPageClient.tsx`
- Booking modal: `components/booking/BookingModal.tsx` — outer dialog container fixed center with `max-w-2xl` and inner content not constrained in height; uses grid with lots of buttons; set `max-h-[90vh] overflow-y-auto` on content area to enable scroll on mobile.

## Vendor Apply
- Form: `components/vendor/onboarding/ApplicationForm.tsx`
  - <select> uses `bg-white/5` on control, but native dropdown list uses UA/OS styles; needs `appearance-none` + custom popover or acceptable minimal: add `dark:[&>option]:bg-[#1a1f2e] dark:[&>option]:text-foreground` which is already on shop sort select; reuse that pattern.

## Profile (Authenticated)
- Page wrapper: `src/app/profile/page.tsx` using container and `ProfileView`.
- Component: `components/profile/ProfileView.tsx` — header uses `flex items-start gap-6`; ensure it stacks on small widths; card grids ok.

## My Bookings
- Page: `src/app/bookings/page.tsx` renders inside `DashboardLayout` which uses `lg:grid-cols-[260px_1fr]` — good; on mobile it stacks (one column). The client list `components/customer/MyBookingsClient.tsx` has multiple `flex` groups; ensure action buttons wrap and grids remain readable at `sm`/`xs`.

## Vendor Dashboard (/vendor/*)
- Sidebar layouts are page-owned; many pages are client components in `components/vendor/*`. Common pattern: dense tables (OrdersTable, ProductsPageClient, VendorOrdersClient). Ensure `overflow-x-auto` on table containers and safe min-widths.

## Stylist
- Dashboard client `StylistDashboardClient.tsx` likely fine; booking modal already mapped; schedule page uses `SchedulePageClient` with header `Request Time Off` button; adjust responsive classes for placement and size at mobile.

## Admin
- Sidebar: `components/admin/AdminSidebar.tsx` — collapsible groups; on mobile it shows entire nav; use `details/summary` or custom accordion and collapse by default on small screens; also shrink paddings.
- Complex pages: `UsersPageClient.tsx`, `VendorsPageClient.tsx`, `SpecialtiesClient.tsx`, `FeaturedStylistsClient.tsx`, `CategoriesPageClient.tsx`, `CreateScheduleModal.tsx`.
  - Add responsive tables: wrap with `overflow-x-auto`, use stacked cards at mobile if simple.
  - Modals: ensure `max-h-[90vh] overflow-y-auto` on `DialogContent`.

## Global CSS/Tokens
- `globals.css` defines brand tokens and dark theme; consistent and fine for accessibility. Ensure focus rings visible.

## Summary of root causes
- Hidden auth controls on mobile due to `hidden sm:*` in `HeaderClientControls`.
- PDP duplicate CTA via sticky bar in `ProductDetailClient`.
- Review filters layout not stacking at mobile.
- BookingModal content lacks scroll bounds.
- Some selects render OS dropdown with white bg; use `[&>option]` dark styles as in Shop.
- Admin sidebar not collapsed by default on small screens.
- Tables lacking `overflow-x-auto` and min-widths causing squeeze.
