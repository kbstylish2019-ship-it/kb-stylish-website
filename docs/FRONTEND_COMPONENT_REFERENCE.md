# KB Stylish - Frontend Component Reference

## Complete Component Documentation

---

## 1. Layout Components

### 1.1 Header (`src/components/layout/Header.tsx`)

**Type**: Server Component

**Purpose**: Main navigation header with role-based menu items

**Props**:
```typescript
interface HeaderProps {
  cartItemCount?: number; // Optional, uses store value
}
```

**Features**:
- Sticky positioning at top
- Brand logo with link to homepage
- Desktop navigation menu
- Mobile-responsive controls
- Role-based navigation filtering
- Cart icon with item count

**Usage**:
```tsx
// Automatically included in root layout
<Header />
```

---

### 1.2 Footer (`src/components/layout/Footer.tsx`)

**Type**: Server Component

**Purpose**: Site footer with links and company information

**Sections**:
- About KB Stylish - Company description
- Quick Links - Navigation shortcuts
- Legal - Privacy, Terms, Refund policies
- Copyright bar

---

### 1.3 DashboardLayout (`src/components/layout/DashboardLayout.tsx`)

**Type**: Client Component

**Purpose**: Wrapper layout for dashboard pages

**Props**:
```typescript
interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  title: string;
}
```

---

## 2. Homepage Components

### 2.1 CompactHero (`src/components/homepage/CompactHero.tsx`)

**Type**: Server Component

**Purpose**: Hero section with brand messaging

**Features**:
- Gradient background
- Tagline badge
- Main heading
- Trust indicators

**Visual Elements**:
- Background blur effects
- Gold accent dots
- Responsive text sizing

---

### 2.2 HeroSection (`src/components/homepage/HeroSection.tsx`)

**Type**: Server Component

**Purpose**: Full hero section with image (alternative to CompactHero)

**Features**:
- Two-column layout
- Hero image
- CTA buttons (Shop Now, Book a Stylist)
- Trust indicators

---

### 2.3 QuickCategories (`src/components/homepage/QuickCategories.tsx`)

**Type**: Server Component

**Purpose**: Category navigation grid

**Props**:
```typescript
interface QuickCategoriesProps {
  categories: Category[];
}
```

---

### 2.4 ProductCard (`src/components/homepage/ProductCard.tsx`)

**Type**: Client Component (Memoized)

**Purpose**: Individual product display card

**Props**:
```typescript
interface ProductCardProps {
  product: Product;
  onClick?: () => void; // For tracking
}
```

**Features**:
- Image with fallback
- Product name and price
- Badge display (e.g., "New", "Sale")
- Navigation loader for smooth transitions
- Memoized for performance

---

### 2.5 TrendingProducts (`src/components/homepage/TrendingProducts.tsx`)

**Type**: Server Component

**Purpose**: Trending products section

**Props**:
```typescript
interface TrendingProductsProps {
  products: Product[];
}
```

---

### 2.6 FeaturedBrands (`src/components/homepage/FeaturedBrands.tsx`)

**Type**: Server Component

**Purpose**: Brand showcase section

**Props**:
```typescript
interface FeaturedBrandsProps {
  brands: Brand[];
}
```

---

### 2.7 FeaturedStylists (`src/components/homepage/FeaturedStylists.tsx`)

**Type**: Client Component (Lazy Loaded)

**Purpose**: Featured stylists carousel

**Features**:
- Stylist cards with ratings
- Booking CTA
- Responsive carousel

---

### 2.8 StylistCard (`src/components/homepage/StylistCard.tsx`)

**Type**: Client Component

**Purpose**: Individual stylist display card

**Props**:
```typescript
interface StylistCardProps {
  stylist: Stylist;
  onBook?: () => void;
}
```

---

### 2.9 ValueProps (`src/components/homepage/ValueProps.tsx`)

**Type**: Client Component (Lazy Loaded)

**Purpose**: Value proposition section

**Features**:
- Icon-based feature highlights
- Grid layout
- Responsive design

---

## 3. Shop Components

### 3.1 FilterSidebar (`src/components/shop/FilterSidebar.tsx`)

**Type**: Client Component

**Purpose**: Product filtering interface

**Props**:
```typescript
interface FilterSidebarProps {
  availableCategories: string[];
  currentFilters: CurrentFilters;
}

interface CurrentFilters {
  search: string;
  selectedCategories: string[];
  minPrice: string;
  maxPrice: string;
  sort: string;
}
```

