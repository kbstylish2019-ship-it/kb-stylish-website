# 🎨 FRONTEND ADAPTATION PLAN
# UI/UX Changes for Electrical Shop

**Date**: January 27, 2026  
**Purpose**: Detailed frontend modifications  
**Status**: COMPLETE

---

## 📋 OVERVIEW

### Transformation Summary
```
KB Stylish (Fashion Marketplace)  →  ElectroPro (Electrical Shop)
─────────────────────────────────    ───────────────────────────────
Multi-vendor marketplace         →  Single-owner shop
Fashion products (clothing)      →  Electrical equipment
Booking system                   →  (removed)
Vendor application flow          →  (removed)
Stylist profiles                 →  (removed)
```

---

## 🎨 BRANDING CHANGES

### Color Scheme

#### Current (KB Stylish - Fashion)
```css
/* Warm, fashion-oriented palette */
--primary: #8B5CF6;      /* Purple */
--secondary: #F59E0B;    /* Amber */
--accent: #EC4899;       /* Pink */
```

#### New (ElectroPro - Electrical)
```css
/* Professional, trust-inspiring palette */
--primary: #2563EB;      /* Electric Blue */
--secondary: #F59E0B;    /* Warning Yellow (electrical safety) */
--accent: #10B981;       /* Success Green */
--danger: #EF4444;       /* Alert Red */
```

### Logo & Branding
| Element | KB Stylish | ElectroPro |
|---------|-----------|------------|
| Logo | Fashion script | Bold, technical |
| Favicon | 💜 | ⚡ |
| Tagline | "Style Your Way" | "Your Trusted Electrical Partner" |
| Hero Image | Fashion models | Electrical equipment |

### Typography
- Keep: Inter font family (clean, professional)
- Headlines: Slightly bolder for industrial feel
- Body: Same readable styles

---

## 📱 PAGE-BY-PAGE MODIFICATIONS

### 1. Homepage (`/`)

#### Current Structure
```
├── Hero Section (Fashion imagery)
├── Featured Products (Clothing)
├── Categories (Fashion categories)
├── Become a Vendor CTA
├── Testimonials
└── Footer
```

#### New Structure
```
├── Hero Section (Electrical shop imagery)
│   ├── Headline: "Quality Electrical Equipment"
│   ├── Subheadline: "Trusted brands, competitive prices"
│   └── CTA: "Shop Now" / "View Categories"
├── Featured Categories (Electrical)
│   ├── Wiring & Cables
│   ├── Switches & Sockets
│   ├── Lighting
│   ├── Circuit Protection
│   └── View All →
├── Featured Products
├── Why Choose Us
│   ├── Genuine Products
│   ├── Competitive Prices
│   ├── Expert Support
│   └── Fast Delivery
├── Brand Showcase
│   ├── Havells, Philips, Legrand, etc.
│   └── (Logo carousel)
└── Footer (updated)
```

#### Code Changes
```tsx
// src/app/(main)/page.tsx

// Remove
- <BecomeVendorCTA />
- Fashion-specific hero images

// Add
+ Electrical hero section
+ Electrical category showcase
+ Brand logos section
+ "Why Choose Us" section
```

---

### 2. Product Listing (`/products`)

#### Filter Changes

##### Remove
- Size (S, M, L, XL)
- Material (Cotton, Silk, etc.)
- Occasion (Casual, Formal)

##### Add
- Voltage (220V, 12V, etc.)
- Wattage (5W, 9W, 100W, etc.)
- Brand (Havells, Philips, etc.)
- Wire Gauge (1.5mm, 2.5mm, etc.)
- Amperage (6A, 16A, 32A, etc.)

#### Code Changes
```tsx
// src/components/products/ProductFilters.tsx

const electricalFilters = [
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    options: electricalCategories
  },
  {
    name: 'brand',
    label: 'Brand',
    type: 'checkbox',
    options: ['Havells', 'Philips', 'Anchor', 'Polycab', ...]
  },
  {
    name: 'voltage',
    label: 'Voltage',
    type: 'checkbox',
    options: ['220V AC', '12V DC', '24V DC', '380V 3-Phase']
  },
  {
    name: 'price',
    label: 'Price Range',
    type: 'range',
    min: 0,
    max: 50000
  }
];
```

