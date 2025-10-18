export type UserRole = "guest" | "customer" | "vendor" | "admin";

// Core capabilities that drive visibility. Compose roles from these.
export type UserCapability =
  | "authenticated" // user is logged in
  | "view_shop"
  | "view_about"
  | "apply_vendor"
  | "view_bookings"
  | "view_cart"
  | "view_profile"
  | "vendor_access"
  | "stylist_access"
  | "admin_access";

export type NavArea = "primary" | "utility" | "profile";

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  area: NavArea;
  requires: UserCapability[]; // all capabilities must be present to see this item
  emphasis?: "default" | "cta";
  external?: boolean;
}

// Homepage domain models (sample contracts; real API may extend these)
export interface Product {
  id: string;
  name: string;
  slug?: string; // URL-friendly identifier
  price: number; // in NPR
  imageUrl?: string; // optional until CDN configured
  badge?: string; // e.g., "New", "Trending"
  category?: string; // e.g., 'ethnic' | 'streetwear' | 'formal' | 'casual'
}

// PDP domain models (Product Detail Page)
export interface Media {
  url: string;
  alt: string;
}

export interface ProductOption {
  id: string;
  name: string; // e.g., "Size", "Color"
  values: string[];
}

export interface ProductVariant {
  id: string;
  options: Record<string, string>; // { Size: "M", Color: "Black" }
  price: number; // in NPR
  stock: number; // 0 indicates out-of-stock for this variant
  sku?: string;
}

export interface VendorSummary {
  id: string;
  name: string;
  rating?: number; // 0..5
}

export interface Review {
  id: string;
  author: string;
  rating: number; // 0..5
  title?: string;
  content: string;
  date: string; // ISO date string
}

export interface ShippingInfo {
  estimated: string; // e.g., "2-4 days in KTM | 3-6 days nationwide"
  cost: string; // e.g., "Free over NPR 2,000 | NPR 99 standard"
  codAvailable?: boolean;
}

export interface ReturnPolicy {
  days: number; // e.g., 7
  summary: string; // short description shown on PDP
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number; // in NPR
  compareAtPrice?: number; // optional MSRP / crossed-out price
  currency: "NPR";
  vendor: VendorSummary;
  images: Media[];
  options: ProductOption[];
  variants: ProductVariant[];
  badges?: string[]; // e.g., ["New", "Limited"]
  avgRating: number; // 0..5
  reviewCount: number;
  reviews: Review[];
  stockStatus: StockStatus;
  shipping: ShippingInfo;
  returns: ReturnPolicy;
}

// Checkout domain models
export interface Booking {
  id: string;
  stylist: string;
  service: string;
  date: string; // ISO date
  time: string; // e.g., "14:30"
  durationMins: number;
  location?: string;
  price: number; // in NPR
}

export interface CartProductItem {
  type: "product";
  id: string;
  name: string;
  variant?: string; // e.g., "M / Royal Purple"
  variantId?: string; // The actual variant ID from database
  variantData?: any; // Full variant object from database
  imageUrl?: string;
  price: number; // per unit
  quantity: number;
  sku?: string;
}

export interface CartBookingItem {
  type: "booking";
  booking: Booking;
}

export type CartItem = CartProductItem | CartBookingItem;

export interface Address {
  fullName: string;
  phone: string;
  region: string; // Province
  city: string;
  area: string; // Area/Street
  line2?: string;
  notes?: string;
}

export type PaymentMethod = "esewa" | "khalti" | "cod";

export interface OrderCosts {
  productSubtotal: number;
  serviceFees: number;
  shipping: number;
  discount: number;
  total: number;
  currency: "NPR";
}

export interface Stylist {
  id: string;
  name: string;
  specialty: string; // e.g., "Bridal", "Grooming"
  rating: number; // 0..5
  reviewCount?: number;
  imageUrl?: string;
  availability?: string;
  isFeatured?: boolean;
}

// Vendor domain models
export interface OrderItem {
  name: string;
  quantity: number;
}

export type OrderStatus =
  | "Pending"
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

export type PayoutStatus = "Unpaid" | "Processing" | "Paid";

export interface Order {
  id: string; // Order number or ID, e.g., "ORD-1001"
  date: string; // ISO date string
  customer: string;
  items: OrderItem[];
  total: number; // in NPR
  status: OrderStatus;
  payout: PayoutStatus;
}

// Admin domain models
export type AccountStatus = "Active" | "Suspended" | "Pending" | "Banned";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole; // 'customer' | 'vendor' | 'admin' are typical values
  status: AccountStatus;
  createdAt: string; // ISO date string
  lastActiveAt?: string; // ISO date string
  orders?: number; // for customer/vendor
  revenue?: number; // NPR, for vendor
}

// Vendor Onboarding models
export type PayoutMethod = "bank" | "esewa" | "khalti";

export interface VendorBusinessInfo {
  businessName: string;
  businessType: "Boutique" | "Salon" | "Designer" | "Manufacturer" | "Other";
  contactName: string;
  email: string;
  phone: string;
  website?: string;
}

export interface VendorPayoutInfoBase {
  method: PayoutMethod;
}

export interface VendorBankPayout extends VendorPayoutInfoBase {
  method: "bank";
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string;
}

export interface VendorEsewaPayout extends VendorPayoutInfoBase {
  method: "esewa";
  esewaId: string; // registered mobile/account id
}

export interface VendorKhaltiPayout extends VendorPayoutInfoBase {
  method: "khalti";
  khaltiId: string; // registered mobile/account id
}

export type VendorPayoutInfo = VendorBankPayout | VendorEsewaPayout | VendorKhaltiPayout;

export interface VendorApplication {
  business: VendorBusinessInfo;
  payout: VendorPayoutInfo;
  consent: boolean; // agrees to terms/policies
}
