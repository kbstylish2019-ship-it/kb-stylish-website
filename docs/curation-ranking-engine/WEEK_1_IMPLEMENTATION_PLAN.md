# 🏗️ CURATION ENGINE - WEEK 1 FOUNDATION IMPLEMENTATION PLAN

**Date**: October 17, 2025  
**Status**: PRE-EXECUTION ANALYSIS COMPLETE  
**Mission**: Implement database foundation for Blueprint v2.1 (Fortress Architecture)  

---

## 📋 EXECUTIVE SUMMARY

### What We're Building (Week 1)
- ✅ 4 new database tables (product_recommendations, metrics.product_trending_scores, curation_events, + 1 column in brands)
- ✅ 6 new database functions (trending, recommendations, featured brands, admin RPCs)
- ✅ All RLS policies and security measures
- ✅ Proper indexes for performance

### What Already Exists (NO DUPLICATES)
- ✅ `brands` table with `is_featured` column ALREADY EXISTS (line 70 of 20250914223023_create_product_inventory_schema.sql)
- ✅ `products` table with `average_rating` and `review_count` columns ALREADY EXIST (added in 20250925082200_create_trust_engine_schema.sql)
- ✅ `metrics` schema ALREADY EXISTS (created in 20251007071500_create_metrics_schema.sql)
- ✅ `private` schema and `private.assert_admin()` function ALREADY EXIST (created in 20250919130123_secure_the_secret.sql)

---

## 🚨 CRITICAL SCHEMA DISCREPANCY DETECTED

### BLOCKER #1: order_items.product_id DOES NOT EXIST

**Blueprint v2.1 Assumption (WRONG)**:
```sql
-- Blueprint assumes this:
FROM public.order_items oi
WHERE oi.product_id = p_product_id  -- ❌ COLUMN DOES NOT EXIST
```

**Actual Schema Reality**:
```sql
-- order_items table structure (from 20250919054600_create_async_commerce_infra.sql):
CREATE TABLE public.order_items (
    id UUID,
    order_id UUID,
    variant_id UUID,  -- ✅ HAS variant_id
    vendor_id UUID,
    quantity INTEGER,
    price_at_purchase DECIMAL(12,2),
    -- NO product_id column ❌
);
```

**Fix Required**: JOIN through `product_variants` table:
```sql
-- CORRECT query:
FROM public.order_items oi
JOIN public.product_variants pv ON oi.variant_id = pv.id
WHERE pv.product_id = p_product_id  -- ✅ CORRECT
```

**Impact**: ALL trending score functions must use this join pattern.

---

## 📊 FINAL SCHEMA & LOGIC SPECIFICATION

### Migration 1: SKIP - brands.is_featured Already Exists

**STATUS**: ✅ **NO ACTION NEEDED**

The `brands` table already has `is_featured` column (created in initial schema migration).

**Evidence**:
- File: `supabase/migrations/20250914223023_create_product_inventory_schema.sql`
- Line 70: `is_featured BOOLEAN DEFAULT false`

**Decision**: We will ADD audit columns (`featured_at`, `featured_by`) but NOT the is_featured column itself.

---

### Migration 2: Create product_recommendations Table

**File**: `20251017120000_create_product_recommendations.sql`

```sql
-- =====================================================================
-- CURATION ENGINE: Product Recommendations (Complete the Look)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    recommended_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    recommendation_type TEXT NOT NULL DEFAULT 'manual' 
        CHECK (recommendation_type IN ('manual', 'algorithmic', 'purchased_together')),
    recommendation_reason TEXT,
    click_count INTEGER NOT NULL DEFAULT 0,
    conversion_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Integrity constraints
    CONSTRAINT no_self_recommendation CHECK (source_product_id != recommended_product_id),
    CONSTRAINT unique_recommendation UNIQUE (source_product_id, recommended_product_id)
);

-- Indexes
CREATE INDEX idx_recommendations_source 
  ON public.product_recommendations(source_product_id, display_order);

CREATE INDEX idx_recommendations_recommended 
  ON public.product_recommendations(recommended_product_id);

CREATE INDEX idx_recommendations_performance 
  ON public.product_recommendations(click_count DESC, conversion_count DESC);

-- Enable RLS
ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read recommendations
CREATE POLICY recommendations_public_read
ON public.product_recommendations
FOR SELECT
TO anon, authenticated
USING (true);

-- RLS: Only admins can write
CREATE POLICY recommendations_admin_write
ON public.product_recommendations
FOR ALL
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'))
WITH CHECK (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.product_recommendations IS 
  'Manual and algorithmic product recommendations for \"Complete the Look\". Self-healing queries auto-filter inactive/out-of-stock products.';

COMMIT;
```

