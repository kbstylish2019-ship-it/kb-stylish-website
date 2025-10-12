-- ============================================================================
-- KB Stylish Trust & Community Engine - Production-Grade Blueprint v2.1
-- Migration: Create Trust Engine Schema Foundation
-- Created: 2025-09-25 08:22:00
-- Author: Principal Backend Architect
-- ============================================================================

-- This migration implements the core database schema for our Trust Engine:
-- - Purchase-verified reviews with moderation pipeline
-- - Sharded vote counters for scalability  
-- - Vendor reply system
-- - Community flagging and reputation scoring
-- - Product rating aggregation

-- ============================================================================
-- PART 1: REVIEWS TABLE - Core review entity with moderation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE RESTRICT,
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    
    -- Moderation fields
    is_approved BOOLEAN NOT NULL DEFAULT false,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        moderation_status IN ('pending', 'approved', 'rejected', 'flagged', 'edited')
    ),
    moderated_at TIMESTAMPTZ,
    moderated_by UUID REFERENCES public.user_profiles(id),
    moderation_notes TEXT,
    
    -- Engagement metrics (denormalized for performance)
    helpful_votes INTEGER NOT NULL DEFAULT 0,
    unhelpful_votes INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    
    -- Media tracking
    has_media BOOLEAN NOT NULL DEFAULT false,
    media_count INTEGER NOT NULL DEFAULT 0,
    
    -- Edit tracking
    is_edited BOOLEAN NOT NULL DEFAULT false,
    edit_count INTEGER NOT NULL DEFAULT 0,
    last_edited_at TIMESTAMPTZ,
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id),
    deletion_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_review_per_product_user UNIQUE(product_id, user_id, deleted_at),
    CONSTRAINT valid_moderation_approval CHECK (
        (is_approved = true AND moderation_status = 'approved') OR
        (is_approved = false)
    )
);

-- Indexes for performance
CREATE INDEX idx_reviews_product_approved ON public.reviews(product_id, is_approved, created_at DESC) 
    WHERE deleted_at IS NULL;
CREATE INDEX idx_reviews_user ON public.reviews(user_id, created_at DESC) 
    WHERE deleted_at IS NULL;
CREATE INDEX idx_reviews_order ON public.reviews(order_id);
CREATE INDEX idx_reviews_moderation ON public.reviews(moderation_status, created_at) 
    WHERE moderation_status = 'pending';
CREATE INDEX idx_reviews_featured ON public.reviews(product_id, is_featured) 
    WHERE is_featured = true AND deleted_at IS NULL;
CREATE INDEX idx_reviews_helpful ON public.reviews(product_id, helpful_votes DESC) 
    WHERE is_approved = true AND deleted_at IS NULL;

-- ============================================================================
-- PART 2: REVIEW VOTES - Track helpful/unhelpful votes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_votes (
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('helpful', 'unhelpful')),
    
    -- Anti-fraud tracking
    ip_address INET,
    user_agent_hash TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (review_id, user_id)
);

-- Index for vote counting
CREATE INDEX idx_review_votes_review ON public.review_votes(review_id, vote_type);

-- ============================================================================
-- PART 3: REVIEW VOTE SHARDS - Scalable counter cache pattern
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_vote_shards (
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    shard SMALLINT NOT NULL CHECK (shard >= 0 AND shard < 64),
    helpful_count BIGINT NOT NULL DEFAULT 0,
    unhelpful_count BIGINT NOT NULL DEFAULT 0,
    
    -- Timestamps
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (review_id, shard)
);

-- Index for fast aggregation
CREATE INDEX idx_review_vote_shards_review ON public.review_vote_shards(review_id);

