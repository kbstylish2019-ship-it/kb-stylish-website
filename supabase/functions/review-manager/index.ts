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
  const { filters = {}, cursor, limit: requestLimit } = request;
  const { limit } = validatePagination({ limit: requestLimit });
  
  // Validate product ID if provided
  if (filters.productId && !isValidUUID(filters.productId)) {
    return errorResponse('Invalid product ID', 'INVALID_PRODUCT_ID', 400, cors);
  }
  
  // Build select columns dynamically to support hasReply inner join when needed
  const isVendor = !!authenticatedUser?.is_vendor || authenticatedUser?.roles?.includes('vendor');
  const isAdmin = authenticatedUser?.roles?.includes('admin');
  const joinVendorReplies = filters.hasReply === true ? 'review_replies!inner' : 'review_replies';
  const selectColumns = `
      *,
      user:user_profiles!inner(display_name, avatar_url),
      product:products!inner(vendor_id),
      vendor_reply:${joinVendorReplies}(id, comment, reply_type, is_visible, is_approved, deleted_at, created_at),
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
    // Default: approved only
    query = query.eq('is_approved', true);
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
  
  // Has vendor reply filter handled via inner join above when hasReply === true
  if (filters.hasReply === true) {
    query = query
      .eq('review_replies.reply_type', 'vendor')
      .is('review_replies.deleted_at', null)
      .eq('review_replies.is_visible', true)
      .eq('review_replies.is_approved', true);
  }
  
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
  
  const { data: reviews, error } = await query;
  
  if (error) {
    console.error('[Review Manager] Query error:', error);
    return errorResponse('Failed to fetch reviews', 'QUERY_ERROR', 400, cors);
  }
  
  // Process reviews to calculate total votes from shards and map vendor reply
  const processedReviews = (reviews || []).map((review: any) => {
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

    // Clean up the response
    const { review_vote_shards, ...cleanReview } = review;
    
    return {
      ...cleanReview,
      vendor_reply: vendorReply ? { id: vendorReply.id, comment: vendorReply.comment, created_at: vendorReply.created_at } : null,
      helpful_votes: totalHelpful,
      unhelpful_votes: totalUnhelpful,
      user_vote: null // TODO: Fetch user's vote if authenticated
    };
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
