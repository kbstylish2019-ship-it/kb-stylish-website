# 📋 STEP-BY-STEP IMPLEMENTATION GUIDE
# 7-Day Execution Plan for Electrical Shop

**Date**: January 27, 2026  
**Purpose**: Detailed daily execution plan  
**Status**: COMPLETE

---

## 🗓️ TIMELINE OVERVIEW

| Day | Focus | Hours | Deliverables |
|-----|-------|-------|--------------|
| 1 | Project Setup | 8 | New Supabase project, forked codebase |
| 2 | Database & Backend | 8 | Schema applied, functions deployed |
| 3 | Remove Multi-Vendor | 8 | Clean codebase, simplified roles |
| 4 | Inventory Enhancement | 8 | Stock management UI complete |
| 5 | E-commerce Customization | 8 | Electrical products, categories |
| 6 | Testing & Polish | 8 | End-to-end testing, bug fixes |
| 7 | Deployment | 4-8 | Production live |

---

## 📅 DAY 1: PROJECT SETUP

### Morning (4 hours)

#### 1.1 Create New Supabase Project (30 min)
```bash
# Go to https://supabase.com/dashboard
# Click "New Project"
# Settings:
#   Name: electropro
#   Region: ap-south-1 (Mumbai - closest to Nepal)
#   Database Password: [generate strong password]
#   Pricing Plan: Pro (if needed for features)

# Wait for project to be ready (~2 minutes)
```

#### 1.2 Fork Codebase (30 min)
```bash
# Option A: Git clone and reinitialize
cd /path/to/projects
cp -r kb-stylish electropro
cd electropro
rm -rf .git
git init
git add .
git commit -m "Initial commit: Fork from KB Stylish"

# Option B: GitHub fork (if KB Stylish is on GitHub)
# Fork repo, then clone

# Create new remote
git remote add origin https://github.com/yourname/electropro.git
git push -u origin main
```

#### 1.3 Update Environment Variables (1 hour)
```bash
# Create new .env.local
cp .env.local.example .env.local

# Update with new Supabase credentials
# From Supabase Dashboard > Settings > API

NEXT_PUBLIC_SUPABASE_URL=https://[NEW_PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[NEW_ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[NEW_SERVICE_KEY]

# Update Supabase CLI config
cd supabase
# Edit config.toml
project_id = "[NEW_PROJECT_ID]"
```

#### 1.4 Link Supabase CLI (30 min)
```bash
# Login to Supabase CLI
supabase login

# Link to new project
supabase link --project-ref [NEW_PROJECT_ID]

# Verify connection
supabase db remote status
```

#### 1.5 Prepare Migration Files (1.5 hours)
```bash
# Create new consolidated migrations directory
mkdir -p supabase/migrations-electropro

# Key migrations to adapt (in order):
# 1. Core schema (products, variants, inventory)
# 2. Auth system (roles, profiles)
# 3. Commerce (cart, orders, payments)
# 4. Trust engine (reviews)
# 5. Metrics (simplified)
# 6. Support (tickets)

# For each migration file:
# - Remove vendor-specific columns/policies where appropriate
# - Simplify RLS policies
# - Update function names if needed
```

### Afternoon (4 hours)

#### 1.6 Create Adapted Core Migration (2 hours)
```sql
-- supabase/migrations-electropro/00001_core_schema.sql

-- This file combines and adapts:
-- - Product schema (without vendor_id)
-- - Inventory schema
-- - Category schema
-- - User schema (simplified roles)

-- See 03_DATABASE_ADAPTATION_PLAN.md for detailed SQL
```

#### 1.7 Create Seed Data (1 hour)
```sql
-- supabase/migrations-electropro/00020_seed_data.sql

-- Categories (electrical)
-- Attributes (voltage, wattage, etc.)
-- Shop settings
-- Admin user

-- See 03_DATABASE_ADAPTATION_PLAN.md for seed SQL
```

#### 1.8 Apply Migrations (1 hour)
```bash
# Apply all migrations to new project
supabase db push

# Verify tables created
supabase db remote status

# Check in Supabase Dashboard > Table Editor
```

