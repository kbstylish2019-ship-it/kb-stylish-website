# Phase 2: Expert Panel Consultation

**Date**: January 10, 2026  
**Status**: IN PROGRESS

---

## Expert Panel Overview

Five virtual experts will review the proposed changes from their domain expertise:

1. **Senior Security Architect** - Authentication, authorization, data protection
2. **Performance Engineer** - Scalability, latency, database optimization
3. **Data Architect** - Schema design, data integrity, migrations
4. **Frontend/UX Engineer** - User experience, React patterns, accessibility
5. **Principal Engineer** - End-to-end flow, integration, failure modes

---

## 👨‍💻 Expert 1: Senior Security Architect Review

### Security Analysis of Proposed Changes

#### 1.1 Authentication & Authorization Concerns

**Current State**:
- `create_vendor_product` uses `SECURITY DEFINER` ✅
- `update_vendor_product` does NOT use `SECURITY DEFINER` ⚠️
- Vendor role check via `public.user_has_role()`

**Recommendations**:

1. **Add SECURITY DEFINER to update functions**
   ```sql
   -- All vendor product functions should use SECURITY DEFINER
   -- to ensure consistent RLS bypass for authorized operations
   CREATE OR REPLACE FUNCTION update_vendor_product(...)
   SECURITY DEFINER
   SET search_path = 'public', 'private', 'pg_temp'
   ```

2. **Ownership Validation Required**
   - When vendors create custom attributes, they should ONLY see their own
   - Prevent cross-vendor attribute access
   ```sql
   -- Add vendor_id to product_attributes for vendor-specific attributes
   -- OR use a separate vendor_custom_attributes table
   ```

3. **Inventory Movement Authorization**
   - Only product owner can adjust inventory
   - Admin can adjust any inventory (with audit)
   - Movement must be logged with user_id

#### 1.2 Input Validation Concerns

**Current Gaps**:
- No validation on attribute names (could inject HTML/SQL)
- No limit on number of attributes per product
- No limit on number of values per attribute

**Recommendations**:

1. **Sanitize Attribute Names**
   ```sql
   -- Validate attribute names
   IF p_attribute_name !~ '^[a-zA-Z][a-zA-Z0-9_ ]{0,49}$' THEN
     RAISE EXCEPTION 'Invalid attribute name format';
   END IF;
   ```

2. **Enforce Limits**
   ```sql
   -- Max 5 variant-defining attributes per product
   -- Max 20 values per attribute
   -- Max 100 variants per product (5^3 = 125 would exceed)
   ```

3. **Prevent SKU Injection**
   ```sql
   -- SKU must be alphanumeric with limited special chars
   IF p_sku !~ '^[A-Z0-9][A-Z0-9\-_]{0,49}$' THEN
     RAISE EXCEPTION 'Invalid SKU format';
   END IF;
   ```

#### 1.3 RLS Policy Review

**Current Policies Needed**:
- `product_attributes`: Public read, admin write (for global attributes)
- `attribute_values`: Public read, admin write (for global values)
- New vendor-specific attributes: Vendor read/write own only

**Recommendation**:
```sql
-- For vendor-specific attributes (if we add vendor_id column)
CREATE POLICY "Vendors can manage own attributes"
ON vendor_product_attributes
FOR ALL
USING (vendor_id = auth.uid())
WITH CHECK (vendor_id = auth.uid());
```

#### 1.4 Audit Trail Requirements

**CRITICAL**: All inventory changes MUST be logged

```sql
-- Every inventory update must create a movement record
-- This is non-negotiable for:
-- 1. Fraud detection
-- 2. Dispute resolution
-- 3. Financial reconciliation
-- 4. Regulatory compliance
```

#### 1.5 Security Verdict

| Area | Risk Level | Mitigation Required |
|------|------------|---------------------|
| Auth bypass | MEDIUM | Add SECURITY DEFINER to all vendor functions |
| Input injection | MEDIUM | Add regex validation for all user inputs |
| Cross-vendor access | HIGH | Add vendor_id ownership to custom attributes |
| Audit gaps | HIGH | Enforce inventory_movements logging |
| RLS gaps | MEDIUM | Add policies for new tables |

**APPROVAL STATUS**: ⚠️ CONDITIONAL - Must address HIGH risk items

---

## ⚡ Expert 2: Performance Engineer Review

### Performance Analysis

#### 2.1 Query Performance Concerns

