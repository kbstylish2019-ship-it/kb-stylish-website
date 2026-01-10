# Phase 4: Solution Blueprint

**Date**: January 10, 2026  
**Status**: IN PROGRESS  
**Version**: 1.0

---

## 4.1 Approach Selection

### Selected Approach: **Refactor (Medium Change, Medium Risk)**

**Justification**:
- **Not Surgical Fix**: Too many interconnected changes (DB + Backend + Frontend)
- **Not Rewrite**: Existing patterns work well, just need extension
- **Refactor is optimal**: Extend existing tables, add new functions, enhance UI

### Alternative Approaches Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| A: New vendor_attributes tables | Clean separation | Duplicate logic, complex queries | ❌ Rejected |
| B: Extend existing tables | Simple, backward compatible | Shared tables with global attrs | ✅ Selected |
| C: JSON attributes in variants | Flexible | No referential integrity, hard to query | ❌ Rejected |

---

## 4.2 Problem Statement

### Current Limitations
1. **Fixed Variant Types**: Only Color + Size attributes exist (fashion-focused)
2. **No Inventory Editing**: Vendors cannot update stock after product creation
3. **No Variant Editing**: Cannot modify prices, SKUs, or add/remove variants
4. **No Product Editing**: `update_vendor_product` only updates basic fields
5. **Stock Display**: Shows product-level stock, not per-variant availability

### Business Impact
- Salon products (Lilium, Astaberry) cannot use Volume/Scent variants
- Vendors must delete and recreate products to fix inventory errors
- Customers see misleading stock information


---

## 4.3 Proposed Solution Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VENDOR PORTAL                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ AddProductModal │  │ EditProductModal│  │ InventoryManager    │  │
│  │ (existing)      │  │ (NEW)           │  │ (NEW)               │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │             │
│  ┌────────▼────────────────────▼──────────────────────▼──────────┐  │
│  │                    VariantBuilder (ENHANCED)                   │  │
│  │  - Dynamic attribute creation                                  │  │
│  │  - Vendor-specific attributes                                  │  │
│  │  - 100 variant limit enforcement                               │  │
│  └────────────────────────────────┬──────────────────────────────┘  │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER ACTIONS                                │
├─────────────────────────────────────────────────────────────────────┤
│  createVendorProduct()     (existing)                               │
│  updateVendorProduct()     (ENHANCED - add variant/inventory)       │
│  updateInventoryQuantity() (NEW)                                    │
│  addVendorAttribute()      (NEW)                                    │
│  addProductVariant()       (NEW)                                    │
│  updateProductVariant()    (NEW)                                    │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATABASE (RPC Functions)                      │
├─────────────────────────────────────────────────────────────────────┤
│  create_vendor_product()        (existing - no changes)             │
│  update_vendor_product()        (ENHANCED - SECURITY DEFINER)       │
│  update_inventory_quantity()    (NEW)                               │
│  add_vendor_attribute()         (NEW)                               │
│  add_product_variant()          (NEW)                               │
│  update_product_variant()       (NEW)                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4.4 Database Changes

### 4.4.1 Schema Modifications

#### Migration 1: Add vendor_id to attributes (Non-Breaking)

```sql
-- Migration: 20260110_001_add_vendor_id_to_attributes.sql

-- Add vendor_id column to product_attributes (nullable for global attributes)
ALTER TABLE product_attributes 
ADD COLUMN vendor_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Add vendor_id column to attribute_values (nullable for global values)
ALTER TABLE attribute_values 
ADD COLUMN vendor_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Create indexes for vendor-specific queries
CREATE INDEX CONCURRENTLY idx_product_attributes_vendor 
ON product_attributes(vendor_id) WHERE vendor_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_attribute_values_vendor 
ON attribute_values(vendor_id) WHERE vendor_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN product_attributes.vendor_id IS 
  'NULL = global attribute (Color, Size), NOT NULL = vendor-specific attribute';
COMMENT ON COLUMN attribute_values.vendor_id IS 
  'NULL = global value, NOT NULL = vendor-specific value';
```


#### Migration 2: Add RLS Policies for Vendor Attributes

