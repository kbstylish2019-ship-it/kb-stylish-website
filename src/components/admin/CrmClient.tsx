'use client';

import React, { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import AdminStatCard from '@/components/admin/AdminStatCard';
import { Users, Stamp, Ticket, Wallet } from 'lucide-react';
import Link from 'next/link';
import {
  fetchAdminCrmStats,
  updateLoyaltyConfig,
  type AdminCrmStats,
} from '@/lib/crmApi';

const formatNpr = (cents: number) => `NPR ${(cents / 100).toLocaleString('en-IN')}`;

interface CrmClientProps {
  initialStats: AdminCrmStats;
}

export default function CrmClient({ initialStats }: CrmClientProps) {
  const [stats, setStats] = useState<AdminCrmStats>(initialStats);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const config = stats.program.config;
  const [stampsRequired, setStampsRequired] = useState(config.stamps_required);
  const [isActive, setIsActive] = useState(config.is_active);
  const [capRupees, setCapRupees] = useState(
    config.reward_max_value_cents ? String(config.reward_max_value_cents / 100) : ''
  );

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const refresh = async () => {
    const token = await getToken();
    if (!token) return;
    const fresh = await fetchAdminCrmStats(token);
    if (fresh) setStats(fresh);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const token = await getToken();
      if (!token) {
        setNotice({ type: 'error', text: 'Session expired — please refresh and sign in again.' });
        return;
      }

      const capValue = capRupees.trim();
      const result = await updateLoyaltyConfig(token, {
        stamps_required: stampsRequired,
        is_active: isActive,
        ...(capValue === ''
          ? { clear_reward_cap: true }
          : { reward_max_value_cents: Math.round(Number(capValue) * 100) }),
      });

      if (result?.success) {
        setNotice({ type: 'success', text: 'Loyalty program settings saved.' });
        await refresh();
      } else {
        setNotice({ type: 'error', text: 'Failed to save settings. Check values and try again.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Program overview */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          title="New Signups"
          value={stats.signups.count}
          subtitle={`${stats.month} (Asia/Kathmandu)`}
          icon={<Users className="h-5 w-5 text-[var(--kb-primary-brand)]" />}
        />
        <AdminStatCard
          title="Stamps Issued"
          value={stats.program.stamps_issued}
          subtitle="All time"
          icon={<Stamp className="h-5 w-5 text-[var(--kb-primary-brand)]" />}
        />
        <AdminStatCard
          title="Vouchers"
          value={stats.program.vouchers_available}
          subtitle={`${stats.program.vouchers_redeemed} redeemed of ${stats.program.vouchers_minted} minted`}
          icon={<Ticket className="h-5 w-5 text-[var(--kb-primary-brand)]" />}
        />
        <AdminStatCard
          title="Redemption Cost"
          value={formatNpr(stats.program.total_redemption_cost_cents)}
          subtitle="Value of free bookings given"
          icon={<Wallet className="h-5 w-5 text-[var(--kb-primary-brand)]" />}
        />
      </div>

      {/* Config editor */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Loyalty Program Settings</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {config.program_name} — every completed paid stylist booking earns 1 stamp.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Stamps for a free booking</span>
            <input
              type="number"
              min={1}
              max={100}
              value={stampsRequired}
              onChange={(e) => setStampsRequired(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              data-testid="config-stamps-required"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Voucher cap (NPR, blank = none)</span>
            <input
              type="number"
              min={1}
              value={capRupees}
              onChange={(e) => setCapRupees(e.target.value)}
              placeholder="No cap"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              data-testid="config-reward-cap"
            />
          </label>

          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
              data-testid="config-is-active"
            />
            <span className="text-sm font-medium text-neutral-700">Program active</span>
          </label>
        </div>

        {notice && (
          <p
            role="status"
            className={`mt-3 text-sm ${notice.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
          >
            {notice.text}
          </p>
        )}

        <button
          onClick={handleSaveConfig}
          disabled={saving || stampsRequired < 1 || stampsRequired > 100}
          className="mt-4 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          data-testid="config-save"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Salon acquisition (QR posters) */}
      {stats.branches && stats.branches.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Salon Acquisition — QR Posters</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Welcome-stamp claims per salon and how many became paying customers.
                {stats.referrals && ` Friend referrals: ${stats.referrals.total} claimed, ${stats.referrals.rewarded} converted.`}
              </p>
            </div>
            <Link
              href="/admin/crm/posters"
              className="rounded-lg border border-[var(--kb-primary-brand)] px-4 py-2 text-sm font-semibold text-[var(--kb-primary-brand)]"
              data-testid="print-posters-link"
            >
              Print QR Posters
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-testid="crm-branches-table">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Salon</th>
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Claims (month)</th>
                  <th className="py-2 pr-4 font-medium">Claims (total)</th>
                  <th className="py-2 pr-4 font-medium">Became Customers</th>
                  <th className="py-2 font-medium">Attributed Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.branches.map((b) => (
                  <tr key={b.branch_id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-900">
                      {b.branch_name.replace('KB Stylish_', '')}
                    </td>
                    <td className="py-2 pr-4 font-mono text-neutral-600">{b.referral_code || '—'}</td>
                    <td className="py-2 pr-4 text-neutral-600">{b.claims_this_month}</td>
                    <td className="py-2 pr-4 text-neutral-600">{b.claims_total}</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {b.converted_customers}
                      {b.claims_total > 0 &&
                        ` (${Math.round((b.converted_customers / b.claims_total) * 100)}%)`}
                    </td>
                    <td className="py-2 font-medium text-neutral-900">
                      {formatNpr(b.attributed_revenue_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signups this month */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          New Signups — {stats.month}
        </h2>
        {stats.signups.list.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No signups yet this month.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 font-medium">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {stats.signups.list.map((s) => (
                  <tr key={s.user_id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-900">{s.display_name || '—'}</td>
                    <td className="py-2 pr-4 text-neutral-600">{s.email || '—'}</td>
                    <td className="py-2 text-neutral-500">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customers */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Customers</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Bookings, spend, and loyalty status per customer (sorted by total spend).
        </p>
        {stats.customers.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No customer activity yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-testid="crm-customers-table">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Bookings</th>
                  <th className="py-2 pr-4 font-medium">Total Spend</th>
                  <th className="py-2 pr-4 font-medium">Stamps</th>
                  <th className="py-2 pr-4 font-medium">Vouchers</th>
                  <th className="py-2 font-medium">Redemption Cost</th>
                </tr>
              </thead>
              <tbody>
                {stats.customers.map((c) => (
                  <tr key={c.user_id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">
                      <div className="text-neutral-900">{c.display_name || '—'}</div>
                      <div className="text-xs text-neutral-400">{c.email || c.user_id}</div>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {c.bookings_completed}/{c.bookings_total} completed
                    </td>
                    <td className="py-2 pr-4 font-medium text-neutral-900">
                      {formatNpr(c.total_spend_cents)}
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {c.current_stamps}/{config.stamps_required}
                      <span className="text-xs text-neutral-400"> ({c.lifetime_stamps} lifetime)</span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {c.rewards_available} available, {c.rewards_redeemed} used
                    </td>
                    <td className="py-2 text-neutral-600">{formatNpr(c.redemption_cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
