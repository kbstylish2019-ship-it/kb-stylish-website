# 🗄️ DATABASE ADAPTATION PLAN
# Schema Modifications for Electrical Shop

**Date**: January 27, 2026  
**Purpose**: Detailed database schema changes  
**Status**: COMPLETE

---

## 📋 OVERVIEW

### Strategy: New Project + Adapted Migrations

1. **Create new Supabase project** (fresh, empty)
2. **Copy migration files** from KB Stylish
3. **Modify migrations** before applying
4. **Apply adapted migrations** to new project
5. **Seed with electrical data** (categories, attributes)

---

## 🔄 MIGRATION ADAPTATION ORDER

### Phase 1: Core Schema (Apply with modifications)

| Original Migration | Action | Notes |
|-------------------|--------|-------|
| `20250914223023_create_product_inventory_schema.sql` | MODIFY | Remove vendor complexity |
| `20250914223720_apply_product_rls_policies.sql` | MODIFY | Simplify RLS |
| `20250914230527_add_role_version_to_users.sql` | KEEP | Auth system |
| `20250914230800_create_jwt_claim_hook.sql` | KEEP | JWT handling |
| `20250914234200_create_user_profile_trigger.sql` | KEEP | User creation |
| `20250915070000_create_refresh_jwt_function.sql` | KEEP | JWT refresh |
| `20250915133700_create_event_driven_cache_infra.sql` | KEEP | Caching |

### Phase 2: Commerce (Apply with modifications)

| Original Migration | Action | Notes |
|-------------------|--------|-------|
| `20250919054600_create_async_commerce_infra.sql` | MODIFY | Remove vendor splits |
| `20250919112800_fix_cart_rls_policies.sql` | KEEP | Cart security |
| `20250919120517_secure_guest_sessions_and_merge.sql` | KEEP | Guest cart |
| `20250919130123_secure_the_secret.sql` | KEEP | Security |
| `20250930073900_create_payment_verification_schema.sql` | KEEP | Payments |

### Phase 3: Trust Engine (Apply as-is)

| Original Migration | Action | Notes |
|-------------------|--------|-------|
| `20250925082200_create_trust_engine_schema.sql` | KEEP | Reviews |
| `20250925093000_trust_engine_review_submission.sql` | KEEP | Review logic |
| `20250925093100_trust_engine_voting_system.sql` | KEEP | Voting |
| `20250925093200_trust_engine_rating_aggregation.sql` | KEEP | Ratings |
| `20250925093300_trust_engine_vendor_reply.sql` | MODIFY | Owner reply |

### Phase 4: Governance (Apply with modifications)

| Original Migration | Action | Notes |
|-------------------|--------|-------|
| `20251007071500_create_metrics_schema.sql` | MODIFY | Single-shop metrics |
| `20251007074500_create_governance_logic.sql` | MODIFY | Owner dashboard |
| `20251012200000_vendor_products_management.sql` | MODIFY | Owner products |

### Phase 5: Skip/Remove

| Original Migration | Action | Reason |
|-------------------|--------|--------|
| `20250923*_booking*.sql` | SKIP | No bookings |
| `20251015*_stylist*.sql` | SKIP | No stylists |
| `20251015*_vendor_application*.sql` | SKIP | No vendor app |
| `20251129*_vendor_documents*.sql` | SKIP | No vendor docs |

---

## 📝 DETAILED SCHEMA MODIFICATIONS

### 1. Products Table

#### Current Schema
```sql
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES user_profiles(id),  -- REMOVE
  name varchar(255) NOT NULL,
  slug varchar(255) UNIQUE NOT NULL,
  description text,
  -- ... other fields
);
```

#### New Schema
```sql
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- vendor_id removed - single owner, no need
  name varchar(255) NOT NULL,
  slug varchar(255) UNIQUE NOT NULL,
  description text,
  short_description text,
  material text,  -- repurpose as "specifications"
  care_instructions text,  -- repurpose as "installation_notes"
  brand varchar(100),  -- ADD for electrical
  model_number varchar(100),  -- ADD for electrical
  warranty_months integer DEFAULT 0,  -- ADD for electrical
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### Migration Script
```sql
-- 00001_adapt_products_for_electrical.sql

-- Remove vendor_id column (if migrating from existing)
-- For new project, just don't include it

