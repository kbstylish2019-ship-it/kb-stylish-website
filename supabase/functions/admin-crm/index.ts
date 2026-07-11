import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, verifyUser, errorResponse } from '../_shared/auth.ts';
/**
 * Admin CRM Edge Function v1.0 — Loyalty + CRM surface
 * Structural copy of admin-dashboard (userClient JWT propagation; public wrapper RPC
 * captures auth.uid(); database self-validates admin role). verify_jwt stays at the
 * platform default (true) — no config.toml entry, same as admin-dashboard.
 *
 * Actions (POST body {action, ...}):
 *  - get_stats      -> public.get_admin_crm_stats_v1(p_month?)
 *  - update_config  -> public.admin_update_loyalty_config_v1(...)
 *  - reconcile      -> public.admin_reconcile_loyalty_v1(p_dry_run)
 */ Deno.serve(async (req) => {
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
      console.warn('[Admin CRM] No authenticated user');
      return errorResponse('Authentication required', 'AUTH_REQUIRED', 401, cors);
    }
    if (!authenticatedUser.roles?.includes('admin')) {
      console.warn('[Admin CRM] Non-admin access attempt:', authenticatedUser.id);
      return errorResponse('Admin access required', 'FORBIDDEN', 403, cors);
    }

    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}));
    }
    const action = (body.action as string) || 'get_stats';

    let rpcName: string;
    let rpcArgs: Record<string, unknown>;
    switch (action) {
      case 'get_stats':
        rpcName = 'get_admin_crm_stats_v1';
        rpcArgs = { p_month: (body.month as string) || null };
        break;
      case 'update_config':
        rpcName = 'admin_update_loyalty_config_v1';
        rpcArgs = {
          p_stamps_required: body.stamps_required ?? null,
          p_is_active: body.is_active ?? null,
          p_program_name: body.program_name ?? null,
          p_reward_max_value_cents: body.reward_max_value_cents ?? null,
          p_clear_reward_cap: body.clear_reward_cap ?? false
        };
        break;
      case 'reconcile':
        rpcName = 'admin_reconcile_loyalty_v1';
        rpcArgs = { p_dry_run: body.dry_run ?? true };
        break;
      default:
        return errorResponse(`Unknown action: ${action}`, 'INVALID_ACTION', 400, cors);
    }

    // Public wrapper (SECURITY INVOKER) captures auth.uid() and passes to private function
    const { data, error } = await userClient.rpc(rpcName, rpcArgs);
    if (error) {
      console.error('[Admin CRM] RPC error:', JSON.stringify(error));
      if (error.code === '42501') {
        return errorResponse('Admin verification failed at database level', 'DB_AUTH_FAILED', 403, cors);
      }
      return errorResponse(error.message || 'Failed to execute CRM action', 'RPC_ERROR', 500, cors);
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
    console.error('[Admin CRM] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