---

### 3. Product Detail (`/products/[slug]`)

#### Attribute Display

##### Current (Fashion)
```
Color: [Red] [Blue] [Black]
Size: [S] [M] [L] [XL]
Material: Cotton
Care: Machine wash cold
```

##### New (Electrical)
```
Voltage: 220V AC
Wattage: 9W
Brand: Philips
Model: LED-9W-CDL
Warranty: 24 months
Wire Gauge: 2.5 sq mm (if applicable)
IP Rating: IP44
```

#### Code Changes
```tsx
// src/components/products/ProductAttributes.tsx

function ElectricalSpecs({ product }: { product: Product }) {
  return (
    <div className="specifications">
      <h3>Technical Specifications</h3>
      <table>
        <tbody>
          {product.brand && <tr><td>Brand</td><td>{product.brand}</td></tr>}
          {product.model_number && <tr><td>Model</td><td>{product.model_number}</td></tr>}
          {product.warranty_months && <tr><td>Warranty</td><td>{product.warranty_months} months</td></tr>}
          {/* Dynamic attributes */}
          {product.attributes.map(attr => (
            <tr key={attr.name}>
              <td>{attr.display_name}</td>
              <td>{attr.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

### 4. Admin Dashboard (`/admin`)

#### Current Stats
- Total Revenue
- Total Orders
- Total Users
- Total Vendors ← REMOVE

#### New Stats
- Today's Sales
- Total Orders
- Low Stock Alerts ← ADD
- Pending Orders ← ADD

#### New Sections
```
├── Dashboard (overview)
├── Products
│   ├── All Products
│   ├── Add Product
│   └── Categories
├── Inventory ← ENHANCED
│   ├── Stock Levels
│   ├── Low Stock
│   ├── Import Stock (Purchase)
│   └── Movement History
├── Orders
│   ├── All Orders
│   ├── Pending
│   └── Completed
├── Customers
└── Settings
    ├── Shop Settings
    ├── Payment Settings
    └── Delivery Settings
```

---

### 5. Owner Portal (`/owner` - renamed from `/vendor`)

#### Route Changes
```
/vendor/*  →  /owner/*

/vendor/dashboard      →  /owner/dashboard
/vendor/products       →  /owner/products
/vendor/products/new   →  /owner/products/new
/vendor/orders         →  /owner/orders
/vendor/settings       →  /owner/settings
```

#### Navigation Updates
```tsx
// src/components/owner/OwnerSidebar.tsx

const ownerNavItems = [
  { href: '/owner', icon: Home, label: 'Dashboard' },
  { href: '/owner/products', icon: Package, label: 'Products' },
  { href: '/owner/inventory', icon: Warehouse, label: 'Inventory' },
  { href: '/owner/orders', icon: ShoppingCart, label: 'Orders' },
  { href: '/owner/customers', icon: Users, label: 'Customers' },
  { href: '/owner/reports', icon: BarChart, label: 'Reports' },
  { href: '/owner/settings', icon: Settings, label: 'Settings' },
];
```

---

### 6. Inventory Management (`/owner/inventory`) - NEW/ENHANCED

#### Stock Overview Page
```tsx
// src/app/owner/inventory/page.tsx

export default function InventoryPage() {
  return (
    <div>
      <PageHeader title="Inventory Management" />
      
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total SKUs" value={stats.totalSkus} />
        <StatCard title="Low Stock Items" value={stats.lowStock} variant="warning" />
        <StatCard title="Out of Stock" value={stats.outOfStock} variant="danger" />
        <StatCard title="Total Value" value={formatCurrency(stats.totalValue)} />
      </div>
      
      {/* Inventory Table */}
      <DataTable
        columns={[
          { header: 'Product', accessor: 'name' },
          { header: 'SKU', accessor: 'sku' },
          { header: 'Location', accessor: 'location' },
          { header: 'In Stock', accessor: 'quantity', cell: StockCell },
          { header: 'Reorder Point', accessor: 'reorder_point' },
          { header: 'Actions', accessor: 'actions', cell: ActionsCell }
        ]}
        data={inventory}
        filters={['location', 'stock_status']}
        search={true}
      />
    </div>
  );
}
```

#### Stock Adjustment Modal
```tsx
// src/components/inventory/StockAdjustmentModal.tsx

