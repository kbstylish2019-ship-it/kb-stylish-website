-- =====================================================================
-- CRITICAL PRODUCTION FIX: Add image_url to get_trending_products function
-- =====================================================================
-- Issue: Trending products showing placeholder icons instead of actual images
-- Root Cause: get_trending_products function missing image_url field
-- Solution: Add product_images join and image_url to return table
-- =====================================================================

BEGIN;

-- Drop and recreate the function with image_url support
DROP FUNCTION IF EXISTS public.get_trending_products(INTEGER);

CREATE OR REPLACE FUNCTION public.get_trending_products(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
    product_id UUID,
    name TEXT,
    slug TEXT,
    trend_score NUMERIC,
    source TEXT,
    min_price INTEGER,
    image_url TEXT,  -- ✅ ADDED: Missing image_url field
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
            (
                SELECT pi.image_url 
                FROM public.product_images pi 
                WHERE pi.product_id = p.id 
                ORDER BY pi.sort_order ASC, pi.created_at ASC 
                LIMIT 1
            ) as image_url,  -- ✅ Get primary product image
            p.average_rating,
            p.is_featured
        FROM metrics.product_trending_scores pts
        JOIN public.products p ON pts.product_id = p.id
        JOIN public.product_variants pv ON p.id = pv.product_id AND pv.is_active = TRUE
        WHERE pts.score_date = CURRENT_DATE
          AND pts.trend_score > 1.0  -- Minimum threshold to qualify as "trending"
          AND p.is_active = TRUE
        GROUP BY pts.product_id, p.id, p.name, p.slug, pts.trend_score, p.average_rating, p.is_featured
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
            (
                SELECT pi.image_url 
                FROM public.product_images pi 
                WHERE pi.product_id = p.id 
                ORDER BY pi.sort_order ASC, pi.created_at ASC 
                LIMIT 1
            ) as image_url,  -- ✅ Get primary product image
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
            (
                SELECT pi.image_url 
                FROM public.product_images pi 
                WHERE pi.product_id = p.id 
                ORDER BY pi.sort_order ASC, pi.created_at ASC 
                LIMIT 1
            ) as image_url,  -- ✅ Get primary product image
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
            (
                SELECT pi.image_url 
                FROM public.product_images pi 
                WHERE pi.product_id = p.id 
                ORDER BY pi.sort_order ASC, pi.created_at ASC 
                LIMIT 1
            ) as image_url,  -- ✅ Get primary product image
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

-- Restore permissions
GRANT EXECUTE ON FUNCTION public.get_trending_products TO anon, authenticated;

COMMENT ON FUNCTION public.get_trending_products IS
  'FIXED: Hybrid ranking with image_url support. 4-tier fallback: trending (time-decay) → new arrivals → top rated → any active. Now includes product images for consistent display.';

COMMIT;
