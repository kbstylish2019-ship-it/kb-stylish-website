-- KB Stylish Event-Driven Cache Infrastructure
-- Production-Grade Blueprint v2.1 Implementation
-- Created: 2025-09-15 13:37:00
-- Purpose: Enable real-time cache invalidation and incremental materialized view refresh

-- =========================================================================
-- 1. PRODUCT CHANGE LOG TABLE
-- =========================================================================
-- Tracks all product changes for incremental refresh and audit purposes
CREATE TABLE IF NOT EXISTS product_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_type VARCHAR(20) NOT NULL CHECK (
        change_type IN ('INSERT', 'UPDATE', 'DELETE', 'PRICE_CHANGE', 'INVENTORY_CHANGE')
    ),
    changed_fields JSONB,
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES user_profiles(id),
    
    -- Indexes for efficient querying
    INDEX idx_product_changes_time (changed_at DESC),
    INDEX idx_product_changes_product (product_id, changed_at DESC),
    INDEX idx_product_changes_pending (changed_at) WHERE changed_at > NOW() - INTERVAL '5 minutes'
);

-- =========================================================================
-- 2. NOTIFY PRODUCT CHANGE FUNCTION
-- =========================================================================
-- PostgreSQL trigger function for real-time product change notifications
CREATE OR REPLACE FUNCTION notify_product_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    product_slug TEXT;
    vendor_id UUID;
BEGIN
    -- Get the product slug and vendor_id for cache key construction
    IF TG_TABLE_NAME = 'products' THEN
        product_slug := COALESCE(NEW.slug, OLD.slug);
        vendor_id := COALESCE(NEW.vendor_id, OLD.vendor_id);
    ELSIF TG_TABLE_NAME = 'product_variants' THEN
        SELECT p.slug, p.vendor_id INTO product_slug, vendor_id
        FROM products p
        WHERE p.id = COALESCE(NEW.product_id, OLD.product_id);
    END IF;

    -- Build the notification payload
    payload := jsonb_build_object(
        'timestamp', NOW(),
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'product_id', CASE 
            WHEN TG_TABLE_NAME = 'products' THEN COALESCE(NEW.id, OLD.id)
            ELSE COALESCE(NEW.product_id, OLD.product_id)
        END,
        'variant_id', CASE 
            WHEN TG_TABLE_NAME = 'product_variants' THEN COALESCE(NEW.id, OLD.id)
            ELSE NULL
        END,
        'product_slug', product_slug,
        'vendor_id', vendor_id,
        'cache_keys', jsonb_build_array(
            'product:' || product_slug,
            'vendor:' || vendor_id || ':products',
            'category:products'
        )
    );

    -- Log to change table for audit and incremental refresh
    IF TG_OP = 'INSERT' THEN
        INSERT INTO product_change_log (
            product_id,
            variant_id,
            change_type,
            new_values,
            changed_by
        ) VALUES (
            CASE WHEN TG_TABLE_NAME = 'products' THEN NEW.id ELSE NEW.product_id END,
            CASE WHEN TG_TABLE_NAME = 'product_variants' THEN NEW.id ELSE NULL END,
            TG_OP,
            to_jsonb(NEW),
            current_setting('app.current_user_id', true)::UUID
        );
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Detect specific change types for optimized handling
        DECLARE
            change_type_value VARCHAR(20);
        BEGIN
            IF TG_TABLE_NAME = 'product_variants' AND OLD.price != NEW.price THEN
                change_type_value := 'PRICE_CHANGE';
            ELSIF TG_TABLE_NAME = 'inventory' THEN
                change_type_value := 'INVENTORY_CHANGE';
            ELSE
                change_type_value := 'UPDATE';
            END IF;

            INSERT INTO product_change_log (
                product_id,
                variant_id,
                change_type,
                old_values,
                new_values,
                changed_fields,
                changed_by
            ) VALUES (
                CASE WHEN TG_TABLE_NAME = 'products' THEN NEW.id ELSE NEW.product_id END,
                CASE WHEN TG_TABLE_NAME = 'product_variants' THEN NEW.id ELSE NULL END,
                change_type_value,
                to_jsonb(OLD),
                to_jsonb(NEW),
                to_jsonb(
                    ARRAY(
                        SELECT jsonb_object_keys(to_jsonb(NEW)) 
                        EXCEPT 
                        SELECT jsonb_object_keys(to_jsonb(OLD))
                    )
                ),
                current_setting('app.current_user_id', true)::UUID
            );
        END;
        
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO product_change_log (
            product_id,
            variant_id,
            change_type,
            old_values,
            changed_by
        ) VALUES (
            CASE WHEN TG_TABLE_NAME = 'products' THEN OLD.id ELSE OLD.product_id END,
            CASE WHEN TG_TABLE_NAME = 'product_variants' THEN OLD.id ELSE NULL END,
            TG_OP,
            to_jsonb(OLD),
            current_setting('app.current_user_id', true)::UUID
        );
    END IF;

    -- Send real-time notification for cache invalidation
    PERFORM pg_notify('product_changes', payload::text);
    
    -- Also send a targeted notification for the specific product
    PERFORM pg_notify('product:' || product_slug, payload::text);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 3. ATTACH TRIGGERS TO TABLES
