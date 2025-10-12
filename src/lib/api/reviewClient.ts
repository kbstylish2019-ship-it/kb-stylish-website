'use client';

/**
 * Review API Client - Client-Side Only
 * Trust Engine Integration v1.0
 * 
 * Client-side review management following the cartClient.ts pattern
 * Handles authentication, optimistic updates, and server synchronization
 */

import { createBrowserClient } from '@supabase/ssr';

// ============================================
// Types
// ============================================

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
  userId?: string;
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
  updated_at: string;
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

export interface ReviewStats {
  average: number;
  total: number;
  distribution: Record<string, number>;
}

export interface ReviewFetchResponse {
  success: boolean;
  reviews: ReviewWithMeta[];
  nextCursor?: string;
  stats?: ReviewStats;
  error?: string;
}

export interface VoteResponse {
  success: boolean;
  changed: boolean;
  previous_vote?: string;
  error?: string;
}

export interface VendorReplyResponse {
  success: boolean;
  reply?: {
    id: string;
    comment: string;
    created_at: string;
    updated_at?: string;
  };
  message?: string;
  error?: string;
  error_code?: string;
}

/**
 * ReviewAPIClient - Client-side review management
 * Handles authentication, optimistic updates, and server synchronization
 */
export class ReviewAPIClient {
  private baseUrl: string;
  private anonKey: string;
  private browserClient: any;
  
  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    // Initialize browser client only if we have the required environment variables
    if (typeof window !== 'undefined' && this.baseUrl && this.anonKey) {
      try {
        this.browserClient = createBrowserClient(
          this.baseUrl,
          this.anonKey
        );
        
        console.log('[ReviewAPIClient] Initialized successfully');
      } catch (error) {
        console.warn('[ReviewAPIClient] Failed to initialize browser client:', error);
      }
    }
  }
  
  /**
   * Fetch paginated reviews with advanced filters
   */
  async fetchReviews(
    filters?: {
      productId?: string;
      userId?: string;
      rating?: number | number[];
      hasPhotos?: boolean;
      hasReply?: boolean;
      verified?: boolean;
      sortBy?: 'recent' | 'helpful';
    },
    cursor?: string,
    limit: number = 10
  ): Promise<ReviewFetchResponse> {
    try {
      console.log('[ReviewAPIClient] Fetching reviews with filters:', filters, 'cursor:', cursor);
      
      const response = await fetch(`${this.baseUrl}/functions/v1/review-manager`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          action: 'fetch',
          filters: filters || {},
          cursor,
          limit
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        console.error('[ReviewAPIClient] Fetch failed:', data.error);
        return {
          success: false,
          reviews: [],
          error: data.error || 'Failed to fetch reviews'
        };
      }
      
      console.log(`[ReviewAPIClient] Fetched ${data.reviews?.length || 0} reviews`);
      
      return {
        success: true,
        reviews: data.reviews || [],
        nextCursor: data.nextCursor,
        stats: data.stats,
        error: undefined
      };
    } catch (error) {
      console.error('[ReviewAPIClient] Fetch error:', error);
      return {
        success: false,
        reviews: [],
        error: 'Network error while fetching reviews'
      };
    }
  }
  
  /**
   * Submit a new review (purchase verified)
   */
  async submitReview(data: ReviewSubmission): Promise<ReviewResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/functions/v1/review-manager`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          action: 'submit',
          ...data
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ReviewAPIClient] Submit error:', error);
      return {
        success: false,
        error: 'Network error while submitting review'
      };
    }
  }
  
  /**
   * Cast a helpful/unhelpful vote
   */
  async castVote(
    reviewId: string,
    voteType: 'helpful' | 'unhelpful'
  ): Promise<VoteResponse> {
    try {
      // Route through Next.js API to guarantee authenticated server-side context
      const response = await fetch(`/api/trust/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cast',
          reviewId,
          voteType,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[ReviewAPIClient] Vote error:', error);
      return {
        success: false,
        changed: false,
        error: 'Network error while casting vote'
      };
    }
  }
  
  /**
   * Submit vendor reply (vendor only)
   * @param {string} reviewId - Review ID to reply to
   * @param {string} comment - Vendor reply comment
   * @returns {Promise<VendorReplyResponse>} - Response object with success, reply, and error
   */
  async submitVendorReply(
    reviewId: string,
    comment: string
  ): Promise<VendorReplyResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/functions/v1/reply-manager`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          action: 'submit',
          review_id: reviewId,
          comment
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ReviewAPIClient] Reply error:', error);
      return {
        success: false,
        error: 'Network error while submitting reply'
      };
    }
  }
  
  /**
   * Get authenticated headers
   */
  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Include auth token if available
    if (this.browserClient) {
      try {
        const { data: { session } } = await this.browserClient.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
          console.log('[ReviewAPIClient] Using authenticated request');
        } else {
          // Use anon key for unauthenticated requests
          headers['Authorization'] = `Bearer ${this.anonKey}`;
          console.log('[ReviewAPIClient] Using anonymous request');
        }
      } catch (error) {
        console.warn('[ReviewAPIClient] Failed to get session:', error);
        // Fallback to anon key
        headers['Authorization'] = `Bearer ${this.anonKey}`;
      }
    }
    
    return headers;
  }
}

// Export singleton instance
export const reviewAPI = new ReviewAPIClient();
