# Trust Engine Integration: The Definitive Blueprint

**Author**: Principal Full-Stack Architect  
**Date**: September 25, 2025  
**Status**: Planning Complete - Awaiting Execution Command

---

## Executive Summary

This blueprint defines the complete integration strategy for connecting our bulletproof Trust & Community Engine backend (8 tables, 3 hardened RPCs, 22 RLS policies) to the live user experience. The integration follows our established dual-client Edge Function pattern and maintains zero-trust security throughout.

---

## Part 1: The API Layer - Edge Functions Architecture

### 1.1 Edge Function Structure

```
supabase/functions/
├── review-manager/          # Reviews & ratings
│   └── index.ts
├── vote-manager/           # Helpful/unhelpful votes  
│   └── index.ts
├── reply-manager/          # Vendor replies
│   └── index.ts
└── _shared/
    ├── cors.ts            # Existing CORS config
    ├── auth.ts            # NEW: Shared auth utilities
    └── validation.ts      # NEW: Input sanitization
```

### 1.2 Edge Function: review-manager

**Purpose**: Secure gateway for review submission, fetching, and updates

**Core Logic**:
```typescript
// Dual-client pattern (proven in cart-manager v26)
const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: req.headers.get('Authorization') ?? '' }}
});

const serviceClient = createClient(url, serviceRoleKey);

// Actions: 'submit' | 'fetch' | 'update' | 'delete'
switch(action) {
  case 'submit':
    // 1. Verify JWT with userClient.auth.getUser()
    // 2. Validate input (rating 1-5, sanitize text)
    // 3. Call RPC: serviceClient.rpc('submit_review_secure', params)
    // 4. Return structured response with review_id
    
  case 'fetch':
    // 1. Parse filters (product_id, status, sort)
    // 2. Apply pagination (cursor-based, limit 20)
    // 3. Direct query with LEFT JOINs for user profiles
    // 4. Include vote counts from shards if authenticated
}
```