-- Add electrical-specific columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand varchar(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_number varchar(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_months integer DEFAULT 0;

-- Rename columns for clarity
ALTER TABLE products RENAME COLUMN material TO specifications;
ALTER TABLE products RENAME COLUMN care_instructions TO installation_notes;

-- Create indexes
CREATE INDEX idx_products_brand ON products(brand) WHERE brand IS NOT NULL;
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = true;
```

---

### 2. RLS Policies

#### Current (Multi-Vendor)
```sql
-- Products readable by all, writable by owner vendor
CREATE POLICY "products_select" ON products
FOR SELECT USING (true);

CREATE POLICY "products_insert" ON products
FOR INSERT WITH CHECK (
  vendor_id = auth.uid() AND
  public.user_has_role(auth.uid(), 'vendor')
);

CREATE POLICY "products_update" ON products
FOR UPDATE USING (
  vendor_id = auth.uid() AND
  public.user_has_role(auth.uid(), 'vendor')
);
```

#### New (Single-Owner)
```sql
-- Products readable by all, writable by admin only
CREATE POLICY "products_select" ON products
FOR SELECT USING (true);

CREATE POLICY "products_insert" ON products
FOR INSERT WITH CHECK (
  public.user_has_role(auth.uid(), 'admin')
);

CREATE POLICY "products_update" ON products
FOR UPDATE USING (
  public.user_has_role(auth.uid(), 'admin')
);

CREATE POLICY "products_delete" ON products
FOR DELETE USING (
  public.user_has_role(auth.uid(), 'admin')
);
```

---

### 3. Inventory Tables

#### Current Schema (Already Perfect!)
```sql
-- These tables are exactly what we need
CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY,
  vendor_id uuid,  -- CHANGE to optional or remove
  name varchar(100),
  address text,
  is_default boolean DEFAULT false
);

CREATE TABLE inventory (
  id uuid PRIMARY KEY,
  variant_id uuid REFERENCES product_variants(id),
  location_id uuid REFERENCES inventory_locations(id),
  quantity_available integer DEFAULT 0,
  quantity_reserved integer DEFAULT 0,
  reorder_point integer DEFAULT 10,
  reorder_quantity integer DEFAULT 50
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY,
  variant_id uuid,
  location_id uuid,
  movement_type varchar(20),  -- purchase, sale, adjustment, transfer, return, damage
  quantity_change integer,
  quantity_after integer,
  reference_id uuid,  -- order_id, purchase_order_id, etc.
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
```

#### Enhancements for Electrical Shop
```sql
-- Add supplier tracking to movements
ALTER TABLE inventory_movements 
ADD COLUMN supplier_name varchar(255),
ADD COLUMN supplier_invoice varchar(100),
ADD COLUMN unit_cost_cents integer;

-- Add purchase orders table (optional enhancement)
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name varchar(255) NOT NULL,
  supplier_contact text,
  order_date date NOT NULL,
  expected_delivery date,
  status varchar(20) DEFAULT 'pending',  -- pending, received, partial, cancelled
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id),
  quantity_ordered integer NOT NULL,
  quantity_received integer DEFAULT 0,
  unit_cost_cents integer,
  created_at timestamptz DEFAULT now()
);

-- RLS for purchase orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_admin" ON purchase_orders
FOR ALL USING (public.user_has_role(auth.uid(), 'admin'));
```

---

### 4. Categories (Reseed)

#### Electrical Shop Categories
```sql
-- Clear existing and insert electrical categories
TRUNCATE categories CASCADE;

INSERT INTO categories (id, name, slug, description, parent_id, sort_order, is_active) VALUES
-- Main categories
(gen_random_uuid(), 'Wiring & Cables', 'wiring-cables', 'Electrical wires, cables, and conduits', NULL, 1, true),
(gen_random_uuid(), 'Switches & Sockets', 'switches-sockets', 'Wall switches, power sockets, and outlets', NULL, 2, true),
(gen_random_uuid(), 'Lighting', 'lighting', 'Bulbs, fixtures, and LED solutions', NULL, 3, true),
(gen_random_uuid(), 'Circuit Protection', 'circuit-protection', 'MCBs, RCCBs, and distribution boards', NULL, 4, true),
(gen_random_uuid(), 'Motors & Pumps', 'motors-pumps', 'Electric motors and water pumps', NULL, 5, true),
(gen_random_uuid(), 'Fans', 'fans', 'Ceiling fans, exhaust fans, and table fans', NULL, 6, true),
(gen_random_uuid(), 'Tools & Accessories', 'tools-accessories', 'Electrical tools and installation accessories', NULL, 7, true),
(gen_random_uuid(), 'Solar & Energy', 'solar-energy', 'Solar panels, inverters, and batteries', NULL, 8, true);