```sql
-- Migration: 20260110_002_add_vendor_attribute_rls.sql

-- RLS policy: Vendors can read global attributes + their own
CREATE POLICY "vendors_read_attributes" ON product_attributes
FOR SELECT USING (
  vendor_id IS NULL  -- Global attributes visible to all
  OR vendor_id = auth.uid()  -- Vendor's own attributes
  OR public.user_has_role(auth.uid(), 'admin')  -- Admins see all
);

-- RLS policy: Vendors can only create their own attributes
CREATE POLICY "vendors_create_own_attributes" ON product_attributes
FOR INSERT WITH CHECK (
  vendor_id = auth.uid()
  AND public.user_has_role(auth.uid(), 'vendor')
);

-- RLS policy: Vendors can only update their own attributes
CREATE POLICY "vendors_update_own_attributes" ON product_attributes
FOR UPDATE USING (
  vendor_id = auth.uid()
  AND public.user_has_role(auth.uid(), 'vendor')
);

-- Same policies for attribute_values
CREATE POLICY "vendors_read_attribute_values" ON attribute_values
FOR SELECT USING (
  vendor_id IS NULL 
  OR vendor_id = auth.uid()
  OR public.user_has_role(auth.uid(), 'admin')
);

CREATE POLICY "vendors_create_own_attribute_values" ON attribute_values
FOR INSERT WITH CHECK (
  vendor_id = auth.uid()
  AND public.user_has_role(auth.uid(), 'vendor')
);

CREATE POLICY "vendors_update_own_attribute_values" ON attribute_values
FOR UPDATE USING (
  vendor_id = auth.uid()
  AND public.user_has_role(auth.uid(), 'vendor')
);
```

#### Migration 3: Add Performance Indexes

```sql
-- Migration: 20260110_003_add_performance_indexes.sql

-- Index for variant attribute lookups (critical for product detail page)
CREATE INDEX CONCURRENTLY idx_vav_variant_id 
ON variant_attribute_values(variant_id);

CREATE INDEX CONCURRENTLY idx_vav_attr_value_id 
ON variant_attribute_values(attribute_value_id);

-- Index for inventory lookups
CREATE INDEX CONCURRENTLY idx_inventory_variant_location 
ON inventory(variant_id, location_id);

-- Index for product queries by vendor
CREATE INDEX CONCURRENTLY idx_products_vendor_active 
ON products(vendor_id, is_active) WHERE is_active = true;

-- Index for variant queries by product
CREATE INDEX CONCURRENTLY idx_variants_product_active 
ON product_variants(product_id, is_active) WHERE is_active = true;

-- Index for attribute values by attribute
CREATE INDEX CONCURRENTLY idx_attr_values_attr_active 
ON attribute_values(attribute_id, is_active) WHERE is_active = true;
```


### 4.4.2 New Database Functions

#### Function 1: add_vendor_attribute

```sql
-- Migration: 20260110_004_add_vendor_attribute_function.sql

CREATE OR REPLACE FUNCTION public.add_vendor_attribute(
  p_name varchar(50),
  p_display_name varchar(100),
  p_attribute_type varchar(20),
  p_is_variant_defining boolean DEFAULT true,
  p_values jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_attribute_id uuid;
  v_value_record jsonb;
  v_value_id uuid;
  v_result jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Input validation
  IF p_name !~ '^[a-zA-Z][a-zA-Z0-9_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid attribute name: must start with letter, alphanumeric/underscore only, max 50 chars';
  END IF;
  
  IF p_attribute_type NOT IN ('text', 'color', 'number', 'select') THEN
    RAISE EXCEPTION 'Invalid attribute type: must be text, color, number, or select';
  END IF;
  
  -- 4. Check vendor attribute limit (max 10 custom attributes per vendor)
  IF (SELECT COUNT(*) FROM product_attributes WHERE vendor_id = v_vendor_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 custom attributes per vendor';
  END IF;
  
  -- 5. Check for duplicate name
  IF EXISTS (
    SELECT 1 FROM product_attributes 
    WHERE vendor_id = v_vendor_id AND lower(name) = lower(p_name)
  ) THEN
    RAISE EXCEPTION 'Attribute with this name already exists';
  END IF;
  
  -- 6. Create attribute
  INSERT INTO product_attributes (
    name, display_name, attribute_type, is_variant_defining, vendor_id, is_active, sort_order
  ) VALUES (
    lower(p_name), p_display_name, p_attribute_type, p_is_variant_defining, v_vendor_id, true,
    (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_attributes WHERE vendor_id = v_vendor_id)
  )
  RETURNING id INTO v_attribute_id;
  
  -- 7. Create attribute values if provided
  FOR v_value_record IN SELECT * FROM jsonb_array_elements(p_values)
  LOOP
    INSERT INTO attribute_values (
      attribute_id, value, display_value, color_hex, vendor_id, is_active, sort_order
    ) VALUES (
      v_attribute_id,
      lower(v_value_record->>'value'),
      v_value_record->>'display_value',
      v_value_record->>'color_hex',
      v_vendor_id,
      true,
      (v_value_record->>'sort_order')::integer
    );
  END LOOP;
  
  -- 8. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, old_values, new_values
  ) VALUES (
    NULL, v_vendor_id, 'attribute_created',
    NULL,
    jsonb_build_object('attribute_id', v_attribute_id, 'name', p_name)
  );
  
  -- 9. Return result
  RETURN jsonb_build_object(
    'success', true,
    'attribute_id', v_attribute_id,
    'message', 'Attribute created successfully'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Attribute or value already exists';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create attribute: %', SQLERRM;
END;
$function$;
```