---

### Migration 3: Create metrics.product_trending_scores

**File**: `20251017120100_create_product_trending_scores.sql`

```sql
-- =====================================================================
-- CURATION ENGINE: Product Trending Scores (Event-Driven Aggregates)
-- =====================================================================
-- Replaces materialized view with incremental aggregates
-- Follows proven pattern from metrics.vendor_daily
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS metrics.product_trending_scores (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    score_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Time-windowed order counts
    order_count_1d INTEGER NOT NULL DEFAULT 0,
    order_count_3d INTEGER NOT NULL DEFAULT 0,
    order_count_7d INTEGER NOT NULL DEFAULT 0,
    order_count_14d INTEGER NOT NULL DEFAULT 0,
    
    -- Calculated trend score (time-decay weighted)
    trend_score NUMERIC NOT NULL DEFAULT 0,
    
    -- Supporting metrics
    weighted_rating NUMERIC NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    
    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (product_id, score_date),
    CONSTRAINT trending_scores_date_not_future CHECK (score_date <= CURRENT_DATE)
);

-- Indexes
CREATE INDEX idx_trending_scores_date_score 
  ON metrics.product_trending_scores(score_date, trend_score DESC);

CREATE INDEX idx_trending_scores_product 
  ON metrics.product_trending_scores(product_id, score_date DESC);

CREATE INDEX idx_trending_scores_today 
  ON metrics.product_trending_scores(trend_score DESC) 
  WHERE score_date = CURRENT_DATE;

-- Enable RLS
ALTER TABLE metrics.product_trending_scores ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read (public trending data)
CREATE POLICY trending_scores_public_read
ON metrics.product_trending_scores
FOR SELECT
TO anon, authenticated
USING (true);

-- RLS: Only service_role can write (via functions)
CREATE POLICY trending_scores_service_write
ON metrics.product_trending_scores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE metrics.product_trending_scores IS
  'Incrementally updated trending scores. Event-driven updates on order creation. Time-decay: recent orders 10x more valuable than old orders.';

COMMIT;
```

---

### Migration 4: Create curation_events Table

**File**: `20251017120200_create_curation_events.sql`

```sql
-- =====================================================================
-- CURATION ENGINE: Event Tracking (Analytics)
-- =====================================================================
-- Tracks user interactions with curated content
-- Enables CTR, conversion tracking, ROI measurement
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.curation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event classification
    event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'add_to_cart', 'purchase')),
    curation_type TEXT NOT NULL CHECK (curation_type IN (
        'trending_products', 
        'featured_brands', 
        'product_recommendations', 
        'top_stylists'
    )),
    
    -- Target identification
    source_id UUID,  -- For recommendations: source product_id
    target_id UUID,  -- Clicked product_id or brand_id
    
    -- User identification
    user_id UUID REFERENCES auth.users(id),
    session_id TEXT,  -- For anonymous users
    
    -- Metadata
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_curation_events_type_date 
  ON public.curation_events(curation_type, event_type, created_at DESC);

CREATE INDEX idx_curation_events_source 
  ON public.curation_events(source_id, target_id, event_type);

CREATE INDEX idx_curation_events_target 
  ON public.curation_events(target_id, event_type, created_at DESC);

CREATE INDEX idx_curation_events_date_only 
  ON public.curation_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.curation_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can insert their own events
CREATE POLICY curation_events_insert
ON public.curation_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);  -- Allow all inserts (tracking)

-- RLS: Only admins can read
CREATE POLICY curation_events_admin_read
ON public.curation_events
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.curation_events IS
  'Event tracking for curation features. Measures CTR, conversion rates, ROI of curation.';

COMMIT;
```