### Day 1 Checklist
- [ ] New Supabase project created
- [ ] Codebase forked to new repo
- [ ] Environment variables updated
- [ ] Supabase CLI linked
- [ ] Core migrations applied
- [ ] Seed data inserted
- [ ] Can connect to database from local

---

## 📅 DAY 2: DATABASE & BACKEND

### Morning (4 hours)

#### 2.1 Apply Remaining Migrations (2 hours)
```bash
# Apply commerce migrations
supabase db push

# Verify all tables
supabase db remote status

# Test RLS policies
# In Supabase Dashboard > SQL Editor:
SELECT * FROM products;  -- Should work
INSERT INTO products (name) VALUES ('Test');  -- Should fail (no auth)
```

#### 2.2 Create Admin User (30 min)
```bash
# In Supabase Dashboard > Authentication > Users
# Click "Add User"
# Email: owner@electropro.com
# Password: [secure password]

# Then in SQL Editor, assign admin role:
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'owner@electropro.com';

# Refresh JWT claims
SELECT refresh_jwt_claims((SELECT id FROM auth.users WHERE email = 'owner@electropro.com'));
```

#### 2.3 Deploy Edge Functions (1.5 hours)
```bash
# Copy functions (excluding vendor-application, booking)
cd supabase/functions

# Deploy each function
supabase functions deploy cart-manager
supabase functions deploy create-order-intent
supabase functions deploy fulfill-order
supabase functions deploy verify-payment
supabase functions deploy khalti-webhook
supabase functions deploy npx-webhook
supabase functions deploy review-manager
supabase functions deploy vote-manager
supabase functions deploy reply-manager
supabase functions deploy send-email
supabase functions deploy order-worker
supabase functions deploy metrics-worker
supabase functions deploy cache-cleanup-worker
supabase functions deploy cache-invalidator
supabase functions deploy ratings-worker
supabase functions deploy get-curated-content
supabase functions deploy user-onboarding
supabase functions deploy support-ticket-manager
supabase functions deploy review-request-worker

# Deploy renamed/modified functions
# First rename vendor-dashboard to owner-dashboard
mv vendor-dashboard owner-dashboard
supabase functions deploy owner-dashboard
supabase functions deploy admin-dashboard
```

### Afternoon (4 hours)

#### 2.4 Configure Edge Function Secrets (1 hour)
```bash
# Set secrets for Edge Functions
supabase secrets set RESEND_API_KEY=[your_resend_key]
supabase secrets set KHALTI_SECRET_KEY=[your_khalti_key]
supabase secrets set NPX_SECRET_KEY=[your_npx_key]

# Verify secrets
supabase secrets list
```

#### 2.5 Test Edge Functions (1 hour)
```bash
# Test cart-manager
curl -X POST https://[PROJECT_ID].supabase.co/functions/v1/cart-manager \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"action": "get_cart"}'

# Test admin-dashboard (with admin JWT)
curl https://[PROJECT_ID].supabase.co/functions/v1/admin-dashboard \
  -H "Authorization: Bearer [ADMIN_JWT]"
```

#### 2.6 Setup Storage Buckets (1 hour)
```bash
# In Supabase Dashboard > Storage
# Create buckets:
# - product-images (public)
# - documents (private)

# Set policies for product-images:
# - Anyone can read
# - Only admin can write
```

#### 2.7 Configure Auth Settings (1 hour)
```bash
# In Supabase Dashboard > Authentication > Settings

# Email Templates:
# - Update branding to ElectroPro
# - Update logo
# - Update colors

# URL Configuration:
# - Site URL: https://electropro.com (or localhost for now)
# - Redirect URLs: Add production domain

# Email Settings:
# - Enable email confirmations (optional)
```

### Day 2 Checklist
- [ ] All migrations applied successfully
- [ ] Admin user created with correct role
- [ ] All Edge Functions deployed
- [ ] Secrets configured
- [ ] Edge Functions tested
- [ ] Storage buckets created
- [ ] Auth settings configured

---

## 📅 DAY 3: REMOVE MULTI-VENDOR

### Morning (4 hours)