#### Function 2: update_inventory_quantity

```sql
-- Migration: 20260110_005_update_inventory_quantity_function.sql

CREATE OR REPLACE FUNCTION public.update_inventory_quantity(
  p_variant_id uuid,
  p_quantity_change integer,
  p_movement_type varchar(20),
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_product_vendor_id uuid;
  v_inventory_id uuid;
  v_location_id uuid;
  v_old_quantity integer;
  v_new_quantity integer;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') 
     AND NOT public.user_has_role(v_vendor_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor or admin';
  END IF;
  
  -- 3. Validate movement type
  IF p_movement_type NOT IN ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'damage') THEN
    RAISE EXCEPTION 'Invalid movement type';
  END IF;
  
  -- 4. Get variant's product and verify ownership
  SELECT pv.product_id, p.vendor_id 
  INTO v_product_id, v_product_vendor_id
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;
  
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Variant not found';
  END IF;
  
  -- 5. Ownership check (vendors can only update their own products)
  IF NOT public.user_has_role(v_vendor_id, 'admin') 
     AND v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update inventory for products you do not own';
  END IF;
  
  -- 6. Get current inventory record
  SELECT i.id, i.location_id, i.quantity_available
  INTO v_inventory_id, v_location_id, v_old_quantity
  FROM inventory i
  WHERE i.variant_id = p_variant_id
  LIMIT 1;
  
  IF v_inventory_id IS NULL THEN
    RAISE EXCEPTION 'Inventory record not found for variant';
  END IF;
  
  -- 7. Calculate new quantity and validate
  v_new_quantity := v_old_quantity + p_quantity_change;
  
  IF v_new_quantity < 0 THEN
    RAISE EXCEPTION 'Insufficient inventory: cannot reduce below 0 (current: %, change: %)', 
      v_old_quantity, p_quantity_change;
  END IF;
  
  -- 8. Update inventory with optimistic concurrency
  UPDATE inventory
  SET quantity_available = v_new_quantity,
      updated_at = now()
  WHERE id = v_inventory_id;
  
  -- 9. Create movement record (audit trail)
  INSERT INTO inventory_movements (
    variant_id, location_id, movement_type, quantity_change, 
    quantity_after, notes, created_by
  ) VALUES (
    p_variant_id, v_location_id, p_movement_type, p_quantity_change,
    v_new_quantity, p_notes, v_vendor_id
  );
  
  -- 10. Notify cache invalidation
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'action', 'inventory_updated'
  )::text);
  
  -- 11. Return result
  RETURN jsonb_build_object(
    'success', true,
    'old_quantity', v_old_quantity,
    'new_quantity', v_new_quantity,
    'message', 'Inventory updated successfully'
  );

EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Inventory cannot be negative';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update inventory: %', SQLERRM;
END;
$function$;
```


#### Function 3: add_product_variant

