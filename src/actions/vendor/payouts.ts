'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Helper to create Supabase server client
async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

export interface PayoutData {
  success: boolean;
  payouts: Array<{
    id: string;
    amount_cents: number;
    net_amount_cents: number;
    payment_method: string;
    payment_reference: string | null;
    status: string;
    created_at: string;
    processed_at: string | null;
  }>;
  requests: Array<{
    id: string;
    requested_amount_cents: number;
    payment_method: string;
    status: string;
    created_at: string;
    reviewed_at: string | null;
    rejection_reason: string | null;
  }>;
  summary: {
    total_paid_cents: number;
    pending_payout_cents: number;
    this_month_cents: number;
  };
  available_balance: {
    vendor_id: string;
    delivered_gmv_cents: number;
    platform_fees_cents: number;
    net_earnings_cents: number;
    already_paid_cents: number;
    pending_payout_cents: number;
    can_request_payout: boolean;
  };
}

export interface RequestPayoutParams {
  amountCents: number;
  paymentMethod: 'bank_transfer' | 'esewa' | 'khalti';
  paymentDetails: {
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    phoneNumber?: string;
  };
}

export interface RequestPayoutResult {
  success: boolean;
  message: string;
  requestId?: string;
}

/**
 * Fetch vendor payout data
 * Server Action to get payout history and available balance
 */
export async function getVendorPayouts(): Promise<PayoutData | null> {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[getVendorPayouts] Auth error:', authError);
      return null;
    }

    // Call database function
    const { data, error } = await supabase.rpc('get_vendor_payouts', {
      p_vendor_id: user.id,
      p_limit: 50,
    });

    if (error) {
      console.error('[getVendorPayouts] Database error:', error);
      return null;
    }

    return data as PayoutData;
  } catch (error) {
    console.error('[getVendorPayouts] Unexpected error:', error);
    return null;
  }
}

/**
 * Request a payout
 * Server Action for vendors to request withdrawal of earnings
 */
export async function requestPayout(
  params: RequestPayoutParams
): Promise<RequestPayoutResult> {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    // Call database function
    const { data, error } = await supabase.rpc('request_payout', {
      p_amount_cents: params.amountCents,
      p_payment_method: params.paymentMethod,
      p_payment_details: params.paymentDetails,
    });

    if (error) {
      console.error('[requestPayout] Database error:', error);
      return {
        success: false,
        message: error.message || 'Failed to submit payout request',
      };
    }

    const result = data as { success: boolean; message: string; request_id?: string };

    if (!result.success) {
      return {
        success: false,
        message: result.message,
      };
    }

    // Revalidate payouts page
    revalidatePath('/vendor/payouts');
    revalidatePath('/vendor/dashboard');

    return {
      success: true,
      message: result.message,
      requestId: result.request_id,
    };
  } catch (error) {
    console.error('[requestPayout] Unexpected error:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}

/**
 * Cancel a pending payout request
 * Server Action for vendors to cancel their own pending requests
 */
export async function cancelPayoutRequest(requestId: string): Promise<RequestPayoutResult> {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    // Update request status
    const { error } = await supabase
      .from('payout_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('vendor_id', user.id)
      .eq('status', 'pending');

    if (error) {
      console.error('[cancelPayoutRequest] Database error:', error);
      return {
        success: false,
        message: 'Failed to cancel request',
      };
    }

    // Revalidate payouts page
    revalidatePath('/vendor/payouts');

    return {
      success: true,
      message: 'Payout request cancelled successfully',
    };
  } catch (error) {
    console.error('[cancelPayoutRequest] Unexpected error:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}
