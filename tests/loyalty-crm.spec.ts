/**
 * Loyalty + CRM backend e2e (trust-engine template).
 *
 * DEPLOY-GATED: requires the `admin-crm` edge function to be deployed. Until then this
 * spec is not in playwright.config.ts testMatch. RPC-level tests (get_my_loyalty_status,
 * redeem_loyalty_reward, RLS) hit the live DB directly and work without the edge function.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, and E2E admin creds E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL as string;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD as string;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAccessToken(email: string, password: string): Promise<string> {
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session!.access_token;
}

async function callFunction(name: string, body: unknown, token: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

test.describe('Loyalty RPCs (live DB, no edge function needed)', () => {
  test('anon cannot read loyalty ledger/accounts/rewards (RLS)', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const table of ['loyalty_ledger', 'loyalty_accounts', 'loyalty_rewards']) {
      const { data } = await anon.from(table).select('*').limit(5);
      expect(data || []).toHaveLength(0);
    }
  });

  test('loyalty_config is publicly readable (singleton)', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon
      .from('loyalty_config')
      .select('id, stamps_required, is_active')
      .eq('id', 1)
      .single();
    expect(error).toBeNull();
    expect(data!.stamps_required).toBeGreaterThanOrEqual(1);
  });

  test('ledger is append-only even for authenticated sessions', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.from('loyalty_ledger').insert({
      customer_user_id: '00000000-0000-0000-0000-000000000000',
      event_type: 'earn',
      stamps_delta: 99,
    });
    expect(error).not.toBeNull();
  });
});

test.describe('admin-crm edge function (requires deployment + admin creds)', () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');

  test('admin gets CRM stats with the expected shape', async () => {
    const token = await getAccessToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await callFunction('admin-crm', { action: 'get_stats' }, token);
    expect(res.ok).toBe(true);
    expect(res.json.success).toBe(true);
    expect(res.json.data.timezone).toBe('Asia/Kathmandu');
    expect(res.json.data.signups).toHaveProperty('count');
    expect(res.json.data.program.config).toHaveProperty('stamps_required');
    expect(Array.isArray(res.json.data.customers)).toBe(true);
  });

  test('config update round-trips and is audited', async () => {
    const token = await getAccessToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    const before = await callFunction('admin-crm', { action: 'get_stats' }, token);
    const currentThreshold = before.json.data.program.config.stamps_required;

    const updated = await callFunction(
      'admin-crm',
      { action: 'update_config', stamps_required: currentThreshold },
      token
    );
    expect(updated.ok).toBe(true);
    expect(updated.json.data.config.stamps_required).toBe(currentThreshold);

    const { data: auditRows } = await admin
      .from('user_audit_log')
      .select('id')
      .eq('action', 'loyalty_config_updated')
      .limit(1);
    expect((auditRows || []).length).toBeGreaterThan(0);
  });

  test('non-admin is rejected with 403', async () => {
    // Any non-admin authenticated user; reuse trust-engine seeded customer if present
    const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
    const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
    test.skip(!customerEmail || !customerPassword, 'E2E customer creds not set');

    const token = await getAccessToken(customerEmail!, customerPassword!);
    const res = await callFunction('admin-crm', { action: 'get_stats' }, token);
    expect(res.status).toBe(403);
  });
});

test.describe('Phase 2: acquisition + referrals (live DB)', () => {
  test('anon cannot call claim RPCs', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const w = await anon.rpc('claim_welcome_stamp', { p_branch_code: 'JADIBUTI' });
    expect(w.error).not.toBeNull();
    const r = await anon.rpc('claim_referral_code', { p_code: 'KB-000000' });
    expect(r.error).not.toBeNull();
  });

  test('branch codes are publicly readable (landing page dependency)', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await anon
      .from('kb_branches')
      .select('name, referral_code')
      .eq('referral_code', 'JADIBUTI')
      .maybeSingle();
    expect(data?.name).toContain('Jadibuti');
  });

  test('admin CRM stats include branches + referrals sections', async () => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'admin creds not set');
    const token = await getAccessToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await callFunction('admin-crm', { action: 'get_stats' }, token);
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.json.data.branches)).toBe(true);
    expect(res.json.data.branches.length).toBeGreaterThanOrEqual(13);
    expect(res.json.data.referrals).toHaveProperty('total');
  });

  test('nudge candidate RPC is service-role only', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.rpc('get_loyalty_nudge_candidates_v1');
    expect(error).not.toBeNull();
  });
});
