# 🔍 WHAT TO KEEP VS REMOVE
# Comprehensive Codebase Inventory

**Date**: January 27, 2026  
**Purpose**: Complete inventory of KB Stylish components and their fate  
**Status**: COMPLETE

---

## 📊 SUMMARY MATRIX

| Category | Keep | Modify | Remove | Total |
|----------|------|--------|--------|-------|
| Database Tables | 25 | 8 | 5 | 38 |
| Database Functions | 40 | 15 | 8 | 63 |
| Edge Functions | 15 | 6 | 3 | 24 |
| Frontend Pages | 80 | 25 | 12 | 117 |
| Components | 150 | 20 | 5 | 175 |

---

## 🗄️ DATABASE TABLES

### ✅ KEEP AS-IS (25 tables)

| Table | Purpose | Notes |
|-------|---------|-------|
| `products` | Product catalog | Core table |
| `product_variants` | Size/color/etc variations | Already flexible |
| `product_images` | Product photos | Works perfectly |
| `product_attributes` | Custom attribute definitions | Perfect for electrical attrs |
| `attribute_values` | Attribute options | Already supports vendor-specific |
| `variant_attribute_values` | Links variants to attributes | Core functionality |
| `categories` | Product categorization | Reseed with electrical categories |
| `inventory` | Stock quantities | Exactly what's needed |
| `inventory_locations` | Warehouses/shops | Multi-location support |
| `inventory_movements` | Stock change audit trail | Critical for tracking |
| `orders` | Customer orders | Core e-commerce |
| `order_items` | Order line items | Standard structure |
| `order_status_history` | Order lifecycle tracking | Useful for customers |
| `payments` | Payment records | Khalti integration |
| `carts` | Shopping carts | Guest + authenticated |
| `cart_items` | Cart contents | Standard cart model |
| `user_profiles` | User information | Auth integration |
| `user_roles` | Role assignments | Simplify to admin/customer |
| `reviews` | Product reviews | Customer feedback |
| `review_votes` | Helpful/not helpful | Trust engine |
| `product_change_log` | Product audit trail | Useful for tracking |
| `email_logs` | Email history | Notification tracking |
| `job_queue` | Background jobs | Async processing |
| `support_tickets` | Customer support | Help system |
| `support_messages` | Ticket conversations | Support flow |

### ⚠️ MODIFY (8 tables)

| Table | Current Purpose | New Purpose | Changes Needed |
|-------|-----------------|-------------|----------------|
| `vendor_profiles` | Multi-vendor info | `shop_settings` | Rename, repurpose for shop config |
| `metrics.vendor_daily` | Per-vendor metrics | Shop metrics | Remove vendor_id, single row per day |
| `metrics.platform_daily` | Platform-wide stats | Shop stats | Keep structure, update naming |
| `metrics.vendor_realtime_cache` | Today's counters | Shop realtime | Simplify to single-shop |
| `product_attributes.vendor_id` | Vendor-specific attrs | Owner attrs | Change to owner_id or remove |
| `attribute_values.vendor_id` | Vendor-specific values | Owner values | Change to owner_id or remove |
| `bookings` | Salon appointments | REMOVE or repurpose | Likely remove for electrical shop |
| `booking_*` | Booking system | REMOVE | Not needed |

### ❌ REMOVE (5 tables + booking system)

| Table | Reason for Removal |
|-------|-------------------|
| `vendor_applications` | No vendor onboarding needed |
| `vendor_application_status_history` | Part of vendor flow |
| `vendor_documents` | Vendor verification docs |
| `stylist_*` | Salon-specific tables |
| `booking_*` (8 tables) | Appointment booking not needed |

---

## 🔧 DATABASE FUNCTIONS

### ✅ KEEP AS-IS (40 functions)

