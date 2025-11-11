import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from './_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from './_shared/auth.ts';
import { isValidUUID, extractIPAddress, hashUserAgent } from './_shared/validation.ts';
Deno.serve(async (req)=>{
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    });
  }
  try {
    const requestData = await req.json();
    console.log('[Vote Manager] Action:', requestData.action);
    // Voting requires authentication - no guest voting allowed
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    const authenticatedUser = await verifyUser(authHeader, userClient);
    if (!authenticatedUser) {
      return errorResponse('Authentication required for voting', 'AUTH_REQUIRED', 401, cors);
    }
    switch(requestData.action){
      case 'cast':
        return await handleCastVote(requestData, userClient, authenticatedUser, req, cors);
      case 'unvote':
        return await handleUnvote(requestData, userClient, authenticatedUser, cors);
      case 'get_user_votes':
        return await handleGetUserVotes(requestData, serviceClient, authenticatedUser, cors);
      default:
        return errorResponse('Invalid action', 'INVALID_ACTION', 400, cors);
    }
  } catch (error) {
    console.error('[Vote Manager] Error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
/**
 * Handle vote casting with sharded counting
 * CRITICAL: Uses userClient to ensure auth.uid() is set in database
 */ async function handleCastVote(request, userClient, authenticatedUser, req, cors) {
  const { review_id, vote_type } = request;
  // Validate inputs
  if (!review_id || !isValidUUID(review_id)) {
    return errorResponse('Valid review ID required', 'INVALID_REVIEW_ID', 400, cors);
  }
  if (vote_type !== 'helpful' && vote_type !== 'unhelpful') {
    return errorResponse('Vote type must be "helpful" or "unhelpful"', 'INVALID_VOTE_TYPE', 400, cors);
  }
  // Extract tracking information for audit
  const ipAddress = extractIPAddress(req);
  const userAgent = req.headers.get('User-Agent');
  const userAgentHash = await hashUserAgent(userAgent);
  console.log(`[Vote Manager] User ${authenticatedUser.id} casting ${vote_type} vote on review ${review_id}`);
  // CRITICAL: Use userClient (not serviceClient) so auth.uid() is populated
  const { data, error } = await userClient.rpc('cast_review_vote', {
    p_review_id: review_id,
    p_vote_type: vote_type,
    p_ip_address: ipAddress,
    p_user_agent_hash: userAgentHash
  });
  if (error) {
    console.error('[Vote Manager] RPC error:', error);
    // Handle specific error cases
    if (error.message?.includes('self-voting')) {
      return errorResponse('You cannot vote on your own review', 'SELF_VOTE_PROHIBITED', 400, cors);
    }
    if (error.message?.includes('rate limit')) {
      return errorResponse('Too many votes. Please try again later', 'RATE_LIMIT_EXCEEDED', 429, cors);
    }
    return errorResponse('Failed to cast vote', 'VOTE_FAILED', 400, cors);
  }
  // CRITICAL FIX: Check for business logic failures in RPC response
  if (data?.success === false) {
    const errorCode = data?.error_code || 'VOTE_FAILED';
    const errorMessage = data?.error || data?.message || 'Vote failed';
    // Map specific error codes to appropriate HTTP status codes
    const statusCode = errorCode === 'SELF_VOTE_PROHIBITED' ? 400 : errorCode === 'REVIEW_NOT_APPROVED' ? 400 : errorCode === 'REVIEW_NOT_FOUND' ? 404 : errorCode === 'RATE_LIMIT_EXCEEDED' ? 429 : 422;
    console.log(`[Vote Manager] Business logic failure: ${errorCode} - ${errorMessage}`);
    return errorResponse(errorMessage, errorCode, statusCode, cors);
  }
  // If vote unchanged (user tapped the same vote), interpret as toggle-off (unvote)
  if (data?.success === true && data?.changed === false) {
    console.log('[Vote Manager] Toggling off existing vote via unvote_review');
    // CRITICAL: Use userClient for unvote too
    const { data: unvoteData, error: unvoteError } = await userClient.rpc('unvote_review', {
      p_review_id: review_id
    });
    if (unvoteError) {
      console.error('[Vote Manager] Unvote fallback failed:', unvoteError);
      return errorResponse('Failed to toggle vote', 'UNVOTE_FAILED', 400, cors);
    }
    const toggledResponse = {
      success: unvoteData?.success === true,
      changed: true,
      previous_vote: unvoteData?.previous_vote || null,
      message: unvoteData?.message || 'Vote removed'
    };
    return new Response(JSON.stringify(toggledResponse), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
  // Process normal RPC response
  const response = {
    success: data?.success === true,
    changed: data?.changed || false,
    previous_vote: data?.previous_vote || null,
    message: data?.message || (data?.success ? 'Vote recorded successfully' : data?.error || 'Vote failed')
  };
  // Log vote change for analytics
  if (response.changed) {
    console.log(`[Vote Manager] Vote changed: ${response.previous_vote} -> ${vote_type}`);
  }
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Handle unvote (remove user's existing vote)
 * CRITICAL: Uses userClient to ensure auth.uid() is set in database
 */ async function handleUnvote(request, userClient, authenticatedUser, cors) {
  const { review_id } = request;
  if (!review_id || !isValidUUID(review_id)) {
    return errorResponse('Valid review ID required', 'INVALID_REVIEW_ID', 400, cors);
  }
  console.log(`[Vote Manager] User ${authenticatedUser.id} unvoting on review ${review_id}`);
  // CRITICAL: Use userClient (not serviceClient) so auth.uid() is populated
  const { data, error } = await userClient.rpc('unvote_review', {
    p_review_id: review_id
  });
  if (error) {
    console.error('[Vote Manager] Unvote RPC error:', error);
    return errorResponse('Failed to remove vote', 'UNVOTE_FAILED', 400, cors);
  }
  const response = {
    success: data?.success === true,
    changed: data?.changed || false,
    previous_vote: data?.previous_vote || null,
    message: data?.message || (data?.success ? 'Vote removed' : data?.error || 'Unvote failed')
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Get user's votes for multiple reviews
 * Useful for showing "You found this helpful" state
 */ async function handleGetUserVotes(request, serviceClient, authenticatedUser, cors) {
  const { review_ids } = request;
  // Validate inputs
  if (!review_ids || !Array.isArray(review_ids) || review_ids.length === 0) {
    return errorResponse('Review IDs array required', 'INVALID_REVIEW_IDS', 400, cors);
  }
  // Validate all review IDs are valid UUIDs
  const invalidIds = review_ids.filter((id)=>!isValidUUID(id));
  if (invalidIds.length > 0) {
    return errorResponse('Invalid review IDs found', 'INVALID_REVIEW_ID', 400, cors);
  }
  // Limit batch size to prevent abuse
  if (review_ids.length > 50) {
    return errorResponse('Maximum 50 review IDs per request', 'BATCH_SIZE_EXCEEDED', 400, cors);
  }
  console.log(`[Vote Manager] Fetching votes for user ${authenticatedUser.id} on ${review_ids.length} reviews`);
  // Query user's votes
  const { data: votes, error } = await serviceClient.from('review_votes').select('review_id, vote_type').eq('user_id', authenticatedUser.id).in('review_id', review_ids);
  if (error) {
    console.error('[Vote Manager] Query error:', error);
    return errorResponse('Failed to fetch votes', 'QUERY_ERROR', 400, cors);
  }
  // Transform to map for easy lookup
  const votesMap = {};
  for (const vote of votes || []){
    votesMap[vote.review_id] = vote.vote_type;
  }
  const response = {
    success: true,
    votes: votesMap
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
