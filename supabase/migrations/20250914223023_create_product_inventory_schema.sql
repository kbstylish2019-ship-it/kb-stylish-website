-- KB Stylish Product & Inventory System - Core Schema Migration
-- Production-Grade Blueprint v2.0 Implementation
-- Created: 2025-09-14 22:30:23

-- 1. BRANDS TABLE
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. HIERARCHICAL CATEGORIES
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    description TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(slug, parent_id)
);

-- 3. PRODUCT ATTRIBUTES (Dynamic Attribute System)
CREATE TABLE product_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    attribute_type VARCHAR(20) NOT NULL CHECK (attribute_type IN ('text', 'color', 'number', 'select')),
    is_variant_defining BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

-- 4. ATTRIBUTE VALUES
CREATE TABLE attribute_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id UUID NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
    value VARCHAR(100) NOT NULL,
    display_value VARCHAR(100) NOT NULL,
    color_hex VARCHAR(7),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(attribute_id, value)
);

-- 5. BASE PRODUCTS (Master Product Information)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    short_description VARCHAR(500),
    material TEXT,
    care_instructions TEXT,
    country_of_origin VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    seo_title VARCHAR(200),
    seo_description VARCHAR(300),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, slug)
);

-- 6. PRODUCT VARIANTS (SKUs)
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL UNIQUE,
    barcode VARCHAR(50),
    price DECIMAL(12,2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(12,2) CHECK (compare_at_price >= price),
    cost_price DECIMAL(12,2) CHECK (cost_price >= 0),
    weight_grams INTEGER,
    dimensions_cm VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. VARIANT ATTRIBUTE VALUES (Links variants to their attributes)
CREATE TABLE variant_attribute_values (
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_value_id UUID NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, attribute_value_id)
);

-- 8. INVENTORY LOCATIONS
CREATE TABLE inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. INVENTORY TRACKING
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
    quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    quantity_incoming INTEGER NOT NULL DEFAULT 0 CHECK (quantity_incoming >= 0),
    reorder_point INTEGER DEFAULT 5,
    reorder_quantity INTEGER DEFAULT 20,
    last_counted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(variant_id, location_id)
);

-- 10. INVENTORY MOVEMENTS (Audit Trail)
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (
        movement_type IN ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'damage')
    ),
    quantity_change INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    reference_id UUID,
    reference_type VARCHAR(50),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PRODUCT IMAGES
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(200),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK ((product_id IS NOT NULL AND variant_id IS NULL) OR 
           (product_id IS NULL AND variant_id IS NOT NULL))
);

-- 12. PRODUCT TAGS
CREATE TABLE product_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. PRODUCT TAG ASSIGNMENTS
CREATE TABLE product_tag_assignments (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

-- Performance Indexes
CREATE INDEX idx_products_vendor_active ON products (vendor_id, is_active);
CREATE INDEX idx_products_category_active ON products (category_id, is_active);
CREATE INDEX idx_products_featured ON products (is_featured, is_active) WHERE is_featured = true;
CREATE INDEX idx_variants_product_active ON product_variants (product_id, is_active);
CREATE INDEX idx_variants_sku ON product_variants (sku) WHERE is_active = true;
CREATE INDEX idx_variants_price_range ON product_variants (price, is_active);
CREATE INDEX idx_inventory_variant_location ON inventory (variant_id, location_id);
CREATE INDEX idx_inventory_low_stock ON inventory (variant_id) WHERE quantity_available <= reorder_point;
CREATE INDEX idx_categories_parent_active ON categories (parent_id, is_active);
CREATE INDEX idx_variant_attributes ON variant_attribute_values (attribute_value_id, variant_id);
