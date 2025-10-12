'use client';

import React, { useState, useEffect, useCallback } from "react";
import { Star, Loader2 } from "lucide-react";
import { useInView } from 'react-intersection-observer';
import { reviewAPI } from '@/lib/api/reviewClient';
import ReviewSubmissionForm from "./ReviewSubmissionForm";
import ReviewCard from "./ReviewCard";
import ReviewFilters from "./ReviewFilters";

interface ReviewWithMeta {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  title?: string;
  comment?: string;
  helpful_votes: number;
  unhelpful_votes: number;
  is_verified: boolean;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  user: {
    display_name: string;
    avatar_url?: string;
  };
  vendor_reply?: {
    id: string;
    comment: string;
    created_at: string;
  };
  user_vote?: 'helpful' | 'unhelpful' | null;
}

interface ReviewStats {
  average: number;
  total: number;
  distribution: Record<string, number>;
}

export default function CustomerReviews({
  productId,
  avgRating,
  reviewCount,
  initialReviews = [],
  stats,
  canReview = false,
  orderId,
}: {
  productId?: string;
  avgRating: number;
  reviewCount: number;
  initialReviews?: ReviewWithMeta[];
  stats?: ReviewStats;
  canReview?: boolean;
  orderId?: string;
}) {
  const [reviews, setReviews] = useState<ReviewWithMeta[]>(initialReviews);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [localReviewCount, setLocalReviewCount] = useState(reviewCount);
  const [localAvgRating, setLocalAvgRating] = useState(avgRating);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false); // Always start with false to trigger initial load
  
  // Filter state
  const [filters, setFilters] = useState({
    rating: [] as number[],
    verified: false,
    hasReply: false,
    sortBy: 'recent' as 'recent' | 'helpful'
  });
  
  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    triggerOnce: false
  });
  
  // Check authentication status and user's order for this product on mount
  useEffect(() => {
    checkAuthStatus();
    fetchUserOrder();
  }, []);

  const fetchUserOrder = async () => {
    if (!productId) return;
    
    try {
      // TODO: Create an API endpoint to fetch user's order for this product
      // For now, we'll disable the review form for vendor users
      // since vendors shouldn't be reviewing their own products
      console.log('[CustomerReviews] Checking user order for product:', productId);
    } catch (error) {
      console.error('[CustomerReviews] Error fetching user order:', error);
    }
  };

  // Initial load of reviews on component mount
  useEffect(() => {
    if (!productId || initialLoadDone) return;
    
    const initialLoad = async () => {
      setLoading(true);
      try {
        const response = await reviewAPI.fetchReviews(
          {
            productId,
            sortBy: 'recent'
          },
          undefined,
          10
        );
        
        if (response.success && response.reviews) {
          setReviews(response.reviews);
          setNextCursor(response.nextCursor);
          setHasMore(!!response.nextCursor);
          
          // Update counts from API response
          if (response.stats) {
            setLocalAvgRating(response.stats.average);
            setLocalReviewCount(response.stats.total);
          }
        }
      } catch (error) {
        console.error('[CustomerReviews] Error in initial load:', error);
      } finally {
        setLoading(false);
        setInitialLoadDone(true);
      }
    };
    
    initialLoad();
  }, [productId, initialLoadDone]);
  
  const checkAuthStatus = async () => {
    try {
      // Perform real session check using the review API's browser client
      const supabase = (reviewAPI as any).browserClient;
      if (!supabase) {
        setIsAuthenticated(false);
        return;
      }
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        setIsAuthenticated(false);
        console.log('[CustomerReviews] No authenticated session found');
      } else {
        setIsAuthenticated(true);
        console.log('[CustomerReviews] User authenticated:', session.user.id);
      }
    } catch (error) {
      console.error('[CustomerReviews] Error checking auth status:', error);
      setIsAuthenticated(false);
    }
  };
  
  // Load more reviews for infinite scroll
  const loadMoreReviews = useCallback(async () => {
    if (loadingMore || !hasMore || !productId) return;
    
    setLoadingMore(true);
    
    try {
      const response = await reviewAPI.fetchReviews(
        {
          productId,
          rating: filters.rating.length > 0 ? filters.rating : undefined,
          verified: filters.verified || undefined,
          hasReply: filters.hasReply || undefined,
          sortBy: filters.sortBy
        },
        nextCursor,
        10
      );
      
      if (response.success && response.reviews) {
        setReviews(prev => [...prev, ...response.reviews]);
        setNextCursor(response.nextCursor);
        setHasMore(!!response.nextCursor);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('[CustomerReviews] Error loading more reviews:', error);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [productId, filters, nextCursor, loadingMore, hasMore]);
  
  // Trigger load more when scrolling to bottom
  useEffect(() => {
    if (inView && hasMore && !loadingMore && initialLoadDone) {
      loadMoreReviews();
    }
  }, [inView, hasMore, loadingMore, loadMoreReviews, initialLoadDone]);
  
  // Reload reviews when filters change
  const handleFilterChange = useCallback(async (newFilters: any) => {
    setFilters(newFilters);
    setLoading(true);
    setReviews([]);
    setNextCursor(undefined);
    setHasMore(true);
    setInitialLoadDone(false);
    
    try {
      const response = await reviewAPI.fetchReviews(
        {
          productId,
          rating: newFilters.rating?.length > 0 ? newFilters.rating : undefined,
          verified: newFilters.verified || undefined,
          hasReply: newFilters.hasReply || undefined,
          sortBy: newFilters.sortBy
        },
        undefined,
        10
      );
      
      if (response.success && response.reviews) {
        setReviews(response.reviews);
        setNextCursor(response.nextCursor);
        setHasMore(!!response.nextCursor);
        
        // Update stats if provided
        if (response.stats) {
          setLocalAvgRating(response.stats.average);
          setLocalReviewCount(response.stats.total);
        }
      }
    } catch (error) {
      console.error('[CustomerReviews] Error fetching filtered reviews:', error);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, [productId]);
  
  // Handle successful review submission
  const handleReviewSuccess = (newReview: any) => {
    // Add the new review to the top of the list
    setReviews(prev => [newReview, ...prev]);
    
    // Update local count and potentially rating
    setLocalReviewCount(prev => prev + 1);
    
    // Recalculate average if we have enough data
    if (localReviewCount > 0 && newReview.rating) {
      const newAvg = ((localAvgRating * localReviewCount) + newReview.rating) / (localReviewCount + 1);
      setLocalAvgRating(newAvg);
    }
    
    console.log('[CustomerReviews] New review added:', newReview.id);
  };
  
  // Handle vote casting with optimistic updates
  const handleVote = async (reviewId: string, voteType: 'helpful' | 'unhelpful') => {
    if (!isAuthenticated) {
      alert('Please sign in to vote on reviews');
      return;
    }
    
    console.log(`[CustomerReviews] Casting ${voteType} vote on review ${reviewId}`);
    
    // Optimistic update - update the review in state
    const reviewIndex = reviews.findIndex(r => r.id === reviewId);
    if (reviewIndex === -1) return;
    
    const review = reviews[reviewIndex];
    const previousVote = review.user_vote;
    
    // Calculate new vote counts optimistically
    let updatedReview = { ...review };
    
    // Toggle vote if clicking the same type, otherwise change vote
    if (previousVote === voteType) {
      // Remove vote
      updatedReview.user_vote = null;
      if (voteType === 'helpful') {
        updatedReview.helpful_votes = Math.max(0, updatedReview.helpful_votes - 1);
      } else {
        updatedReview.unhelpful_votes = Math.max(0, updatedReview.unhelpful_votes - 1);
      }
    } else if (previousVote) {
      // Change vote
      updatedReview.user_vote = voteType;
      if (previousVote === 'helpful') {
        updatedReview.helpful_votes = Math.max(0, updatedReview.helpful_votes - 1);
        updatedReview.unhelpful_votes = updatedReview.unhelpful_votes + 1;
      } else {
        updatedReview.unhelpful_votes = Math.max(0, updatedReview.unhelpful_votes - 1);
        updatedReview.helpful_votes = updatedReview.helpful_votes + 1;
      }
    } else {
      // New vote
      updatedReview.user_vote = voteType;
      if (voteType === 'helpful') {
        updatedReview.helpful_votes = updatedReview.helpful_votes + 1;
      } else {
        updatedReview.unhelpful_votes = updatedReview.unhelpful_votes + 1;
      }
    }
    
    // Apply optimistic update
    const newReviews = [...reviews];
    newReviews[reviewIndex] = updatedReview;
    setReviews(newReviews);
    
    try {
      // Make API call
      const response = await reviewAPI.castVote(reviewId, voteType);
      
      if (!response.success) {
        throw new Error(response.error || 'Vote failed');
      }
      
      console.log(`[CustomerReviews] Vote successful: changed=${response.changed}`);
      
      // The optimistic update should match the server state
      // If not, we could refetch the review here
    } catch (error) {
      console.error('[CustomerReviews] Vote failed:', error);
      
      // Rollback optimistic update
      setReviews(reviews);
      
      // Show error to user
      if (error instanceof Error && error.message.includes('self-voting')) {
        alert('You cannot vote on your own review');
      } else if (error instanceof Error && error.message.includes('rate limit')) {
        alert('Too many votes. Please try again later.');
      } else {
        alert('Failed to record your vote. Please try again.');
      }
      
      throw error; // Re-throw for ReviewCard to handle
    }
  };
  
  return (
    <section aria-labelledby="customer-reviews" className="mt-12">
      <div className="mb-6">
        <h2 id="customer-reviews" className="text-lg font-semibold tracking-tight mb-4">
          Customer Reviews
        </h2>
        
        {/* Review Filters */}
        <ReviewFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          stats={{
            average: localAvgRating,
            total: localReviewCount,
            distribution: stats?.distribution || {}
          }}
        />
        
        {/* Review Submission Form - Show for verified purchasers */}
        {productId && canReview && orderId && (
          <ReviewSubmissionForm
            productId={productId}
            orderId={orderId}
            onSuccess={handleReviewSuccess}
          />
        )}
        
        {productId && canReview && !orderId && (
          <div className="p-6 bg-yellow-900/30 border border-yellow-600/30 rounded-lg">
            <p className="text-yellow-200 text-sm">
              ⚠️ You can only review products you have purchased and received.
            </p>
          </div>
        )}
      </div>
      
      {/* Loading state */}
      {loading && reviews.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--kb-primary-brand)]" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-sm text-foreground/70">
            {filters.rating?.length > 0 || filters.verified || filters.hasReply
              ? 'No reviews match your filters. Try adjusting them.'
              : 'No reviews yet. Be the first to review this product!'}
          </p>
        </div>
      ) : (
        <>
          {/* Review Grid */}
          <div className="grid grid-cols-1 gap-4">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onVote={handleVote}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
          
          {/* Infinite Scroll Trigger */}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="mt-6 flex items-center justify-center py-4"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--kb-primary-brand)]" />
                  <span className="text-sm text-foreground/60">Loading more reviews...</span>
                </div>
              ) : (
                <button
                  onClick={loadMoreReviews}
                  className="px-4 py-2 text-sm text-[var(--kb-primary-brand)] hover:bg-white/5 rounded-lg transition-colors"
                >
                  Load More Reviews
                </button>
              )}
            </div>
          )}
          
          {!hasMore && reviews.length > 0 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-foreground/60">
                You've reached the end! {reviews.length} of {localReviewCount} reviews shown.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
