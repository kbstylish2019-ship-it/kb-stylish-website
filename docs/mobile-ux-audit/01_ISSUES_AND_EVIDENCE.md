# 01 — Issues Intake and Evidence (Mobile UX)

Source: User screenshots and notes (Oct 25, 2025). Desktop generally OK unless noted.

## Global / Navigation
- Home navigation: login/logout/profile not visible on mobile menu.
- Authenticated profile dropdown not accessible in mobile header.

## Shop
- Filter sidebar consumes full screen height on mobile, pushes product list too far down. Needs collapsible/accordion and sticky summary.

## Product Detail (PDP)
- Duplicate Add to Cart: sticky bottom bar exists but is non-functional — remove.
- Reviews section: header, sort controls (Most Recent / Most Helpful), filters cramped on mobile.

## Track Order
- Layout looks cut on right edge in screenshot; ensure container and action button do not overflow at 360px.

## About
- One image missing (shows broken/blank block). Replace with safe high-quality Unsplash image.

## Book a Stylist
- Filters positioning on mobile needs polish.
- Booking modal not scrollable after selecting service/date/time.

## Become a Vendor (Apply)
- Business Type <select> shows white dropdown options (hard to read in dark theme) on mobile.

## Authenticated
- Profile page unresponsive (check header actions and layout stack).
- My Bookings page “completely unresponsive” in report; ensure cards and action group wrap/stack.

## Vendor Dashboard (/vendor)
- Only Orders and Settings responsive; other pages not. Verify sidebar/content grid and table overflow for Products, Payouts, Analytics, Support.

## Stylist
- Dashboard OK; BookingActions modal unresponsive on mobile; /stylist/booking page unresponsive; Reviews OK; Schedule page needs Request Time Off button positioning/size improvement.

## Admin
- Dashboard responsive but sidebar consumes 2 screen heights; needs compact collapsible pattern.
- Users and Vendors pages not responsive.
- Featured Brands OK.
- Featured Stylists + Specialties not responsive.
- Services responsive, but Create Service modal not responsive.
- Services, Onboard Stylist, Manage Schedules unresponsive; Schedule Overrides OK; Audit logs likely OK.
- Categories not responsive; Payouts responsive.