**Features**:
- Search input
- Category checkboxes
- Price range inputs
- Sort dropdown
- Collapsible sections on mobile
- URL-based state management

**Sort Options**:
- Popularity
- Newest
- Price: Low to High
- Price: High to Low

---

## 4. Product Components

### 4.1 ProductDetailClient (`src/components/product/ProductDetailClient.tsx`)

**Type**: Client Component

**Purpose**: Main product detail page content

**Features**:
- Image gallery
- Product information
- Variant selection
- Add to cart functionality
- Reviews section

---

### 4.2 ProductImageGallery (`src/components/product/ProductImageGallery.tsx`)

**Type**: Client Component

**Purpose**: Product image carousel

**Features**:
- Main image display
- Thumbnail navigation
- Zoom functionality
- Image fallback

---

### 4.3 ProductOptions (`src/components/product/ProductOptions.tsx`)

**Type**: Client Component

**Purpose**: Variant selection (size, color, etc.)

**Props**:
```typescript
interface ProductOptionsProps {
  variants: ProductVariant[];
  selectedVariant: ProductVariant | null;
  onSelect: (variant: ProductVariant) => void;
}
```

---

### 4.4 ProductActions (`src/components/product/ProductActions.tsx`)

**Type**: Client Component

**Purpose**: Add to cart and buy now buttons

**Features**:
- Quantity selector
- Add to cart button
- Buy now button
- Stock status display

---

### 4.5 CustomerReviews (`src/components/product/CustomerReviews.tsx`)

**Type**: Client Component

**Purpose**: Product reviews section

**Features**:
- Review list
- Rating summary
- Review submission form
- Pagination

---

### 4.6 ReviewCard (`src/components/product/ReviewCard.tsx`)

**Type**: Client Component

**Purpose**: Individual review display

**Props**:
```typescript
interface ReviewCardProps {
  review: Review;
  showVendorReply?: boolean;
}
```

---

### 4.7 RelatedProducts (`src/components/product/RelatedProducts.tsx`)

**Type**: Server Component

**Purpose**: Related product recommendations

---

## 5. Booking Components

### 5.1 BookingPageClient (`src/components/booking/BookingPageClient.tsx`)

**Type**: Client Component

**Purpose**: Main booking page interface

**Features**:
- Stylist listing
- Branch filtering
- Service filtering
- Booking modal trigger

---

### 5.2 BookingModal (`src/components/booking/BookingModal.tsx`)

**Type**: Client Component

**Purpose**: Appointment booking modal

**Props**:
```typescript
interface BookingModalProps {
  stylist: StylistWithServices;
  open: boolean;
  onClose: () => void;
}
```

**Features**:
- Service selection
- Date picker (14 days)
- Time slot selection
- Real-time availability
- Status indicators:
  - ✅ Available
  - 🔒 Booked
  - ⏳ Reserved
  - ☕ Break time
- Focus trap for accessibility
- Keyboard navigation

---

### 5.3 ChangeAppointmentModal (`src/components/booking/ChangeAppointmentModal.tsx`)

**Type**: Client Component

**Purpose**: Reschedule existing appointment

**Features**:
- Current appointment display
- New slot selection
- Confirmation flow

---

### 5.4 RatingModal (`src/components/booking/RatingModal.tsx`)

**Type**: Client Component

**Purpose**: Post-appointment rating

**Features**:
- Star rating
- Written review
- Submission handling

---

### 5.5 BranchFilter (`src/components/booking/BranchFilter.tsx`)

**Type**: Client Component

**Purpose**: Filter stylists by branch location

---

### 5.6 StylistFilter (`src/components/booking/StylistFilter.tsx`)

**Type**: Client Component

**Purpose**: Filter stylists by specialty/service

---

## 6. Checkout Components

### 6.1 CheckoutClient (`src/components/checkout/CheckoutClient.tsx`)

**Type**: Client Component

**Purpose**: Main checkout page

**Features**:
- Product list display
- Booking details display
- Shipping form
- Payment method selection
- Order summary
- Payment gateway integration

**Payment Methods**:
- eSewa
- Khalti
- NPX (Nepal Payment Exchange)

---

### 6.2 ProductList (`src/components/checkout/ProductList.tsx`)

**Type**: Client Component

**Purpose**: Cart items display in checkout

