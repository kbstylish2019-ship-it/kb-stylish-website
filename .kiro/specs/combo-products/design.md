# Design Document: Combo Products

## Overview

This design implements a Combo Products feature for KB Stylish that allows the platform owner (KB Stylish vendor) to create product bundles with discounted pricing. The design prioritizes simplicity and minimal system changes by:

1. Treating combos as special products with an `is_combo` flag
2. Using a junction table for combo-product relationships
3. Expanding combos into constituent products at cart-add time
4. Leveraging existing inventory, cart, and order systems

This approach avoids complex coupon systems, new payment flows, or major architectural changes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         COMBO PRODUCTS FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Vendor     │───▶│  Create      │───▶│   products   │          │
│  │   Portal     │    │  Combo       │    │  (is_combo)  │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                             │                    │                   │
│                             ▼                    │                   │
│                      ┌──────────────┐            │                   │
│                      │ combo_items  │◀───────────┘                   │
│                      │ (junction)   │                                │
│                      └──────────────┘                                │
│                             │                                        │
│  ┌──────────────┐          │                                        │
│  │   Customer   │          ▼                                        │
│  │   Storefront │    ┌──────────────┐                               │
│  └──────────────┘    │  Display     │                               │
│         │            │  Combo       │                               │
│         │            └──────────────┘                               │
│         ▼                   │                                        │
│  ┌──────────────┐          │                                        │
│  │  Add to Cart │◀─────────┘                                        │
│  │  (expand)    │                                                   │
│  └──────────────┘                                                   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  cart_items  │───▶│   Checkout   │───▶│ order_items  │          │
│  │ (combo_id)   │    │              │    │ (combo_id)   │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Database Schema Changes

#### 1. Products Table Extension
Add combo-specific fields to the existing `products` table:

```sql
ALTER TABLE products ADD COLUMN is_combo BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN combo_price_cents INTEGER;
ALTER TABLE products ADD COLUMN combo_savings_cents INTEGER;
-- Combo-specific inventory limit (separate from constituent inventory)
ALTER TABLE products ADD COLUMN combo_quantity_limit INTEGER DEFAULT NULL;
ALTER TABLE products ADD COLUMN combo_quantity_sold INTEGER DEFAULT 0;
```

**Combo Inventory Logic**:
- `combo_quantity_limit`: Maximum number of this combo that can be sold (e.g., 3 for launch)
- `combo_quantity_sold`: Counter tracking how many have been purchased
- When `combo_quantity_limit` is NULL, availability is derived from constituent inventory only
- When set, combo is available only if: `combo_quantity_sold < combo_quantity_limit` AND all constituents have inventory

#### 2. New Combo Items Table
Junction table linking combo products to their constituent products:

```sql
CREATE TABLE combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  constituent_product_id UUID NOT NULL REFERENCES products(id),
  constituent_variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(combo_product_id, constituent_variant_id)
);
```

#### 3. Cart Items Extension
Add combo tracking to cart items:

```sql
ALTER TABLE cart_items ADD COLUMN combo_id UUID REFERENCES products(id);
ALTER TABLE cart_items ADD COLUMN combo_group_id UUID;
```

#### 4. Order Items Extension
Add combo tracking to order items:

```sql
ALTER TABLE order_items ADD COLUMN combo_id UUID REFERENCES products(id);
ALTER TABLE order_items ADD COLUMN combo_group_id UUID;
```

### Configuration Constants

```typescript
// src/lib/constants/combo.ts
export const COMBO_CONFIG = {
  // KB Stylish vendor ID - only this vendor can create combos
  AUTHORIZED_VENDOR_ID: '365bd0ab-e135-45c5-bd24-a907de036287',
  
  // Minimum products required for a combo
  MIN_PRODUCTS: 2,
  
  // Maximum products allowed in a combo
  MAX_PRODUCTS: 10,
  
  // Default combo quantity limit for launch (can be overridden per combo)
  DEFAULT_QUANTITY_LIMIT: 10,
} as const;
```

