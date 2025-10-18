-- =====================================================================
-- CURATION ENGINE: Event Tracking (Analytics)
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1 (Fortress Architecture)
-- Purpose: Track user interactions with curated content for analytics
-- Metrics: CTR, conversion rates, ROI measurement
-- Privacy: RLS ensures only admins can read analytics
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
    source_id UUID,  -- For recommendations: source product_id; for trending: NULL
    target_id UUID,  -- Clicked product_id or brand_id or stylist_id
    
    -- User identification (anonymous-friendly)
    user_id UUID REFERENCES auth.users(id),
    session_id TEXT,  -- For anonymous user tracking
    
    -- Campaign tracking (UTM parameters)
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_curation_events_type_date 
  ON public.curation_events(curation_type, event_type, created_at DESC);

CREATE INDEX idx_curation_events_source 
  ON public.curation_events(source_id, target_id, event_type)
  WHERE source_id IS NOT NULL;

CREATE INDEX idx_curation_events_target 
  ON public.curation_events(target_id, event_type, created_at DESC)
  WHERE target_id IS NOT NULL;

CREATE INDEX idx_curation_events_date_only 
  ON public.curation_events(created_at DESC);

CREATE INDEX idx_curation_events_user 
  ON public.curation_events(user_id, curation_type, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.curation_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can insert their own events (tracking)
CREATE POLICY curation_events_insert
ON public.curation_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);  -- Allow all inserts for tracking

-- RLS: Only admins can read analytics
CREATE POLICY curation_events_admin_read
ON public.curation_events
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.curation_events IS
  'Event tracking for curation features. Measures CTR, conversion rates, and ROI of curated sections (trending, featured, recommendations).';

COMMENT ON COLUMN public.curation_events.event_type IS
  'Type of user interaction: view (section shown), click (item clicked), add_to_cart (added from curation), purchase (completed order from curation).';

COMMENT ON COLUMN public.curation_events.source_id IS
  'For recommendations: the source product_id that showed the recommendation. For other curation types: NULL.';

COMMENT ON COLUMN public.curation_events.target_id IS
  'The clicked item: product_id for trending/recommendations, brand_id for featured_brands, stylist user_id for top_stylists.';

COMMIT;
