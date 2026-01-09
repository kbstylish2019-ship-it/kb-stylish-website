# KB Stylish - Frontend Documentation

## Project Report for College Submission

---

### Document Information

| Field | Details |
|-------|---------|
| Project Name | KB Stylish - Multi-Vendor Fashion & Style Marketplace |
| Document Type | Frontend Development Documentation |
| Version | 1.0 |
| Date | December 2025 |
| Technology Stack | Next.js 15, React 19, TypeScript, Tailwind CSS |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Technology Stack](#3-technology-stack)
4. [Project Architecture](#4-project-architecture)
5. [Frontend Structure](#5-frontend-structure)
6. [Page Modules](#6-page-modules)
7. [Component Library](#7-component-library)
8. [State Management](#8-state-management)
9. [Styling & Design System](#9-styling--design-system)
10. [Performance Optimizations](#10-performance-optimizations)
11. [Testing Strategy](#11-testing-strategy)
12. [Screenshots & UI Showcase](#12-screenshots--ui-showcase)
13. [Challenges & Solutions](#13-challenges--solutions)
14. [Future Enhancements](#14-future-enhancements)
15. [Conclusion](#15-conclusion)

---

## 1. Executive Summary

KB Stylish is a comprehensive multi-vendor e-commerce platform designed specifically for Nepal's fashion and beauty industry. The frontend application serves as the primary interface for customers, vendors, stylists, and administrators to interact with the platform.

### Key Achievements

- Built a modern, responsive web application using Next.js 15 with App Router
- Implemented role-based dashboards for customers, vendors, stylists, and administrators
- Created a seamless booking system for stylist appointments
- Developed a complete e-commerce checkout flow with multiple payment gateway integrations
- Achieved optimal performance through code splitting, lazy loading, and server-side rendering

### Project Scope

The frontend development encompasses:
- Public-facing pages (Homepage, Shop, Product Details, About)
- Customer features (Cart, Checkout, Order Tracking, Bookings)
- Vendor dashboard (Products, Orders, Payouts, Settings)
- Stylist dashboard (Bookings, Schedule, Reviews, Earnings)
- Admin panel (User Management, Content Curation, Analytics)

---

## 2. Project Overview

### 2.1 Business Context

KB Stylish is Nepal's premier multi-vendor fashion and style marketplace that combines:
- **E-commerce Platform**: Multi-vendor product marketplace
- **Service Booking**: Professional stylist appointment system
- **Brand Showcase**: Featured brands and trending products

### 2.2 Target Users

| User Role | Description |
|-----------|-------------|
| Customers | Browse products, book stylists, make purchases |
| Vendors | Manage products, fulfill orders, track earnings |
| Stylists | Manage appointments, view schedules, track reviews |
| Administrators | Oversee platform operations, manage users, curate content |

### 2.3 Key Features

1. **Product Catalog**: Browse and search products with advanced filtering
2. **Shopping Cart**: Add products and booking services to cart
3. **Checkout System**: Multi-payment gateway support (eSewa, Khalti, NPX)
4. **Stylist Booking**: Real-time availability and appointment scheduling
5. **Order Tracking**: Track order status and delivery
6. **Dashboard Portals**: Role-specific management interfaces

---

## 3. Technology Stack

### 3.1 Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.4.6 | React framework with App Router |
| React | 19.1.0 | UI component library |
| TypeScript | 5.x | Type-safe JavaScript |
| Tailwind CSS | 4.x | Utility-first CSS framework |

### 3.2 Key Dependencies

```json
{
  "dependencies": {
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-progress": "^1.1.7",
    "@tanstack/react-query": "^5.17.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "focus-trap-react": "^11.0.4",
    "lucide-react": "^0.539.0",
    "react-hot-toast": "^2.6.0",
    "react-intersection-observer": "^9.16.0",
    "react-window": "^2.1.0",
    "tailwind-merge": "^3.3.1",
    "zod": "^4.1.8",
    "zustand": "^5.0.7"
  }
}
```

### 3.3 Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code linting and quality |
| Jest | Unit testing framework |
| Playwright | End-to-end testing |
| TypeScript | Static type checking |

---

## 4. Project Architecture

### 4.1 Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KB Stylish Frontend                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │ Components  │  │   State Management  │  │
│  │  (App Dir)  │  │  (Shared)   │  │     (Zustand)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    Hooks    │  │    Utils    │  │    API Clients      │  │
│  │  (Custom)   │  │  (Helpers)  │  │   (Data Fetching)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Styling Layer                             │
│         Tailwind CSS + CSS Variables + Design Tokens         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── about/             # About page
│   ├── admin/             # Admin dashboard pages
│   ├── book-a-stylist/    # Stylist booking page
│   ├── bookings/          # Customer bookings
│   ├── checkout/          # Checkout flow
│   ├── legal/             # Legal pages
│   ├── order-confirmation/# Order success page
│   ├── payment/           # Payment callback
│   ├── product/           # Product detail pages
│   ├── profile/           # User profile
│   ├── shop/              # Product listing
│   ├── stylist/           # Stylist dashboard
│   ├── support/           # Support tickets
│   ├── track-order/       # Order tracking
│   ├── vendor/            # Vendor dashboard
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/            # Reusable UI components
│   ├── about/            # About page components
│   ├── admin/            # Admin components
│   ├── booking/          # Booking components
│   ├── checkout/         # Checkout components
│   ├── homepage/         # Homepage components
│   ├── layout/           # Layout components
│   ├── product/          # Product components
│   ├── shared/           # Shared components
│   ├── shop/             # Shop components
│   ├── stylist/          # Stylist components
│   ├── support/          # Support components
│   ├── ui/               # Base UI components
│   └── vendor/           # Vendor components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and helpers
├── styles/               # Global styles
└── constants/            # Application constants
```

---

## 5. Frontend Structure

### 5.1 App Router Structure

The application uses Next.js 15 App Router with the following route organization:

```
/                          → Homepage
/shop                      → Product catalog
/product/[slug]            → Product detail page
/book-a-stylist            → Stylist booking
/checkout                  → Checkout page
/order-confirmation        → Order success
/track-order               → Order tracking
/about                     → About page
/profile                   → User profile
/bookings                  → Customer bookings
/support                   → Support center
/support/tickets           → Support tickets
/legal/*                   → Legal pages

/admin/*                   → Admin dashboard
/vendor/*                  → Vendor dashboard
/stylist/*                 → Stylist dashboard
```

### 5.2 Layout Hierarchy

```tsx
// Root Layout (src/app/layout.tsx)
export default async function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <CartInitializer />
        <AuthSessionManager />
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
```

---

## 6. Page Modules

### 6.1 Homepage Module

**Location**: `src/app/page.tsx`

**Components Used**:
- `CompactHero` - Hero section with tagline
- `QuickCategories` - Category navigation
- `ProductGrid` - Latest products display
- `FeaturedStylists` - Featured stylist showcase
- `FeaturedBrands` - Brand showcase
- `TrendingProducts` - Trending items
- `ValueProps` - Value propositions

**Features**:
- Server-side data fetching for optimal performance
- Parallel API requests for faster loading
- Lazy loading for below-the-fold content

```tsx
export default async function Home() {
  const [allProducts, trendingProducts, featuredBrands, categories] = 
    await Promise.all([
      fetchProducts({ filters: {}, sort: { field: "created_at", order: "desc" } }),
      fetchTrendingProducts(8),
      fetchFeaturedBrands(4),
      getProductCategories(),
    ]);
  
  return (
    <main>
      <CompactHero />
      <QuickCategories categories={categories} />
      <ProductGrid products={allProducts.data} />
      <FeaturedStylists />
      <FeaturedBrands brands={featuredBrands} />
      <TrendingProducts products={trendingProducts} />
      <ValueProps />
    </main>
  );
}
```

### 6.2 Shop Module

**Location**: `src/app/shop/page.tsx`

**Components Used**:
- `FilterSidebar` - Product filtering
- `ProductGrid` - Product display grid

**Features**:
- Advanced filtering (category, price range, search)
- Sorting options (popularity, newest, price)
- URL-based filter state for shareability
- Responsive sidebar (collapsible on mobile)

### 6.3 Product Detail Module

**Location**: `src/app/product/[slug]/page.tsx`

**Components Used**:
- `ProductImageGallery` - Image carousel
- `ProductMeta` - Product information
- `ProductOptions` - Variant selection
- `ProductActions` - Add to cart
- `ProductPrice` - Pricing display
- `CustomerReviews` - Review section
- `RelatedProducts` - Product recommendations

**Features**:
- Dynamic routing with slug
- SEO-optimized metadata
- Image gallery with zoom
- Variant selection (size, color)
- Review submission and display

### 6.4 Checkout Module

**Location**: `src/app/checkout/page.tsx`

**Components Used**:
- `BookingDetails` - Appointment summary
- `ProductList` - Cart items
- `ShippingForm` - Address form
- `OrderSummary` - Order totals
- `ChangeAppointmentModal` - Reschedule booking

**Features**:
- Combined product and booking checkout
- Multiple payment methods (eSewa, Khalti, NPX)
- Address validation
- Discount code support
- Real-time price calculation

### 6.5 Booking Module

**Location**: `src/app/book-a-stylist/page.tsx`

**Components Used**:
- `BookingPageClient` - Main booking interface
- `BookingModal` - Appointment selection
- `StylistFilter` - Stylist filtering
- `BranchFilter` - Location filtering

**Features**:
- Real-time slot availability
- Service selection
- Date and time picker
- Stylist profiles with ratings
- Branch location filtering

### 6.6 Admin Dashboard Module

**Location**: `src/app/admin/*`

**Pages**:
- `/admin/dashboard` - Overview and analytics
- `/admin/users` - User management
- `/admin/vendors` - Vendor management
- `/admin/categories` - Category management
- `/admin/branches` - Branch locations
- `/admin/services` - Service management
- `/admin/curation/*` - Content curation
- `/admin/support` - Support tickets
- `/admin/logs/audit` - Audit logs

**Components Used**:
- `AdminSidebar` - Navigation sidebar
- `AdminStatCard` - Statistics display
- `UsersTable` - User listing
- `VendorsPageClient` - Vendor management
- `SupportTicketManager` - Ticket handling

### 6.7 Vendor Dashboard Module

**Location**: `src/app/vendor/*`

**Pages**:
- `/vendor/dashboard` - Overview
- `/vendor/products` - Product management
- `/vendor/orders` - Order fulfillment
- `/vendor/payouts` - Earnings and payouts
- `/vendor/settings` - Store settings

**Components Used**:
- `VendorOrdersClient` - Order management
- `ProductsPageClient` - Product CRUD
- `AddProductModal` - Product creation
- `StatCard` - Dashboard statistics

### 6.8 Stylist Dashboard Module

**Location**: `src/app/stylist/*`

**Pages**:
- `/stylist/dashboard` - Overview
- `/stylist/bookings` - Appointment management
- `/stylist/schedule` - Schedule management
- `/stylist/reviews` - Customer reviews
- `/stylist/earnings` - Earnings tracking

**Components Used**:
- `StylistDashboardClient` - Main dashboard
- `BookingsListClient` - Booking list
- `SchedulePageClient` - Schedule editor
- `WeeklyScheduleView` - Calendar view

---

## 7. Component Library

### 7.1 Layout Components

#### Header Component
**Location**: `src/components/layout/Header.tsx`

```tsx
export default async function Header() {
  const user = await getCurrentUser();
  const capabilities = user ? capabilitiesToArray(user.capabilities) : defaultCaps;
  
  return (
    <header className="sticky top-0 z-50 bg-[var(--kb-primary-brand)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/">
            <Image src="/kbStylishlogo.png" alt="KB Stylish Logo" />
            <span>KB Stylish</span>
          </Link>
          <nav>{/* Navigation links */}</nav>
          <HeaderClientControls />
        </div>
      </div>
    </header>
  );
}
```

**Features**:
- Server component for SEO
- Role-based navigation
- Sticky positioning
- Responsive design

#### Footer Component
**Location**: `src/components/layout/Footer.tsx`

**Sections**:
- About KB Stylish
- Quick Links
- Legal Links
- Copyright

### 7.2 Homepage Components

#### CompactHero
**Location**: `src/components/homepage/CompactHero.tsx`

**Features**:
- Gradient background
- Tagline and CTA
- Trust indicators (Verified brands, Secure payments, Premium quality)

#### ProductCard
**Location**: `src/components/homepage/ProductCard.tsx`

```tsx
const ProductCard = React.memo(function ProductCard({ product, onClick }) {
  return (
    <NavigationLoader href={`/product/${product.slug}`}>
      <div className="aspect-square">
        <Image src={product.imageUrl} alt={product.name} fill />
        {product.badge && <span className="badge">{product.badge}</span>}
      </div>
      <div className="p-4">
        <p>{product.name}</p>
        <p>Rs. {product.price.toLocaleString()}</p>
      </div>
    </NavigationLoader>
  );
});
```

**Features**:
- Memoized for performance
- Image fallback handling
- Badge display
- Click tracking support

### 7.3 Booking Components

#### BookingModal
**Location**: `src/components/booking/BookingModal.tsx`

**Features**:
- Service selection
- Date picker (14-day range)
- Real-time slot availability
- Status indicators (available, booked, reserved, break)
- Focus trap for accessibility
- Keyboard navigation (Escape to close)

### 7.4 Checkout Components

#### CheckoutClient
**Location**: `src/components/checkout/CheckoutClient.tsx`

**Features**:
- Product and booking display
- Shipping form with validation
- Payment method selection
- Order summary with discounts
- Payment gateway integration
- Success modal

### 7.5 UI Components

**Location**: `src/components/ui/`

| Component | Purpose |
|-----------|---------|
| `button.tsx` | Button variants |
| `input.tsx` | Form inputs |
| `select.tsx` | Dropdown select |
| `textarea.tsx` | Text area |
| `alert.tsx` | Alert messages |
| `LoadingSpinner.tsx` | Loading indicator |
| `NavigationLoader.tsx` | Page transition loader |
| `ErrorBoundary.tsx` | Error handling |
| `CustomSelect.tsx` | Custom dropdown |

---

## 8. State Management

### 8.1 Zustand Store

The application uses Zustand for client-side state management.

#### Cart Store
**Location**: `src/lib/store/decoupledCartStore.ts`

```tsx
interface CartState {
  productItems: CartProductItem[];
  bookingItems: CartBookingItem[];
  isLoading: boolean;
  
  // Actions
  addProductItem: (item: CartProductItem) => Promise<boolean>;
  addBookingItem: (item: CartBookingItem) => Promise<boolean>;
  updateProductQuantity: (id: string, qty: number) => void;
  removeProductItem: (id: string) => void;
  removeBookingItem: (id: string) => void;
  clearCart: () => void;
  
  // Computed
  grandTotal: () => number;
}
```

**Features**:
- Separate product and booking items
- Async actions for API sync
- Computed totals
- Persistence support

### 8.2 Server State

React Query is used for server state management:

```tsx
import { useQuery, useMutation } from '@tanstack/react-query';

// Fetch products
const { data, isLoading } = useQuery({
  queryKey: ['products', filters],
  queryFn: () => fetchProducts(filters),
});

// Create order
const mutation = useMutation({
  mutationFn: createOrder,
  onSuccess: () => {
    queryClient.invalidateQueries(['orders']);
  },
});
```

---

## 9. Styling & Design System

### 9.1 Design Tokens

```css
:root {
  --kb-primary-brand: #8B5CF6;      /* Purple - Primary brand color */
  --kb-accent-gold: #F59E0B;        /* Gold - Accent color */
  --kb-accent-red: #EF4444;         /* Red - Error/Alert color */
  --kb-text-primary: #FFFFFF;       /* White - Primary text */
  --kb-surface-dark: #1A1A1A;       /* Dark surface */
  --background: #0A0A0A;            /* Background */
  --foreground: #FAFAFA;            /* Foreground */
}
```

### 9.2 Component Styling Pattern

```tsx
// Using Tailwind CSS with design tokens
<div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
  <h3 className="text-lg font-semibold text-foreground">Title</h3>
  <p className="text-foreground/70">Description</p>
  <button className="bg-[var(--kb-primary-brand)] text-white px-4 py-2 rounded-lg">
    Action
  </button>
</div>
```

### 9.3 Responsive Design

```tsx
// Mobile-first responsive classes
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Cards */}
</div>

// Responsive text
<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
  Heading
</h1>
```

---

## 10. Performance Optimizations

### 10.1 Code Splitting

```tsx
// Dynamic imports for below-the-fold components
const FeaturedStylists = dynamic(
  () => import("@/components/homepage/FeaturedStylists"),
  { loading: () => <Skeleton /> }
);

// Lazy load modals
const AuthModal = React.useMemo(
  () => dynamic(() => import("@/components/features/AuthModal"), { ssr: false }),
  []
);
```

### 10.2 Image Optimization

```tsx
<Image
  src={product.imageUrl}
  alt={product.name}
  fill
  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
  className="object-cover"
  priority={isAboveFold}
/>
```

### 10.3 Memoization

```tsx
// Memoized components
const ProductCard = React.memo(function ProductCard({ product }) {
  // Component logic
});

// Memoized values
const costs = React.useMemo(
  () => calculateCosts(products, bookings, discount),
  [products, bookings, discount]
);
```

### 10.4 Server Components

```tsx
// Server component for data fetching
export default async function ShopPage() {
  const products = await fetchProducts(); // Server-side fetch
  return <ProductGrid products={products} />;
}
```

---

## 11. Testing Strategy

### 11.1 Unit Testing (Jest)

**Location**: `*.test.tsx` files

```tsx
// Example: AdminStatCard.test.tsx
describe('AdminStatCard', () => {
  it('renders stat value correctly', () => {
    render(<AdminStatCard title="Users" value={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
```

### 11.2 End-to-End Testing (Playwright)

**Location**: `tests/`

```tsx
// Example: checkout.spec.ts
test('complete checkout flow', async ({ page }) => {
  await page.goto('/shop');
  await page.click('[data-testid="product-card"]');
  await page.click('[data-testid="add-to-cart"]');
  await page.goto('/checkout');
  // Fill form and submit
});
```

### 11.3 Test Coverage

| Area | Coverage |
|------|----------|
| Components | Unit tests for critical components |
| Pages | Integration tests for page flows |
| E2E | Critical user journeys |

---

## 12. Screenshots & UI Showcase

### 12.1 Homepage
- Hero section with brand messaging
- Category quick navigation
- Product grid with cards
- Featured stylists carousel
- Brand showcase

### 12.2 Shop Page
- Filter sidebar (categories, price, sort)
- Product grid with pagination
- Responsive layout

### 12.3 Product Detail
- Image gallery
- Product information
- Variant selection
- Add to cart
- Customer reviews

### 12.4 Checkout
- Cart summary
- Shipping form
- Payment selection
- Order total

### 12.5 Dashboards
- Admin: User management, analytics
- Vendor: Products, orders, payouts
- Stylist: Bookings, schedule, reviews

---

## 13. Challenges & Solutions

### Challenge 1: Cart State Synchronization
**Problem**: Keeping cart state in sync between server and client
**Solution**: Implemented server-side cart fetching in layout with client-side hydration using Zustand

### Challenge 2: Real-time Booking Availability
**Problem**: Showing accurate slot availability
**Solution**: API-based slot fetching with status indicators (available, booked, reserved)

### Challenge 3: Payment Gateway Integration
**Problem**: Multiple payment methods with different flows
**Solution**: Unified checkout flow with gateway-specific form submission

### Challenge 4: Role-based Navigation
**Problem**: Different navigation for different user roles
**Solution**: Server-side capability detection with filtered navigation

### Challenge 5: Performance with Large Product Lists
**Problem**: Slow rendering with many products
**Solution**: Virtualized lists with react-window, pagination, and lazy loading

---

## 14. Future Enhancements

1. **Progressive Web App (PWA)**: Offline support and installability
2. **Internationalization (i18n)**: Multi-language support
3. **Advanced Search**: Elasticsearch integration
4. **Real-time Notifications**: WebSocket-based updates
5. **AR Try-On**: Virtual product try-on feature
6. **Voice Search**: Voice-enabled product search
7. **Personalization**: AI-powered recommendations

---

## 15. Conclusion

The KB Stylish frontend represents a comprehensive, production-ready e-commerce platform built with modern web technologies. Key accomplishments include:

- **Modern Architecture**: Next.js 15 App Router with React 19
- **Type Safety**: Full TypeScript implementation
- **Performance**: Optimized with SSR, code splitting, and lazy loading
- **User Experience**: Responsive design with accessibility considerations
- **Scalability**: Modular component architecture
- **Maintainability**: Clean code structure with testing

The frontend successfully serves multiple user roles (customers, vendors, stylists, administrators) with dedicated interfaces while maintaining a consistent design language and user experience.

---

## Appendix

### A. File Count Summary

| Directory | Files |
|-----------|-------|
| src/app | 40+ pages |
| src/components | 80+ components |
| src/lib | 20+ utilities |
| src/hooks | 10+ custom hooks |

### B. Dependencies Summary

- Production dependencies: 25+
- Development dependencies: 15+
- Total package size: Optimized with tree-shaking

### C. Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

---

*Document prepared for academic submission - December 2025*