**Current Product Query Pattern**:
```sql
SELECT p.*, 
  product_variants(*),
  inventory(*)
FROM products p
WHERE p.slug = $1
```

**With Dynamic Attributes, Query Becomes**:
```sql
SELECT p.*,
  product_variants(
    *,
    variant_attribute_values(
      attribute_values(
        product_attributes(*)
      )
    )
  ),
  inventory(*)
FROM products p
WHERE p.slug = $1
```

**Concern**: 4-level nested join could be slow

**Recommendations**:

1. **Add Composite Indexes**
   ```sql
   -- For variant attribute lookups
   CREATE INDEX idx_vav_variant_id ON variant_attribute_values(variant_id);
   CREATE INDEX idx_vav_attr_value_id ON variant_attribute_values(attribute_value_id);
   
   -- For inventory lookups
   CREATE INDEX idx_inventory_variant_location 
   ON inventory(variant_id, location_id);
   ```

2. **Denormalize Variant Display Data**
   ```sql
   -- Add computed column to product_variants
   ALTER TABLE product_variants 
   ADD COLUMN attributes_display jsonb DEFAULT '{}';
   
   -- Store: {"Color": "Black", "Size": "XL"}
   -- Updated via trigger on variant_attribute_values changes
   ```

3. **Cache Strategy**
   - Product detail: Cache for 5 minutes
   - Inventory: Real-time (no cache)
   - Attributes: Cache for 1 hour (rarely change)

#### 2.2 Variant Generation Performance

**Concern**: Cartesian product of attributes can explode

| Attributes | Values Each | Total Variants |
|------------|-------------|----------------|
| 2 | 5 | 25 |
| 3 | 5 | 125 |
| 4 | 5 | 625 |
| 5 | 5 | 3,125 |

**Recommendations**:

1. **Enforce Variant Limit**
   ```sql
   -- Max 100 variants per product
   IF (SELECT COUNT(*) FROM product_variants WHERE product_id = p_product_id) > 100 THEN
     RAISE EXCEPTION 'Maximum 100 variants per product';
   END IF;
   ```

2. **Lazy Variant Creation**
   - Don't auto-generate all combinations
   - Let vendor select which combinations to create
   - UI shows "potential combinations" but only creates selected

#### 2.3 Inventory Update Performance

**Concern**: High-frequency inventory updates during sales

**Recommendations**:

1. **Use Optimistic Concurrency Control (OCC)**
   ```sql
   -- Already have updated_at column
   -- Add version column for OCC
   ALTER TABLE inventory ADD COLUMN version integer DEFAULT 1;
   
   UPDATE inventory 
   SET quantity_available = quantity_available - $1,
       version = version + 1
   WHERE variant_id = $2 AND version = $3
   RETURNING version;
   -- If no rows returned, concurrent update occurred
   ```

2. **Batch Inventory Updates**
   - For bulk operations, use single transaction
   - Avoid N+1 updates

#### 2.4 Index Recommendations

```sql
-- Essential indexes for new queries
CREATE INDEX CONCURRENTLY idx_products_vendor_active 
ON products(vendor_id, is_active);

CREATE INDEX CONCURRENTLY idx_variants_product_active 
ON product_variants(product_id, is_active);

CREATE INDEX CONCURRENTLY idx_inventory_variant 
ON inventory(variant_id);

CREATE INDEX CONCURRENTLY idx_attr_values_attr_id 
ON attribute_values(attribute_id, is_active);
```

#### 2.5 Performance Verdict

| Area | Risk Level | Mitigation Required |
|------|------------|---------------------|
| Nested joins | MEDIUM | Add denormalized attributes_display |
| Variant explosion | HIGH | Enforce 100 variant limit |
| Concurrent updates | MEDIUM | Implement OCC pattern |
| Missing indexes | LOW | Add recommended indexes |

**APPROVAL STATUS**: ⚠️ CONDITIONAL - Must add variant limit and indexes

---

## 🗄️ Expert 3: Data Architect Review

### Schema Design Analysis

#### 3.1 Current Schema Assessment

**Strengths**:
- Good normalization (3NF)
- Proper foreign keys
- CHECK constraints on critical fields
- Audit tables exist

**Weaknesses**:
- `variant_attribute_values` junction table is empty
- No vendor ownership on attributes
- No soft delete on attributes

#### 3.2 Proposed Schema Changes

**Option A: Vendor-Specific Attributes (Recommended)**

