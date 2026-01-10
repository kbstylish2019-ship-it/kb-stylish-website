# Phase 1: Codebase Immersion - Inventory System Upgrade

**Date**: January 10, 2026  
**Status**: COMPLETE  
**Duration**: ~60 minutes

---

## 1.1 Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15 (App Router, Server Components)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Auth**: JWT with role-based access (admin/vendor/customer)
- **State**: Zustand stores
- **Styling**: Tailwind CSS

### Project ID
- Supabase Project: `poxjcaogjupsplrcliau`
- Region: `ap-southeast-1`
- Database Version: PostgreSQL 17.6.1

---

## 1.2 Current Variant/Inventory System Analysis

### Database Schema (LIVE)

#### `product_attributes` Table
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | varchar | Internal name (e.g., 'color', 'size') |
| display_name | varchar | UI display name (e.g., 'Color', 'Size') |
| attribute_type | varchar | Type: 'text', 'color', 'number', 'select' |
| is_variant_defining | boolean | If true, creates variant combinations |
| sort_order | integer | Display order |
| is_active | boolean | Active status |

**Current Data (3 attributes)**:
1. `color` - type: color, variant_defining: true
2. `size` - type: select, variant_defining: true  
3. `material` - type: text, variant_defining: false

#### `attribute_values` Table
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| attribute_id | uuid | FK to product_attributes |
| value | varchar | Internal value (e.g., 'black') |
| display_value | varchar | UI display (e.g., 'Black') |
| color_hex | varchar | Hex code for color type |
| sort_order | integer | Display order |
| is_active | boolean | Active status |

**Current Data (14 values)**:
- Colors: black, white, navy, gray, red, blue, green, beige
- Sizes: xs, s, m, l, xl, xxl

#### `product_variants` Table
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| product_id | uuid | FK to products |
| sku | varchar | UNIQUE stock keeping unit |
| barcode | varchar | Optional barcode |
| price | numeric | Variant price (CHECK >= 0) |
| compare_at_price | numeric | Original/compare price |
| cost_price | numeric | Cost for margin calc |
| weight_grams | integer | Shipping weight |
| dimensions_cm | varchar | L x W x H |
| is_active | boolean | Active status |

#### `variant_attribute_values` Junction Table
| Column | Type | Description |
|--------|------|-------------|
| variant_id | uuid | FK to product_variants |
| attribute_value_id | uuid | FK to attribute_values |

**Current Data**: EMPTY (0 rows) - Variants not linked to attributes!

#### `inventory` Table
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| variant_id | uuid | FK to product_variants |
| location_id | uuid | FK to inventory_locations |
| quantity_available | integer | Available stock (CHECK >= 0) |
| quantity_reserved | integer | Reserved for orders (CHECK >= 0) |
| quantity_incoming | integer | Expected incoming (CHECK >= 0) |
| reorder_point | integer | Low stock threshold |
| reorder_quantity | integer | Reorder amount |
| last_counted_at | timestamptz | Last physical count |
| updated_at | timestamptz | Last update |

#### `inventory_movements` Table (Audit Trail)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| variant_id | uuid | FK to product_variants |
| location_id | uuid | FK to inventory_locations |
| movement_type | varchar | 'purchase', 'sale', 'adjustment', 'transfer', 'return', 'damage' |
| quantity_change | integer | +/- change amount |
| quantity_after | integer | Resulting quantity |
| reference_id | uuid | Order/transfer reference |
| reference_type | varchar | Reference type |
| notes | text | Movement notes |
| created_by | uuid | User who made change |
| created_at | timestamptz | Timestamp |

**Current Data**: EMPTY (0 rows) - No movement tracking!

---

## 1.3 Current Products Analysis

### Live Products (5 total)
| Product | SKU | Price | Stock | Variant Attributes |
|---------|-----|-------|-------|-------------------|
| ABct Gold Cleasing Milk 900ml | ABCTSKDLFJ | 10.00 | 500 | None |
| Astaberry Wine Facial Kit | ASTABERRYW | 1100.00 | 10 | None |
| Lilium Herbal Gold Cleasing Milk | LILIUMHERB | 500.00 | 100 | None |
| Lilium Herbal Gold Face Scrub | LILIUMGLD | 500.00 | 100 | None |
| test product | TESTPRODUC | 1.00 | 10 | None |

**CRITICAL FINDING**: All existing products have:
- Single "Default Variant" (no color/size selection)
- SKU generated from first 10 chars of product name
- No attribute values linked via `variant_attribute_values`

---

## 1.4 Frontend Components Analysis

### Vendor Portal - Product Creation Flow

#### `AddProductModal.tsx`
- 4-step wizard: Basic Info → Images → Variants → Review
- Uses `VariantBuilder` component for variant configuration

#### `VariantBuilder.tsx` (CRITICAL)
**Current Behavior**:
1. Fetches `product_attributes` where `is_variant_defining = true`
2. Fetches `attribute_values` for those attributes
3. Displays FIXED attributes (Color, Size) as selectable options
4. Generates cartesian product of selected values
5. Creates variant objects with `attribute_value_ids[]`

**PROBLEM**: 
- Attributes are HARDCODED in database (only Color/Size)
- No way for vendors to create custom attributes (Flavor, Weight, Volume, etc.)
- No UI for vendors to define their own attribute types

#### `ProductsPageClient.tsx`
- Lists vendor products with inventory totals
- Has Edit/Delete buttons but **NO EDIT MODAL EXISTS**
- Only supports: Toggle Active, Delete (soft delete)

### Customer Portal - Product Display

#### `ProductDetailClient.tsx`
**Current Behavior**:
1. Extracts options from `variant.attributes` object
2. Displays option selectors (buttons for each value)
3. Finds matching variant based on selection
4. Shows stock status per variant

