import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
/**
 * Metrics Worker Edge Function v1.0
 *
 * Processes queued metrics updates in batches.
 * Admin-gated at Edge; executes DB functions with service role.
 */ Deno.serve(async (req)=>{
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    });
  }
  try {
    const url = new URL(req.url);
    const batchSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('batch_size') || '25', 10)));
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    const user = await verifyUser(authHeader, userClient);
    if (!user) {
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    if (!user.roles?.includes('admin')) {
      return errorResponse('Admin access required', 'FORBIDDEN', 403, cors);
    }
    // Process queue using service role (function restricted to service_role)
    const { data, error } = await serviceClient.rpc('process_metrics_update_queue', {
      p_batch_size: batchSize
    });
    if (error) {
      console.error('[metrics-worker] RPC error:', error);
      return errorResponse(error.message || 'Failed to process metrics queue', 'RPC_ERROR', 500, cors);
    }
    return new Response(JSON.stringify({
      success: true,
      result: data
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.error('[metrics-worker] Error:', e);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