**Props**:
```typescript
interface ProductListProps {
  items: CartProductItem[];
  onQtyChange: (id: string, qty: number, variant?: string) => void;
  onRemove: (id: string, variant?: string) => void;
}
```

---

### 6.3 BookingDetails (`src/components/checkout/BookingDetails.tsx`)

**Type**: Client Component

**Purpose**: Booking summary in checkout

**Features**:
- Service name
- Stylist name
- Date and time
- Duration
- Price

---

### 6.4 ShippingForm (`src/components/checkout/ShippingForm.tsx`)

**Type**: Client Component

**Purpose**: Shipping address form

**Props**:
```typescript
interface ShippingFormProps {
  address: Address;
  onChange: (address: Address) => void;
}

interface Address {
  fullName: string;
  phone: string;
  area: string;
  line2?: string;
  city: string;
  region: string;
  notes?: string;
}
```

---

### 6.5 OrderSummary (`src/components/checkout/OrderSummary.tsx`)

**Type**: Client Component

**Purpose**: Order totals and payment

**Props**:
```typescript
interface OrderSummaryProps {
  costs: OrderCosts;
  discountCode: string;
  onDiscountCodeChange: (code: string) => void;
  selectedPayment?: PaymentMethod;
  onPaymentSelect: (method: PaymentMethod) => void;
  onPlaceOrder: () => void;
  placeOrderEnabled: boolean;
  isProcessing: boolean;
  error: string | null;
  onClearError: () => void;
}
```

---

## 7. Admin Components

### 7.1 AdminSidebar (`src/components/admin/AdminSidebar.tsx`)

**Type**: Client Component

**Purpose**: Admin navigation sidebar

**Navigation Groups**:
- Overview (Dashboard, Analytics)
- User Management (Users, Vendors)
- Content Curation (Brands, Stylists, Specialties)
- Stylist Operations (Branches, Services, Schedules)
- Commerce & Finance (Categories, Payouts)
- Customer Support (Tickets)
- System (Moderation, Audit Logs, Settings)

---

### 7.2 AdminStatCard (`src/components/admin/AdminStatCard.tsx`)

**Type**: Client Component

**Purpose**: Statistics display card

**Props**:
```typescript
interface AdminStatCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}
```

---

### 7.3 UsersTable (`src/components/admin/UsersTable.tsx`)

**Type**: Client Component

**Purpose**: User listing with actions

**Features**:
- Sortable columns
- Search/filter
- Role badges
- Action buttons

---

### 7.4 VendorsPageClient (`src/components/admin/VendorsPageClient.tsx`)

**Type**: Client Component

**Purpose**: Vendor management interface

**Features**:
- Vendor listing
- Approval workflow
- Details modal

---

### 7.5 SupportTicketManager (`src/components/admin/SupportTicketManager.tsx`)

**Type**: Client Component

**Purpose**: Support ticket management

**Features**:
- Ticket listing
- Status filtering
- Assignment
- Response handling

---

## 8. Vendor Components

### 8.1 VendorOrdersClient (`src/components/vendor/VendorOrdersClient.tsx`)

**Type**: Client Component

**Purpose**: Vendor order management

**Features**:
- Order listing
- Status filtering
- Fulfillment status updates
- Tracking number entry
- Shipping carrier selection

**Order Statuses**:
- Pending
- Processing
- Shipped
- Delivered
- Cancelled

---

### 8.2 ProductsPageClient (`src/components/vendor/ProductsPageClient.tsx`)

**Type**: Client Component

**Purpose**: Product management for vendors

**Features**:
- Product listing
- Add/Edit/Delete
- Stock management
- Image upload

---

### 8.3 AddProductModal (`src/components/vendor/AddProductModal.tsx`)

**Type**: Client Component

**Purpose**: Product creation form

**Fields**:
- Product name
- Description
- Category
- Price
- Stock
- Images
- Variants

---

### 8.4 StatCard (`src/components/vendor/StatCard.tsx`)

**Type**: Client Component

**Purpose**: Dashboard statistics

---

## 9. Stylist Components

### 9.1 StylistDashboardClient (`src/components/stylist/StylistDashboardClient.tsx`)

**Type**: Client Component

**Purpose**: Stylist dashboard overview

**Features**:
- Upcoming appointments
- Budget tracker
- Real-time booking notifications
- Customer history
- Safety information display

---

### 9.2 BookingsListClient (`src/components/stylist/BookingsListClient.tsx`)