```sql
-- New table for vendor-defined attribute types
CREATE TABLE vendor_attribute_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES user_profiles(id),
  name varchar(50) NOT NULL,
  display_name varchar(100) NOT NULL,
  attribute_type varchar(20) NOT NULL 
    CHECK (attribute_type IN ('text', 'color', 'number', 'select')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(vendor_id, name)
);

-- New table for vendor-defined attribute values
CREATE TABLE vendor_attribute_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_type_id uuid NOT NULL REFERENCES vendor_attribute_types(id),
  value varchar(100) NOT NULL,
  display_value varchar(100) NOT NULL,
  color_hex varchar(7),
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  UNIQUE(attribute_type_id, value)
);

-- Link variants to vendor attribute values
CREATE TABLE variant_vendor_attributes (
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_value_id uuid NOT NULL REFERENCES vendor_attribute_values(id),
  PRIMARY KEY (variant_id, attribute_value_id)
);
```

**Option B: Extend Existing Tables**

```sql
-- Add vendor_id to existing tables (nullable for global attributes)
ALTER TABLE product_attributes 
ADD COLUMN vendor_id uuid REFERENCES user_profiles(id);

ALTER TABLE attribute_values
ADD COLUMN vendor_id uuid REFERENCES user_profiles(id);

-- Global attributes: vendor_id IS NULL
-- Vendor-specific: vendor_id = vendor's user_id
```

**Recommendation**: Option B is simpler and maintains backward compatibility

#### 3.3 Migration Strategy

**Phase 1: Schema Extension (Non-Breaking)**
```sql
-- Add nullable vendor_id columns
ALTER TABLE product_attributes ADD COLUMN vendor_id uuid;
ALTER TABLE attribute_values ADD COLUMN vendor_id uuid;

-- Add foreign keys
ALTER TABLE product_attributes 
ADD CONSTRAINT fk_pa_vendor FOREIGN KEY (vendor_id) 
REFERENCES user_profiles(id);

ALTER TABLE attribute_values 
ADD CONSTRAINT fk_av_vendor FOREIGN KEY (vendor_id) 
REFERENCES user_profiles(id);
```

**Phase 2: Backfill Existing Products**
```sql
-- Existing products have "Default Variant" with no attributes
-- No backfill needed - they continue to work as-is
```

**Phase 3: Add Inventory Update Functions**
```sql
-- New function for inventory adjustments
CREATE FUNCTION update_inventory_quantity(
  p_variant_id uuid,
  p_quantity_change integer,
  p_movement_type varchar,
  p_notes text DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $$
-- Implementation
$$;
```

#### 3.4 Data Integrity Constraints

```sql
-- Ensure variant has valid product
ALTER TABLE product_variants
ADD CONSTRAINT fk_variant_product 
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- Ensure inventory has valid variant
ALTER TABLE inventory
ADD CONSTRAINT fk_inventory_variant
FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;

-- Ensure attribute value belongs to correct attribute
-- (Already exists via foreign key)

-- Ensure inventory quantity never goes negative
ALTER TABLE inventory
ADD CONSTRAINT chk_inventory_non_negative
CHECK (quantity_available >= 0 AND quantity_reserved >= 0);
```

#### 3.5 Rollback Plan

```sql
-- If migration fails, rollback:
ALTER TABLE product_attributes DROP COLUMN IF EXISTS vendor_id;
ALTER TABLE attribute_values DROP COLUMN IF EXISTS vendor_id;

-- Functions can be dropped and recreated from backup
```

#### 3.6 Data Architect Verdict

| Area | Risk Level | Mitigation Required |
|------|------------|---------------------|
| Schema changes | LOW | Use nullable columns, non-breaking |
| Data migration | LOW | No backfill needed for existing data |
| Referential integrity | LOW | Proper FKs with CASCADE |
| Rollback capability | LOW | Simple column drops |

**APPROVAL STATUS**: ✅ APPROVED with Option B approach

---

## 🎨 Expert 4: Frontend/UX Engineer Review

### UX Analysis

#### 4.1 Vendor Portal - Product Creation

**Current UX Issues**:
1. Fixed Color/Size attributes - not suitable for salon products
2. No way to create custom attributes
3. Variant table gets unwieldy with many combinations

**Proposed UX Flow**:

