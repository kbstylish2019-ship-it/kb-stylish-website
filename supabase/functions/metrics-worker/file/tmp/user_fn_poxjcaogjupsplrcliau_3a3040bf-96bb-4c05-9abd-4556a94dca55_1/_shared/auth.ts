import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
export function createDualClients(authHeader) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring('Bearer '.length);
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (token === anonKey) return null;
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (!error && user) {
    const roles = user.app_metadata?.user_roles || [];
    return {
      id: user.id,
      email: user.email ?? undefined,
      roles,
      is_vendor: roles.includes('vendor')
    };
  }
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