function StockAdjustmentModal({ variant, onClose }) {
  const [type, setType] = useState<'add' | 'remove' | 'set'>('add');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');
  
  const reasons = [
    { value: 'purchase', label: 'New Purchase/Import' },
    { value: 'return', label: 'Customer Return' },
    { value: 'adjustment', label: 'Stock Count Adjustment' },
    { value: 'damage', label: 'Damaged Goods' },
    { value: 'transfer', label: 'Location Transfer' },
  ];
  
  return (
    <Dialog>
      <DialogHeader>Adjust Stock: {variant.sku}</DialogHeader>
      <DialogContent>
        <div>Current Stock: {variant.quantity}</div>
        
        <Select value={type} onChange={setType}>
          <option value="add">Add Stock</option>
          <option value="remove">Remove Stock</option>
          <option value="set">Set Exact Quantity</option>
        </Select>
        
        <Input 
          type="number" 
          value={quantity} 
          onChange={setQuantity}
          min={0}
        />
        
        <Select value={reason} onChange={setReason}>
          {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        
        <Textarea 
          placeholder="Notes (optional)"
          value={notes}
          onChange={setNotes}
        />
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit}>Confirm Adjustment</Button>
      </DialogFooter>
    </Dialog>
  );
}
```

#### Movement History Page
```tsx
// src/app/owner/inventory/history/page.tsx

export default function MovementHistoryPage() {
  return (
    <div>
      <PageHeader title="Inventory Movement History" />
      
      <DataTable
        columns={[
          { header: 'Date', accessor: 'created_at', cell: DateCell },
          { header: 'Product', accessor: 'product_name' },
          { header: 'SKU', accessor: 'sku' },
          { header: 'Type', accessor: 'movement_type', cell: MovementTypeBadge },
          { header: 'Change', accessor: 'quantity_change', cell: ChangeCell },
          { header: 'After', accessor: 'quantity_after' },
          { header: 'Notes', accessor: 'notes' },
          { header: 'By', accessor: 'created_by_name' },
        ]}
        data={movements}
        filters={['movement_type', 'date_range', 'product']}
      />
    </div>
  );
}

function MovementTypeBadge({ value }) {
  const colors = {
    purchase: 'bg-green-100 text-green-800',
    sale: 'bg-blue-100 text-blue-800',
    adjustment: 'bg-yellow-100 text-yellow-800',
    return: 'bg-purple-100 text-purple-800',
    damage: 'bg-red-100 text-red-800',
  };
  return <Badge className={colors[value]}>{value}</Badge>;
}
```

---

### 7. Pages to DELETE

```
src/app/
├── become-a-vendor/         ← DELETE entire directory
├── vendor/application/      ← DELETE
├── stylists/                ← DELETE entire directory
├── book/                    ← DELETE entire directory
├── bookings/                ← DELETE entire directory
└── admin/
    ├── vendors/             ← DELETE
    └── vendor-applications/ ← DELETE
```

---

### 8. Components to DELETE

```
src/components/
├── vendor/
│   ├── VendorApplicationForm.tsx    ← DELETE
│   ├── VendorApplicationStatus.tsx  ← DELETE
│   └── BecomeVendorCTA.tsx          ← DELETE
├── booking/                          ← DELETE entire directory
├── stylists/                         ← DELETE entire directory
└── home/
    └── BecomeVendorSection.tsx      ← DELETE