| Function | Purpose |
|----------|---------|
| `create_vendor_product` | Product creation (rename later) |
| `update_vendor_product` | Product updates |
| `get_cart_details` | Cart retrieval |
| `add_to_cart` | Add items |
| `remove_from_cart` | Remove items |
| `update_cart_quantity` | Quantity changes |
| `merge_guest_cart` | Guest → user cart |
| `process_order` | Order processing |
| `get_order_history` | Order retrieval |
| `submit_review` | Review submission |
| `vote_review` | Review voting |
| `aggregate_product_rating` | Rating calculation |
| `get_product_reviews` | Review display |
| `user_has_role` | Role checking |
| `refresh_jwt_claims` | JWT refresh |
| `get_trending_products` | Product discovery |
| `get_featured_products` | Homepage content |
| All inventory functions | Stock management |
| All payment functions | Payment processing |
| All email functions | Notifications |

### ⚠️ MODIFY (15 functions)

| Function | Current | New | Changes |
|----------|---------|-----|---------|
| `get_vendor_dashboard_stats_v2_1` | Vendor metrics | Owner metrics | Remove vendor_id param |
| `get_admin_dashboard_stats_v2_1` | Platform stats | Shop stats | Simplify calculations |
| `update_inventory_quantity` | Vendor ownership check | Owner check | Simplify auth |
| `add_product_variant` | Vendor product | Owner product | Remove vendor check |
| `update_product_variant` | Vendor variant | Owner variant | Remove vendor check |
| `add_vendor_attribute` | Vendor attrs | Owner attrs | Rename, simplify |
| `create_vendor_product` | Multi-vendor | Single owner | Remove vendor logic |
| RLS policies on products | vendor_id checks | owner checks | Simplify policies |
| RLS policies on inventory | vendor_id checks | owner checks | Simplify policies |

### ❌ REMOVE (8 functions)

| Function | Reason |
|----------|--------|
| `submit_vendor_application` | No vendor onboarding |
| `get_vendor_application_status` | Not needed |
| `approve_vendor_application` | Not needed |
| `reject_vendor_application` | Not needed |
| `get_vendor_balance` | Multi-vendor payout |
| `create_booking_reservation` | Booking system |
| `confirm_booking` | Booking system |
| All `stylist_*` functions | Salon-specific |

---

## ⚡ EDGE FUNCTIONS

### ✅ KEEP AS-IS (15 functions)

| Function | Purpose |
|----------|---------|
| `cart-manager` | Cart operations |
| `create-order-intent` | Order creation |
| `fulfill-order` | Order fulfillment |
| `verify-payment` | Payment verification |
| `khalti-webhook` | Payment webhook |
| `npx-webhook` | NPX payment webhook |
| `review-manager` | Review CRUD |
| `vote-manager` | Review voting |
| `reply-manager` | Review replies |
| `send-email` | Email dispatch |
| `cache-cleanup-worker` | Cache maintenance |
| `cache-invalidator` | Cache busting |
| `ratings-worker` | Rating aggregation |
| `order-worker` | Order processing |
| `metrics-worker` | Metrics updates |

### ⚠️ MODIFY (6 functions)

| Function | Changes Needed |
|----------|---------------|
| `admin-dashboard` | Keep as-is, update stats queries |
| `vendor-dashboard` | Rename to `owner-dashboard`, simplify |
| `get-curated-content` | Update for electrical products |
| `review-request-worker` | Update email templates |
| `support-ticket-manager` | Update branding |
| `user-onboarding` | Simplify, remove vendor path |

### ❌ REMOVE (3 functions)

| Function | Reason |
|----------|--------|
| `submit-vendor-application` | No vendor onboarding |
| `booking-reminder-worker` | No bookings |
| N/A | Most are reusable |

---

## 📱 FRONTEND PAGES

### ✅ KEEP AS-IS (80+ pages)