```
Step 1: Basic Info (unchanged)
Step 2: Images (unchanged)
Step 3: Attributes & Variants (NEW)
  ├── "Add Attribute" button
  │   ├── Attribute Name (e.g., "Volume")
  │   ├── Attribute Type (text/select/color)
  │   └── Values (e.g., "100ml", "250ml", "500ml")
  ├── Show existing attributes (Color, Size) as optional
  ├── Generate Variants button
  │   └── Shows preview of combinations
  └── Variant Details Table
      ├── SKU (auto-generated, editable)
      ├── Price
      ├── Compare At Price
      └── Initial Stock
Step 4: Review (unchanged)
```

**Wireframe Concept**:
```
┌─────────────────────────────────────────────────────┐
│ Product Attributes                    [+ Add New]   │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ Volume (Custom)                    [Edit] [×]   │ │
│ │ Values: 100ml, 250ml, 500ml                     │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Scent (Custom)                     [Edit] [×]   │ │
│ │ Values: Rose, Lavender, Unscented               │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ [Generate 9 Variants]                               │
└─────────────────────────────────────────────────────┘
```

#### 4.2 Vendor Portal - Product Editing

**Current State**: No edit capability

**Proposed Edit Modal**:
```
┌─────────────────────────────────────────────────────┐
│ Edit Product: Lilium Herbal Gold Cleansing Milk     │
├─────────────────────────────────────────────────────┤
│ [Basic Info] [Images] [Variants] [Inventory]        │
├─────────────────────────────────────────────────────┤
│ Variants Tab:                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SKU          Price    Stock    Actions          │ │
│ │ LILIUM-100ML  ₹300    50       [Edit] [×]       │ │
│ │ LILIUM-250ML  ₹600    30       [Edit] [×]       │ │
│ │ LILIUM-500ML  ₹1000   20       [Edit] [×]       │ │
│ │                                                 │ │
│ │ [+ Add Variant]                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Inventory Tab:                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Variant      Current   Adjust   Reason          │ │
│ │ 100ml        50        [+10]    Restock         │ │
│ │ 250ml        30        [-5]     Damaged         │ │
│ │ 500ml        20        [+20]    Purchase        │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### 4.3 Customer Portal - Product Detail

**Current Issues**:
1. Shows "Out of Stock" for entire product, not per variant
2. No indication which combinations are available
3. Options don't update based on availability

**Proposed UX**:

```
┌─────────────────────────────────────────────────────┐
│ Volume: [100ml] [250ml] [500ml ❌]                   │
│                                                     │
│ Scent:  [Rose] [Lavender ❌] [Unscented]            │
│                                                     │
│ ✓ In Stock (23 available)                           │
│ or                                                  │
│ ❌ Out of Stock - Select different options          │
└─────────────────────────────────────────────────────┘
```

**Key UX Improvements**:
1. Cross out unavailable options (stock = 0)
2. Show stock count for selected combination
3. Disable "Add to Cart" only when selected combo is out of stock
4. Show "Only X left!" for low stock

#### 4.4 Accessibility Requirements

- All form inputs must have labels
- Color swatches must have text alternatives
- Stock status must be announced to screen readers
- Keyboard navigation for variant selection

#### 4.5 Mobile Responsiveness

- Variant table must scroll horizontally on mobile
- Option buttons must wrap properly
- Touch targets minimum 44x44px

#### 4.6 UX Verdict

| Area | Risk Level | Mitigation Required |
|------|------------|---------------------|
| Attribute creation UX | MEDIUM | Design intuitive "Add Attribute" flow |
| Variant explosion | HIGH | Show warning when >50 variants |
| Stock display | LOW | Per-variant stock is straightforward |
| Edit modal complexity | MEDIUM | Use tabs to organize sections |
| Mobile UX | MEDIUM | Test on various screen sizes |

**APPROVAL STATUS**: ⚠️ CONDITIONAL - Need detailed wireframes before implementation

---

## 🔬 Expert 5: Principal Engineer Review

### End-to-End System Analysis

#### 5.1 Complete Data Flow

**Product Creation Flow**:
```
Vendor UI → Server Action → RPC Function → Database
    ↓
Cache Invalidation ← pg_notify
    ↓
Customer sees new product
```

**Inventory Update Flow**:
```
Vendor UI → Server Action → RPC Function → Database
    ↓                           ↓
Movement Log              Inventory Update
    ↓                           ↓
Cache Invalidation ← pg_notify
    ↓
Customer sees updated stock
```

**Order Flow (Inventory Impact)**:
```
Customer Checkout → Payment Intent → Reserve Inventory
    ↓
