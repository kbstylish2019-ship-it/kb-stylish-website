-- =====================================================================
-- ADMIN CATEGORY MANAGEMENT
-- Date: 2025-10-20
-- Purpose: Enable admins to create, update, and manage product categories
-- Security: Admin-only access with full audit trail
-- =====================================================================

-- =====================================================================
-- FUNCTION 1: admin_list_categories()
-- Purpose: List all categories with hierarchy support
-- Security: Admin-only, SECURITY DEFINER
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_list_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '5s'
AS $$
DECLARE
  v_categories jsonb;
BEGIN
  -- Security: Verify admin access
  PERFORM private.assert_admin();
  
  -- Fetch all categories with parent relationship
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'slug', c.slug,
        'parent_id', c.parent_id,
        'description', c.description,
        'image_url', c.image_url,
        'sort_order', c.sort_order,
        'is_active', c.is_active,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'product_count', COALESCE(pc.product_count, 0)
      ) ORDER BY c.sort_order, c.name
    ),
    '[]'::jsonb
  ) INTO v_categories
  FROM categories c
  LEFT JOIN (
    SELECT category_id, COUNT(*)::int as product_count
    FROM products
    WHERE is_active = true
    GROUP BY category_id
  ) pc ON pc.category_id = c.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'categories', v_categories
  );
END;
$$;

COMMENT ON FUNCTION public.admin_list_categories() IS 'List all categories with product counts. Admin-only access.';

