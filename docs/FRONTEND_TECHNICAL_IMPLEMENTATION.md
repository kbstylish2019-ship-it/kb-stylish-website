# KB Stylish - Technical Implementation Guide

## Frontend Technical Documentation

---

## 1. Project Setup & Configuration

### 1.1 Next.js Configuration

**File**: `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  experimental: {
    turbo: {}, // Turbopack enabled
  },
};

export default nextConfig;
```

### 1.2 TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 1.3 Tailwind CSS Configuration

**File**: `postcss.config.mjs`

```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

---

## 2. Routing Implementation

### 2.1 App Router Structure

```
src/app/
├── (public)/              # Public routes group
│   ├── page.tsx          # Homepage
│   ├── shop/page.tsx     # Shop
│   └── about/page.tsx    # About
├── (auth)/               # Auth-required routes
│   ├── profile/page.tsx
│   └── bookings/page.tsx
├── admin/                # Admin routes
│   └── [...slug]/page.tsx
├── vendor/               # Vendor routes
│   └── [...slug]/page.tsx
└── stylist/              # Stylist routes
    └── [...slug]/page.tsx
```

### 2.2 Dynamic Routes

**Product Detail Page**: `src/app/product/[slug]/page.tsx`

```typescript
interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  
  return <ProductDetailClient product={product} />;
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  
  return {
    title: `${product.name} | KB Stylish`,
    description: product.description,
  };
}
```

### 2.3 Route Groups

```
src/app/
├── (marketing)/          # Marketing pages layout
│   ├── layout.tsx
│   ├── about/
│   └── legal/
├── (dashboard)/          # Dashboard layout
│   ├── layout.tsx
│   ├── admin/
│   ├── vendor/
│   └── stylist/
```

---

## 3. Data Fetching Patterns

### 3.1 Server-Side Data Fetching

```typescript
// src/app/shop/page.tsx
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  
  const products = await fetchProducts({
    filters: {
      category: params.category,
      minPrice: params.minPrice ? Number(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
      search: params.search,
    },
    sort: {
      field: params.sort || 'created_at',
      order: 'desc',
    },
  });

  return <ShopPageClient products={products} />;
}
```

### 3.2 Parallel Data Fetching

```typescript
// src/app/page.tsx
export default async function Home() {
  // Parallel requests for better performance
  const [products, trending, brands, categories] = await Promise.all([
    fetchProducts({ pagination: { limit: 12 } }),
    fetchTrendingProducts(8),
    fetchFeaturedBrands(4),
    getProductCategories(),
  ]);

  return (
    <main>
      <ProductGrid products={products.data} />
      <TrendingProducts products={trending} />
      <FeaturedBrands brands={brands} />
    </main>
  );
}
```

### 3.3 Client-Side Data Fetching

```typescript
// Using React Query
'use client';