### Database Functions

#### 1. Create Combo Product
```sql
CREATE OR REPLACE FUNCTION create_combo_product(
  p_name TEXT,
  p_description TEXT,
  p_category_id UUID,
  p_combo_price_cents INTEGER,
  p_constituent_items JSONB, -- [{variant_id, quantity, display_order}]
  p_images JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendor_id UUID;
  v_combo_product_id UUID;
  v_total_original_price INTEGER := 0;
  v_item JSONB;
  v_variant RECORD;
BEGIN
  -- Get current user
  v_vendor_id := auth.uid();
  
  -- Authorization check: Only KB Stylish vendor can create combos
  IF v_vendor_id != '365bd0ab-e135-45c5-bd24-a907de036287'::UUID THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only KB Stylish can create combo products');
  END IF;
  
  -- Validate minimum products
  IF jsonb_array_length(p_constituent_items) < 2 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo must have at least 2 products');
  END IF;
  
  -- Calculate total original price and validate all variants belong to this vendor
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_constituent_items)
  LOOP
    SELECT pv.*, p.vendor_id INTO v_variant
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.id = (v_item->>'variant_id')::UUID;
    
    IF v_variant IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid variant ID');
    END IF;
    
    IF v_variant.vendor_id != v_vendor_id THEN
      RETURN jsonb_build_object('success', false, 'message', 'Can only include your own products in combo');
    END IF;
    
    v_total_original_price := v_total_original_price + (v_variant.price * COALESCE((v_item->>'quantity')::INTEGER, 1));
  END LOOP;
  
  -- Create the combo product
  INSERT INTO products (
    vendor_id, name, description, category_id, slug,
    is_combo, combo_price_cents, combo_savings_cents, is_active
  ) VALUES (
    v_vendor_id, p_name, p_description, p_category_id,
    lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')),
    true, p_combo_price_cents, v_total_original_price - p_combo_price_cents, true
  ) RETURNING id INTO v_combo_product_id;
  
  -- Create combo items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_constituent_items)
  LOOP
    INSERT INTO combo_items (combo_product_id, constituent_variant_id, constituent_product_id, quantity, display_order)
    SELECT 
      v_combo_product_id,
      (v_item->>'variant_id')::UUID,
      pv.product_id,
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE((v_item->>'display_order')::INTEGER, 0)
    FROM product_variants pv
    WHERE pv.id = (v_item->>'variant_id')::UUID;
  END LOOP;
  
  -- Handle images (reuse existing image handling)
  -- ... image insertion logic ...
  
  RETURN jsonb_build_object(
    'success', true,
    'combo_id', v_combo_product_id,
    'savings_cents', v_total_original_price - p_combo_price_cents
  );
END;
$$;
```

#### 2. Add Combo to Cart
```sql
CREATE OR REPLACE FUNCTION add_combo_to_cart_secure(
  p_combo_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_combo RECORD;
  v_item RECORD;
  v_combo_group_id UUID;
  v_total_original_price NUMERIC := 0;
  v_discount_ratio NUMERIC;
  v_discounted_price NUMERIC;
  v_available_qty INTEGER;
BEGIN
  -- Validate combo exists and is active
  SELECT * INTO v_combo FROM products WHERE id = p_combo_id AND is_combo = true AND is_active = true;
  IF v_combo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo not found or inactive');
  END IF;
  
  -- Check inventory for all constituent products
  FOR v_item IN 
    SELECT ci.*, pv.price, i.quantity_available
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
  LOOP
    v_available_qty := COALESCE(v_item.quantity_available, 0);
    IF v_available_qty < v_item.quantity THEN
      RETURN jsonb_build_object('success', false, 'message', 'Insufficient inventory for combo');
    END IF;
    v_total_original_price := v_total_original_price + (v_item.price * v_item.quantity);
  END LOOP;
  
  -- Calculate discount ratio
  v_discount_ratio := v_combo.combo_price_cents::NUMERIC / v_total_original_price;
  
  -- Get or create cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
  END IF;
  
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (user_id, session_id)
    VALUES (p_user_id, CASE WHEN p_user_id IS NULL THEN p_guest_token ELSE NULL END)
    RETURNING id INTO v_cart_id;
  END IF;
  
  -- Generate unique group ID for this combo addition
  v_combo_group_id := gen_random_uuid();
  
  -- Add each constituent product to cart with discounted price
  FOR v_item IN 
    SELECT ci.*, pv.price
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
    ORDER BY ci.display_order
  LOOP
    v_discounted_price := ROUND(v_item.price * v_discount_ratio);
    
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot, combo_id, combo_group_id)
    VALUES (v_cart_id, v_item.constituent_variant_id, v_item.quantity, v_discounted_price, p_combo_id, v_combo_group_id);
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'combo_group_id', v_combo_group_id);
END;
$$;
```