```sql
-- Migration: 20260110_006_add_product_variant_function.sql

CREATE OR REPLACE FUNCTION public.add_product_variant(
  p_product_id uuid,
  p_sku varchar(50),
  p_price numeric,
  p_compare_at_price numeric DEFAULT NULL,
  p_cost_price numeric DEFAULT NULL,
  p_quantity integer DEFAULT 0,
  p_attribute_value_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_variant_id uuid;
  v_location_id uuid;
  v_variant_count integer;
  v_attr_value_id uuid;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Verify product ownership
  SELECT vendor_id INTO v_product_vendor_id
  FROM products WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot add variants to products you do not own';
  END IF;
  
  -- 4. Validate SKU format
  IF p_sku !~ '^[A-Z0-9][A-Z0-9\-_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid SKU format: must be alphanumeric with hyphens/underscores, max 50 chars';
  END IF;
  
  -- 5. Check variant limit (max 100 per product)
  SELECT COUNT(*) INTO v_variant_count
  FROM product_variants WHERE product_id = p_product_id;
  
  IF v_variant_count >= 100 THEN
    RAISE EXCEPTION 'Maximum 100 variants per product';
  END IF;
  
  -- 6. Validate price
  IF p_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;
  
  -- 7. Get default inventory location
  SELECT id INTO v_location_id
  FROM inventory_locations
  WHERE vendor_id = v_vendor_id AND is_default = true
  LIMIT 1;
  
  IF v_location_id IS NULL THEN
    -- Create default location if not exists
    INSERT INTO inventory_locations (vendor_id, name, is_default)
    VALUES (v_vendor_id, 'Default Warehouse', true)
    RETURNING id INTO v_location_id;
  END IF;
  
  -- 8. Create variant
  INSERT INTO product_variants (
    product_id, sku, price, compare_at_price, cost_price, is_active
  ) VALUES (
    p_product_id, p_sku, p_price, p_compare_at_price, p_cost_price, true
  )
  RETURNING id INTO v_variant_id;
  
  -- 9. Link attribute values
  FOREACH v_attr_value_id IN ARRAY p_attribute_value_ids
  LOOP
    INSERT INTO variant_attribute_values (variant_id, attribute_value_id)
    VALUES (v_variant_id, v_attr_value_id);
  END LOOP;
  
  -- 10. Create inventory record
  INSERT INTO inventory (variant_id, location_id, quantity_available)
  VALUES (v_variant_id, v_location_id, p_quantity);
  
  -- 11. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, new_values
  ) VALUES (
    p_product_id, v_vendor_id, 'variant_added',
    jsonb_build_object('variant_id', v_variant_id, 'sku', p_sku)
  );
  
  -- 12. Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'action', 'variant_added'
  )::text);
  
  -- 13. Return result
  RETURN jsonb_build_object(
    'success', true,
    'variant_id', v_variant_id,
    'message', 'Variant added successfully'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SKU already exists';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid attribute value reference';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to add variant: %', SQLERRM;
END;
$function$;
```


#### Function 4: update_product_variant

```sql
-- Migration: 20260110_007_update_product_variant_function.sql

CREATE OR REPLACE FUNCTION public.update_product_variant(
  p_variant_id uuid,
  p_sku varchar(50) DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_compare_at_price numeric DEFAULT NULL,
  p_cost_price numeric DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_product_vendor_id uuid;
  v_old_values jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Get variant's product and verify ownership
  SELECT pv.product_id, p.vendor_id,
    jsonb_build_object(
      'sku', pv.sku,
      'price', pv.price,
      'compare_at_price', pv.compare_at_price,
      'cost_price', pv.cost_price,
      'is_active', pv.is_active
    )
  INTO v_product_id, v_product_vendor_id, v_old_values
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;
  
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Variant not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update variants for products you do not own';
  END IF;
  
  -- 4. Validate SKU if provided
  IF p_sku IS NOT NULL AND p_sku !~ '^[A-Z0-9][A-Z0-9\-_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid SKU format';
  END IF;
  
  -- 5. Validate price if provided
  IF p_price IS NOT NULL AND p_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;
  
  -- 6. Update variant (only non-null fields)
  UPDATE product_variants
  SET 
    sku = COALESCE(p_sku, sku),
    price = COALESCE(p_price, price),
    compare_at_price = CASE WHEN p_compare_at_price IS NOT NULL THEN p_compare_at_price ELSE compare_at_price END,
    cost_price = CASE WHEN p_cost_price IS NOT NULL THEN p_cost_price ELSE cost_price END,
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_variant_id;
  
  -- 7. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, old_values, new_values
  ) VALUES (
    v_product_id, v_vendor_id, 'variant_updated',
    v_old_values,
    jsonb_build_object(
      'sku', p_sku,
      'price', p_price,
      'compare_at_price', p_compare_at_price,
      'cost_price', p_cost_price,
      'is_active', p_is_active
    )
  );
  
  -- 8. Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'action', 'variant_updated'
  )::text);
  
  -- 9. Return result
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Variant updated successfully'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SKU already exists';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update variant: %', SQLERRM;
END;
$function$;
```