---

### Migration 5: Add brands audit columns

**File**: `20251017120300_add_brands_featured_audit.sql`

```sql
-- =====================================================================
-- CURATION ENGINE: Add audit columns to brands table
-- =====================================================================
-- Note: is_featured column already exists from initial schema
-- We're only adding audit tracking columns
-- =====================================================================

BEGIN;

-- Add audit columns (is_featured already exists)
ALTER TABLE public.brands 
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured_by UUID REFERENCES auth.users(id);

-- Add partial index for featured brands (performance)
CREATE INDEX IF NOT EXISTS idx_brands_featured_audit 
ON public.brands (id, name, logo_url, featured_at, featured_by) 
WHERE is_featured = TRUE AND is_active = TRUE;

COMMENT ON COLUMN public.brands.featured_at IS 'Timestamp when brand was featured. NULL if never featured.';
COMMENT ON COLUMN public.brands.featured_by IS 'Admin user who featured this brand. For audit trail.';

COMMIT;
```

---

## ⚙️ DATABASE FUNCTIONS SPECIFICATION

### Function 1: private.update_product_trending_score

**File**: `20251017120400_create_trending_functions.sql`

```sql
-- =====================================================================
-- FUNCTION: Update product trending score (event-driven)
-- =====================================================================
-- CRITICAL FIX: Uses variant_id join (order_items doesn't have product_id)
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
    -- ✅ CRITICAL: JOIN through product_variants (order_items has variant_id, not product_id)
    SELECT 
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '1 day' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '3 days' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '7 days' THEN o.id END),
        COUNT(DISTINCT CASE WHEN o.created_at > NOW() - INTERVAL '14 days' THEN o.id END)
    INTO v_order_count_1d, v_order_count_3d, v_order_count_7d, v_order_count_14d
    FROM public.order_items oi
    JOIN public.product_variants pv ON oi.variant_id = pv.id  -- ✅ CRITICAL JOIN
    JOIN public.orders o ON oi.order_id = o.id
    WHERE pv.product_id = p_product_id  -- ✅ Correct filter
      AND o.status IN ('confirmed', 'processing', 'shipped', 'delivered');
    
    -- Get average rating and review count
    SELECT COALESCE(average_rating, 0), COALESCE(review_count, 0)
    INTO v_avg_rating, v_review_count
    FROM public.products
    WHERE id = p_product_id;
    
    -- Calculate time-decay weighted score
    -- Recent orders weighted 10x more than old orders
    v_score := (v_order_count_1d * 5.0) +      -- Last 24h: 5x weight
               (v_order_count_3d * 3.0) +      -- Last 3d: 3x weight
               (v_order_count_7d * 1.5) +      -- Last 7d: 1.5x weight
               (v_order_count_14d * 0.5) +     -- Last 14d: 0.5x weight
               (v_avg_rating * 0.3);            -- Rating boost
    
    -- Idempotent upsert
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
  'Event-driven trending score update. Called by order worker. CRITICAL: Joins through product_variants since order_items has variant_id.';
```

---

### Function 2: public.get_trending_products (Hybrid Ranking)

**Critical Pre-Mortem Issue**: What if all 3 tiers return 0 products (sparse data + no new arrivals + no reviews)?

**Fix**: Add fallback to "Recently Active" products (any product with is_active=true).

```sql
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
        -- Tier 1: True trending (recent orders)
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
          AND pts.trend_score > 1.0
          AND p.is_active = TRUE
        GROUP BY pts.product_id, p.name, p.slug, pts.trend_score, p.average_rating, p.is_featured
        ORDER BY pts.trend_score DESC
        LIMIT p_limit
    ),
    trending_count AS (
        SELECT COUNT(*) as cnt FROM trending
    ),
    new_arrivals AS (
        -- Tier 2: Recently added products
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
        -- Tier 3: Top rated products
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
        -- Tier 4: Any active product (final fallback)
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
```