| Route | Purpose |
|-------|---------|
| `/` | Homepage |
| `/products` | Product listing |
| `/products/[slug]` | Product detail |
| `/categories/[slug]` | Category pages |
| `/cart` | Shopping cart |
| `/checkout` | Checkout flow |
| `/checkout/success` | Order confirmation |
| `/account` | Customer account |
| `/account/orders` | Order history |
| `/account/orders/[id]` | Order detail |
| `/account/profile` | Profile settings |
| `/account/addresses` | Address book |
| `/auth/login` | Login page |
| `/auth/register` | Registration |
| `/auth/forgot-password` | Password reset |
| `/search` | Search results |
| `/about` | About page |
| `/contact` | Contact page |
| `/help` | Help/FAQ |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |
| `/admin` | Admin dashboard |
| `/admin/orders` | Order management |
| `/admin/orders/[id]` | Order detail |
| `/admin/users` | User management |
| `/admin/categories` | Category management |
| `/admin/settings` | Settings |

### ⚠️ MODIFY (25 pages)

| Route | Current | New | Changes |
|-------|---------|-----|---------|
| `/` | Fashion homepage | Electrical homepage | Hero, featured products |
| `/products` | Fashion filters | Electrical filters | Voltage, brand, etc. |
| `/admin/dashboard` | Platform stats | Shop stats | Simplify metrics |
| `/admin/products` | All products | Owner products | Remove vendor column |
| `/admin/inventory` | (if exists) | Enhanced | Add import tracking |
| `/vendor/*` | Vendor portal | Owner portal | Rename, simplify |
| `/vendor/dashboard` | Vendor stats | Owner stats | Single owner |
| `/vendor/products` | Vendor products | All products | Full access |
| `/vendor/orders` | Vendor orders | All orders | Full access |
| `/vendor/settings` | Vendor profile | Shop settings | Repurpose |

### ❌ REMOVE (12 pages)

| Route | Reason |
|-------|--------|
| `/become-a-vendor` | No vendor onboarding |
| `/vendor/application` | Not needed |
| `/vendor/application/status` | Not needed |
| `/admin/vendors` | Single owner |
| `/admin/vendor-applications` | Not needed |
| `/stylists` | Salon-specific |
| `/stylists/[id]` | Not needed |
| `/book` | Booking system |
| `/book/[id]` | Not needed |
| `/bookings` | Not needed |
| `/bookings/[id]` | Not needed |
| Any `/salon/*` routes | Not needed |

---

## 🧩 COMPONENTS

### ✅ KEEP AS-IS (150+ components)

| Category | Components | Notes |
|----------|------------|-------|
| UI primitives | Button, Input, Select, Dialog, etc. | shadcn/ui |
| Layout | Header, Footer, Sidebar, etc. | Core structure |
| Products | ProductCard, ProductGrid, ProductGallery | Fully reusable |
| Cart | CartDrawer, CartItem, CartSummary | E-commerce core |
| Checkout | CheckoutForm, AddressForm, PaymentForm | Critical flow |
| Orders | OrderCard, OrderDetails, OrderStatus | Order management |
| Dashboard | StatCard, DataTable, Charts | Admin/owner UI |
| Forms | All form components | Input handling |
| Navigation | NavMenu, Breadcrumbs, Pagination | Site navigation |

### ⚠️ MODIFY (20 components)

| Component | Changes |
|-----------|---------|
| `Header` | Update logo, navigation |
| `Footer` | Update branding, links |
| `HeroSection` | Electrical shop content |
| `FeaturedProducts` | Electrical categories |
| `ProductFilters` | Electrical attributes |
| `ProductAttributes` | Display voltage, wattage, etc. |
| `VendorDashboard` | Rename to OwnerDashboard |
| `VendorSidebar` | Rename, update links |
| `VendorProductCard` | Simplify for single owner |
| `AdminVendorList` | Remove entirely |

### ❌ REMOVE (5 components)

| Component | Reason |
|-----------|--------|
| `VendorApplicationForm` | No vendor onboarding |
| `VendorApplicationStatus` | Not needed |
| `BecomVendorCTA` | Not needed |
| `StylistCard` | Salon-specific |
| `BookingWidget` | No bookings |