import { useQuery } from '@tanstack/react-query';

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => fetchProducts(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Usage in component
function ProductList() {
  const { data, isLoading, error } = useProducts({ category: 'clothing' });
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <ProductGrid products={data} />;
}
```

---

## 4. State Management

### 4.1 Zustand Store Implementation

**File**: `src/lib/store/decoupledCartStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartProductItem {
  id: string;
  product_id: string;
  product_name: string;
  variant_id?: string;
  variant_name?: string;
  image_url?: string;
  price: number;
  quantity: number;
}

interface CartBookingItem {
  id: string;
  reservation_id: string;
  service_id: string;
  service_name: string;
  stylist_id: string;
  stylist_name: string;
  start_time: string;
  end_time: string;
  price: number;
}

interface CartState {
  productItems: CartProductItem[];
  bookingItems: CartBookingItem[];
  isLoading: boolean;
  isAddingProduct: boolean;
  isAddingBooking: boolean;
  
  // Actions
  setProductItems: (items: CartProductItem[]) => void;
  setBookingItems: (items: CartBookingItem[]) => void;
  addProductItem: (item: Omit<CartProductItem, 'id'>) => Promise<boolean>;
  addBookingItem: (item: Omit<CartBookingItem, 'id'>) => Promise<boolean>;
  updateProductQuantity: (id: string, quantity: number) => void;
  removeProductItem: (id: string) => void;
  removeBookingItem: (reservationId: string) => void;
  clearCart: () => void;
  
  // Computed
  get grandTotal(): number;
  get itemCount(): number;
}

export const useDecoupledCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      productItems: [],
      bookingItems: [],
      isLoading: false,
      isAddingProduct: false,
      isAddingBooking: false,

      setProductItems: (items) => set({ productItems: items }),
      setBookingItems: (items) => set({ bookingItems: items }),

      addProductItem: async (item) => {
        set({ isAddingProduct: true });
        try {
          // API call to add item
          const response = await cartAPI.addItem(item);
          if (response.success) {
            set((state) => ({
              productItems: [...state.productItems, { ...item, id: response.id }],
            }));
            return true;
          }
          return false;
        } finally {
          set({ isAddingProduct: false });
        }
      },

      addBookingItem: async (item) => {
        set({ isAddingBooking: true });
        try {
          set((state) => ({
            bookingItems: [...state.bookingItems, { ...item, id: item.reservation_id }],
          }));
          return true;
        } finally {
          set({ isAddingBooking: false });
        }
      },

      updateProductQuantity: (id, quantity) => {
        set((state) => ({
          productItems: state.productItems.map((item) =>
            item.id === id ? { ...item, quantity } : item
          ),
        }));
      },

      removeProductItem: (id) => {
        set((state) => ({
          productItems: state.productItems.filter((item) => item.id !== id),
        }));
      },

      removeBookingItem: (reservationId) => {
        set((state) => ({
          bookingItems: state.bookingItems.filter(
            (item) => item.reservation_id !== reservationId
          ),
        }));
      },

      clearCart: () => set({ productItems: [], bookingItems: [] }),

      get grandTotal() {
        const productTotal = get().productItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const bookingTotal = get().bookingItems.reduce(
          (sum, item) => sum + item.price,
          0
        );
        return productTotal + bookingTotal;
      },

      get itemCount() {
        return get().productItems.length + get().bookingItems.length;
      },
    }),
    {
      name: 'kb-stylish-cart',
      partialize: (state) => ({
        productItems: state.productItems,
        bookingItems: state.bookingItems,
      }),
    }
  )
);
```

### 4.2 Store Usage in Components

```typescript
'use client';

import { useDecoupledCartStore } from '@/lib/store/decoupledCartStore';

function CartButton() {
  // Select specific state to avoid unnecessary re-renders
  const itemCount = useDecoupledCartStore((state) => 
    state.productItems.length + state.bookingItems.length
  );
  
  return (
    <button>
      Cart ({itemCount})
    </button>
  );
}

function AddToCartButton({ product }: { product: Product }) {
  const addProductItem = useDecoupledCartStore((state) => state.addProductItem);
  const isAdding = useDecoupledCartStore((state) => state.isAddingProduct);
  
  const handleAdd = async () => {
    await addProductItem({
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      quantity: 1,
    });
  };
  
  return (
    <button onClick={handleAdd} disabled={isAdding}>
      {isAdding ? 'Adding...' : 'Add to Cart'}
    </button>
  );
}
```

---

## 5. Component Patterns

### 5.1 Server vs Client Components

```typescript
// Server Component (default)
// src/components/product/RelatedProducts.tsx
export default async function RelatedProducts({ productId }: { productId: string }) {
  const products = await fetchRelatedProducts(productId);
  
  return (
    <section>
      <h2>Related Products</h2>
      <ProductGrid products={products} />
    </section>
  );
}

// Client Component
// src/components/product/ProductActions.tsx
'use client';

import { useState } from 'react';

export default function ProductActions({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  
  return (
    <div>
      <input 
        type="number" 
        value={quantity} 
        onChange={(e) => setQuantity(Number(e.target.value))} 
      />
      <button onClick={() => addToCart(product, quantity)}>
        Add to Cart
      </button>
    </div>
  );
}
```

### 5.2 Composition Pattern

```typescript
// src/components/checkout/CheckoutClient.tsx
export default function CheckoutClient() {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <BookingDetails />
        <ProductList />
        <ShippingForm />
      </div>
      <div className="lg:col-span-1">
        <OrderSummary />
      </div>
    </div>
  );
}
```

### 5.3 Render Props Pattern

```typescript
// src/components/shared/DataLoader.tsx
interface DataLoaderProps<T> {
  fetcher: () => Promise<T>;
  children: (data: T) => React.ReactNode;
  fallback?: React.ReactNode;
}

