-- =====================================================================
-- CURATION ENGINE: Database Functions (Trending & Recommendations)
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1 (Fortress Architecture)
-- Purpose: Core logic for trending products and recommendations
-- Security: SECURITY DEFINER for private functions, SECURITY INVOKER for public
-- CRITICAL FIX: order_items has variant_id (NOT product_id) - must JOIN through product_variants
-- =====================================================================

BEGIN;

-- =====================================================================
-- FUNCTION 1: private.update_product_trending_score
-- =====================================================================
-- Event-driven trending score calculation
-- Called by order worker when orders are created/updated
-- CRITICAL: JOINs through product_variants (order_items.product_id doesn't exist)
-- =====================================================================

CREATE OR REPLACE FUNCTION private.update_product_trending_score(p_product_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, metrics, public, pg_temp
AS $$
DECLARE
    v_order_count_1d INTEGER;
    v_order_count_3d INTEGER;
    v_order_count_7d INTEGER;
    v_order_count_14d INTEGER;
    v_avg_rating NUMERIC;
    v_review_count INTEGER;
    v_score NUMERIC;
BEGIN
    -- Count orders in different time windows
    -- ✅ CRITICAL FIX: JOIN through product_variants (order_items has variant_id, NOT product_id)
    SELECT 
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '1 day' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '3 days' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '7 days' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '14 days' THEN o.id END)
    INTO v_order_count_1d, v_order_count_3d, v_order_count_7d, v_order_count_14d
    FROM public.order_items oi
    JOIN public.product_variants pv ON oi.variant_id = pv.id  -- ✅ CRITICAL JOIN
    JOIN public.orders o ON oi.order_id = o.id
    WHERE pv.product_id = p_product_id  -- ✅ Filter by product_id from variant
      AND o.status IN ('confirmed', 'processing', 'shipped', 'delivered');
    
    -- Get average rating and review count from products table
    SELECT COALESCE(average_rating, 0), COALESCE(review_count, 0)
    INTO v_avg_rating, v_review_count
    FROM public.products
    WHERE id = p_product_id;
    
    -- Calculate time-decay weighted score
    -- Recent orders (1-3 days) weighted 10x more than old orders (14 days)
    v_score := (v_order_count_1d * 5.0) +      -- Last 24h: 5x weight
               (v_order_count_3d * 3.0) +      -- Last 3d: 3x weight
               (v_order_count_7d * 1.5) +      -- Last 7d: 1.5x weight
               (v_order_count_14d * 0.5) +     -- Last 14d: 0.5x weight
               (v_avg_rating * 0.3);            -- Rating boost
    
    -- Idempotent upsert (safe for retries)
    INSERT INTO metrics.product_trending_scores (
        product_id, score_date, 
        order_count_1d, order_count_3d, order_count_7d, order_count_14d,
        trend_score, weighted_rating, review_count, updated_at
    )
    VALUES (
        p_product_id, CURRENT_DATE,
        v_order_count_1d, v_order_count_3d, v_order_count_7d, v_order_count_14d,
        v_score, v_avg_rating, v_review_count, NOW()
    )
    ON CONFLICT (product_id, score_date) DO UPDATE SET
        order_count_1d = EXCLUDED.order_count_1d,
        order_count_3d = EXCLUDED.order_count_3d,
        order_count_7d = EXCLUDED.order_count_7d,
        order_count_14d = EXCLUDED.order_count_14d,
        trend_score = EXCLUDED.trend_score,
        weighted_rating = EXCLUDED.weighted_rating,
        review_count = EXCLUDED.review_count,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION private.update_product_trending_score TO service_role;

COMMENT ON FUNCTION private.update_product_trending_score IS
  'Event-driven trending score update. Called by order worker. CRITICAL: Joins through product_variants since order_items has variant_id (NOT product_id).';

-- =====================================================================
-- FUNCTION 2: public.get_trending_products
-- =====================================================================
-- Hybrid ranking with 4-tier fallback system
-- Tier 1: True trending (recent orders with time-decay)
-- Tier 2: New arrivals (products created in last 30 days)
-- Tier 3: Top rated (products with 3+ reviews)
-- Tier 4: Any active product (final fallback to prevent empty state)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_trending_products(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
    product_id UUID,
    name TEXT,
    slug TEXT,
    trend_score NUMERIC,
    source TEXT,
    min_price INTEGER,
    average_rating NUMERIC,
    is_featured BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, metrics, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH trending AS (
        -- Tier 1: True trending products (with recent orders)
        SELECT 
            pts.product_id,
            p.name,
            p.slug,
            pts.trend_score,
            'trending'::TEXT as source,
            MIN(pv.price)::INTEGER as min_price,
            p.average_rating,
            p.is_featured
        FROM metrics.product_trending_scores pts
        JOIN public.products p ON pts.product_id = p.id
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        WHERE pts.score_date = CURRENT_DATE
          AND pts.trend_score > 1.0  -- Minimum threshold to qualify as "trending"
          AND p.is_active = TRUE
        GROUP BY pts.product_id, p.name, p.slug, pts.trend_score, p.average_rating, p.is_featured
        ORDER BY pts.trend_score DESC
        LIMIT p_limit
    ),
    trending_count AS (
        SELECT COUNT(*) as cnt FROM trending
    ),
    new_arrivals AS (
        -- Tier 2: Recently added products (fallback for sparse data)
        SELECT 
            p.id as product_id,
            p.name,
            p.slug,
            0 as trend_score,
            'new'::TEXT as source,
            MIN(pv.price)::INTEGER as min_price,
            p.average_rating,
            p.is_featured
        FROM public.products p
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.created_at >= NOW() - INTERVAL '30 days'
          AND p.id NOT IN (SELECT product_id FROM trending)
        GROUP BY p.id, p.name, p.slug, p.average_rating, p.is_featured
        ORDER BY p.created_at DESC
        LIMIT p_limit - (SELECT cnt FROM trending_count)
    ),
    top_rated AS (
        -- Tier 3: Top rated products (second fallback)
        SELECT 
            p.id as product_id,
            p.name,
            p.slug,
            0 as trend_score,
            'rated'::TEXT as source,
            MIN(pv.price)::INTEGER as min_price,
            p.average_rating,
            p.is_featured
        FROM public.products p
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.review_count >= 3
          AND p.id NOT IN (SELECT product_id FROM trending)
          AND p.id NOT IN (SELECT product_id FROM new_arrivals)
        GROUP BY p.id, p.name, p.slug, p.average_rating, p.is_featured
        ORDER BY p.average_rating DESC, p.review_count DESC
        LIMIT p_limit - (SELECT cnt FROM trending_count) - (SELECT COUNT(*) FROM new_arrivals)
    ),
    fallback_active AS (
        -- Tier 4: Any active product (final fallback to prevent empty state)
        SELECT 
            p.id as product_id,
            p.name,
            p.slug,
            0 as trend_score,
            'active'::TEXT as source,
            MIN(pv.price)::INTEGER as min_price,
            p.average_rating,
            p.is_featured
        FROM public.products p
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        WHERE p.is_active = TRUE
          AND p.id NOT IN (SELECT product_id FROM trending)
          AND p.id NOT IN (SELECT product_id FROM new_arrivals)
          AND p.id NOT IN (SELECT product_id FROM top_rated)
        GROUP BY p.id, p.name, p.slug, p.average_rating, p.is_featured
        ORDER BY p.created_at DESC
        LIMIT p_limit - (SELECT cnt FROM trending_count) - (SELECT COUNT(*) FROM new_arrivals) - (SELECT COUNT(*) FROM top_rated)
    )
    -- Combine all tiers
    SELECT * FROM trending
    UNION ALL
    SELECT * FROM new_arrivals
    UNION ALL
    SELECT * FROM top_rated
    UNION ALL
    SELECT * FROM fallback_active
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_products TO anon, authenticated;

COMMENT ON FUNCTION public.get_trending_products IS
  'Hybrid ranking with 4-tier fallback: trending (time-decay) → new arrivals → top rated → any active. Guarantees no empty state even with sparse data.';

-- =====================================================================
-- FUNCTION 3: public.get_product_recommendations
-- =====================================================================
-- Self-healing recommendations query
-- Automatically filters out inactive products and out-of-stock items
-- Never shows broken links to users
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_product_recommendations(
    p_source_product_id UUID,
    p_limit INTEGER DEFAULT 4
)
RETURNS TABLE(
    recommendation_id UUID,
    product_id UUID,
    product_name TEXT,
    product_slug TEXT,
    min_price INTEGER,
    display_order INTEGER,
    in_stock BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as recommendation_id,
        p.id as product_id,
        p.name as product_name,
        p.slug as product_slug,
        MIN(pv.price)::INTEGER as min_price,
        r.display_order,
        CASE 
            WHEN SUM(inv.quantity_available) > 0 THEN TRUE 
            ELSE FALSE 
        END as in_stock
    FROM public.product_recommendations r
    JOIN public.products p ON r.recommended_product_id = p.id
    JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
    LEFT JOIN public.inventory inv ON pv.id = inv.variant_id
    WHERE r.source_product_id = p_source_product_id
      AND p.is_active = TRUE  -- ✅ Self-healing: filter inactive products
      AND EXISTS (  -- ✅ Self-healing: filter out-of-stock products
          SELECT 1 FROM public.inventory i
          JOIN public.product_variants v ON i.variant_id = v.id
          WHERE v.product_id = p.id AND i.quantity_available > 0
      )
    GROUP BY r.id, p.id, p.name, p.slug, r.display_order
    ORDER BY r.display_order, r.click_count DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_recommendations TO anon, authenticated;

COMMENT ON FUNCTION public.get_product_recommendations IS
  'Self-healing recommendations query. Auto-filters inactive/out-of-stock products. Never shows broken links to users.';

-- =====================================================================
-- FUNCTION 4: public.get_featured_brands
-- =====================================================================
-- Fetch featured brands with active product counts
-- Only shows brands that have at least 1 active product
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_featured_brands(p_limit INTEGER DEFAULT 6)
RETURNS TABLE(
    brand_id UUID,
    brand_name TEXT,
    brand_slug TEXT,
    logo_url TEXT,
    product_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as brand_id,
        b.name as brand_name,
        b.slug as brand_slug,
        b.logo_url,
        COUNT(p.id) as product_count
    FROM public.brands b
    LEFT JOIN public.products p ON b.id = p.brand_id AND p.is_active = TRUE
    WHERE b.is_featured = TRUE
      AND b.is_active = TRUE
    GROUP BY b.id, b.name, b.slug, b.logo_url
    HAVING COUNT(p.id) > 0  -- Only show brands with active products
    ORDER BY COUNT(p.id) DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_featured_brands TO anon, authenticated;

COMMENT ON FUNCTION public.get_featured_brands IS
  'Fetch featured brands with active product counts. Only brands with at least 1 active product are shown.';

-- =====================================================================
-- FUNCTION 5: public.toggle_brand_featured (Admin)
-- =====================================================================
-- Admin-only function to feature/unfeature brands
-- Self-defending: calls private.assert_admin()
-- Creates audit trail in featured_at/featured_by columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.toggle_brand_featured(
    p_brand_id UUID,
    p_is_featured BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    -- Self-defense: Only admins can feature brands
    PERFORM private.assert_admin();
    
    -- Update brand with audit trail
    UPDATE public.brands
    SET 
        is_featured = p_is_featured,
        featured_at = CASE WHEN p_is_featured THEN NOW() ELSE NULL END,
        featured_by = CASE WHEN p_is_featured THEN auth.uid() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_brand_id;
    
    -- Verify brand exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Brand not found: %', p_brand_id USING ERRCODE = '22023';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_brand_featured FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_brand_featured TO authenticated;

COMMENT ON FUNCTION public.toggle_brand_featured IS
  'Admin-only function to toggle brand featured status. Self-defending with assert_admin(). Creates audit trail.';

-- =====================================================================
-- FUNCTION 6: public.add_product_recommendation (Admin)
-- =====================================================================
-- Admin-only function to create product recommendations
-- Self-defending: calls private.assert_admin()
-- Returns recommendation ID for tracking
-- =====================================================================

CREATE OR REPLACE FUNCTION public.add_product_recommendation(
    p_source_product_id UUID,
    p_recommended_product_id UUID,
    p_display_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_recommendation_id UUID;
BEGIN
    -- Self-defense: Only admins can add recommendations
    PERFORM private.assert_admin();
    
    -- Verify both products exist
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_source_product_id) THEN
        RAISE EXCEPTION 'Source product not found: %', p_source_product_id USING ERRCODE = '22023';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_recommended_product_id) THEN
        RAISE EXCEPTION 'Recommended product not found: %', p_recommended_product_id USING ERRCODE = '22023';
    END IF;
    
    -- Insert recommendation
    INSERT INTO public.product_recommendations (
        source_product_id,
        recommended_product_id,
        display_order,
        recommendation_type,
        created_by
    ) VALUES (
        p_source_product_id,
        p_recommended_product_id,
        p_display_order,
        'manual',
        auth.uid()
    )
    RETURNING id INTO v_recommendation_id;
    
    RETURN v_recommendation_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Recommendation already exists for these products' USING ERRCODE = '23505';
    WHEN check_violation THEN
        RAISE EXCEPTION 'Cannot recommend a product to itself' USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public.add_product_recommendation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_product_recommendation TO authenticated;

COMMENT ON FUNCTION public.add_product_recommendation IS
  'Admin-only function to add product recommendations. Self-defending with assert_admin(). Returns recommendation ID.';

COMMIT;