-- ============================================================================
-- PART 4: REVIEW REPLIES - Vendor and admin responses
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Reply content
    comment TEXT NOT NULL,
    
    -- Reply type and visibility
    reply_type TEXT NOT NULL CHECK (reply_type IN ('vendor', 'admin', 'support')),
    is_visible BOOLEAN NOT NULL DEFAULT true,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    
    -- Moderation
    is_approved BOOLEAN NOT NULL DEFAULT true, -- Auto-approve vendor replies
    moderated_at TIMESTAMPTZ,
    moderated_by UUID REFERENCES public.user_profiles(id),
    
    -- Edit tracking
    is_edited BOOLEAN NOT NULL DEFAULT false,
    edit_count INTEGER NOT NULL DEFAULT 0,
    last_edited_at TIMESTAMPTZ,
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.user_profiles(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_review_replies_review ON public.review_replies(review_id, is_visible) 
    WHERE deleted_at IS NULL;
CREATE INDEX idx_review_replies_user ON public.review_replies(user_id);

-- Unique partial index for one vendor reply per review
CREATE UNIQUE INDEX unique_vendor_reply_per_review 
    ON public.review_replies(review_id, reply_type) 
    WHERE reply_type = 'vendor' AND deleted_at IS NULL;

-- ============================================================================
-- PART 5: MODERATION QUEUE - Content moderation pipeline
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.moderation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Subject being moderated
    subject_type TEXT NOT NULL CHECK (subject_type IN ('review', 'reply', 'flag', 'user')),
    subject_id UUID NOT NULL,
    
    -- Moderation state
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'in_review', 'approved', 'rejected', 'escalated')
    ),
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    
    -- Auto-moderation scores
    auto_score DECIMAL(3,2) CHECK (auto_score >= 0 AND auto_score <= 1),
    toxicity_score DECIMAL(3,2) CHECK (toxicity_score >= 0 AND toxicity_score <= 1),
    spam_score DECIMAL(3,2) CHECK (spam_score >= 0 AND spam_score <= 1),
    
    -- Detected issues
    detected_issues JSONB DEFAULT '[]'::JSONB,
    contains_pii BOOLEAN DEFAULT false,
    contains_links BOOLEAN DEFAULT false,
    
    -- Review process
    assigned_to UUID REFERENCES public.user_profiles(id),
    reviewed_by UUID REFERENCES public.user_profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    resolution TEXT,
    
    -- SLA tracking
    due_by TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for queue processing
CREATE INDEX idx_moderation_queue_pending ON public.moderation_queue(priority DESC, created_at) 
    WHERE status = 'pending';
CREATE INDEX idx_moderation_queue_subject ON public.moderation_queue(subject_type, subject_id);
CREATE INDEX idx_moderation_queue_assigned ON public.moderation_queue(assigned_to, status) 
    WHERE assigned_to IS NOT NULL;

-- ============================================================================
-- PART 6: REVIEW FLAGS - Community reporting system
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Flag details
    reason TEXT NOT NULL CHECK (reason IN (
        'inappropriate', 'spam', 'fake', 'offensive', 'off_topic', 
        'competitor', 'personal_info', 'other'
    )),
    description TEXT,
    
    -- Resolution
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'reviewing', 'valid', 'invalid', 'resolved')
    ),
    resolved_by UUID REFERENCES public.user_profiles(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    action_taken TEXT,
    
    -- Anti-spam
    ip_address INET,
    user_agent_hash TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate flags
    CONSTRAINT unique_flag_per_user UNIQUE(review_id, reporter_user_id)
);

-- Indexes
CREATE INDEX idx_review_flags_review ON public.review_flags(review_id, status);
CREATE INDEX idx_review_flags_pending ON public.review_flags(status, created_at) 
    WHERE status = 'pending';

-- ============================================================================
-- PART 7: USER REPUTATION - Trust scoring system
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_reputation (
    user_id UUID PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Reputation scores (0-100 scale)
    overall_score DECIMAL(5,2) NOT NULL DEFAULT 50.00 CHECK (
        overall_score >= 0 AND overall_score <= 100
    ),
    review_quality_score DECIMAL(5,2) DEFAULT 50.00,
    helpfulness_score DECIMAL(5,2) DEFAULT 50.00,
    authenticity_score DECIMAL(5,2) DEFAULT 50.00,
    
    -- Behavioral metrics
    total_reviews INTEGER NOT NULL DEFAULT 0,
    approved_reviews INTEGER NOT NULL DEFAULT 0,
    rejected_reviews INTEGER NOT NULL DEFAULT 0,
    flagged_reviews INTEGER NOT NULL DEFAULT 0,
    featured_reviews INTEGER NOT NULL DEFAULT 0,
    
    total_votes_cast INTEGER NOT NULL DEFAULT 0,
    helpful_votes_received INTEGER NOT NULL DEFAULT 0,
    unhelpful_votes_received INTEGER NOT NULL DEFAULT 0,
    
    -- Trust indicators
    verified_purchases INTEGER NOT NULL DEFAULT 0,
    account_age_days INTEGER NOT NULL DEFAULT 0,
    consecutive_approved INTEGER NOT NULL DEFAULT 0,
    
    -- Moderation history
    warnings_count INTEGER NOT NULL DEFAULT 0,
    suspensions_count INTEGER NOT NULL DEFAULT 0,
    last_warning_at TIMESTAMPTZ,
    last_suspension_at TIMESTAMPTZ,
    
    -- Weight factors for ranking
    weight_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00 CHECK (
        weight_multiplier >= 0 AND weight_multiplier <= 2
    ),
    
    -- Badges and achievements
    badges JSONB DEFAULT '[]'::JSONB,
    achievements JSONB DEFAULT '[]'::JSONB,
    
    -- Calculation metadata
    last_calculated_at TIMESTAMPTZ,
    calculation_version INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_reputation_score ON public.user_reputation(overall_score DESC);
CREATE INDEX idx_user_reputation_calculation ON public.user_reputation(last_calculated_at) 
    WHERE last_calculated_at IS NOT NULL;

-- ============================================================================
-- PART 8: ALTER PRODUCTS TABLE - Add rating aggregation columns
-- ============================================================================

-- Add rating columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0.00 CHECK (
    average_rating >= 0 AND average_rating <= 5
),
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0 CHECK (review_count >= 0),
ADD COLUMN IF NOT EXISTS rating_distribution JSONB DEFAULT '{
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0
}'::JSONB,
ADD COLUMN IF NOT EXISTS last_review_at TIMESTAMPTZ;