export function DataLoader<T>({ fetcher, children, fallback }: DataLoaderProps<T>) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['data'],
    queryFn: fetcher,
  });
  
  if (isLoading) return fallback || <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <>{children(data!)}</>;
}

// Usage
<DataLoader fetcher={fetchProducts}>
  {(products) => <ProductGrid products={products} />}
</DataLoader>
```

### 5.4 Memoization Pattern

```typescript
// src/components/homepage/ProductCard.tsx
import React from 'react';

interface ProductCardProps {
  product: Product;
  onClick?: () => void;
}

const ProductCard = React.memo(function ProductCard({ 
  product, 
  onClick 
}: ProductCardProps) {
  return (
    <div onClick={onClick}>
      <Image src={product.imageUrl} alt={product.name} />
      <h3>{product.name}</h3>
      <p>Rs. {product.price}</p>
    </div>
  );
});

export default ProductCard;
```

---

## 6. Form Handling

### 6.1 Controlled Forms

```typescript
// src/components/checkout/ShippingForm.tsx
'use client';

import { useState } from 'react';

interface Address {
  fullName: string;
  phone: string;
  area: string;
  city: string;
  region: string;
}

export default function ShippingForm({ 
  address, 
  onChange 
}: { 
  address: Address; 
  onChange: (address: Address) => void;
}) {
  const handleChange = (field: keyof Address) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({ ...address, [field]: e.target.value });
  };

  return (
    <form className="space-y-4">
      <div>
        <label htmlFor="fullName">Full Name</label>
        <input
          id="fullName"
          value={address.fullName}
          onChange={handleChange('fullName')}
          required
        />
      </div>
      <div>
        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          type="tel"
          value={address.phone}
          onChange={handleChange('phone')}
          required
        />
      </div>
      {/* More fields... */}
    </form>
  );
}
```

### 6.2 Form Validation with Zod

```typescript
import { z } from 'zod';

const addressSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Invalid phone number'),
  area: z.string().min(5, 'Please enter a valid address'),
  city: z.string().min(2, 'City is required'),
  region: z.string().min(2, 'Region is required'),
});

