-- KB Stylish Product & Inventory System - RLS Security Migration
-- Production-Grade Blueprint v2.0 - Part II Implementation
-- Created: 2025-09-14 22:37:20
-- CRITICAL SECURITY REMEDIATION: Enabling RLS on all 13 product tables

-- Enable RLS on all product tables
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tag_assignments ENABLE ROW LEVEL SECURITY;

-- BRANDS POLICIES
CREATE POLICY "brands_select_all" ON brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "brands_insert_admin" ON brands FOR INSERT TO authenticated 
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "brands_update_admin" ON brands FOR UPDATE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "brands_delete_admin" ON brands FOR DELETE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));

-- CATEGORIES POLICIES
CREATE POLICY "categories_select_active" ON categories FOR SELECT TO authenticated 
    USING (is_active = true OR public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "categories_insert_admin" ON categories FOR INSERT TO authenticated 
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "categories_update_admin" ON categories FOR UPDATE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));

-- PRODUCT ATTRIBUTES POLICIES (Read-only for most users)
CREATE POLICY "product_attributes_select_all" ON product_attributes FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_attributes_insert_admin" ON product_attributes FOR INSERT TO authenticated 
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "product_attributes_update_admin" ON product_attributes FOR UPDATE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));

-- ATTRIBUTE VALUES POLICIES (Read-only for most users)
CREATE POLICY "attribute_values_select_all" ON attribute_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "attribute_values_insert_admin" ON attribute_values FOR INSERT TO authenticated 
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "attribute_values_update_admin" ON attribute_values FOR UPDATE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));

-- PRODUCTS POLICIES (Multi-tenant security)
CREATE POLICY "products_select_active" ON products FOR SELECT TO authenticated 
    USING (
        is_active = true OR 
        vendor_id = auth.uid() OR 
        public.user_has_role(auth.uid(), 'admin') OR
        public.user_has_role(auth.uid(), 'support')
    );

CREATE POLICY "products_insert_vendor" ON products FOR INSERT TO authenticated 
    WITH CHECK (
        public.user_has_role(auth.uid(), 'vendor') AND 
        vendor_id = auth.uid()
    );

CREATE POLICY "products_update_vendor" ON products FOR UPDATE TO authenticated 
    USING (
        (vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
        public.user_has_role(auth.uid(), 'admin')
    );

CREATE POLICY "products_delete_vendor" ON products FOR DELETE TO authenticated 
    USING (
        (vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
        public.user_has_role(auth.uid(), 'admin')
    );

-- PRODUCT VARIANTS POLICIES
CREATE POLICY "variants_select_by_product" ON product_variants FOR SELECT TO authenticated 
    USING (
        is_active = true OR
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                p.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        )
    );

CREATE POLICY "variants_insert_vendor" ON product_variants FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND p.vendor_id = auth.uid()
        ) AND public.user_has_role(auth.uid(), 'vendor')
    );

CREATE POLICY "variants_update_vendor" ON product_variants FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );

CREATE POLICY "variants_delete_vendor" ON product_variants FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );

-- VARIANT ATTRIBUTE VALUES POLICIES
CREATE POLICY "variant_attributes_select_by_variant" ON variant_attribute_values FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND (
                pv.is_active = true OR
                p.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        )
    );

CREATE POLICY "variant_attributes_insert_vendor" ON variant_attribute_values FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND p.vendor_id = auth.uid()
        ) AND public.user_has_role(auth.uid(), 'vendor')
    );

CREATE POLICY "variant_attributes_update_vendor" ON variant_attribute_values FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );

CREATE POLICY "variant_attributes_delete_vendor" ON variant_attribute_values FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );

-- INVENTORY LOCATIONS POLICIES
CREATE POLICY "locations_select_vendor" ON inventory_locations FOR SELECT TO authenticated 
    USING (
        vendor_id = auth.uid() OR 
        public.user_has_role(auth.uid(), 'admin') OR
        public.user_has_role(auth.uid(), 'support')
    );

CREATE POLICY "locations_insert_vendor" ON inventory_locations FOR INSERT TO authenticated 
    WITH CHECK (
        vendor_id = auth.uid() AND 
        public.user_has_role(auth.uid(), 'vendor')
    );