-- Index for sorting by rating
CREATE INDEX IF NOT EXISTS idx_products_rating ON public.products(average_rating DESC, review_count DESC) 
    WHERE is_active = true;

-- ============================================================================
-- PART 9: REVIEW MEDIA TABLE - Store review images/videos (for future)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    
    -- Media details
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    
    -- Media metadata
    file_size_bytes BIGINT,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER, -- For videos
    
    -- Moderation
    is_approved BOOLEAN NOT NULL DEFAULT false,
    contains_faces BOOLEAN DEFAULT false,
    auto_tags JSONB DEFAULT '[]'::JSONB,
    
    -- Processing status
    processing_status TEXT DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processing', 'completed', 'failed')
    ),
    processed_at TIMESTAMPTZ,
    
    -- Order and visibility
    sort_order INTEGER DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_review_media_review ON public.review_media(review_id, sort_order) 
    WHERE is_visible = true AND is_approved = true;

-- ============================================================================
-- PART 10: ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_vote_shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_media ENABLE ROW LEVEL SECURITY;

-- Reviews policies
CREATE POLICY "Users can view approved reviews" ON public.reviews
    FOR SELECT USING (
        is_approved = true 
        OR user_id = auth.uid()
        OR public.user_has_role(auth.uid(), 'admin')
        OR public.user_has_role(auth.uid(), 'support')
    );

CREATE POLICY "Users can create their own reviews" ON public.reviews
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.orders o
            JOIN public.order_items oi ON oi.order_id = o.id
            WHERE o.user_id = auth.uid()
            AND o.id = reviews.order_id
            AND o.status IN ('delivered', 'completed')
            AND oi.product_id = reviews.product_id
        )
    );

CREATE POLICY "Users can update their own reviews" ON public.reviews
    FOR UPDATE USING (
        user_id = auth.uid() 
        AND deleted_at IS NULL
    );

CREATE POLICY "Users can soft delete their own reviews" ON public.reviews
    FOR UPDATE USING (
        user_id = auth.uid() 
        AND deleted_at IS NULL
    ) WITH CHECK (
        user_id = auth.uid()
        AND deleted_at IS NOT NULL
    );

-- Review votes policies
CREATE POLICY "Anyone can view vote counts" ON public.review_votes
    FOR SELECT USING (true);

CREATE POLICY "Users can vote on others reviews" ON public.review_votes
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND user_id != (SELECT user_id FROM public.reviews WHERE id = review_id)
    );

CREATE POLICY "Users can update their own votes" ON public.review_votes
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own votes" ON public.review_votes
    FOR DELETE USING (user_id = auth.uid());

-- Review vote shards - read only for users
CREATE POLICY "Anyone can view vote shards" ON public.review_vote_shards
    FOR SELECT USING (true);

-- Review replies policies
CREATE POLICY "Anyone can view visible replies" ON public.review_replies
    FOR SELECT USING (
        is_visible = true 
        OR user_id = auth.uid()
        OR public.user_has_role(auth.uid(), 'admin')
    );

CREATE POLICY "Vendors can reply to their product reviews" ON public.review_replies
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND reply_type = 'vendor'
        AND EXISTS (
            SELECT 1 FROM public.reviews r
            JOIN public.products p ON p.id = r.product_id
            WHERE r.id = review_id
            AND p.vendor_id = auth.uid()
        )
    );

CREATE POLICY "Admins can reply to any review" ON public.review_replies
    FOR INSERT WITH CHECK (
        public.user_has_role(auth.uid(), 'admin')
        OR public.user_has_role(auth.uid(), 'support')
    );

CREATE POLICY "Users can update their own replies" ON public.review_replies
    FOR UPDATE USING (
        user_id = auth.uid()
        AND deleted_at IS NULL
    );

-- Moderation queue - admin/support only
CREATE POLICY "Only moderators can view queue" ON public.moderation_queue
    FOR SELECT USING (
        public.user_has_role(auth.uid(), 'admin')
        OR public.user_has_role(auth.uid(), 'support')
    );

CREATE POLICY "Only moderators can update queue" ON public.moderation_queue
    FOR UPDATE USING (
        public.user_has_role(auth.uid(), 'admin')
        OR public.user_has_role(auth.uid(), 'support')
    );