#### 3. Remove Combo from Cart
```sql
CREATE OR REPLACE FUNCTION remove_combo_from_cart_secure(
  p_combo_group_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- Get cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
  END IF;
  
  IF v_cart_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cart not found');
  END IF;
  
  -- Remove all items in the combo group
  DELETE FROM cart_items 
  WHERE cart_id = v_cart_id AND combo_group_id = p_combo_group_id
  RETURNING 1 INTO v_deleted_count;
  
  RETURN jsonb_build_object('success', true, 'items_removed', v_deleted_count);
END;
$$;
```

#### 4. Get Combo Availability
```sql
CREATE OR REPLACE FUNCTION get_combo_availability(p_combo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_min_available INTEGER := 999999;
  v_item RECORD;
BEGIN
  FOR v_item IN 
    SELECT ci.quantity as required_qty, COALESCE(i.quantity_available, 0) as available_qty
    FROM combo_items ci
    LEFT JOIN inventory i ON i.variant_id = ci.constituent_variant_id
    WHERE ci.combo_product_id = p_combo_id
  LOOP
    v_min_available := LEAST(v_min_available, FLOOR(v_item.available_qty / v_item.required_qty));
  END LOOP;
  
  RETURN jsonb_build_object(
    'available', v_min_available > 0,
    'max_quantity', GREATEST(0, v_min_available)
  );
END;
$$;
```

### API Endpoints

#### Cart Manager Extension
Extend the existing `cart-manager` edge function to handle combo operations:

```typescript
// Additional actions in cart-manager/index.ts
case 'add_combo':
  if (!combo_id) {
    return errorResponse('combo_id is required');
  }
  response = await addComboToCart(serviceClient, authenticatedUser, guestToken, combo_id);
  break;

case 'remove_combo':
  if (!combo_group_id) {
    return errorResponse('combo_group_id is required');
  }
  response = await removeComboFromCart(serviceClient, authenticatedUser, guestToken, combo_group_id);
  break;
```

### Frontend Components

#### 1. ComboProductCard
Extends ProductCard with combo-specific display:
- COMBO badge
- Original price (crossed out)
- Combo price
- Savings amount/percentage
- "View Bundle" button

#### 2. ComboDetailPage
Shows combo details with:
- Combo images
- Combo name and description
- List of constituent products with individual prices
- Total original price vs combo price
- Add to Cart button

#### 3. CartComboGroup
Groups combo items in cart display:
- Combo name header
- List of constituent products
- Combined quantity controls
- Remove entire combo button

#### 4. VendorComboManager
Vendor portal component for:
- List of vendor's combos
- Create new combo wizard
- Edit existing combos
- Activate/deactivate combos

## Data Models

### Combo Product (Extended Product)
```typescript
interface ComboProduct extends Product {
  is_combo: true;
  combo_price_cents: number;
  combo_savings_cents: number;
  combo_items?: ComboItem[];
}
```