-- =========================================================================

-- Trigger for products table
DROP TRIGGER IF EXISTS product_change_trigger ON products;
CREATE TRIGGER product_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW 
    EXECUTE FUNCTION notify_product_change();

-- Trigger for product_variants table
DROP TRIGGER IF EXISTS product_variant_change_trigger ON product_variants;
CREATE TRIGGER product_variant_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON product_variants
    FOR EACH ROW 
    EXECUTE FUNCTION notify_product_change();

-- Trigger for inventory table (for stock changes)
DROP TRIGGER IF EXISTS inventory_change_trigger ON inventory;
CREATE TRIGGER inventory_change_trigger
    AFTER UPDATE OF quantity_available, quantity_reserved ON inventory
    FOR EACH ROW 
    WHEN (OLD.quantity_available IS DISTINCT FROM NEW.quantity_available 
          OR OLD.quantity_reserved IS DISTINCT FROM NEW.quantity_reserved)
    EXECUTE FUNCTION notify_product_change();

-- =========================================================================
-- 4. MATERIALIZED VIEW FOR PRODUCT SEARCH
-- =========================================================================
-- Create the materialized view if it doesn't exist
CREATE MATERIALIZED VIEW IF NOT EXISTS product_search_index AS
SELECT 
    p.id AS product_id,
    p.vendor_id,
    p.slug,
    p.name,
    p.short_description,
    p.is_active,
    p.is_featured,
    p.created_at,
    p.updated_at,
    b.name AS brand_name,
    b.slug AS brand_slug,
    c.name AS category_name,
    c.slug AS category_slug,
    MIN(pv.price) AS min_price,
    MAX(pv.price) AS max_price,
    COUNT(DISTINCT pv.id) AS variant_count,
    COALESCE(SUM(inv.quantity_available), 0) AS total_stock,
    ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS tags,
    ARRAY_AGG(DISTINCT pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images,
    -- Full-text search vector
    to_tsvector('english', 
        COALESCE(p.name, '') || ' ' || 
        COALESCE(p.description, '') || ' ' || 
        COALESCE(b.name, '') || ' ' || 
        COALESCE(c.name, '')
    ) AS search_vector
FROM products p
LEFT JOIN brands b ON p.brand_id = b.id
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
LEFT JOIN inventory inv ON pv.id = inv.variant_id
LEFT JOIN product_tag_assignments pta ON p.id = pta.product_id
LEFT JOIN product_tags t ON pta.tag_id = t.id
LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = true
WHERE p.is_active = true
GROUP BY p.id, p.vendor_id, p.slug, p.name, p.short_description, 
         p.is_active, p.is_featured, p.created_at, p.updated_at,
         b.name, b.slug, c.name, c.slug;

-- Create indexes on the materialized view
CREATE UNIQUE INDEX idx_product_search_index_id ON product_search_index (product_id);
CREATE INDEX idx_product_search_index_slug ON product_search_index (slug);
CREATE INDEX idx_product_search_index_vendor ON product_search_index (vendor_id);
CREATE INDEX idx_product_search_index_category ON product_search_index (category_slug);
CREATE INDEX idx_product_search_index_brand ON product_search_index (brand_slug);
CREATE INDEX idx_product_search_index_price ON product_search_index (min_price, max_price);
CREATE INDEX idx_product_search_index_featured ON product_search_index (is_featured) WHERE is_featured = true;
CREATE INDEX idx_product_search_index_fts ON product_search_index USING gin(search_vector);

-- =========================================================================
-- 5. INCREMENTAL REFRESH FUNCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION refresh_product_search_index_incremental()
RETURNS void AS $$
DECLARE
    affected_products UUID[];
    refresh_start TIMESTAMPTZ;
    refresh_end TIMESTAMPTZ;
BEGIN
    refresh_start := NOW();
    
    -- Get list of products that changed in the last 5 minutes
    SELECT ARRAY_AGG(DISTINCT product_id) INTO affected_products
    FROM product_change_log
    WHERE changed_at > NOW() - INTERVAL '5 minutes';

    -- If there are changes, refresh only those products
    IF array_length(affected_products, 1) > 0 THEN
        -- For small batches (< 100 products), do targeted refresh
        IF array_length(affected_products, 1) < 100 THEN
            -- Delete affected products from the materialized view
            DELETE FROM product_search_index 
            WHERE product_id = ANY(affected_products);
            
            -- Re-insert updated data for affected products
            INSERT INTO product_search_index
            SELECT 
                p.id AS product_id,
                p.vendor_id,
                p.slug,
                p.name,
                p.short_description,
                p.is_active,
                p.is_featured,
                p.created_at,
                p.updated_at,
                b.name AS brand_name,
                b.slug AS brand_slug,
                c.name AS category_name,
                c.slug AS category_slug,
                MIN(pv.price) AS min_price,
                MAX(pv.price) AS max_price,
                COUNT(DISTINCT pv.id) AS variant_count,
                COALESCE(SUM(inv.quantity_available), 0) AS total_stock,
                ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS tags,
                ARRAY_AGG(DISTINCT pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images,
                to_tsvector('english', 
                    COALESCE(p.name, '') || ' ' || 
                    COALESCE(p.description, '') || ' ' || 
                    COALESCE(b.name, '') || ' ' || 
                    COALESCE(c.name, '')
                ) AS search_vector
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
            LEFT JOIN inventory inv ON pv.id = inv.variant_id
            LEFT JOIN product_tag_assignments pta ON p.id = pta.product_id
            LEFT JOIN product_tags t ON pta.tag_id = t.id
            LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = true
            WHERE p.id = ANY(affected_products) AND p.is_active = true
            GROUP BY p.id, p.vendor_id, p.slug, p.name, p.short_description, 
                     p.is_active, p.is_featured, p.created_at, p.updated_at,
                     b.name, b.slug, c.name, c.slug;
        ELSE
            -- For large batches, do a concurrent full refresh
            REFRESH MATERIALIZED VIEW CONCURRENTLY product_search_index;
        END IF;
        
        refresh_end := NOW();
        
        -- Log the refresh
        RAISE NOTICE 'Incremental refresh completed. Products updated: %, Duration: %', 
                     array_length(affected_products, 1), 
                     refresh_end - refresh_start;
    END IF;

    -- Clean up old change log entries
    DELETE FROM product_change_log 
    WHERE changed_at < NOW() - INTERVAL '7 days';
    
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 6. POSTGRESQL FUNCTION FOR GETTING PRODUCT WITH VARIANTS
-- =========================================================================
CREATE OR REPLACE FUNCTION get_product_with_variants(product_slug TEXT)
RETURNS TABLE (
    product JSONB,
    variants JSONB,
    images JSONB,
    inventory JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH product_data AS (
        SELECT 
            jsonb_build_object(
                'id', p.id,
                'vendor_id', p.vendor_id,
                'brand', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug),
                'category', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug),
                'name', p.name,
                'slug', p.slug,
                'description', p.description,
                'short_description', p.short_description,
                'material', p.material,
                'care_instructions', p.care_instructions,
                'country_of_origin', p.country_of_origin,
                'is_active', p.is_active,
                'is_featured', p.is_featured,
                'seo_title', p.seo_title,
                'seo_description', p.seo_description,
                'created_at', p.created_at,
                'updated_at', p.updated_at
            ) AS product_json
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.slug = product_slug AND p.is_active = true
        LIMIT 1
    ),
    variant_data AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', pv.id,
                    'sku', pv.sku,
                    'barcode', pv.barcode,
                    'price', pv.price,
                    'compare_at_price', pv.compare_at_price,
                    'cost_price', pv.cost_price,
                    'weight_grams', pv.weight_grams,
                    'dimensions_cm', pv.dimensions_cm,
                    'is_active', pv.is_active,
                    'attributes', (
                        SELECT jsonb_object_agg(pa.name, av.display_value)
                        FROM variant_attribute_values vav
                        JOIN attribute_values av ON vav.attribute_value_id = av.id
                        JOIN product_attributes pa ON av.attribute_id = pa.id
                        WHERE vav.variant_id = pv.id
                    )
                ) ORDER BY pv.price
            ) AS variants_json
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE p.slug = product_slug AND pv.is_active = true
    ),
    image_data AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', pi.id,
                    'url', pi.image_url,
                    'alt_text', pi.alt_text,
                    'is_primary', pi.is_primary,
                    'sort_order', pi.sort_order,
                    'variant_id', pi.variant_id
                ) ORDER BY pi.sort_order, pi.is_primary DESC
            ) AS images_json
        FROM product_images pi
        JOIN products p ON pi.product_id = p.id OR pi.variant_id IN (
            SELECT id FROM product_variants WHERE product_id = p.id
        )
        WHERE p.slug = product_slug
    ),
    inventory_data AS (
        SELECT 
            jsonb_object_agg(
                inv.variant_id::text,
                jsonb_build_object(
                    'quantity_available', inv.quantity_available,
                    'quantity_reserved', inv.quantity_reserved,
                    'quantity_incoming', inv.quantity_incoming,
                    'location', il.name
                )
            ) AS inventory_json
        FROM inventory inv
        JOIN inventory_locations il ON inv.location_id = il.id
        JOIN product_variants pv ON inv.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE p.slug = product_slug AND il.is_default = true
    )
    SELECT 
        pd.product_json,
        COALESCE(vd.variants_json, '[]'::jsonb),
        COALESCE(id.images_json, '[]'::jsonb),
        COALESCE(ind.inventory_json, '{}'::jsonb)
    FROM product_data pd
    CROSS JOIN variant_data vd
    CROSS JOIN image_data id
    CROSS JOIN inventory_data ind;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 7. SCHEDULED REFRESH (Using pg_cron if available)
-- =========================================================================
-- Note: This requires pg_cron extension to be enabled
-- If pg_cron is not available, use external cron job or Supabase scheduled functions

-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--         -- Schedule incremental refresh every minute
--         PERFORM cron.schedule(
--             'refresh-product-search-index',
--             '* * * * *',
--             'SELECT refresh_product_search_index_incremental();'
--         );
--         
--         -- Schedule full refresh daily at 3 AM
--         PERFORM cron.schedule(
--             'full-refresh-product-search-index',
--             '0 3 * * *',
--             'REFRESH MATERIALIZED VIEW CONCURRENTLY product_search_index;'
--         );
--     END IF;
-- END $$;

-- =========================================================================
-- 8. GRANT PERMISSIONS
-- =========================================================================
-- Grant necessary permissions for the functions and tables
GRANT SELECT ON product_change_log TO authenticated;
GRANT SELECT ON product_search_index TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_product_with_variants TO anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_product_search_index_incremental TO service_role;

-- =========================================================================
-- Migration Complete: Event-Driven Cache Infrastructure v2.1
-- =========================================================================