#### 3.1 Search and Document Vendor References (1 hour)
```bash
# Find all vendor references in codebase
grep -rn "vendor" src/ --include="*.tsx" --include="*.ts" > vendor-references.txt
grep -rn "Vendor" src/ --include="*.tsx" --include="*.ts" >> vendor-references.txt

# Count occurrences
wc -l vendor-references.txt
# Expect: 200-400 references

# Categorize:
# - Routes to delete
# - Components to delete
# - Role checks to modify
# - Text/labels to update
```

#### 3.2 Delete Vendor-Specific Routes (1 hour)
```bash
# Delete directories
rm -rf src/app/become-a-vendor
rm -rf src/app/vendor/application
rm -rf src/app/stylists
rm -rf src/app/book
rm -rf src/app/bookings
rm -rf src/app/admin/vendors
rm -rf src/app/admin/vendor-applications

# Verify deletions
ls src/app/
```

#### 3.3 Rename Vendor to Owner (1 hour)
```bash
# Rename directory
mv src/app/vendor src/app/owner
mv src/components/vendor src/components/owner

# Update all imports (use IDE find/replace)
# Find: from '@/components/vendor
# Replace: from '@/components/owner

# Find: /vendor/
# Replace: /owner/
```

#### 3.4 Delete Unused Components (1 hour)
```bash
# Delete vendor-specific components
rm -rf src/components/booking
rm -rf src/components/stylists
rm src/components/home/BecomeVendorSection.tsx
rm src/components/owner/VendorApplicationForm.tsx
rm src/components/owner/VendorApplicationStatus.tsx

# Clean up any remaining imports
# Run TypeScript compiler to find broken imports
npm run type-check
```

### Afternoon (4 hours)

#### 3.5 Update Role Checks (2 hours)
```typescript
// Find all role checks
grep -rn "user_has_role.*vendor" src/
grep -rn "hasRole.*vendor" src/
grep -rn "role.*vendor" src/

// For owner functionality, change to admin:
// Before:
if (userRole === 'vendor') { ... }

// After:
if (userRole === 'admin') { ... }

// Update in:
// - Middleware (if any)
// - Layout components
// - Page components
// - Server actions
```

#### 3.6 Update Navigation (1 hour)
```tsx
// src/components/layout/Header.tsx

// Remove vendor-related links
const navItems = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  // Remove: { href: '/become-a-vendor', label: 'Sell with Us' },
  // Remove: { href: '/stylists', label: 'Stylists' },
];

// Update user menu
const userMenuItems = [
  { href: '/account', label: 'My Account' },
  { href: '/account/orders', label: 'My Orders' },
  // For admin only:
  { href: '/owner', label: 'Dashboard', role: 'admin' },
];
```

#### 3.7 Run Type Check and Fix Errors (1 hour)
```bash
# Check for TypeScript errors
npm run type-check

# Fix any import errors
# Fix any missing component errors
# Fix any type errors

# Build to verify
npm run build
```

### Day 3 Checklist
- [ ] Vendor references documented
- [ ] Vendor routes deleted
- [ ] Vendor → Owner renamed
- [ ] Unused components deleted
- [ ] Role checks updated
- [ ] Navigation updated
- [ ] TypeScript compiles without errors
- [ ] Build succeeds

---

## 📅 DAY 4: INVENTORY ENHANCEMENT

### Morning (4 hours)

#### 4.1 Create Inventory Overview Page (2 hours)
```tsx
// src/app/owner/inventory/page.tsx
// See 04_FRONTEND_ADAPTATION_PLAN.md for code
```

#### 4.2 Create Stock Adjustment Modal (1 hour)
```tsx
// src/components/inventory/StockAdjustmentModal.tsx
// See 04_FRONTEND_ADAPTATION_PLAN.md for code
```

#### 4.3 Create Movement History Page (1 hour)
```tsx
// src/app/owner/inventory/history/page.tsx
// See 04_FRONTEND_ADAPTATION_PLAN.md for code
```

### Afternoon (4 hours)

