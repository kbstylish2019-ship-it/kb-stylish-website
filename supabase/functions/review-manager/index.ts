import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
import { sanitizeText, validateRating, isValidUUID, validatePagination } from '../_shared/validation.ts';

/**
 * Review Manager Edge Function v1.0
 * 
 * Secure gateway for review operations following the Trust Engine architecture:
 * - Purchase-verified review submission via submit_review_secure RPC
 * - Paginated review fetching with filters
 * - Review updates and deletions
 * 
 * Uses dual-client pattern for authentication and service operations
 */

interface ReviewRequest {
  action: 'fetch' | 'submit' | 'update' | 'delete';
  
  // For fetch
  filters?: {
    productId?: string;
    userId?: string;
    status?: 'approved' | 'pending' | 'all';
    rating?: number | number[];
    hasPhotos?: boolean;
    hasReply?: boolean;
    verified?: boolean;
    sortBy?: 'recent' | 'helpful';
  };
  cursor?: string;
  limit?: number;
  
  // For submit/update
  productId?: string;
  orderId?: string;
  rating?: number;
  title?: string;
  comment?: string;
  
  // For update/delete
  reviewId?: string;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  
  try {
    // Parse request
    const requestData: ReviewRequest = await req.json();
    console.log('[Review Manager] Action:', requestData.action);
    
    // Create dual clients
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    
    // Verify user (optional for fetch, required for other actions)
    const authenticatedUser = await verifyUser(authHeader, userClient);
    
    switch (requestData.action) {
      case 'fetch':
        return await handleFetchReviews(requestData, serviceClient, authenticatedUser, cors);
      
      case 'submit':
        if (!authenticatedUser) {
          return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
        }
        return await handleSubmitReview(requestData, userClient, authenticatedUser, cors);
      
      case 'update':
        if (!authenticatedUser) {
          return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
        }
        return errorResponse('Update not yet implemented', 'NOT_IMPLEMENTED', 501, cors);
      
      case 'delete':
        if (!authenticatedUser) {
          return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
        }
        return errorResponse('Delete not yet implemented', 'NOT_IMPLEMENTED', 501, cors);
      
      default:
        return errorResponse('Invalid action', 'INVALID_ACTION', 400, cors);
    }
  } catch (error) {
    console.error('[Review Manager] Error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});

/**
 * Handle review fetching with pagination and filters
 */
async function handleFetchReviews(
  request: ReviewRequest,
  serviceClient: any,
  authenticatedUser: any,
  cors: Record<string, string>
) {
  console.log('[Review Manager] handleFetchReviews called with:', JSON.stringify({
    filters: request.filters,
    cursor: request.cursor,
    limit: request.limit,
    hasAuth: !!authenticatedUser
  }));
  
  const { filters = {}, cursor, limit: requestLimit } = request;
  const { limit } = validatePagination({ limit: requestLimit });
  
  console.log('[Review Manager] Validated limit:', limit);
  
  // Validate product ID if provided
  if (filters.productId && !isValidUUID(filters.productId)) {
    console.log('[Review Manager] Invalid product ID:', filters.productId);
    return errorResponse('Invalid product ID', 'INVALID_PRODUCT_ID', 400, cors);
  }
  
  console.log('[Review Manager] Product ID validated:', filters.productId);
  
  // Build select columns dynamically to support hasReply inner join when needed
  const isVendor = !!authenticatedUser?.is_vendor || authenticatedUser?.roles?.includes('vendor');
  const isAdmin = authenticatedUser?.roles?.includes('admin');
  // FIX: Use explicit foreign key constraint to disambiguate multiple relationships
  // reviews table has 3 FKs to user_profiles: user_id, moderated_by, deleted_by
  // PostgREST requires explicit constraint name when multiple relationships exist
  const selectColumns = `
      *,
      author:user_profiles!reviews_user_id_fkey(display_name, avatar_url),
      product:products!inner(vendor_id),
      vendor_reply:review_replies(id, comment, reply_type, is_visible, is_approved, deleted_at, created_at),
      review_vote_shards(helpful_count, unhelpful_count)
    `;
  // Build query
  let query = serviceClient
    .from('reviews')
    .select(selectColumns);
  
  // Apply filters
  if (filters.productId) {
    query = query.eq('product_id', filters.productId);
  }
  
  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }
  
  // Status filter (default to approved only) with role gating
  const allowsVendorView = isVendor && !!filters.productId;
  const allowsModeratedView = isAdmin || allowsVendorView;
  if (filters.status === 'all' && allowsModeratedView) {
    // no extra filter; includes all statuses for authorized viewers
    if (allowsVendorView) {
      query = query.eq('product.vendor_id', authenticatedUser.id);
    }
  } else if (filters.status === 'pending' && allowsModeratedView) {
    query = query.eq('moderation_status', 'pending');
    if (allowsVendorView) {
      query = query.eq('product.vendor_id', authenticatedUser.id);
    }
  } else {
    // Default: Show approved reviews + user's own pending reviews
    // This allows users to see their pending reviews on product pages
    // RLS policy ensures security (users can only see their own pending reviews)
    if (authenticatedUser) {
      // Show: (1) all approved reviews OR (2) user's own reviews (any status)
      query = query.or(`is_approved.eq.true,user_id.eq.${authenticatedUser.id}`);
    } else {
      // Guest users: approved only
      query = query.eq('is_approved', true);
    }
  }
  
  // Rating filter - can be single value or array
  if (filters.rating) {
    if (Array.isArray(filters.rating)) {
      query = query.in('rating', filters.rating);
    } else {
      query = query.eq('rating', filters.rating);
    }
  }
  
  // Verified purchase filter
  if (filters.verified === true) {
    // All reviews are purchase-verified by design (order-linked). Keep filter explicit.
    query = query.not('order_id', 'is', null);
  }
  
  // Has photos/media filter
  if (filters.hasPhotos === true) {
    query = query.eq('has_media', true);
  }
  
  // Has vendor reply filter - requires manual filtering in post-processing
  // PostgREST doesn't support parent-level filtering on embedded many-to-one relations
  // We'll filter in JavaScript after fetching
  const filterByReply = filters.hasReply === true;
  
  // Sort by helpfulness (most helpful first) using denormalized column
  if (filters.sortBy === 'helpful') {
    query = query.order('helpful_votes', { ascending: false });
  }
  
  // Always filter out deleted reviews
  query = query.is('deleted_at', null);
  
  // Apply pagination
  if (cursor) {
    query = query.lt('created_at', cursor);
  }
  
  // Order by creation date when not sorting by helpfulness
  if (filters.sortBy !== 'helpful') {
    query = query.order('created_at', { ascending: false });
  }
  query = query.limit(limit);
  
  console.log('[Review Manager] About to execute query with filters:', {
    productId: filters.productId,
    sortBy: filters.sortBy,
    hasReply: filters.hasReply,
    limit
  });
  
  const { data: reviews, error } = await query;
  
  console.log('[Review Manager] Query completed. Error:', !!error, 'Reviews:', reviews?.length);
  
  if (error) {
    console.error('[Review Manager] Query error:', JSON.stringify(error, null, 2));
    console.error('[Review Manager] Query details:', {
      productId: filters.productId,
      hasReply: filters.hasReply,
      status: filters.status,
      selectColumns: selectColumns.substring(0, 200) + '...'
    });
    return errorResponse(
      `Failed to fetch reviews: ${error.message || 'Unknown error'}`,
      'QUERY_ERROR',
      400,
      cors
    );
  }
  
  // Batch fetch user votes if authenticated
  let userVotesMap = new Map<string, string>();
  if (authenticatedUser && reviews && reviews.length > 0) {
    const reviewIds = reviews.map((r: any) => r.id);
    const { data: userVotes } = await serviceClient
      .from('review_votes')
      .select('review_id, vote_type')
      .eq('user_id', authenticatedUser.id)
      .in('review_id', reviewIds);
    
    if (userVotes) {
      userVotesMap = new Map(userVotes.map((v: any) => [v.review_id, v.vote_type]));
      console.log(`[Review Manager] Fetched ${userVotes.length} user votes`);
    }
  }
  
  // Process reviews to calculate total votes from shards and map vendor reply
  const processedReviews = (reviews || [])
    .map((review: any) => {
      // Sum up votes from shards
      const totalHelpful = review.review_vote_shards?.reduce(
        (sum: number, shard: any) => sum + (shard.helpful_count || 0), 0
      ) || 0;
      
      const totalUnhelpful = review.review_vote_shards?.reduce(
        (sum: number, shard: any) => sum + (shard.unhelpful_count || 0), 0
      ) || 0;
      
      // Vendor reply normalization - pick only vendor reply if array
      let vendorReply = null as any;
      const vr = (review.vendor_reply ?? null);
      if (Array.isArray(vr)) {
        vendorReply = vr.find((r: any) => r.reply_type === 'vendor' && r.is_visible && r.is_approved && r.deleted_at === null) || null;
      } else if (vr && vr.reply_type === 'vendor' && vr.is_visible && vr.is_approved && vr.deleted_at === null) {
        vendorReply = vr;
      }

      // Get user's vote for this review
      const userVote = userVotesMap.get(review.id) || null;

      // Clean up the response
      const { review_vote_shards, ...cleanReview } = review;
      
      return {
        ...cleanReview,
        vendor_reply: vendorReply ? { id: vendorReply.id, comment: vendorReply.comment, created_at: vendorReply.created_at } : null,
        helpful_votes: totalHelpful,
        unhelpful_votes: totalUnhelpful,
        user_vote: userVote,
        _hasVendorReply: !!vendorReply // Add flag for filtering
      };
    })
    .filter((review: any) => {
      // Apply hasReply filter if requested
      if (filterByReply && !review._hasVendorReply) return false;
      return true;
    })
    .map((review: any) => {
      // Remove internal flag
      const { _hasVendorReply, ...cleanReview } = review;
      return cleanReview;
    });
  
  // Get product stats if fetching for a specific product
  let stats = null;
  if (filters.productId) {
    const { data: product } = await serviceClient
      .from('products')
      .select('average_rating, review_count, rating_distribution')
      .eq('id', filters.productId)
      .single();
    
    if (product) {
      stats = {
        average: product.average_rating,
        total: product.review_count,
        distribution: product.rating_distribution
      };
    }
  }
  
  // Determine next cursor (based on created_at ordering)
  const nextCursor = processedReviews.length === limit 
    ? processedReviews[processedReviews.length - 1].created_at 
    : undefined;
  
  return new Response(
    JSON.stringify({
      success: true,
      reviews: processedReviews,
      nextCursor,
      stats,
      message: `Fetched ${processedReviews.length} reviews`
    }),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Handle review submission with purchase verification
 */
async function handleSubmitReview(
  request: ReviewRequest,
  userClient: any,
  authenticatedUser: any,
  cors: Record<string, string>
) {
  const { productId, orderId, rating, title, comment } = request;
  
  // Validate required fields
  if (!productId || !isValidUUID(productId)) {
    return errorResponse('Valid product ID required', 'INVALID_PRODUCT_ID', 400, cors);
  }
  
  if (!orderId || !isValidUUID(orderId)) {
    return errorResponse('Valid order ID required', 'INVALID_ORDER_ID', 400, cors);
  }
  
  const validatedRating = validateRating(rating);
  if (!validatedRating) {
    return errorResponse('Rating must be between 1 and 5', 'INVALID_RATING', 400, cors);
  }
  
  // Sanitize text inputs
  const sanitizedTitle = sanitizeText(title, 200);
  const sanitizedComment = sanitizeText(comment, 5000);
  
  // Call the secure RPC using auth context (auth.uid() inside RPC)
  const { data, error } = await userClient.rpc('submit_review_secure', {
    p_product_id: productId,
    p_order_id: orderId,
    p_rating: validatedRating,
    p_title: sanitizedTitle || null,
    p_comment: sanitizedComment || null
  });
  
  if (error) {
    console.error('[Review Manager] RPC error:', error);
    return errorResponse('Failed to submit review', 'RPC_ERROR', 400, cors);
  }
  
  // Check RPC response
  if (!data.success) {
    return errorResponse(
      data.error || 'Failed to submit review',
      data.error_code || 'SUBMISSION_FAILED',
      400,
      cors
    );
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      review: {
        id: data.review_id,
        status: data.status,
        message: data.message
      }
    }),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    }
  );
}
