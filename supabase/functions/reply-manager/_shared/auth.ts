import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
export function createDualClients(authHeader) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // User client: inherits RLS from auth header
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: authHeader ?? ''
      }
    }
  });
  // Service client: bypasses RLS (SECURITY DEFINER equivalent)
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return {
    userClient,
    serviceClient
  };
}
export async function verifyUser(authHeader, userClient) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring('Bearer '.length);
  // Check if it's just the anon key (guest access)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (token === anonKey) {
    console.log('[Auth] Using anon key for guest access');
    return null;
  }
  // Verify JWT
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (!error && user) {
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
export function errorResponse(message, code = 'ERROR', status = 400, extraHeaders) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    error_code: code
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders ?? {}
    }
  });
}