-- =====================================================================
-- FUNCTION 2: admin_create_category()
-- Purpose: Create a new category
-- Security: Admin-only, validates slug uniqueness
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_create_category(
  p_name text,
  p_slug text,
  p_parent_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_sort_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_category_id uuid;
  v_slug_exists boolean;
BEGIN
  v_admin_id := auth.uid();
  
  -- Security: Verify admin access
  PERFORM private.assert_admin();
  
  -- Validation: Check required fields
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category name is required'
    );
  END IF;
  
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category slug is required'
    );
  END IF;
  
  -- Validation: Check slug uniqueness
  SELECT EXISTS(
    SELECT 1 FROM categories WHERE slug = p_slug
  ) INTO v_slug_exists;
  
  IF v_slug_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category slug already exists. Please choose a different slug.'
    );
  END IF;
  
  -- Validation: If parent_id provided, verify it exists
  IF p_parent_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM categories WHERE id = p_parent_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Parent category not found'
      );
    END IF;
  END IF;
  
  -- Create category
  INSERT INTO categories (
    name,
    slug,
    parent_id,
    description,
    image_url,
    sort_order,
    is_active
  ) VALUES (
    trim(p_name),
    trim(p_slug),
    p_parent_id,
    trim(p_description),
    trim(p_image_url),
    COALESCE(p_sort_order, 0),
    true
  )
  RETURNING id INTO v_category_id;
  
  -- Audit log
  INSERT INTO user_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    new_values
  ) VALUES (
    v_admin_id,
    'category_created',
    'category',
    v_category_id,
    jsonb_build_object(
      'name', p_name,
      'slug', p_slug,
      'parent_id', p_parent_id
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Category created successfully',
    'category_id', v_category_id
  );
END;
$$;

COMMENT ON FUNCTION public.admin_create_category(text, text, uuid, text, text, integer) IS 'Create a new category. Admin-only access with validation.';

-- =====================================================================
-- FUNCTION 3: admin_update_category()
-- Purpose: Update an existing category
-- Security: Admin-only, prevents slug conflicts
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_update_category(
  p_category_id uuid,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_old_values jsonb;
  v_slug_exists boolean;
BEGIN
  v_admin_id := auth.uid();
  
  -- Security: Verify admin access
  PERFORM private.assert_admin();
  
  -- Validation: Check category exists
  IF NOT EXISTS(SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category not found'
    );
  END IF;
  
  -- Validation: If slug is being changed, check uniqueness
  IF p_slug IS NOT NULL AND trim(p_slug) != '' THEN
    SELECT EXISTS(
      SELECT 1 FROM categories 
      WHERE slug = p_slug 
      AND id != p_category_id
    ) INTO v_slug_exists;
    
    IF v_slug_exists THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Category slug already exists'
      );
    END IF;
  END IF;
  
  -- Validation: Prevent circular parent relationship
  IF p_parent_id IS NOT NULL THEN
    IF p_parent_id = p_category_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Category cannot be its own parent'
      );
    END IF;
  END IF;
  
  -- Get old values for audit
  SELECT to_jsonb(categories.*) INTO v_old_values
  FROM categories
  WHERE id = p_category_id;
  
  -- Update category (only non-null fields)
  UPDATE categories
  SET
    name = COALESCE(trim(p_name), name),
    slug = COALESCE(trim(p_slug), slug),
    parent_id = CASE 
      WHEN p_parent_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL
      ELSE COALESCE(p_parent_id, parent_id)
    END,
    description = CASE
      WHEN p_description = '' THEN NULL
      ELSE COALESCE(trim(p_description), description)
    END,
    image_url = CASE
      WHEN p_image_url = '' THEN NULL
      ELSE COALESCE(trim(p_image_url), image_url)
    END,
    sort_order = COALESCE(p_sort_order, sort_order),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_category_id;
  
  -- Audit log
  INSERT INTO user_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values
  ) VALUES (
    v_admin_id,
    'category_updated',
    'category',
    p_category_id,
    v_old_values,
    jsonb_build_object(
      'name', p_name,
      'slug', p_slug,
      'parent_id', p_parent_id,
      'is_active', p_is_active
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Category updated successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_category(uuid, text, text, uuid, text, text, integer, boolean) IS 'Update category details. Admin-only access with validation.';

-- =====================================================================
-- FUNCTION 4: admin_delete_category()
-- Purpose: Soft delete a category (sets is_active = false)
-- Security: Admin-only, prevents deletion if products exist
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_category(
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_product_count integer;
BEGIN
  v_admin_id := auth.uid();
  
  -- Security: Verify admin access
  PERFORM private.assert_admin();
  
  -- Validation: Check category exists
  IF NOT EXISTS(SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Category not found'
    );
  END IF;
  
  -- Validation: Check for active products
  SELECT COUNT(*)::int INTO v_product_count
  FROM products
  WHERE category_id = p_category_id
  AND is_active = true;
  
  IF v_product_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Cannot delete category with %s active product(s). Please reassign products first.', v_product_count)
    );
  END IF;
  
  -- Soft delete: Set is_active = false
  UPDATE categories
  SET 
    is_active = false,
    updated_at = now()
  WHERE id = p_category_id;
  
  -- Audit log
  INSERT INTO user_audit_log (
    user_id,
    action,
    resource_type,
    resource_id
  ) VALUES (
    v_admin_id,
    'category_deleted',
    'category',
    p_category_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Category deactivated successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_delete_category(uuid) IS 'Soft delete category (deactivate). Admin-only access. Prevents deletion if active products exist.';

-- =====================================================================
-- RLS POLICIES FOR CATEGORIES
-- =====================================================================

-- Enable RLS if not already enabled
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admins can manage all categories" ON categories;
DROP POLICY IF EXISTS "Public can view active categories" ON categories;

-- Policy 1: Admins have full access
CREATE POLICY "Admins can manage all categories"
ON categories
FOR ALL
TO authenticated
USING (
  public.user_has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.user_has_role(auth.uid(), 'admin')
);

-- Policy 2: Public can view active categories
CREATE POLICY "Public can view active categories"
ON categories
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================

-- Grant execute on functions to authenticated users
-- (Functions will check admin role internally)
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_category(text, text, uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_category(uuid, text, text, uuid, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_category(uuid) TO authenticated;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'categories' 
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on categories table';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Category management functions created successfully';
  RAISE NOTICE '✅ RLS policies applied';
  RAISE NOTICE '✅ Ready for admin category management';
END $$;