**Security Features**:
- Purchase verification via RPC (can't fake reviews)
- Rate limiting headers (X-Rate-Limit-*)
- Content sanitization before storage
- IP tracking for abuse detection

### 1.3 Edge Function: vote-manager

**Purpose**: Handle helpful/unhelpful votes with sharded counting

**Core Logic**:
```typescript
// Actions: 'cast' | 'get_user_votes'
case 'cast':
  // 1. Require authentication (no guest voting)
  // 2. Extract IP and user agent for tracking
  // 3. Call RPC: serviceClient.rpc('cast_review_vote', {
  //      p_review_id, p_vote_type, p_ip_address, p_user_agent_hash
  //    })
  // 4. Return success with changed flag

case 'get_user_votes':
  // Bulk fetch user's votes for a set of review IDs
  // Enables showing "You found this helpful" state
```

**Performance**:
- < 50ms response via sharded counting
- Prevents self-voting at database level
- Handles vote changes atomically

### 1.4 Edge Function: reply-manager

**Purpose**: Vendor-only endpoint for replying to reviews

**Core Logic**:
```typescript
// Actions: 'submit' | 'update' | 'delete'
case 'submit':
  // 1. Verify vendor role via JWT claims
  // 2. Verify vendor owns the product being reviewed
  // 3. Check no existing reply (one per review)
  // 4. Insert vendor_reply with moderation status
  // 5. Queue moderation job
```

**Authorization**:
- Must have vendor role in JWT
- Must be product owner (verified in database)
- Rate limited to prevent spam

---

## Part 2: API Client Refactor

### 2.1 New File: `/src/lib/api/reviewClient.ts`

```typescript
// Client-side review management following cartClient.ts patterns

export interface ReviewSubmission {
  productId: string;
  orderId: string;
  rating: number;
  title?: string;
  comment?: string;
}

export interface ReviewResponse {
  success: boolean;
  review?: {
    id: string;
    status: 'approved' | 'pending_moderation';
    message: string;
  };
  error?: string;
  error_code?: string;
}

export interface ReviewFilters {
  productId?: string;
  status?: 'approved' | 'pending' | 'all';
  rating?: number;
  hasPhotos?: boolean;
  verified?: boolean;
}

export interface ReviewWithMeta {
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
  // Joined data
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

export class ReviewAPIClient {
  private baseUrl: string;
  private browserClient: any;
  
  constructor() {
    // Same initialization pattern as CartAPIClient
  }
  
  /**
   * Fetch paginated reviews with filters
   */
  async fetchReviews(
    filters: ReviewFilters,
    cursor?: string,
    limit: number = 20
  ): Promise<{
    reviews: ReviewWithMeta[];
    nextCursor?: string;
    stats: {
      average: number;
      total: number;
      distribution: Record<string, number>;
    };
  }> {
    const response = await fetch(`${this.baseUrl}/functions/v1/review-manager`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        action: 'fetch',
        filters,
        cursor,
        limit
      })
    });
    
    return response.json();
  }
  
  /**
   * Submit a new review (purchase verified)
   */
  async submitReview(data: ReviewSubmission): Promise<ReviewResponse> {
    // Optimistic UI: Show review immediately as "pending"
    const response = await fetch(`${this.baseUrl}/functions/v1/review-manager`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        action: 'submit',
        ...data
      })
    });
    
    return response.json();
  }
  
  /**
   * Cast a helpful/unhelpful vote
   */
  async castVote(
    reviewId: string,
    voteType: 'helpful' | 'unhelpful'
  ): Promise<{
    success: boolean;
    changed: boolean;
    previous_vote?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/functions/v1/vote-manager`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        action: 'cast',
        review_id: reviewId,
        vote_type: voteType
      })
    });
    
    return response.json();
  }
  
  /**
   * Submit vendor reply (vendor only)
   */
  async submitVendorReply(
    reviewId: string,
    comment: string
  ): Promise<{
    success: boolean;
    reply_id?: string;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/functions/v1/reply-manager`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        action: 'submit',
        review_id: reviewId,
        comment
      })
    });
    
    return response.json();
  }
  
  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Include auth token if available
    const session = await this.browserClient?.auth.getSession();
    if (session?.data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
    }
    
    return headers;
  }
}

// Export singleton instance
export const reviewAPI = new ReviewAPIClient();
```

### 2.2 Update: `/src/lib/apiClient.ts`

Add server-side review fetching for SSR:

```typescript
export async function fetchProductReviews(
  productId: string,
  options?: {
    limit?: number;
    cursor?: string;
    includeStats?: boolean;
  }
): Promise<{
  reviews: Review[];
  stats?: ReviewStats;
  nextCursor?: string;
}> {
  noStore(); // Disable caching for fresh reviews
  
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        }
      }
    }
  );
  
  // Direct query with proper joins
  const query = supabase
    .from('reviews')
    .select(`
      *,
      user:user_profiles!inner(display_name, avatar_url),
      vendor_reply:vendor_replies(id, comment, created_at)
    `)
    .eq('product_id', productId)
    .eq('is_approved', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  
  // Apply pagination
  if (options?.cursor) {
    query.lt('created_at', options.cursor);
  }
  
  if (options?.limit) {
    query.limit(options.limit);
  }
  
  const { data, error } = await query;
  
  // Fetch stats if requested
  let stats;
  if (options?.includeStats) {
    const { data: product } = await supabase
      .from('products')
      .select('average_rating, review_count, rating_distribution')
      .eq('id', productId)
      .single();
      
    stats = product;
  }
  
  return {
    reviews: data || [],
    stats,
    nextCursor: data?.length === options?.limit ? data[data.length - 1].created_at : undefined
  };
}
```

---

## Part 3: Frontend Component Refactor

### 3.1 Refactor: `CustomerReviews.tsx`

**From**: Static prop-based display  
**To**: Live data fetching with pagination

```typescript
'use client';

import { useState, useEffect } from 'react';
import { reviewAPI } from '@/lib/api/reviewClient';
import ReviewCard from './ReviewCard';
import ReviewStats from './ReviewStats';
import ReviewFilters from './ReviewFilters';
import ReviewSubmissionForm from './ReviewSubmissionForm';
import { useInView } from 'react-intersection-observer';

export default function CustomerReviews({ 
  productId,
  initialReviews,
  initialStats,
  canReview 
}: {
  productId: string;
  initialReviews?: any[];
  initialStats?: any;
  canReview?: boolean;
}) {
  const [reviews, setReviews] = useState(initialReviews || []);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({});
  
  // Infinite scroll trigger
  const { ref, inView } = useInView();
  
  // Load more reviews when scrolling
  useEffect(() => {
    if (inView && hasMore && !loading) {
      loadMoreReviews();
    }
  }, [inView]);
  
  async function loadMoreReviews() {
    setLoading(true);
    try {
      const response = await reviewAPI.fetchReviews(
        { productId, ...filters },
        cursor
      );
      
      setReviews(prev => [...prev, ...response.reviews]);
      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
      
      // Update stats if this is the first load
      if (!stats && response.stats) {
        setStats(response.stats);
      }
    } catch (error) {
      console.error('Failed to load reviews:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleVote(reviewId: string, voteType: 'helpful' | 'unhelpful') {
    // Optimistic update
    setReviews(prev => prev.map(r => {
      if (r.id === reviewId) {
        const newVote = r.user_vote === voteType ? null : voteType;
        return {
          ...r,
          user_vote: newVote,
          helpful_votes: r.helpful_votes + 
            (newVote === 'helpful' ? 1 : r.user_vote === 'helpful' ? -1 : 0),
          unhelpful_votes: r.unhelpful_votes + 
            (newVote === 'unhelpful' ? 1 : r.user_vote === 'unhelpful' ? -1 : 0)
        };
      }
      return r;
    }));
    
    // Server update
    try {
      await reviewAPI.castVote(reviewId, voteType);
    } catch (error) {
      // Rollback on error
      console.error('Vote failed:', error);
      // Refetch to get correct state
      loadMoreReviews();
    }
  }
  
  return (
    <section className="mt-12">
      {/* Stats Overview */}
      {stats && <ReviewStats stats={stats} />}
      
      {/* Write Review Button */}
      {canReview && (
        <ReviewSubmissionForm 
          productId={productId}
          onSuccess={(newReview) => {
            setReviews(prev => [newReview, ...prev]);
            // Refresh stats
          }}
        />
      )}
      
      {/* Filters */}
      <ReviewFilters 
        onFilterChange={setFilters}
        totalCount={stats?.total || 0}
      />
      
      {/* Reviews List */}
      <div className="space-y-4 mt-6">
        {reviews.map(review => (
          <ReviewCard 
            key={review.id}
            review={review}
            onVote={handleVote}
            canReply={false} // Set based on vendor check
          />
        ))}
      </div>
      
      {/* Infinite scroll trigger */}
      {hasMore && (
        <div ref={ref} className="py-4 text-center">
          {loading && <span>Loading more reviews...</span>}
        </div>
      )}
    </section>
  );
}
```

### 3.2 New Component: `ReviewSubmissionForm.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { reviewAPI } from '@/lib/api/reviewClient';

export default function ReviewSubmissionForm({
  productId,
  orderId,
  onSuccess
}: {
  productId: string;
  orderId?: string;
  onSuccess: (review: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    
    setSubmitting(true);
    setError(undefined);
    
    try {
      const response = await reviewAPI.submitReview({
        productId,
        orderId: orderId!, // Will be validated server-side
        rating,
        title: title.trim(),
        comment: comment.trim()
      });
      
      if (response.success) {
        // Show success message based on moderation status
        if (response.review?.status === 'approved') {
          alert('Review published successfully!');
        } else {
          alert('Review submitted! It will appear after moderation.');
        }
        
        // Reset form
        setRating(0);
        setTitle('');
        setComment('');
        setIsOpen(false);
        
        // Notify parent
        onSuccess(response.review);
      } else {
        setError(response.error || 'Failed to submit review');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }
  
  if (!orderId) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
        <p className="text-sm text-foreground/70">
          Purchase this product to write a review
        </p>
      </div>
    );
  }
  
  return (
    <div className="my-6">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 bg-[var(--kb-primary-brand)] text-white rounded-lg hover:opacity-90"
        >
          Write a Review
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white/5 rounded-lg">
          {/* Star Rating */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Your Rating
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1"
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= rating
                        ? 'fill-[var(--kb-accent-gold)] text-[var(--kb-accent-gold)]'
                        : 'text-gray-400'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Review Title (optional)
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 bg-white/10 rounded border border-white/20"
              placeholder="Sum up your experience"
            />
          </div>
          
          {/* Comment */}
          <div>
            <label htmlFor="comment" className="block text-sm font-medium mb-2">
              Your Review
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-white/10 rounded border border-white/20"
              placeholder="Share your experience with this product"
            />
          </div>
          
          {/* Error Display */}
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          
          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[var(--kb-primary-brand)] text-white rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 border border-white/20 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

### 3.3 New Component: `VendorReplyForm.tsx`

```typescript
'use client';

import { useState } from 'react';
import { reviewAPI } from '@/lib/api/reviewClient';

export default function VendorReplyForm({
  reviewId,
  onSuccess
}: {
  reviewId: string;
  onSuccess: (reply: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!comment.trim()) {
      setError('Please enter a reply');
      return;
    }
    
    setSubmitting(true);
    setError(undefined);
    
    try {
      const response = await reviewAPI.submitVendorReply(
        reviewId,
        comment.trim()
      );
      
      if (response.success) {
        setComment('');
        setIsOpen(false);
        onSuccess({ id: response.reply_id, comment: comment.trim() });
      } else {
        setError(response.error || 'Failed to submit reply');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }
  
  return (
    <div className="mt-3 pl-12">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="text-sm text-[var(--kb-primary-brand)] hover:underline"
        >
          Reply to Review
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-white/10 rounded border border-white/20 text-sm"
            placeholder="Thank you for your feedback..."
            maxLength={500}
          />
          
          {error && (
            <div className="text-red-500 text-xs">{error}</div>
          )}
          
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1 bg-[var(--kb-primary-brand)] text-white text-sm rounded"
            >
              {submitting ? 'Posting...' : 'Post Reply'}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 border border-white/20 text-sm rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

---

## Part 4: The Verification Strategy

### 4.1 Manual Testing Plan

**Phase 1: Review Submission Flow**
1. Create test order with status 'delivered'
2. Navigate to product page as purchaser
3. Verify "Write Review" button appears
4. Submit review with rating only (minimal)
5. Submit review with full details (maximal)
6. Verify pending moderation message
7. Check job_queue table for moderation job
8. Manually approve review in database
9. Verify review appears on product page

**Phase 2: Voting System**
1. Load product with multiple reviews
2. Cast helpful vote as authenticated user
3. Verify optimistic UI update
4. Check review_vote_shards table for shard entry
5. Change vote from helpful to unhelpful
6. Verify delta tracking in shards
7. Attempt self-vote (should fail)
8. Test rate limiting (>10 votes/minute)

**Phase 3: Vendor Reply Flow**
1. Login as vendor who owns product
2. Navigate to product with reviews
3. Verify "Reply" button appears
4. Submit vendor reply
5. Check vendor_replies table
6. Verify reply appears under review
7. Attempt reply as different vendor (should fail)

**Phase 4: Edge Cases**
1. Submit review after 90 days (should fail)
2. Submit review for non-delivered order (should fail)
3. Vote without authentication (should fail)
4. Submit duplicate review (should update)
5. Test pagination with 50+ reviews

### 4.2 Automated Testing Suite

```typescript
// __tests__/integration/trust-engine.test.ts

describe('Trust Engine Integration', () => {
  describe('Review Submission', () => {
    it('should verify purchase before accepting review', async () => {
      // Mock non-existent order
      const response = await reviewAPI.submitReview({
        productId: 'valid-product',
        orderId: 'fake-order',
        rating: 5
      });
      
      expect(response.success).toBe(false);
      expect(response.error_code).toBe('PURCHASE_NOT_VERIFIED');
    });
    
    it('should auto-approve high reputation users', async () => {
      // Set user reputation to 85
      // Submit review
      // Verify immediate approval
    });
  });
  
  describe('Vote Casting', () => {
    it('should prevent self-voting', async () => {
      // Create review as user A
      // Attempt to vote as user A
      // Verify error
    });
    
    it('should handle vote changes atomically', async () => {
      // Cast helpful vote
      // Change to unhelpful
      // Verify counts match expected deltas
    });
  });
  
  describe('Performance', () => {
    it('should handle 100 concurrent votes', async () => {
      // Create 100 vote promises
      // Execute in parallel
      // Verify all succeed
      // Check shard distribution
    });
  });
});
```

### 4.3 Monitoring & Observability

**Key Metrics to Track**:
1. Review submission rate by product
2. Moderation queue depth
3. Average moderation time
4. Vote velocity per review
5. Vendor reply rate
6. Job queue failures

**Alerts to Configure**:
1. Moderation queue > 100 pending
2. Vote rate > 1000/minute (potential attack)
3. Job failures > 5% in 5 minutes
4. Review submission errors > 10/hour

---

## Part 5: Implementation Sequence

### Phase 1: Foundation (Day 1)
1. Create Edge Functions with basic structure
2. Implement review-manager with fetch action
3. Create reviewClient.ts
4. Test basic review fetching

### Phase 2: Review Submission (Day 2)
1. Implement submit action in review-manager
2. Add ReviewSubmissionForm component
3. Integrate with product page
4. Test purchase verification

### Phase 3: Voting System (Day 3)
1. Create vote-manager Edge Function
2. Implement vote casting in reviewClient
3. Add voting UI to ReviewCard
4. Test sharded counting

### Phase 4: Vendor Features (Day 4)
1. Create reply-manager Edge Function
2. Implement VendorReplyForm
3. Add vendor detection logic
4. Test vendor authorization

### Phase 5: Polish & Performance (Day 5)
1. Add infinite scroll pagination
2. Implement review filters
3. Add loading states
4. Performance optimization
5. Final testing

---

## Security Considerations

1. **Purchase Verification**: Every review must be tied to a verified order
2. **Rate Limiting**: Implement at Edge Function level
3. **Content Sanitization**: Strip HTML/scripts before storage
4. **Vendor Authorization**: Double-check product ownership
5. **Sharded Counting**: Prevents vote manipulation at scale
6. **Reputation System**: Auto-moderation for trusted users

---

## Performance Targets

- Review Fetching: < 100ms (cached)
- Review Submission: < 200ms
- Vote Casting: < 50ms (sharded)
- Vendor Reply: < 100ms
- Page Load with Reviews: < 1s

---

## Success Criteria

✅ Customers can submit reviews only for purchased products  
✅ Reviews appear after moderation (or instantly for trusted users)  
✅ Voting system prevents manipulation  
✅ Vendors can reply to reviews on their products only  
✅ Performance meets all targets under load  
✅ Zero security vulnerabilities in penetration testing  

---

## Conclusion

This blueprint provides a complete, production-ready integration strategy that:
1. Leverages our bulletproof backend infrastructure
2. Follows established patterns (dual-client Edge Functions)
3. Provides excellent user experience with optimistic updates
4. Maintains security at every layer
5. Scales to millions of reviews

**The Trust Engine is ready for activation. Awaiting execution command.**
