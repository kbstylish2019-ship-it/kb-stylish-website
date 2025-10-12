
/**
 * Shared Authentication Utilities for Edge Functions
 * Following the proven dual-client pattern from cart-manager v26
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  roles?: string[];
  is_vendor?: boolean;
}

/**
 * Create dual clients for authentication and service operations
 */
export function createDualClients(authHeader: string | null) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  // User client for auth verification with proper auth context
  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        // Critical: Auth context must be in global headers for getUser() to work
        headers: { Authorization: authHeader ?? '' },
      },
    }
  );
  
  // Service client for RPC calls (since RPCs are locked to service_role)
  const serviceClient = createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
  
  return { userClient, serviceClient };
}

/**
 * Verify user authentication and extract user details
 */
export async function verifyUser(
  authHeader: string | null,
  userClient: any
): Promise<AuthenticatedUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring('Bearer '.length);
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  // Check if this is the anon key (for guest access)
  if (token === anonKey) {
    console.log('[Auth] Using anon key for guest access');
    return null;
  }
  
  // Try to verify as a user JWT
  const { data: { user }, error } = await userClient.auth.getUser(token);
  
  if (!error && user) {
    // Extract roles from JWT metadata (check both sources for resilience)
    const roles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
    const isVendor = roles.includes('vendor');
    
    console.log('[Auth] Authenticated user:', user.id, 'Roles:', roles, 'Vendor:', isVendor);
    return {
      id: user.id,
      email: user.email ?? undefined,
      roles,
      is_vendor: isVendor
    };
  }
  
  console.error('[Auth] JWT verification failed:', error?.message || 'Unknown error');
  return null;
}

/**
 * Standard error response
 */
export function errorResponse(
  message: string,
  code: string = 'ERROR',
  status = 400,
  extraHeaders?: Record<string, string>
) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      error_code: code
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) }
    }
  );
}