Payment Success → Create Order → Deduct Inventory
    ↓
Movement Log (type: 'sale')
```

#### 5.2 Integration Points

| System | Integration | Risk |
|--------|-------------|------|
| Cart | Uses variant_id | LOW - No change needed |
| Orders | Uses variant_id, stores snapshot | LOW - No change needed |
| Reviews | Uses product_id | LOW - No change needed |
| Search | Indexes product name | MEDIUM - May need attribute indexing |
| Cache | Invalidates on product_changed | LOW - Existing pattern |
| Metrics | Tracks by vendor/product | LOW - No change needed |

#### 5.3 Edge Cases & Failure Modes

**Edge Case 1: Variant Deleted with Active Orders**
- **Risk**: Order references non-existent variant
- **Mitigation**: Soft delete only, never hard delete variants with orders

**Edge Case 2: Concurrent Inventory Updates**
- **Risk**: Race condition causes overselling
- **Mitigation**: Use OCC with version column, or SELECT FOR UPDATE

**Edge Case 3: Attribute Deleted with Active Variants**
- **Risk**: Variant loses attribute reference
- **Mitigation**: Prevent deletion if variants exist, or cascade soft delete

**Edge Case 4: SKU Collision**
- **Risk**: Two vendors create same SKU
- **Mitigation**: Add vendor prefix to SKU, or use UUID-based SKUs

**Edge Case 5: Inventory Goes Negative**
- **Risk**: Overselling due to concurrent orders
- **Mitigation**: CHECK constraint + transaction isolation

#### 5.4 Monitoring Requirements

```sql
-- Alert: Low stock (< reorder_point)
-- Alert: Negative inventory (should never happen)
-- Alert: Orphaned variants (no inventory record)
-- Alert: High variant count (> 50 per product)
```

#### 5.5 Deployment Strategy

**Phase 1: Database Migration (Zero Downtime)**
1. Add new columns (nullable)
2. Add new functions
3. Add new indexes (CONCURRENTLY)

**Phase 2: Backend Updates**
1. Deploy new RPC functions
2. Update Server Actions
3. Test with feature flag

**Phase 3: Frontend Updates**
1. Deploy new VariantBuilder
2. Deploy EditProductModal
3. Update ProductDetailClient

**Phase 4: Cleanup**
1. Remove feature flags
2. Monitor for issues
3. Document changes

#### 5.6 Rollback Strategy

**Database**: 
- Drop new columns (data loss acceptable for new features)
- Restore functions from backup

**Frontend**:
- Revert to previous deployment
- Feature flags allow instant disable

#### 5.7 Principal Engineer Verdict

| Area | Risk Level | Mitigation Required |
|------|------------|---------------------|
| Data flow | LOW | Existing patterns work |
| Integration | LOW | Minimal changes to other systems |
| Edge cases | MEDIUM | Document and handle all cases |
| Deployment | LOW | Phased rollout with flags |
| Rollback | LOW | Clear rollback path |

**APPROVAL STATUS**: ✅ APPROVED with edge case handling

---

## Expert Panel Summary

### Consolidated Risk Assessment

| Expert | Approval | Key Concerns |
|--------|----------|--------------|
| Security | ⚠️ CONDITIONAL | SECURITY DEFINER, input validation, audit |
| Performance | ⚠️ CONDITIONAL | Variant limit, indexes, OCC |
| Data | ✅ APPROVED | Option B schema approach |
| UX | ⚠️ CONDITIONAL | Wireframes needed |
| Principal | ✅ APPROVED | Edge case handling |

### Must-Have Requirements Before Implementation

1. **Security**:
   - [ ] Add SECURITY DEFINER to all vendor functions
   - [ ] Add input validation regex
   - [ ] Enforce inventory movement logging

2. **Performance**:
   - [ ] Add 100 variant limit per product
   - [ ] Add recommended indexes
   - [ ] Implement OCC for inventory

3. **UX**:
   - [ ] Design "Add Attribute" modal
   - [ ] Design "Edit Product" modal
   - [ ] Design per-variant stock display

4. **Data**:
   - [ ] Use Option B (extend existing tables)
   - [ ] Add vendor_id to attributes
   - [ ] Create inventory update function

5. **Integration**:
   - [ ] Handle all edge cases
   - [ ] Plan phased deployment
   - [ ] Prepare rollback scripts

---

**Phase 2 Status**: COMPLETE  
**Next Phase**: Consistency Check (Phase 3)