### Combo Item
```typescript
interface ComboItem {
  id: string;
  combo_product_id: string;
  constituent_product_id: string;
  constituent_variant_id: string;
  quantity: number;
  display_order: number;
  // Joined data
  product?: Product;
  variant?: ProductVariant;
}
```

### Cart Item (Extended)
```typescript
interface CartItem {
  // ... existing fields
  combo_id?: string;
  combo_group_id?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Authorization Check
*For any* vendor attempting to create a combo, the operation SHALL succeed if and only if the vendor_id equals the KB Stylish vendor ID.
**Validates: Requirements 1.1, 1.2**

### Property 2: Combo Structure Integrity
*For any* combo product, it SHALL have is_combo = true, a valid combo_price_cents > 0, and combo_savings_cents >= 0.
**Validates: Requirements 2.2, 2.3, 2.4**

### Property 3: Savings Calculation
*For any* combo product, combo_savings_cents SHALL equal the sum of (constituent variant prices times quantities) minus combo_price_cents.
**Validates: Requirements 2.7**

### Property 4: Minimum Products Constraint
*For any* combo creation attempt with fewer than 2 constituent products, the operation SHALL be rejected.
**Validates: Requirements 2.5**

### Property 5: Availability Derivation
*For any* combo product, its availability SHALL be true if and only if all constituent products have sufficient inventory for their required quantities.
**Validates: Requirements 3.1, 3.2**

### Property 6: Cart Expansion
*For any* combo added to cart, the cart SHALL contain one cart_item for each constituent variant, each with the same combo_id and combo_group_id, and with proportionally discounted prices.
**Validates: Requirements 5.1, 5.2, 5.4**

### Property 7: Combo Group Removal
*For any* cart containing combo items, removing one item with a combo_group_id SHALL remove all items with that same combo_group_id.
**Validates: Requirements 5.5**

### Property 8: Inventory Validation on Cart Add
*For any* combo add-to-cart attempt, the operation SHALL fail if any constituent product has insufficient inventory.
**Validates: Requirements 5.6**

### Property 9: Order Item Creation
*For any* order created from a cart containing combo items, order_items SHALL be created for each constituent with the combo_id preserved.
**Validates: Requirements 6.1, 6.3**

### Property 10: Vendor Product Ownership
*For any* combo creation, all constituent products SHALL belong to the same vendor creating the combo.
**Validates: Requirements 7.2**

## Error Handling

### Authorization Errors
- Non-KB-Stylish vendor attempts combo creation: Return 403 with clear message
- Vendor attempts to add other vendor's products: Return 400 with ownership error

### Validation Errors
- Fewer than 2 products: Return 400 with minimum products message
- Invalid variant IDs: Return 400 with specific invalid ID
- Combo price >= original price: Return 400 (no savings)

### Inventory Errors
- Insufficient inventory on cart add: Return 400 with specific product name
- Inventory changed during checkout: Revalidate and show warning

### Cart Errors
- Combo not found: Return 404
- Combo inactive: Return 400 with inactive message

## Testing Strategy

### Unit Tests
- Combo creation validation (authorization, minimum products, ownership)
- Savings calculation accuracy
- Availability calculation logic
- Price distribution algorithm

### Property-Based Tests
Using fast-check for TypeScript:

1. **Authorization Property Test**: Generate random vendor IDs, verify only KB Stylish ID succeeds
2. **Savings Calculation Test**: Generate random combos, verify savings formula
3. **Availability Test**: Generate random inventory states, verify availability logic
4. **Cart Expansion Test**: Generate random combos, verify all items added with correct prices
5. **Group Removal Test**: Generate carts with combos, verify group removal

### Integration Tests
- End-to-end combo creation flow
- Add combo to cart and checkout
- Inventory decrement after purchase
- Cart merge with combo items

### Configuration
- Property tests: Minimum 100 iterations
- Test framework: Jest with fast-check
- Tag format: **Feature: combo-products, Property N: [property_text]**