#### Function 5: Fix update_vendor_product (Add SECURITY DEFINER)

```sql
-- Migration: 20260110_008_fix_update_vendor_product.sql

-- Drop existing function and recreate with SECURITY DEFINER
DROP FUNCTION IF EXISTS public.update_vendor_product;

CREATE OR REPLACE FUNCTION public.update_vendor_product(
  p_product_id uuid,
  p_name varchar DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_short_description text DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_care_instructions text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_is_featured boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- CRITICAL: Added for consistent RLS handling
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_old_values jsonb;
BEGIN
  -- 1. Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- 2. Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- 3. Verify product ownership
  SELECT vendor_id,
    jsonb_build_object(
      'name', name,
      'description', description,
      'is_active', is_active
    )
  INTO v_product_vendor_id, v_old_values
  FROM products WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot update products you do not own';
  END IF;
  
  -- 4. Update product (only non-null fields)
  UPDATE products
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    short_description = COALESCE(p_short_description, short_description),
    material = COALESCE(p_material, material),
    care_instructions = COALESCE(p_care_instructions, care_instructions),
    is_active = COALESCE(p_is_active, is_active),
    is_featured = COALESCE(p_is_featured, is_featured),
    updated_at = now()
  WHERE id = p_product_id;
  
  -- 5. Audit log
  INSERT INTO product_change_log (
    product_id, changed_by, change_type, old_values, new_values
  ) VALUES (
    p_product_id, v_vendor_id, 'product_updated',
    v_old_values,
    jsonb_build_object(
      'name', p_name,
      'description', p_description,
      'is_active', p_is_active
    )
  );
  
  -- 6. Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'action', 'updated'
  )::text);
  
  -- 7. Return result
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Product updated successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update product: %', SQLERRM;
END;
$function$;
```

---

## 4.5 Server Action Changes

### 4.5.1 New Server Actions (src/app/actions/vendor.ts)

