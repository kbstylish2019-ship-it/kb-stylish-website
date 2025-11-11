import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
/**
 * Vendor Dashboard Edge Function v1.0
 * 
 * Secure gateway for vendor analytics dashboard
 * - Calls public.get_vendor_dashboard_stats_v2_1() (SECURITY INVOKER)
 * - RLS enforced via JWT propagation
 * - Returns today + 30-day metrics
 * 
 * Security Model:
 * - Authentication required
 * - Uses userClient for SECURITY INVOKER RPC (JWT propagation)
 * - RLS policies enforce vendor-only access
 * - Admins can override vendor_id via query param
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
    const { userClient, serviceClient } = createDualClients(authHeader);
    const authenticatedUser = await verifyUser(authHeader, userClient);
    if (!authenticatedUser) {
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    console.log('[Vendor Dashboard] Fetching stats for user:', authenticatedUser.id);
    const url = new URL(req.url);
    const vendorId = url.searchParams.get('vendor_id');
    const rpcParams = vendorId ? {
      v_id: vendorId
    } : {};
    const { data, error } = await userClient.rpc('get_vendor_dashboard_stats_v2_1', rpcParams);
    if (error) {
      console.error('[Vendor Dashboard] RPC error:', error);
      if (error.code === '42501') {
        return errorResponse('Access denied: Cannot access other vendor data', 'FORBIDDEN', 403, cors);
      }
      return errorResponse(error.message || 'Failed to fetch dashboard stats', 'RPC_ERROR', 500, cors);
    }
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
    console.error('[Vendor Dashboard] Error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