**Type**: Client Component

**Purpose**: Booking management for stylists

**Features**:
- Booking list
- Status filtering
- Action buttons
- Customer details

---

### 9.3 SchedulePageClient (`src/components/stylist/SchedulePageClient.tsx`)

**Type**: Client Component

**Purpose**: Schedule management

**Features**:
- Weekly view
- Time slot editing
- Break time setting
- Override management

---

### 9.4 WeeklyScheduleView (`src/components/stylist/WeeklyScheduleView.tsx`)

**Type**: Client Component

**Purpose**: Calendar view of schedule

---

### 9.5 StylistSidebar (`src/components/stylist/StylistSidebar.tsx`)

**Type**: Client Component

**Purpose**: Stylist dashboard navigation

---

## 10. Support Components

### 10.1 SupportForm (`src/components/support/SupportForm.tsx`)

**Type**: Client Component

**Purpose**: Support ticket submission

**Fields**:
- Subject
- Category
- Description
- Attachments

---

### 10.2 MyTicketsClient (`src/components/support/MyTicketsClient.tsx`)

**Type**: Client Component

**Purpose**: User's support tickets list

---

### 10.3 TicketDetailsClient (`src/components/support/TicketDetailsClient.tsx`)

**Type**: Client Component

**Purpose**: Individual ticket view

**Features**:
- Ticket details
- Message thread
- Reply form
- Status updates

---

## 11. UI Components

### 11.1 Button (`src/components/ui/button.tsx`)

**Variants**:
- default
- destructive
- outline
- secondary
- ghost
- link

**Sizes**:
- default
- sm
- lg
- icon

---

### 11.2 Input (`src/components/ui/input.tsx`)

**Type**: Form input component

---

### 11.3 Select (`src/components/ui/select.tsx`)

**Type**: Dropdown select component

---

### 11.4 LoadingSpinner (`src/components/ui/LoadingSpinner.tsx`)

**Type**: Loading indicator

**Props**:
```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}
```

---

### 11.5 NavigationLoader (`src/components/ui/NavigationLoader.tsx`)

**Type**: Page transition loader

**Purpose**: Shows loading state during navigation

---

### 11.6 ErrorBoundary (`src/components/ui/ErrorBoundary.tsx`)

**Type**: Error boundary component

**Purpose**: Catches and displays errors gracefully

---

## 12. Shared Components

### 12.1 ProductGrid (`src/components/shared/ProductGrid.tsx`)

**Type**: Server Component

**Purpose**: Grid display of products

**Props**:
```typescript
interface ProductGridProps {
  products: Product[];
  columns?: 2 | 3 | 4;
}
```

---

### 12.2 VirtualizedProductGrid (`src/components/shared/VirtualizedProductGrid.tsx`)

**Type**: Client Component

**Purpose**: Virtualized product grid for large lists

**Features**:
- react-window integration
- Infinite scroll support
- Performance optimized

---

## 13. About Components

### 13.1 AboutHero (`src/components/about/AboutHero.tsx`)

**Type**: Server Component

**Purpose**: About page hero section

---

### 13.2 AboutCompany (`src/components/about/AboutCompany.tsx`)

**Type**: Server Component

**Purpose**: Company information cards

**Sections**:
- Company Summary
- Company Ownership
- Start-up Summary

---

### 13.3 AboutMission (`src/components/about/AboutMission.tsx`)

**Type**: Server Component

**Purpose**: Mission statement

---

### 13.4 AboutValues (`src/components/about/AboutValues.tsx`)

**Type**: Server Component

**Purpose**: Company values display

---

### 13.5 AboutStats (`src/components/about/AboutStats.tsx`)

**Type**: Server Component

**Purpose**: Company statistics

---

### 13.6 TopStylistsShowcase (`src/components/about/TopStylistsShowcase.tsx`)

**Type**: Server Component

**Purpose**: Featured stylists on about page

---

## Component Count Summary

| Category | Count |
|----------|-------|
| Layout | 3 |
| Homepage | 9 |
| Shop | 1 |
| Product | 7 |
| Booking | 6 |
| Checkout | 5 |
| Admin | 15+ |
| Vendor | 10+ |
| Stylist | 10+ |
| Support | 3 |
| UI | 10 |
| Shared | 3 |
| About | 6 |
| **Total** | **80+** |

---

*Component Reference Document - December 2025*