#### 4.4 Create Low Stock Alerts Component (1 hour)
```tsx
// src/components/inventory/LowStockAlerts.tsx

export function LowStockAlerts() {
  const { data: lowStock } = useLowStockItems();
  
  if (!lowStock?.length) return null;
  
  return (
    <Alert variant="warning">
      <AlertTitle>Low Stock Warning</AlertTitle>
      <AlertDescription>
        {lowStock.length} items are below reorder point.
        <Link href="/owner/inventory?filter=low_stock">View all</Link>
      </AlertDescription>
    </Alert>
  );
}
```

#### 4.5 Add Inventory to Owner Dashboard (1 hour)
```tsx
// src/app/owner/page.tsx

export default async function OwnerDashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Today's Sales" value={stats.todaySales} />
        <StatCard title="Pending Orders" value={stats.pendingOrders} />
        <StatCard title="Low Stock Items" value={stats.lowStock} variant="warning" />
        <StatCard title="Total Products" value={stats.totalProducts} />
      </div>
      
      <LowStockAlerts />
      
      <RecentOrders />
    </div>
  );
}
```

#### 4.6 Create Inventory Server Actions (1 hour)
```typescript
// src/app/actions/inventory.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function adjustInventory(
  variantId: string,
  quantityChange: number,
  movementType: string,
  notes?: string
) {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('update_inventory_quantity', {
    p_variant_id: variantId,
    p_quantity_change: quantityChange,
    p_movement_type: movementType,
    p_notes: notes
  });
  
  if (error) throw new Error(error.message);
  
  revalidatePath('/owner/inventory');
  revalidatePath('/owner');
  
  return data;
}

export async function getInventoryMovements(variantId?: string) {
  const supabase = await createClient();
  
  let query = supabase
    .from('inventory_movements')
    .select(`
      *,
      variant:product_variants(
        sku,
        product:products(name)
      ),
      created_by_profile:user_profiles(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);
    
  if (variantId) {
    query = query.eq('variant_id', variantId);
  }
  
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  
  return data;
}
```

#### 4.7 Test Inventory Flow (1 hour)
```bash
# Manual testing checklist:
# 1. Login as admin
# 2. Navigate to /owner/inventory
# 3. View stock levels
# 4. Click "Adjust Stock" on an item
# 5. Add stock (purchase)
# 6. Verify quantity updated
# 7. Check movement history
# 8. Verify low stock alerts appear
```

### Day 4 Checklist
- [ ] Inventory overview page created
- [ ] Stock adjustment modal working
- [ ] Movement history page created
- [ ] Low stock alerts component
- [ ] Dashboard shows inventory stats
- [ ] Server actions created
- [ ] Inventory flow tested

---

## 📅 DAY 5: E-COMMERCE CUSTOMIZATION

### Morning (4 hours)

#### 5.1 Update Homepage (2 hours)
```tsx
// src/app/(main)/page.tsx

// Update hero section with electrical imagery
// Update featured categories for electrical
// Add brand showcase section
// Remove "Become a Vendor" CTA
```

#### 5.2 Update Product Filters (1 hour)
```tsx
// src/components/products/ProductFilters.tsx

// Replace fashion filters with electrical:
// - Voltage
// - Wattage
// - Brand
// - Wire Gauge
// - Amperage
```

#### 5.3 Update Product Detail Page (1 hour)
```tsx
// src/app/(main)/products/[slug]/page.tsx

// Update attribute display for electrical specs
// Show warranty info
// Show brand prominently
// Update related products logic
```

### Afternoon (4 hours)

#### 5.4 Update Branding (2 hours)
```tsx
// tailwind.config.ts
// Update colors to electrical theme

// src/components/layout/Header.tsx
// Update logo

// public/
// Replace favicon, og-image, logos

// Update all text references
grep -rn "KB Stylish" src/
grep -rn "kb-stylish" src/
// Replace with "ElectroPro" / "electropro"
```

#### 5.5 Update Category Structure (1 hour)
```tsx
// Verify categories seeded correctly
// Update category page layouts if needed
// Add category icons for electrical
```

#### 5.6 Test E-commerce Flow (1 hour)
```bash
# Manual testing checklist:
# 1. Browse products
# 2. Filter by electrical attributes
# 3. View product detail
# 4. Add to cart
# 5. View cart
# 6. Proceed to checkout
# 7. Complete order (test payment)
```

### Day 5 Checklist
- [ ] Homepage updated
- [ ] Product filters updated
- [ ] Product detail shows electrical specs
- [ ] Branding updated throughout
- [ ] Categories working correctly
- [ ] E-commerce flow tested end-to-end

---

## 📅 DAY 6: TESTING & POLISH

### Morning (4 hours)

#### 6.1 End-to-End Testing (2 hours)
```bash
# Update Playwright tests
# Remove vendor-related tests
# Add inventory tests
# Run full test suite