-- Subcategories (example for Wiring)
WITH parent AS (SELECT id FROM categories WHERE slug = 'wiring-cables')
INSERT INTO categories (name, slug, description, parent_id, sort_order, is_active)
SELECT name, slug, description, parent.id, sort_order, true
FROM parent, (VALUES
  ('House Wiring', 'house-wiring', 'Copper wires for home electrical', 1),
  ('Flexible Cables', 'flexible-cables', 'Multi-core flexible cables', 2),
  ('Armoured Cables', 'armoured-cables', 'Underground and industrial cables', 3),
  ('Conduits & Pipes', 'conduits-pipes', 'PVC and metal conduits', 4),
  ('Cable Accessories', 'cable-accessories', 'Lugs, connectors, ties', 5)
) AS sub(name, slug, description, sort_order);

-- Similar subcategories for other main categories...
```

---

### 5. Product Attributes (Seed Electrical)

#### Electrical-Specific Attributes
```sql
-- Clear vendor-specific attributes, add electrical ones
-- Keep Color as global (useful for wires, switches)

-- Global electrical attributes
INSERT INTO product_attributes (name, display_name, attribute_type, is_variant_defining, vendor_id, sort_order, is_active) VALUES
('voltage', 'Voltage Rating', 'select', true, NULL, 1, true),
('wattage', 'Wattage', 'select', true, NULL, 2, true),
('amperage', 'Amperage', 'select', true, NULL, 3, true),
('wire_gauge', 'Wire Gauge (sq mm)', 'select', true, NULL, 4, true),
('phase', 'Phase', 'select', false, NULL, 5, true),
('ip_rating', 'IP Rating', 'select', false, NULL, 6, true),
('brand', 'Brand', 'select', false, NULL, 7, true),
('pack_size', 'Pack Size', 'select', true, NULL, 8, true);

-- Attribute values for Voltage
WITH attr AS (SELECT id FROM product_attributes WHERE name = 'voltage')
INSERT INTO attribute_values (attribute_id, value, display_value, sort_order, is_active)
SELECT attr.id, value, display_value, sort_order, true
FROM attr, (VALUES
  ('220v', '220V AC', 1),
  ('240v', '240V AC', 2),
  ('110v', '110V AC', 3),
  ('12v', '12V DC', 4),
  ('24v', '24V DC', 5),
  ('48v', '48V DC', 6),
  ('380v', '380V (3-Phase)', 7),
  ('440v', '440V (3-Phase)', 8)
) AS vals(value, display_value, sort_order);

-- Attribute values for Wattage
WITH attr AS (SELECT id FROM product_attributes WHERE name = 'wattage')
INSERT INTO attribute_values (attribute_id, value, display_value, sort_order, is_active)
SELECT attr.id, value, display_value, sort_order, true
FROM attr, (VALUES
  ('5w', '5W', 1),
  ('7w', '7W', 2),
  ('9w', '9W', 3),
  ('12w', '12W', 4),
  ('15w', '15W', 5),
  ('18w', '18W', 6),
  ('20w', '20W', 7),
  ('40w', '40W', 8),
  ('60w', '60W', 9),
  ('100w', '100W', 10),
  ('200w', '200W', 11),
  ('500w', '500W', 12),
  ('1000w', '1000W (1kW)', 13),
  ('1500w', '1500W (1.5kW)', 14),
  ('2000w', '2000W (2kW)', 15)
) AS vals(value, display_value, sort_order);

-- Wire Gauge (common in Nepal/India)
WITH attr AS (SELECT id FROM product_attributes WHERE name = 'wire_gauge')
INSERT INTO attribute_values (attribute_id, value, display_value, sort_order, is_active)
SELECT attr.id, value, display_value, sort_order, true
FROM attr, (VALUES
  ('0.75', '0.75 sq mm', 1),
  ('1.0', '1.0 sq mm', 2),
  ('1.5', '1.5 sq mm', 3),
  ('2.5', '2.5 sq mm', 4),
  ('4.0', '4.0 sq mm', 5),
  ('6.0', '6.0 sq mm', 6),
  ('10.0', '10.0 sq mm', 7),
  ('16.0', '16.0 sq mm', 8),
  ('25.0', '25.0 sq mm', 9)
) AS vals(value, display_value, sort_order);

-- Amperage for MCBs/Switches
WITH attr AS (SELECT id FROM product_attributes WHERE name = 'amperage')
INSERT INTO attribute_values (attribute_id, value, display_value, sort_order, is_active)
SELECT attr.id, value, display_value, sort_order, true
FROM attr, (VALUES
  ('6a', '6A', 1),
  ('10a', '10A', 2),
  ('16a', '16A', 3),
  ('20a', '20A', 4),
  ('25a', '25A', 5),
  ('32a', '32A', 6),
  ('40a', '40A', 7),
  ('63a', '63A', 8),
  ('100a', '100A', 9)
) AS vals(value, display_value, sort_order);