-- Review flags policies
CREATE POLICY "Users can view their own flags" ON public.review_flags
    FOR SELECT USING (
        reporter_user_id = auth.uid()
        OR public.user_has_role(auth.uid(), 'admin')
        OR public.user_has_role(auth.uid(), 'support')
    );

CREATE POLICY "Users can flag reviews" ON public.review_flags
    FOR INSERT WITH CHECK (
        reporter_user_id = auth.uid()
        AND reporter_user_id != (SELECT user_id FROM public.reviews WHERE id = review_id)
    );

-- User reputation - public read
CREATE POLICY "Anyone can view reputation scores" ON public.user_reputation
    FOR SELECT USING (true);

-- Review media policies
CREATE POLICY "Anyone can view approved media" ON public.review_media
    FOR SELECT USING (
        (is_approved = true AND is_visible = true)
        OR EXISTS (
            SELECT 1 FROM public.reviews 
            WHERE id = review_id 
            AND user_id = auth.uid()
        )
        OR public.user_has_role(auth.uid(), 'admin')
    );

-- ============================================================================
-- PART 11: HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate shard for vote distribution
CREATE OR REPLACE FUNCTION public.get_vote_shard(p_user_id UUID)
RETURNS SMALLINT AS $$
BEGIN
    -- Use hash of user_id to determine shard (0-63)
    RETURN abs(hashtext(p_user_id::text)) % 64;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to aggregate vote counts from shards
CREATE OR REPLACE FUNCTION public.get_review_vote_counts(p_review_id UUID)
RETURNS TABLE(helpful_count BIGINT, unhelpful_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(rvs.helpful_count), 0) AS helpful_count,
        COALESCE(SUM(rvs.unhelpful_count), 0) AS unhelpful_count
    FROM public.review_vote_shards rvs
    WHERE rvs.review_id = p_review_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 12: TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_trust_engine_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_reviews_updated_at 
    BEFORE UPDATE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_review_votes_updated_at 
    BEFORE UPDATE ON public.review_votes
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_review_vote_shards_updated_at 
    BEFORE UPDATE ON public.review_vote_shards
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_review_replies_updated_at 
    BEFORE UPDATE ON public.review_replies
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_moderation_queue_updated_at 
    BEFORE UPDATE ON public.moderation_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_review_flags_updated_at 
    BEFORE UPDATE ON public.review_flags
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_user_reputation_updated_at 
    BEFORE UPDATE ON public.user_reputation
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

CREATE TRIGGER update_review_media_updated_at 
    BEFORE UPDATE ON public.review_media
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_engine_updated_at();

-- ============================================================================
-- PART 13: INITIAL DATA & COMMENTS
-- ============================================================================

-- Add table comments for documentation
COMMENT ON TABLE public.reviews IS 'User reviews for products with purchase verification and moderation';
COMMENT ON TABLE public.review_votes IS 'Helpful/unhelpful votes on reviews';
COMMENT ON TABLE public.review_vote_shards IS 'Sharded counters for scalable vote aggregation';
COMMENT ON TABLE public.review_replies IS 'Vendor and admin replies to reviews';
COMMENT ON TABLE public.moderation_queue IS 'Content moderation pipeline for reviews and replies';
COMMENT ON TABLE public.review_flags IS 'Community reporting of inappropriate reviews';
COMMENT ON TABLE public.user_reputation IS 'User trust scores based on review quality and behavior';
COMMENT ON TABLE public.review_media IS 'Images and videos attached to reviews';

-- Add column comments for critical fields
COMMENT ON COLUMN public.reviews.is_approved IS 'Whether review has passed moderation and is publicly visible';
COMMENT ON COLUMN public.reviews.order_id IS 'Links review to verified purchase order';
COMMENT ON COLUMN public.review_vote_shards.shard IS 'Shard number 0-63 for distributed counting';
COMMENT ON COLUMN public.user_reputation.overall_score IS 'Composite trust score 0-100 used for ranking reviews';
COMMENT ON COLUMN public.user_reputation.weight_multiplier IS 'Applied to votes to combat manipulation';

-- ============================================================================
-- Migration complete
-- ============================================================================

-- The Trust Engine schema foundation is now in place. Next steps:
-- 1. Create submit_review_secure() RPC function
-- 2. Create ratings_aggregator worker for async product rating updates  
-- 3. Create moderation_worker for content review pipeline
-- 4. Create review_vote_aggregator for periodic shard aggregation
-- 5. Deploy submit-review Edge Function following existing patterns

-- Performance targets:
-- - Review submission: < 100ms
-- - Vote updates: < 50ms (sharded, no contention)
-- - Product rating refresh: Async via job_queue
-- - Moderation queue processing: < 5 min SLA