```typescript
// ADD TO: src/app/actions/vendor.ts

/**
 * Add a custom attribute for the vendor
 */
export async function addVendorAttribute(
  name: string,
  displayName: string,
  attributeType: 'text' | 'color' | 'number' | 'select',
  isVariantDefining: boolean = true,
  values: Array<{ value: string; display_value: string; color_hex?: string; sort_order: number }>
): Promise<{ success: boolean; attribute_id?: string; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('add_vendor_attribute', {
      p_name: name,
      p_display_name: displayName,
      p_attribute_type: attributeType,
      p_is_variant_defining: isVariantDefining,
      p_values: values
    });
    
    if (error) {
      console.error('addVendorAttribute error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data;
  } catch (error: any) {
    console.error('addVendorAttribute error:', error);
    return { success: false, message: error.message || 'Failed to add attribute' };
  }
}

/**
 * Update inventory quantity for a variant
 */
export async function updateInventoryQuantity(
  variantId: string,
  quantityChange: number,
  movementType: 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'return' | 'damage',
  notes?: string
): Promise<{ success: boolean; old_quantity?: number; new_quantity?: number; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('update_inventory_quantity', {
      p_variant_id: variantId,
      p_quantity_change: quantityChange,
      p_movement_type: movementType,
      p_notes: notes
    });
    
    if (error) {
      console.error('updateInventoryQuantity error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    revalidatePath('/vendor/dashboard');
    return data;
  } catch (error: any) {
    console.error('updateInventoryQuantity error:', error);
    return { success: false, message: error.message || 'Failed to update inventory' };
  }
}

/**
 * Add a new variant to an existing product
 */
export async function addProductVariant(
  productId: string,
  sku: string,
  price: number,
  compareAtPrice?: number,
  costPrice?: number,
  quantity: number = 0,
  attributeValueIds: string[] = []
): Promise<{ success: boolean; variant_id?: string; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('add_product_variant', {
      p_product_id: productId,
      p_sku: sku.toUpperCase(),
      p_price: price,
      p_compare_at_price: compareAtPrice,
      p_cost_price: costPrice,
      p_quantity: quantity,
      p_attribute_value_ids: attributeValueIds
    });
    
    if (error) {
      console.error('addProductVariant error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data;
  } catch (error: any) {
    console.error('addProductVariant error:', error);
    return { success: false, message: error.message || 'Failed to add variant' };
  }
}

/**
 * Update an existing variant
 */
export async function updateProductVariant(
  variantId: string,
  updates: {
    sku?: string;
    price?: number;
    compareAtPrice?: number;
    costPrice?: number;
    isActive?: boolean;
  }
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase.rpc('update_product_variant', {
      p_variant_id: variantId,
      p_sku: updates.sku?.toUpperCase(),
      p_price: updates.price,
      p_compare_at_price: updates.compareAtPrice,
      p_cost_price: updates.costPrice,
      p_is_active: updates.isActive
    });
    
    if (error) {
      console.error('updateProductVariant error:', error);
      return { success: false, message: error.message };
    }
    
    revalidatePath('/vendor/products');
    return data;
  } catch (error: any) {
    console.error('updateProductVariant error:', error);
    return { success: false, message: error.message || 'Failed to update variant' };
  }
}
```


---

## 4.6 Frontend Changes

### 4.6.1 Enhanced VariantBuilder Component

**File**: `src/components/vendor/VariantBuilder.tsx`

**Changes Required**:
1. Add "Create Custom Attribute" button and modal
2. Fetch vendor-specific attributes (vendor_id = current user OR vendor_id IS NULL)
3. Enforce 100 variant limit with warning at 50+
4. Show attribute source (Global vs Custom)

**New UI Flow**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Product Attributes                              [+ Add Custom]  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🌐 Color (Global)                                           │ │
│ │ [Black] [White] [Navy] [Gray] [Red] [Blue] [Green] [Beige]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🌐 Size (Global)                                            │ │
│ │ [XS] [S] [M] [L] [XL] [XXL]                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 Volume (Custom)                          [Edit] [Delete] │ │
│ │ [100ml] [250ml] [500ml]                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ⚠️ Warning: 75 variants will be generated (limit: 100)         │
│                                                                 │
│ [Generate Variants]                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Key Code Changes**:
```typescript
// Enhanced attribute fetch query
const { data: attrsData } = await supabase
  .from('product_attributes')
  .select('*')
  .eq('is_variant_defining', true)
  .eq('is_active', true)
  .or(`vendor_id.is.null,vendor_id.eq.${userId}`)  // Global + vendor's own
  .order('sort_order');

// Variant limit check
const potentialVariants = calculateCartesianProductSize(selectedAttributes);
if (potentialVariants > 100) {
  setError('Maximum 100 variants allowed. Please reduce attribute selections.');
  return;
}
if (potentialVariants > 50) {
  setWarning(`${potentialVariants} variants will be created. Consider reducing for easier management.`);
}
```

### 4.6.2 New AddAttributeModal Component

**File**: `src/components/vendor/AddAttributeModal.tsx` (NEW)

**Purpose**: Allow vendors to create custom attributes

**UI Design**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Create Custom Attribute                                    [×]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Attribute Name *                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ volume                                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Display Name *                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Volume                                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Type *                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Select ▼]  Text | Color | Number | Select                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Values                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 100ml                                                  [×]  │ │
│ │ 250ml                                                  [×]  │ │
│ │ 500ml                                                  [×]  │ │
│ │ [+ Add Value]                                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ☑ Use for variant combinations                                 │
│                                                                 │
│                              [Cancel]  [Create Attribute]       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6.3 New EditProductModal Component

**File**: `src/components/vendor/EditProductModal.tsx` (NEW)

**Purpose**: Full product editing with variants and inventory management