```

---

## 🔧 GLOBAL CHANGES

### 1. Navigation Updates

#### Header Navigation
```tsx
// src/components/layout/Header.tsx

// Current
const navItems = [
  { href: '/products', label: 'Shop' },
  { href: '/stylists', label: 'Stylists' },  // REMOVE
  { href: '/become-a-vendor', label: 'Sell with Us' },  // REMOVE
];

// New
const navItems = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact' },
];
```

#### Footer Updates
```tsx
// Update footer links to remove vendor/stylist references
// Update contact info for electrical shop
// Update social media links
```

### 2. Role Checks

#### Find and Replace Pattern
```typescript
// Find all instances of vendor role checks
// OLD:
if (userRole === 'vendor') { ... }
user_has_role(auth.uid(), 'vendor')
hasRole('vendor')

// NEW (for owner/admin functionality):
if (userRole === 'admin') { ... }
user_has_role(auth.uid(), 'admin')
hasRole('admin')
```

### 3. API Client Updates

```typescript
// src/lib/apiClient.ts

// Rename vendor endpoints to owner
export const api = {
  // OLD
  vendor: {
    getDashboard: () => fetchWithAuth('/vendor-dashboard'),
    getProducts: () => fetchWithAuth('/vendor/products'),
  },
  
  // NEW
  owner: {
    getDashboard: () => fetchWithAuth('/owner-dashboard'),
    getProducts: () => fetchWithAuth('/owner/products'),
    getInventory: () => fetchWithAuth('/owner/inventory'),
    adjustStock: (data) => fetchWithAuth('/owner/inventory/adjust', { method: 'POST', body: data }),
  },
};
```

---

## 📁 FILE RENAME MAP

| Old Path | New Path |
|----------|----------|
| `src/app/vendor/` | `src/app/owner/` |
| `src/components/vendor/` | `src/components/owner/` |
| `VendorDashboard.tsx` | `OwnerDashboard.tsx` |
| `VendorSidebar.tsx` | `OwnerSidebar.tsx` |
| `VendorProductCard.tsx` | `ProductCard.tsx` (simplify) |
| `VendorOrderList.tsx` | `OrderList.tsx` (simplify) |

---

## 🧪 COMPONENT REUSE ANALYSIS

### 100% Reusable (No Changes)
- All shadcn/ui components (Button, Input, Dialog, etc.)
- DataTable
- Pagination
- Loading states
- Error boundaries
- Cart components
- Checkout flow
- Payment forms
- Order status components

### Minor Changes Needed
- ProductCard (update attribute display)
- ProductFilters (swap filter options)
- CategoryCard (update icons/images)
- StatCard (already generic)

### Major Changes Needed
- Homepage sections
- Navigation
- Dashboard pages
- Product forms (attribute fields)

---

## ⏱️ EFFORT ESTIMATION

| Task | Hours |
|------|-------|
| Branding (colors, logo) | 2 |
| Homepage redesign | 3 |
| Navigation updates | 1 |
| Product filters update | 2 |
| Product detail attributes | 2 |
| Vendor → Owner rename | 2 |
| Inventory UI enhancements | 4 |
| Delete unused pages/components | 1 |
| Role check updates | 2 |
| Testing | 4 |
| **TOTAL** | **23 hours** |

---

## 📋 IMPLEMENTATION CHECKLIST

### Day 2-3: Core UI Changes
- [ ] Update tailwind.config.ts with new colors
- [ ] Update logo and favicon
- [ ] Rename /vendor to /owner routes
- [ ] Update navigation
- [ ] Delete unused pages

### Day 4: Product & Inventory
- [ ] Update ProductFilters for electrical
- [ ] Update ProductDetail for electrical specs
- [ ] Enhance inventory management UI
- [ ] Add stock adjustment modal

### Day 5: Polish
- [ ] Homepage redesign
- [ ] Category pages
- [ ] Footer updates
- [ ] Mobile responsiveness check

---

**Document Status**: COMPLETE  
**Next Document**: `05_EDGE_FUNCTION_ADAPTATION.md`