---

### Remaining Functions (3-6)

See BLUEPRINT_V2_1_FORTRESS_ARCHITECTURE.md for:
- `public.get_product_recommendations()` (self-healing)
- `public.get_featured_brands()`
- `public.toggle_brand_featured()` (admin)
- `public.add_product_recommendation()` (admin)

---

## 🔬 FAANG PRE-MORTEM AUDIT

### CRITICAL FLAW #1: order_items Schema Mismatch

**Severity**: 🔴 **BLOCKER**

**Problem**: Blueprint assumes `order_items.product_id` exists. It doesn't.

**Fix Applied**: All trending queries now JOIN through `product_variants` table.

---

### CRITICAL FLAW #2: Empty Trending Fallback

**Severity**: 🟡 **MEDIUM**

**Problem**: Original hybrid ranking has 3 tiers. What if all return 0 products?
- Trending: 0 (no orders in 14 days)
- New Arrivals: 0 (no products created in 30 days)
- Top Rated: 0 (no products with 3+ reviews)
- **Result**: Empty homepage section ❌

**Fix Applied**: Added Tier 4 "Any Active Product" fallback.

---

### CRITICAL FLAW #3: Performance on Large Datasets

**Severity**: 🟢 **LOW** (but needs monitoring)

**Problem**: `get_trending_products()` uses 4 CTEs with `NOT IN` subqueries. At 10K products, this could be slow.

**Current Mitigation**:
- Indexed lookups on product_id
- All tables have proper indexes
- Early LIMIT in each CTE

**Future Optimization** (if needed):
- Replace `NOT IN` with anti-joins (`LEFT JOIN ... WHERE id IS NULL`)
- Cache result in Redis (5-min TTL)

---

## ✅ PRE-EXECUTION VERIFICATION CHECKLIST

### Schema Dependencies
- [x] `brands` table exists with `is_featured` column
- [x] `products` table has `average_rating`, `review_count` columns
- [x] `product_variants` table exists (for join in trending functions)
- [x] `order_items` table has `variant_id` column (NOT product_id)
- [x] `orders` table exists with `status` column
- [x] `metrics` schema exists
- [x] `private` schema exists
- [x] `private.assert_admin()` function exists
- [x] `public.user_has_role()` function exists

### Security Dependencies
- [x] RLS policies exist on orders, products, variants
- [x] Auth system properly configured
- [x] JWT claims include user roles

### Function Dependencies
- [x] No circular dependencies detected
- [x] All referenced tables exist
- [x] All FK constraints valid

---

## 🚀 EXECUTION PLAN

### Step 1: Create Migration Files (5 files)
1. `20251017120000_create_product_recommendations.sql`
2. `20251017120100_create_product_trending_scores.sql`
3. `20251017120200_create_curation_events.sql`
4. `20251017120300_add_brands_featured_audit.sql`
5. `20251017120400_create_trending_functions.sql`

### Step 2: Apply Migrations (use Supabase MCP)
- Use `apply_migration` for each file in order
- Verify success after each migration

### Step 3: Verification Queries
```sql
-- Verify tables created
SELECT table_name, table_schema FROM information_schema.tables 
WHERE table_name IN ('product_recommendations', 'product_trending_scores', 'curation_events');

-- Verify columns added
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'brands' AND column_name IN ('featured_at', 'featured_by');

-- Verify functions created
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('update_product_trending_score', 'get_trending_products');

-- Test trending function (should return 20 products or fewer)
SELECT COUNT(*) FROM public.get_trending_products(20);
```

---

## 📊 SUCCESS CRITERIA

- [ ] All 5 migrations applied successfully
- [ ] All 6 functions created and executable
- [ ] All RLS policies active
- [ ] All indexes created
- [ ] Trending function returns results (even if empty data)
- [ ] No SQL syntax errors
- [ ] No FK constraint violations
- [ ] Verified with SELECT queries

---

**Implementation Plan Complete**  
**Ready for Execution**: YES ✅  
**Blocking Issues**: NONE  
**Next Step**: Create migration files