**PROBLEM**:
- `variant.attributes` is currently empty for all products
- Falls back to showing "Default Variant"
- Stock display works but only for single variant

#### `page.tsx` (Product Detail)
- Transforms raw data to `ProductDetail` type
- Calculates `stockStatus` from total inventory
- Shows "Out of Stock" only when ALL variants have 0 stock

---

## 1.5 Backend Functions Analysis

### `create_vendor_product` (SECURITY DEFINER)
**Location**: PostgreSQL function

**Current Flow**:
1. Validates auth + vendor role
2. Validates product data (name, description, category)
3. Generates slug via `private.generate_product_slug()`
4. Creates product record
5. Gets/creates default inventory location
6. For each variant:
   - Validates price > 0 and SKU exists
   - Creates `product_variants` record
   - Links `attribute_value_ids` to `variant_attribute_values`
   - Creates `inventory` record
7. Creates product images
8. Logs to `product_change_log`
9. Notifies cache invalidation

**GOOD**: Already supports `attribute_value_ids` linking!

### `update_vendor_product` (NO SECURITY DEFINER!)
**Current Capabilities**:
- Updates: name, description, short_description, material, care_instructions, is_active, is_featured
- **MISSING**: Cannot update variants, prices, inventory, SKUs, attributes

### `delete_vendor_product`
- Soft delete (sets `is_active = false`)
- Preserves data for order history

---

## 1.6 SKU Generation Pattern

**Current Logic** (in `VariantBuilder.tsx`):
```typescript
const generateSKU = (prodName: string, values: string[]): string => {
  const sanitized = prodName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 10);
  
  const valueSuffix = values
    .map(v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3))
    .join('-');
  
  return valueSuffix ? `${sanitized}-${valueSuffix}` : sanitized || 'PRODUCT';
};
```

**Examples**:
- "Lilium Herbal Gold" + [] → "LILIUMHERB"
- "Lilium Herbal Gold" + ["black", "xl"] → "LILIUMHERB-BLA-XL"

**PROBLEM**: SKU pattern assumes color/size. Need flexibility for:
- "LILIUMHERB-500ML" (volume)
- "LILIUMHERB-ROSE" (scent)
- "LILIUMHERB-100G" (weight)

---

## 1.7 Identified Issues & Gaps

### Critical Issues

1. **Fixed Attribute Types**
   - Only Color/Size available
   - No way to add Flavor, Weight, Volume, Scent, etc.
   - Salon products (Lilium, Astaberry) don't fit this model

2. **No Inventory Editing**
   - Vendors cannot update stock levels after creation
   - No UI for stock adjustments
   - `inventory_movements` table exists but unused

3. **No Variant Editing**
   - Cannot change prices after creation
   - Cannot add/remove variants
   - Cannot update SKUs

4. **No Product Editing**
   - `update_vendor_product` only updates basic fields
   - No variant/inventory update capability

5. **Stock Display Issues**
   - Product shows "Out of Stock" only when ALL variants = 0
   - Should show per-variant availability
   - No "Select options to see availability" UX

### Security Concerns

1. **`update_vendor_product` lacks SECURITY DEFINER**
   - May have RLS bypass issues
   - Inconsistent with `create_vendor_product`

2. **No inventory movement audit**
   - Stock changes not tracked
   - No accountability for adjustments

### Data Integrity Concerns

1. **Existing products have no attribute links**
   - `variant_attribute_values` is empty
   - Migration must handle backward compatibility

2. **SKU uniqueness**
   - UNIQUE constraint exists
   - Must ensure new SKU patterns don't conflict

---

## 1.8 Existing Patterns to Follow

### Database Functions
- Use `SECURITY DEFINER` for vendor operations
- Set `search_path = 'public', 'private', 'pg_temp'`
- Set `statement_timeout` for safety
- Use `pg_notify` for cache invalidation
- Log changes to `product_change_log`

### Frontend Components
- Use Zustand for state management
- Use `cn()` utility for conditional classes
- Follow existing modal patterns (AddProductModal)
- Use existing form input styles

### API Patterns
- Use RPC functions for complex operations
- Server Actions for mutations
- `revalidatePath` after mutations

---

## 1.9 Files to Modify

### Database (Migrations)
1. `product_attributes` - Add vendor-specific attributes support
2. `attribute_values` - Add vendor ownership
3. `variant_attribute_values` - May need schema changes
4. New functions for inventory management

### Frontend
1. `VariantBuilder.tsx` - Dynamic attribute creation
2. `ProductsPageClient.tsx` - Add Edit functionality
3. New `EditProductModal.tsx` - Full product editing
4. `ProductDetailClient.tsx` - Per-variant stock display

### Backend
1. `update_vendor_product` - Add variant/inventory updates
2. New `update_inventory` function
3. New `add_product_variant` function
4. New `update_product_variant` function

---

## 1.10 Backward Compatibility Requirements

1. **Existing products must continue working**
   - Products with "Default Variant" must display correctly
   - No breaking changes to product detail page

2. **Existing orders must be preserved**
   - `order_items.variant_id` references must remain valid
   - Historical data integrity

3. **Existing SKUs must remain unique**
   - New SKU generation must not conflict
   - Consider vendor prefix for uniqueness

---

## Phase 1 Completion Checklist

- [x] Read architecture docs
- [x] Map database schema (LIVE via MCP)
- [x] Map frontend components
- [x] Map vendor portal flows
- [x] Identify existing patterns
- [x] Document current variant/inventory system
- [x] Identify gaps and issues
- [x] Document backward compatibility requirements

---

**Next Phase**: Expert Panel Consultation (Phase 2)
