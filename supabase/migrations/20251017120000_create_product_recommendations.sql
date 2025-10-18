-- =====================================================================
-- CURATION ENGINE: Product Recommendations (Complete the Look)
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1 (Fortress Architecture)
-- Purpose: Manual and algorithmic product recommendations
-- Security: RLS with admin-only write access
-- Self-Healing: Queries auto-filter inactive/out-of-stock products
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

-- Indexes for performance
CREATE INDEX idx_recommendations_source 
  ON public.product_recommendations(source_product_id, display_order);

CREATE INDEX idx_recommendations_recommended 
  ON public.product_recommendations(recommended_product_id);

CREATE INDEX idx_recommendations_performance 
  ON public.product_recommendations(click_count DESC, conversion_count DESC);

-- Enable RLS
ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read recommendations (for public product pages)
CREATE POLICY recommendations_public_read
ON public.product_recommendations
FOR SELECT
TO anon, authenticated
USING (true);

-- RLS: Only admins can insert/update/delete
CREATE POLICY recommendations_admin_write
ON public.product_recommendations
FOR ALL
TO authenticated
USING (public.user_has_role(auth.uid(), 'admin'))
WITH CHECK (public.user_has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.product_recommendations IS 
  'Manual and algorithmic product recommendations for \"Complete the Look\". Self-healing queries auto-filter inactive/out-of-stock products.';

COMMENT ON COLUMN public.product_recommendations.display_order IS 
  'Display order for recommendations (0 = first). Used to control which items show first in UI.';

COMMENT ON COLUMN public.product_recommendations.click_count IS 
  'Number of times this recommendation was clicked. Tracked via curation_events table.';

COMMENT ON COLUMN public.product_recommendations.conversion_count IS 
  'Number of times clicked recommendation resulted in add-to-cart or purchase.';

COMMIT;