CREATE POLICY "locations_update_vendor" ON inventory_locations FOR UPDATE TO authenticated 
    USING (
        (vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
        public.user_has_role(auth.uid(), 'admin')
    );

CREATE POLICY "locations_delete_vendor" ON inventory_locations FOR DELETE TO authenticated 
    USING (
        (vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
        public.user_has_role(auth.uid(), 'admin')
    );

-- INVENTORY POLICIES (Strict vendor isolation)
CREATE POLICY "inventory_select_vendor" ON inventory FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM inventory_locations il 
            WHERE il.id = location_id AND (
                il.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        )
    );

CREATE POLICY "inventory_insert_vendor" ON inventory FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM inventory_locations il 
            WHERE il.id = location_id AND il.vendor_id = auth.uid()
        ) AND public.user_has_role(auth.uid(), 'vendor')
    );

CREATE POLICY "inventory_update_vendor" ON inventory FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM inventory_locations il 
            WHERE il.id = location_id AND (
                (il.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );

CREATE POLICY "inventory_delete_vendor" ON inventory FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM inventory_locations il 
            WHERE il.id = location_id AND (
                (il.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );

-- INVENTORY MOVEMENTS POLICIES (Audit trail protection)
CREATE POLICY "inventory_movements_select_vendor" ON inventory_movements FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM inventory_locations il 
            WHERE il.id = location_id AND (
                il.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        )
    );

CREATE POLICY "inventory_movements_insert_vendor" ON inventory_movements FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM inventory_locations il 
            WHERE il.id = location_id AND il.vendor_id = auth.uid()
        ) AND public.user_has_role(auth.uid(), 'vendor') AND created_by = auth.uid()
    );

-- No UPDATE or DELETE policies for inventory_movements - audit trail must be immutable

-- PRODUCT IMAGES POLICIES
CREATE POLICY "product_images_select_by_product" ON product_images FOR SELECT TO authenticated 
    USING (
        (product_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                p.is_active = true OR
                p.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        )) OR
        (variant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND (
                pv.is_active = true OR
                p.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        ))
    );

CREATE POLICY "product_images_insert_vendor" ON product_images FOR INSERT TO authenticated 
    WITH CHECK (
        ((product_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND p.vendor_id = auth.uid()
        )) OR
        (variant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND p.vendor_id = auth.uid()
        ))) AND public.user_has_role(auth.uid(), 'vendor')
    );

CREATE POLICY "product_images_update_vendor" ON product_images FOR UPDATE TO authenticated 
    USING (
        ((product_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )) OR
        (variant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )))
    );

CREATE POLICY "product_images_delete_vendor" ON product_images FOR DELETE TO authenticated 
    USING (
        ((product_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )) OR
        (variant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = variant_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )))
    );

-- PRODUCT TAGS POLICIES (Global read, admin manage)
CREATE POLICY "product_tags_select_all" ON product_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_tags_insert_admin" ON product_tags FOR INSERT TO authenticated 
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "product_tags_update_admin" ON product_tags FOR UPDATE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));
CREATE POLICY "product_tags_delete_admin" ON product_tags FOR DELETE TO authenticated 
    USING (public.user_has_role(auth.uid(), 'admin'));

-- PRODUCT TAG ASSIGNMENTS POLICIES
CREATE POLICY "product_tag_assignments_select_by_product" ON product_tag_assignments FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                p.is_active = true OR
                p.vendor_id = auth.uid() OR 
                public.user_has_role(auth.uid(), 'admin') OR
                public.user_has_role(auth.uid(), 'support')
            )
        )
    );

CREATE POLICY "product_tag_assignments_insert_vendor" ON product_tag_assignments FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND p.vendor_id = auth.uid()
        ) AND public.user_has_role(auth.uid(), 'vendor')
    );

CREATE POLICY "product_tag_assignments_delete_vendor" ON product_tag_assignments FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = product_id AND (
                (p.vendor_id = auth.uid() AND public.user_has_role(auth.uid(), 'vendor')) OR
                public.user_has_role(auth.uid(), 'admin')
            )
        )
    );
