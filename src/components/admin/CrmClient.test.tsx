/**
 * Render + interaction tests for the admin CRM client component.
 * apiClient and the Supabase browser client are mocked.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CrmClient from './CrmClient';
import type { AdminCrmStats } from '@/lib/crmApi';

const mockUpdateLoyaltyConfig = jest.fn();
const mockFetchAdminCrmStats = jest.fn();

jest.mock('@/lib/crmApi', () => ({
  updateLoyaltyConfig: (...args: unknown[]) => mockUpdateLoyaltyConfig(...args),
  fetchAdminCrmStats: (...args: unknown[]) => mockFetchAdminCrmStats(...args),
}));

jest.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}));

const stats: AdminCrmStats = {
  month: '2026-07',
  timezone: 'Asia/Kathmandu',
  signups: {
    count: 3,
    list: [
      {
        user_id: 'u-1',
        email: 'new@user.com',
        display_name: 'New User',
        created_at: new Date().toISOString(),
      },
    ],
  },
  branches: [
    {
      branch_id: 'br-1',
      branch_name: 'KB Stylish_Jadibuti',
      referral_code: 'JADIBUTI',
      claims_total: 4,
      claims_this_month: 2,
      converted_customers: 1,
      attributed_revenue_cents: 50000,
    },
  ],
  referrals: { total: 3, rewarded: 1 },
  customers: [
    {
      user_id: 'u-2',
      email: 'loyal@user.com',
      display_name: 'Loyal Customer',
      signup_at: new Date().toISOString(),
      bookings_total: 9,
      bookings_completed: 7,
      booking_spend_cents: 300000,
      orders_count: 2,
      order_spend_cents: 150000,
      total_spend_cents: 450000,
      current_stamps: 1,
      lifetime_stamps: 6,
      rewards_available: 1,
      rewards_redeemed: 1,
      redemption_cost_cents: 50000,
    },
  ],
  program: {
    config: {
      id: 1,
      program_name: 'KB Stylish Rewards',
      is_active: true,
      stamps_required: 5,
      reward_max_value_cents: null,
      eligible_service_categories: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
    stamps_issued: 6,
    vouchers_minted: 2,
    vouchers_available: 1,
    vouchers_redeemed: 1,
    total_redemption_cost_cents: 50000,
  },
  generated_at: new Date().toISOString(),
};

describe('CrmClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders program stats, signups and customers', () => {
    render(<CrmClient initialStats={stats} />);

    expect(screen.getByText('New Signups')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Stamps Issued')).toBeInTheDocument();
    expect(screen.getByText('New User')).toBeInTheDocument();
    expect(screen.getByText('Loyal Customer')).toBeInTheDocument();
    expect(screen.getByText('7/9 completed')).toBeInTheDocument();
    expect(screen.getByText('NPR 4,500')).toBeInTheDocument();
    expect(screen.getByText('1 available, 1 used')).toBeInTheDocument();
  });

  it('renders the salon acquisition table with conversion math', () => {
    render(<CrmClient initialStats={stats} />);
    expect(screen.getByText('Salon Acquisition — QR Posters')).toBeInTheDocument();
    expect(screen.getByText('JADIBUTI')).toBeInTheDocument();
    expect(screen.getByText('1 (25%)')).toBeInTheDocument();
    expect(screen.getByTestId('print-posters-link')).toHaveAttribute('href', '/admin/crm/posters');
    expect(screen.getByText(/Friend referrals: 3 claimed, 1 converted/)).toBeInTheDocument();
  });

  it('saves config changes through updateLoyaltyConfig', async () => {
    mockUpdateLoyaltyConfig.mockResolvedValue({ success: true, config: stats.program.config });
    mockFetchAdminCrmStats.mockResolvedValue(stats);

    render(<CrmClient initialStats={stats} />);

    fireEvent.change(screen.getByTestId('config-stamps-required'), { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('config-save'));

    await waitFor(() =>
      expect(mockUpdateLoyaltyConfig).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ stamps_required: 7, is_active: true, clear_reward_cap: true })
      )
    );
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
  });

  it('shows an error notice when the save fails', async () => {
    mockUpdateLoyaltyConfig.mockResolvedValue(null);

    render(<CrmClient initialStats={stats} />);
    fireEvent.click(screen.getByTestId('config-save'));

    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument();
  });

  it('disables save for an out-of-range threshold', () => {
    render(<CrmClient initialStats={stats} />);
    fireEvent.change(screen.getByTestId('config-stamps-required'), { target: { value: '0' } });
    expect(screen.getByTestId('config-save')).toBeDisabled();
  });
});
