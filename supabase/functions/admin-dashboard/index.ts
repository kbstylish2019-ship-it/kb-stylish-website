import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';

/**
 * Admin Dashboard Edge Function v1.0
 * 
 * Secure gateway for admin analytics dashboard
 * - Calls private.get_admin_dashboard_stats_v2_1() (SECURITY DEFINER)
 * - Requires admin role verification
 * - Defense-in-depth: Edge + Database verification
 * 
 * Security Model:
 * - Layer 1: Edge Function verifies admin role from JWT
 * - Layer 2: Database function self-verifies via assert_admin()
 * - Uses serviceClient with JWT context for SECURITY DEFINER RPC
 * - Returns platform-wide aggregates (total users, vendors, GMV, etc.)
 */

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  
  try {
    // Create dual clients
    const authHeader = req.headers.get('Authorization');
    const { userClient, serviceClient } = createDualClients(authHeader);
    
    // Layer 1: Edge Function admin verification
    const authenticatedUser = await verifyUser(authHeader, userClient);
    if (!authenticatedUser) {
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    
    if (!authenticatedUser.roles?.includes('admin')) {
      console.warn('[Admin Dashboard] Non-admin access attempt:', authenticatedUser.id);
      return errorResponse('Admin access required', 'FORBIDDEN', 403, cors);
    }
    
    console.log('[Admin Dashboard] Fetching platform stats for admin:', authenticatedUser.id);
    
    // Layer 2: Call SECURITY DEFINER RPC with JWT context
    // CRITICAL: Pass Authorization header to preserve auth.uid() context
    const { data, error } = await serviceClient.rpc(
      'get_admin_dashboard_stats_v2_1',
      {},
      {
        headers: {
          Authorization: authHeader  // JWT context for database function
        }
      }
    );
    
    if (error) {
      console.error('[Admin Dashboard] RPC error:', error);
      
      // Check if it's an auth error (database-level admin check failed)
      if (error.code === '42501') {
        return errorResponse(
          'Admin verification failed at database level',
          'DB_AUTH_FAILED',
          403,
          cors
        );
      }
      
      return errorResponse(
        error.message || 'Failed to fetch dashboard stats',
        'RPC_ERROR',
        500,
        cors
      );
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        data
      }),
      {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('[Admin Dashboard] Error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