npm run test:e2e
```

#### 6.2 Fix Bugs Found in Testing (2 hours)
```bash
# Address any issues found:
# - Broken links
# - Missing images
# - Type errors
# - API errors
# - UI issues
```

### Afternoon (4 hours)

#### 6.3 Mobile Responsiveness Check (1 hour)
```bash
# Test on mobile viewports:
# - Homepage
# - Product listing
# - Product detail
# - Cart
# - Checkout
# - Owner dashboard
```

#### 6.4 Performance Optimization (1 hour)
```bash
# Run Lighthouse audit
# Fix any critical issues
# Optimize images
# Check bundle size
```

#### 6.5 Security Review (1 hour)
```bash
# Check RLS policies working
# Verify role checks
# Test unauthorized access attempts
# Review Edge Function auth
```

#### 6.6 Final Polish (1 hour)
```bash
# Update meta tags
# Update SEO content
# Check all pages for console errors
# Verify all forms work
# Check email templates
```

### Day 6 Checklist
- [ ] E2E tests passing
- [ ] All bugs fixed
- [ ] Mobile responsive
- [ ] Performance acceptable
- [ ] Security verified
- [ ] No console errors
- [ ] Forms working
- [ ] Emails sending

---

## 📅 DAY 7: DEPLOYMENT

### Morning (4 hours)

#### 7.1 Prepare Production Environment (1 hour)
```bash
# Vercel Setup
# Go to https://vercel.com/new
# Import repository
# Configure environment variables:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

#### 7.2 Configure Domain (1 hour)
```bash
# Add custom domain in Vercel
# Configure DNS records
# Wait for SSL certificate
```

#### 7.3 Production Database Verification (1 hour)
```bash
# Verify all migrations applied
# Verify seed data correct
# Verify RLS policies active
# Test admin login
```

#### 7.4 Deploy to Production (1 hour)
```bash
# Push to main branch triggers deploy
git push origin main

# Monitor deployment logs
# Verify build succeeds
```

### Afternoon (4 hours)

#### 7.5 Production Testing (2 hours)
```bash
# Full flow test on production:
# 1. Homepage loads
# 2. Products display
# 3. Cart works
# 4. Checkout works
# 5. Payment works (test mode)
# 6. Order confirmation
# 7. Admin can login
# 8. Admin can manage products
# 9. Inventory management works
```

#### 7.6 Configure Payment Gateway for Production (1 hour)
```bash
# Switch Khalti to production mode
# Update API keys in Supabase secrets
supabase secrets set KHALTI_SECRET_KEY=[production_key]

# Test a small transaction
```

#### 7.7 Final Handoff (1 hour)
```markdown
# Documentation for client:
- Admin login credentials
- How to add products
- How to manage inventory
- How to process orders
- Support contact info
```

### Day 7 Checklist
- [ ] Vercel project created
- [ ] Environment variables set
- [ ] Custom domain configured
- [ ] SSL working
- [ ] Production deployed
- [ ] All features tested on production
- [ ] Payment gateway live
- [ ] Documentation provided
- [ ] Client trained

---

## 🏆 COMPLETION CRITERIA

### Must Have (Day 7)
- [x] Products can be browsed
- [x] Products can be searched/filtered
- [x] Cart and checkout work
- [x] Payment works
- [x] Orders can be processed
- [x] Inventory can be managed
- [x] Admin dashboard functional

### Nice to Have (Future)
- [ ] Email notifications fully branded
- [ ] Advanced reporting
- [ ] Barcode scanning
- [ ] Multi-location inventory transfers
- [ ] Supplier management

---

**Document Status**: COMPLETE  
**Next Document**: `07_DEPLOYMENT_CHECKLIST.md`