**Tab Structure**:
1. **Basic Info** - Name, description, category (existing fields)
2. **Images** - Manage product images
3. **Variants** - Edit/add/remove variants
4. **Inventory** - Adjust stock levels with movement tracking

**Variants Tab UI**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Variants                                        [+ Add Variant] │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SKU          │ Attributes    │ Price   │ Stock │ Actions    │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ LILIUM-100ML │ 100ml         │ ₹300    │ 50    │ [✏️] [🗑️] │ │
│ │ LILIUM-250ML │ 250ml         │ ₹600    │ 30    │ [✏️] [🗑️] │ │
│ │ LILIUM-500ML │ 500ml         │ ₹1000   │ 20    │ [✏️] [🗑️] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Inventory Tab UI**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Inventory Adjustments                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Select Variant                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [LILIUM-100ML (100ml) - Current: 50 ▼]                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Adjustment Type                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Purchase ▼]  Purchase | Adjustment | Damage | Return       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Quantity Change                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [+] [  10  ] [-]                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Notes (optional)                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Restocked from supplier                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ New Quantity: 60                                                │
│                                                                 │
│                                        [Apply Adjustment]       │
└─────────────────────────────────────────────────────────────────┘
```


### 4.6.4 Enhanced ProductDetailClient (Customer Portal)

**File**: `src/components/product/ProductDetailClient.tsx`

**Changes Required**:
1. Show per-variant stock status
2. Cross out unavailable options
3. Show "Only X left!" for low stock
4. Disable Add to Cart only when selected variant is out of stock

**Enhanced Stock Display Logic**:
```typescript
// Get stock for selected variant
const selectedVariant = variants.find(v => 
  matchesSelectedOptions(v, selectedOptions)
);

const stockStatus = useMemo(() => {
  if (!selectedVariant) return { available: false, quantity: 0, message: 'Select options' };
  
  const qty = selectedVariant.inventory?.quantity_available || 0;
  
  if (qty === 0) return { available: false, quantity: 0, message: 'Out of Stock' };
  if (qty <= 5) return { available: true, quantity: qty, message: `Only ${qty} left!` };
  return { available: true, quantity: qty, message: 'In Stock' };
}, [selectedVariant]);

// Mark unavailable options
const getOptionAvailability = (attributeId: string, valueId: string) => {
  // Check if any variant with this value has stock > 0
  return variants.some(v => 
    v.attribute_value_ids.includes(valueId) && 
    (v.inventory?.quantity_available || 0) > 0
  );
};
```

**UI Changes**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Volume                                                          │
│ [100ml ✓] [250ml ✓] [500ml ❌]                                  │
│                                                                 │
│ Scent                                                           │
│ [Rose ✓] [Lavender ❌] [Unscented ✓]                           │
│                                                                 │
│ ✓ In Stock (23 available)                                       │
│ ⚠️ Only 3 left! (when low stock)                                │
│ ❌ Out of Stock - Select different options (when unavailable)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4.7 Impact Analysis

### 4.7.1 Files to Modify

| File | Change Type | Risk |
|------|-------------|------|
| `product_attributes` table | Add column | LOW |
| `attribute_values` table | Add column | LOW |
| `update_vendor_product` function | Recreate with SECURITY DEFINER | MEDIUM |
| `src/components/vendor/VariantBuilder.tsx` | Enhance | MEDIUM |
| `src/components/vendor/ProductsPageClient.tsx` | Add edit button | LOW |
| `src/components/product/ProductDetailClient.tsx` | Enhance stock display | LOW |
| `src/app/actions/vendor.ts` | Add new actions | LOW |

### 4.7.2 Files to Create

| File | Purpose |
|------|---------|
| `src/components/vendor/AddAttributeModal.tsx` | Custom attribute creation |
| `src/components/vendor/EditProductModal.tsx` | Full product editing |
| `src/components/vendor/InventoryAdjustmentForm.tsx` | Stock adjustment UI |
| 8 migration files | Database changes |

### 4.7.3 Breaking Changes

**NONE** - All changes are additive:
- New columns are nullable
- New functions don't affect existing ones
- Existing products continue to work with "Default Variant"
- Frontend changes are backward compatible

### 4.7.4 Rollback Plan

**Database Rollback**:
```sql
-- Rollback migrations in reverse order
DROP FUNCTION IF EXISTS public.update_product_variant;
DROP FUNCTION IF EXISTS public.add_product_variant;
DROP FUNCTION IF EXISTS public.update_inventory_quantity;
DROP FUNCTION IF EXISTS public.add_vendor_attribute;