function validateAddress(address: Address): boolean {
  try {
    addressSchema.parse(address);
    return true;
  } catch (error) {
    return false;
  }
}
```

---

## 7. API Integration

### 7.1 API Client Structure

```typescript
// src/lib/apiClient.ts
const API_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function fetchProducts(options: FetchProductsOptions) {
  const response = await fetch(`${API_BASE}/functions/v1/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(options),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }
  
  return response.json();
}
```

### 7.2 Cart API Client

```typescript
// src/lib/api/cartClient.ts
export const cartAPI = {
  async getCart() {
    const response = await fetch('/api/cart');
    return response.json();
  },
  
  async addItem(item: CartItem) {
    const response = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return response.json();
  },
  
  async updateQuantity(itemId: string, quantity: number) {
    const response = await fetch('/api/cart/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, quantity }),
    });
    return response.json();
  },
  
  async removeItem(itemId: string) {
    const response = await fetch(`/api/cart/remove/${itemId}`, {
      method: 'DELETE',
    });
    return response.json();
  },
  
  async createOrderIntent(data: OrderIntentData) {
    const response = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },
};
```

### 7.3 Booking API Client

```typescript
// src/lib/api/bookingClient.ts
export async function fetchAvailableSlots(params: {
  stylistId: string;
  serviceId: string;
  targetDate: string;
  customerTimezone: string;
}) {
  const response = await fetch('/api/bookings/available-slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  const data = await response.json();
  return data.slots || [];
}

export async function createBookingReservation(params: {
  stylistId: string;
  serviceId: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes: string;
}) {
  const response = await fetch('/api/bookings/create-reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  return response.json();
}
```

---

## 8. Performance Optimization

### 8.1 Dynamic Imports

```typescript
// Lazy load below-the-fold components
import dynamic from 'next/dynamic';

const FeaturedStylists = dynamic(
  () => import('@/components/homepage/FeaturedStylists'),
  {
    loading: () => (
      <div className="h-64 animate-pulse bg-white/5 rounded-xl" />
    ),
  }
);

const ValueProps = dynamic(
  () => import('@/components/homepage/ValueProps'),
  {
    loading: () => (
      <div className="h-32 animate-pulse bg-white/5 rounded-xl" />
    ),
  }
);
```

### 8.2 Image Optimization

```typescript
import Image from 'next/image';

function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-square">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
        className="object-cover"
        loading="lazy"
        placeholder="blur"
        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..."
      />
    </div>
  );
}
```

### 8.3 Virtualized Lists

```typescript
// src/components/shared/VirtualizedProductGrid.tsx
import { FixedSizeGrid } from 'react-window';

function VirtualizedProductGrid({ products }: { products: Product[] }) {
  const columnCount = 4;
  const rowCount = Math.ceil(products.length / columnCount);
  
  const Cell = ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
    const index = rowIndex * columnCount + columnIndex;
    const product = products[index];
    
    if (!product) return null;
    
    return (
      <div style={style}>
        <ProductCard product={product} />
      </div>
    );
  };
  
  return (
    <FixedSizeGrid
      columnCount={columnCount}
      columnWidth={280}
      height={600}
      rowCount={rowCount}
      rowHeight={350}
      width={1200}
    >
      {Cell}
    </FixedSizeGrid>
  );
}
```

### 8.4 Memoization

```typescript
// Memoize expensive calculations
const costs = React.useMemo(
  () => calculateCosts(products, bookings, discountAmount),
  [products, bookings, discountAmount]
);

// Memoize callbacks
const handleAddToCart = React.useCallback(
  (product: Product) => {
    addProductItem({
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      quantity: 1,
    });
  },
  [addProductItem]
);
```

---

## 9. Error Handling

### 9.1 Error Boundary

```typescript
// src/components/ui/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 9.2 Global Error Page

```typescript
// src/app/global-error.tsx
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2>Something went wrong!</h2>
            <button onClick={() => reset()}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
}
```

---

## 10. Testing Implementation

### 10.1 Jest Configuration

```javascript
// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

module.exports = createJestConfig(customJestConfig);
```

### 10.2 Component Testing

```typescript
// src/components/admin/AdminStatCard.test.tsx
import { render, screen } from '@testing-library/react';
import AdminStatCard from './AdminStatCard';

describe('AdminStatCard', () => {
  it('renders title and value', () => {
    render(<AdminStatCard title="Total Users" value={1234} />);
    
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('displays trend indicator when provided', () => {
    render(
      <AdminStatCard 
        title="Revenue" 
        value="$10,000" 
        trend={{ value: 12, isPositive: true }} 
      />
    );
    
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });
});
```

### 10.3 E2E Testing with Playwright

```typescript
// tests/checkout.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test('should complete checkout successfully', async ({ page }) => {
    // Navigate to shop
    await page.goto('/shop');
    
    // Add product to cart
    await page.click('[data-testid="product-card"]:first-child');
    await page.click('[data-testid="add-to-cart"]');
    
    // Go to checkout
    await page.goto('/checkout');
    
    // Fill shipping form
    await page.fill('[name="fullName"]', 'Test User');
    await page.fill('[name="phone"]', '9841234567');
    await page.fill('[name="area"]', 'Test Area');
    await page.fill('[name="city"]', 'Kathmandu');
    await page.selectOption('[name="region"]', 'Bagmati');
    
    // Select payment method
    await page.click('[data-testid="payment-esewa"]');
    
    // Place order
    await page.click('[data-testid="place-order"]');
    
    // Verify redirect to payment gateway
    await expect(page).toHaveURL(/esewa/);
  });
});
```

---

## 11. Accessibility Implementation

### 11.1 Focus Management

```typescript
// src/components/booking/BookingModal.tsx
import FocusTrap from 'focus-trap-react';

export default function BookingModal({ open, onClose }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (open) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [open, onClose]);
  
  return (
    <FocusTrap active={open}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button ref={closeButtonRef} aria-label="Close">
          <X />
        </button>
        {/* Modal content */}
      </div>
    </FocusTrap>
  );
}
```

### 11.2 ARIA Labels

```typescript
<button
  aria-label={`Add ${product.name} to cart`}
  aria-pressed={isInCart}
>
  Add to Cart
</button>

<nav aria-label="Main navigation">
  {/* Navigation items */}
</nav>

<section aria-labelledby="trending-heading">
  <h2 id="trending-heading">Trending Products</h2>
  {/* Products */}
</section>
```

---

## 12. Environment Configuration

### 12.1 Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 12.2 Type-Safe Environment

```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
```

---

*Technical Implementation Guide - December 2025*