-- Brands (common in Nepal)
WITH attr AS (SELECT id FROM product_attributes WHERE name = 'brand')
INSERT INTO attribute_values (attribute_id, value, display_value, sort_order, is_active)
SELECT attr.id, value, display_value, sort_order, true
FROM attr, (VALUES
  ('havells', 'Havells', 1),
  ('anchor', 'Anchor by Panasonic', 2),
  ('polycab', 'Polycab', 3),
  ('finolex', 'Finolex', 4),
  ('legrand', 'Legrand', 5),
  ('schneider', 'Schneider Electric', 6),
  ('philips', 'Philips', 7),
  ('crompton', 'Crompton', 8),
  ('bajaj', 'Bajaj', 9),
  ('orient', 'Orient', 10),
  ('syska', 'Syska', 11),
  ('wipro', 'Wipro', 12),
  ('other', 'Other', 99)
) AS vals(value, display_value, sort_order);
```

---

### 6. User Roles Simplification

#### Current Roles
```
admin, vendor, customer, stylist
```

#### New Roles
```
admin (shop owner), customer
```

#### Migration
```sql
-- Remove unused roles
DELETE FROM user_roles WHERE role IN ('vendor', 'stylist');

-- Update role checks in functions
-- Replace: user_has_role(auth.uid(), 'vendor')
-- With: user_has_role(auth.uid(), 'admin')
```

---

### 7. Shop Settings Table (Replaces vendor_profiles)

```sql
-- New table for shop configuration
CREATE TABLE shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name varchar(255) NOT NULL DEFAULT 'ElectroPro',
  tagline text,
  logo_url text,
  contact_email varchar(255),
  contact_phone varchar(20),
  address text,
  city varchar(100),
  
  -- Business info
  pan_number varchar(20),
  registration_number varchar(50),
  
  -- Operational settings
  min_order_amount_cents integer DEFAULT 0,
  delivery_fee_cents integer DEFAULT 0,
  free_delivery_threshold_cents integer,
  
  -- Working hours
  opening_time time DEFAULT '09:00',
  closing_time time DEFAULT '18:00',
  working_days text[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday'],
  
  -- Social media
  facebook_url text,
  instagram_url text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Single row constraint
CREATE UNIQUE INDEX shop_settings_singleton ON shop_settings ((true));

-- Initial settings
INSERT INTO shop_settings (shop_name, tagline) VALUES (
  'ElectroPro',
  'Your Trusted Electrical Equipment Partner'
);

-- RLS
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_settings_read" ON shop_settings
FOR SELECT USING (true);  -- Everyone can read

CREATE POLICY "shop_settings_write" ON shop_settings
FOR ALL USING (public.user_has_role(auth.uid(), 'admin'));
```

---

### 8. Metrics Simplification

#### Current (Multi-Vendor)
```sql
metrics.vendor_daily (vendor_id, day, ...)
metrics.platform_daily (day, ...)
```

#### New (Single-Shop)
```sql
-- Just use platform_daily, rename to shop_daily
ALTER TABLE metrics.platform_daily RENAME TO shop_daily;

-- Remove vendor_daily or keep for future multi-location analytics
-- If keeping, rename vendor_id to location_id
ALTER TABLE metrics.vendor_daily RENAME TO location_daily;
ALTER TABLE metrics.location_daily RENAME COLUMN vendor_id TO location_id;
```

---

## 📊 COMPLETE MIGRATION FILE LIST

### New Project Migrations (In Order)

```
migrations/
├── 00001_create_extensions.sql
├── 00002_create_schemas.sql
├── 00003_create_auth_hooks.sql
├── 00004_create_user_system.sql
├── 00005_create_category_system.sql
├── 00006_create_product_system.sql
├── 00007_create_inventory_system.sql
├── 00008_create_cart_system.sql
├── 00009_create_order_system.sql
├── 00010_create_payment_system.sql
├── 00011_create_review_system.sql
├── 00012_create_metrics_system.sql
├── 00013_create_support_system.sql
├── 00014_create_shop_settings.sql
├── 00015_create_rls_policies.sql
├── 00016_create_functions.sql
├── 00017_create_triggers.sql
├── 00018_seed_categories.sql
├── 00019_seed_attributes.sql
├── 00020_seed_shop_settings.sql
└── 00021_create_indexes.sql
```

---

## ⏱️ ESTIMATED TIME

| Task | Hours |
|------|-------|
| Review existing migrations | 1-2 |
| Create adapted migration files | 3-4 |
| Apply to new Supabase project | 0.5 |
| Seed categories and attributes | 1 |
| Test schema with sample data | 1-2 |
| **TOTAL** | **6-10 hours** |

---

**Document Status**: COMPLETE  
**Next Document**: `04_FRONTEND_ADAPTATION_PLAN.md`