-- Drop new columns
ALTER TABLE product_attributes DROP COLUMN IF EXISTS vendor_id;
ALTER TABLE attribute_values DROP COLUMN IF EXISTS vendor_id;

-- Drop new indexes
DROP INDEX IF EXISTS idx_product_attributes_vendor;
DROP INDEX IF EXISTS idx_attribute_values_vendor;
-- ... other indexes
```

**Frontend Rollback**:
- Revert to previous deployment via Vercel
- Feature flags can disable new UI instantly

---

## 4.8 Security Considerations

### 4.8.1 Authentication & Authorization
- All new functions use `SECURITY DEFINER`
- All functions check `auth.uid()` first
- All functions verify vendor role
- Ownership validation on all operations

### 4.8.2 Input Validation
- Attribute names: `^[a-zA-Z][a-zA-Z0-9_]{0,49}$`
- SKU format: `^[A-Z0-9][A-Z0-9\-_]{0,49}$`
- Price: Must be >= 0
- Quantity: Must be >= 0

### 4.8.3 Audit Trail
- All inventory changes logged to `inventory_movements`
- All product changes logged to `product_change_log`
- Created_by field tracks who made changes

### 4.8.4 Rate Limiting
- 10 custom attributes per vendor (enforced in function)
- 100 variants per product (enforced in function)
- 20 values per attribute (enforced in function)

---

## 4.9 Performance Considerations

### 4.9.1 Indexes Added
- `idx_product_attributes_vendor` - Vendor attribute queries
- `idx_attribute_values_vendor` - Vendor value queries
- `idx_vav_variant_id` - Variant attribute lookups
- `idx_inventory_variant_location` - Inventory queries

### 4.9.2 Query Optimization
- Use `CONCURRENTLY` for index creation (no locks)
- Limit variant count to 100 (prevents explosion)
- Cache attribute data (rarely changes)

### 4.9.3 Concurrency Handling
- Inventory updates use single transaction
- `inventory_movements` provides audit trail for debugging
- Future: Add OCC with version column if needed

---

## 4.10 Testing Strategy

### 4.10.1 Unit Tests
- Test each new RPC function with valid/invalid inputs
- Test input validation regex patterns
- Test ownership verification

### 4.10.2 Integration Tests
- Test complete product creation with custom attributes
- Test inventory adjustment flow
- Test variant add/update/delete flow

### 4.10.3 E2E Tests (Playwright)
- Test vendor creates custom attribute
- Test vendor edits product variants
- Test vendor adjusts inventory
- Test customer sees per-variant stock

### 4.10.4 Backward Compatibility Tests
- Existing products still display correctly
- Existing orders still reference valid variants
- Default Variant products work without attributes

---

## 4.11 Deployment Plan

### Phase 1: Database Migration (Zero Downtime)
1. Apply schema migrations (add columns, indexes)
2. Apply new function migrations
3. Verify via MCP queries

### Phase 2: Backend Deployment
1. Deploy new server actions
2. Test with feature flag (admin only)
3. Monitor for errors

### Phase 3: Frontend Deployment
1. Deploy enhanced VariantBuilder
2. Deploy EditProductModal
3. Deploy enhanced ProductDetailClient
4. Enable for all vendors

### Phase 4: Monitoring & Cleanup
1. Monitor error rates
2. Check performance metrics
3. Remove feature flags
4. Update documentation

---

## 4.12 Phase 4 Completion Checklist

- [x] Approach selected and justified
- [x] Impact analysis complete
- [x] Database migrations designed
- [x] New RPC functions designed
- [x] Server actions designed
- [x] Frontend components designed
- [x] Security considerations documented
- [x] Performance considerations documented
- [x] Testing strategy defined
- [x] Deployment plan created
- [x] Rollback plan documented

---

**Phase 4 Status**: COMPLETE  
**Next Phase**: Blueprint Review (Phase 5)
