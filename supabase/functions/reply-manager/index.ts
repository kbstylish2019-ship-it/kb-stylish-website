import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
import { sanitizeText, isValidUUID } from '../_shared/validation.ts';

/**
 * Reply Manager Edge Function v2.0
 * 
 * Vendor-only endpoint for replying to reviews:
 * - Verifies vendor role and product ownership
 * - One reply per review enforcement
 * - Moderation queue integration
 * 
 * Full Phase 4 implementation complete
 */

interface ReplyRequest {
  action: 'submit' | 'update' | 'delete' | 'fetch';
  review_id?: string;
  comment?: string;
  reply_id?: string;
  product_id?: string;
}

interface ReplyResponse {
  success: boolean;
  reply?: {
    id: string;
    comment: string;
    created_at: string;
    updated_at?: string;
  };
  message?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  
  try {
    const requestData: ReplyRequest = await req.json();
    console.log('[Reply Manager] Action:', requestData.action);
    
    // Create clients
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    
    // For fetch action, authentication is optional
    if (requestData.action === 'fetch') {
      return await handleFetchReplies(requestData, serviceClient);
    }
    
    // All other actions require vendor authentication
    const authenticatedUser = await verifyUser(authHeader, userClient);
    
    if (!authenticatedUser) {
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    
    // Check vendor role using normalized fields from shared auth
    const hasVendorRole = authenticatedUser?.is_vendor === true || authenticatedUser?.roles?.includes('vendor');
    if (!hasVendorRole) {
      console.log('[Reply Manager] User lacks vendor role:', authenticatedUser.id);
      return errorResponse('Vendor access required', 'VENDOR_ONLY', 403, cors);
    }
    
    switch (requestData.action) {
      case 'submit':
        return await handleSubmitReply(requestData, userClient, serviceClient, authenticatedUser, cors);
      
      case 'update':
        return await handleUpdateReply(requestData, serviceClient, authenticatedUser, cors);
      
      case 'delete':
        return await handleDeleteReply(requestData, serviceClient, authenticatedUser, cors);
      
      default:
        return errorResponse('Invalid action', 'INVALID_ACTION', 400, cors);
    }
  } catch (error) {
    console.error('[Reply Manager] Error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});

/**
 * Handle vendor reply submission with ownership verification
 */
async function handleSubmitReply(
  request: ReplyRequest,
  userClient: any,
  serviceClient: any,
  authenticatedUser: any,
  cors: Record<string, string>
): Promise<Response> {
  const { review_id, comment } = request;
  
  // Validate inputs
  if (!review_id || !isValidUUID(review_id)) {
    return errorResponse('Valid review ID required', 'INVALID_REVIEW_ID', 400, cors);
  }
  
  if (!comment || comment.trim().length === 0) {
    return errorResponse('Reply comment required', 'COMMENT_REQUIRED', 400, cors);
  }
  
  // Sanitize and validate comment length
  const sanitizedComment = sanitizeText(comment, 2000);
  if (!sanitizedComment || sanitizedComment.length < 10) {
    return errorResponse('Reply must be at least 10 characters', 'COMMENT_TOO_SHORT', 400, cors);
  }
  
  if (sanitizedComment.length > 2000) {
    return errorResponse('Reply must be less than 2000 characters', 'COMMENT_TOO_LONG', 400, cors);
  }
  
  console.log(`[Reply Manager] Vendor ${authenticatedUser.id} submitting reply to review ${review_id}`);
  
  // Call the secure RPC that verifies ownership (auth.uid() inside RPC)
  const { data, error } = await userClient.rpc('submit_vendor_reply_secure', {
    p_review_id: review_id,
    p_comment: sanitizedComment
  });
  
  if (error) {
    console.error('[Reply Manager] RPC error:', error);
    
    // Handle specific error cases
    if (error.message?.includes('not found')) {
      return errorResponse('Review not found', 'REVIEW_NOT_FOUND', 404, cors);
    }
    if (error.message?.includes('not the vendor')) {
      return errorResponse('You can only reply to reviews of your own products', 'NOT_PRODUCT_VENDOR', 403, cors);
    }
    if (error.message?.includes('already exists')) {
      return errorResponse('You have already replied to this review', 'REPLY_EXISTS', 409, cors);
    }
    
    return errorResponse('Failed to submit reply', 'SUBMISSION_FAILED', 400, cors);
  }
  
  // Check RPC response
  if (!data?.success) {
    return errorResponse(
      data?.error || 'Failed to submit reply',
      data?.error_code || 'SUBMISSION_FAILED',
      400,
      cors
    );
  }
  
  const response: ReplyResponse = {
    success: true,
    reply: {
      id: data.reply_id,
      comment: sanitizedComment,
      created_at: data.created_at || new Date().toISOString()
    },
    message: 'Reply submitted successfully'
  };
  
  return new Response(
    JSON.stringify(response),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Handle vendor reply update
 */
async function handleUpdateReply(
  request: ReplyRequest,
  serviceClient: any,
  authenticatedUser: any,
  cors: Record<string, string>
): Promise<Response> {
  const { reply_id, comment } = request;
  
  // Validate inputs
  if (!reply_id || !isValidUUID(reply_id)) {
    return errorResponse('Valid reply ID required', 'INVALID_REPLY_ID', 400, cors);
  }
  
  if (!comment || comment.trim().length === 0) {
    return errorResponse('Reply comment required', 'COMMENT_REQUIRED', 400, cors);
  }
  
  // Sanitize comment
  const sanitizedComment = sanitizeText(comment, 2000);
  if (!sanitizedComment || sanitizedComment.length < 10) {
    return errorResponse('Reply must be at least 10 characters', 'COMMENT_TOO_SHORT', 400, cors);
  }
  
  console.log(`[Reply Manager] Vendor ${authenticatedUser.id} updating reply ${reply_id}`);
  
  // Update the reply (RLS will verify ownership). Unified table: review_replies
  const { data, error } = await serviceClient
    .from('review_replies')
    .update({
      comment: sanitizedComment,
      is_edited: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', reply_id)
    .eq('user_id', authenticatedUser.id) // Ensure ownership
    .eq('reply_type', 'vendor')
    .is('deleted_at', null)
    .select()
    .single();
  
  if (error) {
    console.error('[Reply Manager] Update error:', error);
    if (error.code === 'PGRST116') {
      return errorResponse('Reply not found or you do not have permission', 'REPLY_NOT_FOUND', 404, cors);
    }
    return errorResponse('Failed to update reply', 'UPDATE_FAILED', 400, cors);
  }
  
  const response: ReplyResponse = {
    success: true,
    reply: {
      id: data.id,
      comment: data.comment,
      created_at: data.created_at,
      updated_at: data.updated_at
    },
    message: 'Reply updated successfully'
  };
  
  return new Response(
    JSON.stringify(response),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Handle vendor reply deletion
 */
async function handleDeleteReply(
  request: ReplyRequest,
  serviceClient: any,
  authenticatedUser: any,
  cors: Record<string, string>
): Promise<Response> {
  const { reply_id } = request;
  
  // Validate inputs
  if (!reply_id || !isValidUUID(reply_id)) {
    return errorResponse('Valid reply ID required', 'INVALID_REPLY_ID', 400, cors);
  }
  
  console.log(`[Reply Manager] Vendor ${authenticatedUser.id} deleting reply ${reply_id}`);
  
  // Soft delete the reply (RLS will verify ownership). Unified table: review_replies
  const { error } = await serviceClient
    .from('review_replies')
    .update({
      deleted_at: new Date().toISOString()
    })
    .eq('id', reply_id)
    .eq('user_id', authenticatedUser.id)
    .eq('reply_type', 'vendor')
    .is('deleted_at', null);
  
  if (error) {
    console.error('[Reply Manager] Delete error:', error);
    return errorResponse('Failed to delete reply', 'DELETE_FAILED', 400, cors);
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Reply deleted successfully'
    }),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Fetch vendor replies for reviews
 */
async function handleFetchReplies(
  request: ReplyRequest,
  serviceClient: any
): Promise<Response> {
  // For unauthenticated fetches, compute CORS headers too
  const cors = getCorsHeaders(null);
  const { product_id } = request;
  
  if (!product_id || !isValidUUID(product_id)) {
    return errorResponse('Valid product ID required', 'INVALID_PRODUCT_ID', 400, cors);
  }
  
  // Fetch all non-deleted vendor replies for the product's reviews using join
  const { data: replies, error } = await serviceClient
    .from('review_replies')
    .select(`
      id,
      review_id,
      comment,
      is_edited,
      created_at,
      updated_at,
      reviews!inner(product_id)
    `)
    .eq('reply_type', 'vendor')
    .eq('reviews.product_id', product_id)
    .eq('is_visible', true)
    .eq('is_approved', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[Reply Manager] Fetch error:', error);
    return errorResponse('Failed to fetch replies', 'FETCH_FAILED', 400, cors);
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      replies: replies || []
    }),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    }
  );
}
