import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
/**
 * Admin Dashboard Edge Function v1.3 - FINAL FIX
 * - Uses userClient for JWT propagation
 * - Calls public wrapper which passes user_id to private function
 * - Database validates admin role
 */ Deno.serve(async (req)=>{
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    const { userClient } = createDualClients(authHeader);
    const authenticatedUser = await verifyUser(authHeader, userClient);
    if (!authenticatedUser) {
      console.warn('[Admin Dashboard] No authenticated user');
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    console.log('[Admin Dashboard] Authenticated user:', authenticatedUser.id, 'Roles:', authenticatedUser.roles);
    if (!authenticatedUser.roles?.includes('admin')) {
      console.warn('[Admin Dashboard] Non-admin access attempt:', authenticatedUser.id);
      return errorResponse('Admin access required', 'FORBIDDEN', 403, cors);
    }
    console.log('[Admin Dashboard] Admin verified, fetching platform stats');
    // Call public wrapper (SECURITY INVOKER) which captures auth.uid() and passes to private function
    const { data, error } = await userClient.rpc('get_admin_dashboard_stats_v2_1');
    if (error) {
      console.error('[Admin Dashboard] RPC error:', JSON.stringify(error));
      if (error.code === '42501') {
        return errorResponse('Admin verification failed at database level', 'DB_AUTH_FAILED', 403, cors);
      }
      return errorResponse(error.message || 'Failed to fetch dashboard stats', 'RPC_ERROR', 500, cors);
    }
    console.log('[Admin Dashboard] Successfully fetched stats');
    return new Response(JSON.stringify({
      success: true,
      data
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[Admin Dashboard] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
