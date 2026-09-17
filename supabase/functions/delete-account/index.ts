// delete-account — self-service account closure.
//
// Required by Google Play's data-deletion policy and Apple Guideline 5.1.1(v): an app that
// lets a user create an account must let them delete it from inside the app.
//
// Two steps, in this order:
//   1. public.delete_my_account()  — anonymises the profile, drops addresses/tokens/cart,
//      revokes roles. Runs as the CALLER (auth.uid()), so it can only ever touch self.
//   2. auth admin — scrambles the login email and bans the auth row, so the account cannot
//      be signed into and the original email is freed for a fresh signup.
//
// Step 2 needs the service role and cannot be done from SQL safely, which is why this
// function exists at all rather than the client calling the RPC directly.
//
// Deliberately NOT a hard auth.admin.deleteUser(): orders.user_id is ON DELETE RESTRICT and
// ~30 further FKs are NO ACTION, so a hard delete fails for any customer who ever ordered.
// See supabase/migrations/20260810120000_account_deletion.sql for the full reasoning.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/cors.ts';

const TOMBSTONE_DOMAIN = 'deleted.kbstylish.invalid';
// ~100 years. Supabase has no permanent-ban primitive; this is the idiom.
const BAN_DURATION = '876000h';

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed', error_code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ success: false, error: 'Sign in required', error_code: 'AUTH_REQUIRED' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Caller-scoped client: the RPC reads auth.uid() from this token.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  // getUser() MUST be passed the token explicitly. With no argument, gotrue-js looks for a
  // stored session, finds none (persistSession: false) and returns AuthSessionMissingError —
  // the global Authorization header is used for PostgREST/RPC but not for this call. Every
  // other function in this project already does it this way; see _shared/auth.ts.
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !user) {
    return json({ success: false, error: 'Sign in required', error_code: 'AUTH_REQUIRED' }, 401);
  }

  let reason: string | null = null;
  try {
    const body = await req.json();
    // Explicit confirmation so a stray POST can never close an account.
    if (body?.confirm !== true) {
      return json({ success: false, error: 'Confirmation required', error_code: 'CONFIRM_REQUIRED' }, 400);
    }
    reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null;
  } catch {
    return json({ success: false, error: 'Confirmation required', error_code: 'CONFIRM_REQUIRED' }, 400);
  }

  // Step 1 — anonymise, as the caller.
  const { data: rpcData, error: rpcErr } = await userClient.rpc('delete_my_account', {
    p_reason: reason,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? '';
    if (msg.includes('BUSINESS_ACCOUNT')) {
      return json({
        success: false,
        error_code: 'BUSINESS_ACCOUNT',
        error:
          'Vendor and stylist accounts are closed by our support team so any pending payouts and bookings are settled first. Email kbstylish2019@gmail.com and we will close it for you.',
      }, 409);
    }
    console.error('[delete-account] rpc failed:', msg);
    return json({ success: false, error: 'Could not close the account', error_code: 'DELETE_FAILED' }, 500);
  }

  // Step 2 — disable the login. Best-effort: the personal data is already gone, so a
  // failure here must not report success, but it also must not undo step 1.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: adminErr } = await admin.auth.admin.updateUserById(user.id, {
    email: `deleted+${user.id}@${TOMBSTONE_DOMAIN}`,
    phone: undefined,
    user_metadata: {},
    ban_duration: BAN_DURATION,
  });

  if (adminErr) {
    console.error('[delete-account] auth disable failed:', adminErr.message);
    await admin
      .from('account_deletion_requests')
      .update({ status: 'auth_disable_failed', notes: adminErr.message })
      .eq('user_id', user.id)
      .eq('status', 'completed');

    return json({
      success: false,
      error_code: 'PARTIAL_DELETE',
      error:
        'Your personal details were removed but we could not fully disable the login. Please email kbstylish2019@gmail.com so we can finish closing the account.',
    }, 500);
  }

  // Revoke live sessions so the device is signed out immediately.
  try {
    await admin.auth.admin.signOut(authHeader.substring('Bearer '.length), 'global');
  } catch (e) {
    console.warn('[delete-account] session revoke best-effort failed:', e);
  }

  console.log('[delete-account] closed account', user.id, rpcData);

  return json({
    success: true,
    message: 'Your account has been closed and your personal details removed.',
  });
});
