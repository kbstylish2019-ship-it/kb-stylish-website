-- =====================================================================
-- CURATION ENGINE: Product Trending Scores (Event-Driven Aggregates)
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1 (Fortress Architecture)
-- Purpose: Incremental aggregate table for trending products
-- Pattern: Follows metrics.vendor_daily pattern (idempotent upserts)
-- Performance: Event-driven updates (no blocking MV refresh)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS metrics.product_trending_scores (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    score_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Time-windowed order counts (for time-decay algorithm)
    order_count_1d INTEGER NOT NULL DEFAULT 0,   -- Last 24 hours
    order_count_3d INTEGER NOT NULL DEFAULT 0,   -- Last 3 days
    order_count_7d INTEGER NOT NULL DEFAULT 0,   -- Last 7 days
    order_count_14d INTEGER NOT NULL DEFAULT 0,  -- Last 14 days
    
    -- Calculated trend score (time-decay weighted)
    -- Formula: (1d * 5.0) + (3d * 3.0) + (7d * 1.5) + (14d * 0.5) + (rating * 0.3)
    trend_score NUMERIC NOT NULL DEFAULT 0,
    
    -- Supporting metrics (cached from products table)
    weighted_rating NUMERIC NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    
    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (product_id, score_date),
    CONSTRAINT trending_scores_date_not_future CHECK (score_date <= CURRENT_DATE)
);

-- Indexes for performance
CREATE INDEX idx_trending_scores_date_score 
  ON metrics.product_trending_scores(score_date, trend_score DESC);

CREATE INDEX idx_trending_scores_product 
  ON metrics.product_trending_scores(product_id, score_date DESC);

-- Partial index for today's trending (most common query)
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
  'Incrementally updated trending scores for products. Event-driven updates on order creation. Time-decay: recent orders (1-3 days) count 10x more than old orders (14 days).';

COMMENT ON COLUMN metrics.product_trending_scores.trend_score IS
  'Time-decay weighted score. Formula: (order_count_1d * 5.0) + (order_count_3d * 3.0) + (order_count_7d * 1.5) + (order_count_14d * 0.5) + (average_rating * 0.3)';

COMMENT ON COLUMN metrics.product_trending_scores.order_count_1d IS
  'Count of distinct orders containing this product in last 24 hours. Highest weight in trending formula.';

COMMIT;
