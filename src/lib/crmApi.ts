/**
 * Admin CRM & Loyalty API — client-safe module (no next/headers).
 * Imported by both the /admin/crm Server Component and the CrmClient
 * client component; keep it free of server-only imports.
 */

export interface LoyaltyConfig {
  id: number;
  program_name: string;
  is_active: boolean;
  stamps_required: number;
  reward_max_value_cents: number | null;
  eligible_service_categories: string[] | null;
  updated_at: string;
  updated_by: string | null;
}

export interface CrmCustomer {
  user_id: string;
  email: string | null;
  display_name: string | null;
  signup_at: string;
  bookings_total: number;
  bookings_completed: number;
  booking_spend_cents: number;
  orders_count: number;
  order_spend_cents: number;
  total_spend_cents: number;
  current_stamps: number;
  lifetime_stamps: number;
  rewards_available: number;
  rewards_redeemed: number;
  redemption_cost_cents: number;
}

export interface BranchStats {
  branch_id: string;
  branch_name: string;
  referral_code: string | null;
  claims_total: number;
  claims_this_month: number;
  converted_customers: number;
  attributed_revenue_cents: number;
}

export interface AdminCrmStats {
  month: string;
  timezone: string;
  signups: {
    count: number;
    list: Array<{
      user_id: string;
      email: string | null;
      display_name: string | null;
      created_at: string;
    }>;
  };
  customers: CrmCustomer[];
  branches?: BranchStats[];
  referrals?: { total: number; rewarded: number };
  program: {
    config: LoyaltyConfig;
    stamps_issued: number;
    vouchers_minted: number;
    vouchers_available: number;
    vouchers_redeemed: number;
    total_redemption_cost_cents: number;
  };
  generated_at: string;
}

async function callAdminCrm<T>(
  accessToken: string,
  body: Record<string, unknown>
): Promise<T | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) {
      console.error('[callAdminCrm] NEXT_PUBLIC_SUPABASE_URL not configured');
      return null;
    }

    const response = await fetch(`${baseUrl}/functions/v1/admin-crm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[callAdminCrm] Error response:', error);
      return null;
    }

    const result = await response.json();
    return (result.data as T) ?? null;
  } catch (error) {
    console.error('[callAdminCrm] Exception:', error);
    return null;
  }
}

/**
 * Fetch admin CRM stats (signups, per-customer spend/loyalty, program totals).
 * Requires authenticated admin user. Months are bucketed in Asia/Kathmandu.
 */
export async function fetchAdminCrmStats(
  accessToken: string,
  month?: string
): Promise<AdminCrmStats | null> {
  return callAdminCrm<AdminCrmStats>(accessToken, {
    action: 'get_stats',
    month: month ?? null,
  });
}

/**
 * Update the loyalty program config (threshold, active toggle, name, reward cap).
 * Only provided fields change; pass clear_reward_cap to remove the cap.
 */
export async function updateLoyaltyConfig(
  accessToken: string,
  updates: {
    stamps_required?: number;
    is_active?: boolean;
    program_name?: string;
    reward_max_value_cents?: number;
    clear_reward_cap?: boolean;
  }
): Promise<{ success: boolean; config: LoyaltyConfig } | null> {
  return callAdminCrm<{ success: boolean; config: LoyaltyConfig }>(accessToken, {
    action: 'update_config',
    ...updates,
  });
}