---

## 📁 DIRECTORY STRUCTURE CHANGES

### Current Structure (Simplified)
```
src/
├── app/
│   ├── (auth)/
│   ├── (main)/
│   ├── admin/
│   ├── vendor/          ← RENAME to owner/
│   ├── become-a-vendor/ ← DELETE
│   ├── stylists/        ← DELETE
│   └── book/            ← DELETE
├── components/
│   ├── admin/
│   ├── vendor/          ← RENAME to owner/
│   └── booking/         ← DELETE
└── lib/
```

### New Structure
```
src/
├── app/
│   ├── (auth)/
│   ├── (main)/
│   ├── admin/
│   └── owner/           ← Renamed from vendor
├── components/
│   ├── admin/
│   ├── owner/           ← Renamed from vendor
│   └── inventory/       ← NEW - enhanced inventory UI
└── lib/
```

---

## 🔧 CONFIGURATION FILES

### ✅ KEEP
| File | Notes |
|------|-------|
| `package.json` | Update name, scripts |
| `tsconfig.json` | Keep as-is |
| `tailwind.config.ts` | Update theme colors |
| `next.config.ts` | Update redirects |
| `components.json` | shadcn config |
| `playwright.config.ts` | Test config |

### ⚠️ MODIFY
| File | Changes |
|------|---------|
| `.env.local` | All new environment variables |
| `supabase/config.toml` | New project config |
| `next.config.ts` | Remove vendor redirects |
| `package.json` | Update name to "electropro" |

### ❌ REMOVE/RECREATE
| File | Reason |
|------|--------|
| `.env.local` | New secrets needed |
| All `.env*` files | Security |

---

## 📋 GREP COMMANDS FOR CLEANUP

### Find All Vendor References
```bash
# In codebase root
grep -r "vendor" src/ --include="*.tsx" --include="*.ts" | wc -l
grep -r "Vendor" src/ --include="*.tsx" --include="*.ts" | wc -l
grep -r "vendor_id" supabase/ --include="*.sql" | wc -l

# Specific patterns to address
grep -rn "become-a-vendor" src/
grep -rn "VendorApplication" src/
grep -rn "vendor_profiles" supabase/
grep -rn "isVendor" src/
grep -rn "user_has_role.*vendor" src/
```

### Find Booking/Stylist References
```bash
grep -rn "booking" src/ --include="*.tsx" --include="*.ts"
grep -rn "stylist" src/ --include="*.tsx" --include="*.ts"
grep -rn "Booking" src/
grep -rn "Stylist" src/
```

---

## 📊 EFFORT ESTIMATION

### By Category

| Category | Items | Est. Hours |
|----------|-------|------------|
| Database schema adaptation | 8 tables | 4-6 hours |
| Database function modification | 15 functions | 4-6 hours |
| RLS policy updates | ~20 policies | 3-4 hours |
| Edge function updates | 6 functions | 2-3 hours |
| Page modifications | 25 pages | 8-12 hours |
| Component updates | 20 components | 4-6 hours |
| Removal of unused code | All categories | 2-3 hours |
| Rebranding (logo, colors) | Site-wide | 2-3 hours |
| Testing | All changes | 8-12 hours |
| **TOTAL** | - | **37-55 hours** |

### By Day
| Day | Focus | Hours |
|-----|-------|-------|
| 1 | Setup + Database | 8 |
| 2 | Remove vendor flow + Rebrand | 8 |
| 3 | Inventory enhancements | 8 |
| 4 | Product attributes | 6 |
| 5 | E-commerce customization | 8 |
| 6 | Testing + Bug fixes | 8 |
| 7 | Deployment | 4-8 |

---

**Document Status**: COMPLETE  
**Total Items Inventoried**: 400+  
**Next Document**: `03_DATABASE_ADAPTATION_PLAN.md`
