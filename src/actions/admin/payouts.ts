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

export interface PayoutRequest {
  request_id: string;
  vendor_id: string;
  vendor_name: string;
  requested_amount_cents: number;
  payment_method: string;
  payment_details: Record<string, string>;
  status: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  available_balance: {
    pending_payout_cents: number;
    delivered_gmv_cents: number;
    cancelled_gmv_cents: number;
    platform_fees_cents: number;
  };
}

export interface ApprovePayoutParams {
  requestId: string;
  paymentReference?: string;
  paymentProofUrl?: string;
  adminNotes?: string;
}

export interface RejectPayoutParams {
  requestId: string;
  rejectionReason: string;
}

export interface PayoutActionResult {
  success: boolean;
  message: string;
  payoutId?: string;
  requestId?: string;
}

/**
 * Get all payout requests (admin only)
 * @param status - Filter by status (pending, approved, rejected)
 */
export async function getAdminPayoutRequests(
  status: string = 'pending'
): Promise<PayoutRequest[] | null> {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[getAdminPayoutRequests] Auth error:', authError);
      return null;
    }

    // Call database function
    const { data, error } = await supabase.rpc('get_admin_payout_requests', {
      p_status: status,
      p_limit: 100,
    });

    if (error) {
      console.error('[getAdminPayoutRequests] Database error:', error);
      return null;
    }

    // Return empty array if no data, not null
    return (data as PayoutRequest[]) || [];
  } catch (error) {
    console.error('[getAdminPayoutRequests] Unexpected error:', error);
    return null;
  }
}

/**
 * Approve a payout request (admin only)
 */
export async function approvePayoutRequest(
  params: ApprovePayoutParams
): Promise<PayoutActionResult> {
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
    const { data, error } = await supabase.rpc('approve_payout_request', {
      p_request_id: params.requestId,
      p_payment_reference: params.paymentReference || null,
      p_payment_proof_url: params.paymentProofUrl || null,
      p_admin_notes: params.adminNotes || null,
    });

    if (error) {
      console.error('[approvePayoutRequest] Database error:', error);
      return {
        success: false,
        message: error.message || 'Failed to approve payout request',
      };
    }

    const result = data as { success: boolean; message: string; payout_id?: string; request_id?: string };

    if (!result.success) {
      return {
        success: false,
        message: result.message,
      };
    }

    // Revalidate admin and vendor pages
    revalidatePath('/admin/payouts');
    revalidatePath('/vendor/payouts');

    return {
      success: true,
      message: result.message,
      payoutId: result.payout_id,
      requestId: result.request_id,
    };
  } catch (error) {
    console.error('[approvePayoutRequest] Unexpected error:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}

/**
 * Reject a payout request (admin only)
 */
export async function rejectPayoutRequest(
  params: RejectPayoutParams
): Promise<PayoutActionResult> {
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

    // Validate rejection reason
    if (!params.rejectionReason || params.rejectionReason.trim().length < 10) {
      return {
        success: false,
        message: 'Rejection reason must be at least 10 characters',
      };
    }

    // Call database function
    const { data, error } = await supabase.rpc('reject_payout_request', {
      p_request_id: params.requestId,
      p_rejection_reason: params.rejectionReason.trim(),
    });

    if (error) {
      console.error('[rejectPayoutRequest] Database error:', error);
      return {
        success: false,
        message: error.message || 'Failed to reject payout request',
      };
    }

    const result = data as { success: boolean; message: string; request_id?: string };

    if (!result.success) {
      return {
        success: false,
        message: result.message,
      };
    }

    // Revalidate admin and vendor pages
    revalidatePath('/admin/payouts');
    revalidatePath('/vendor/payouts');

    return {
      success: true,
      message: result.message,
      requestId: result.request_id,
    };
  } catch (error) {
    console.error('[rejectPayoutRequest] Unexpected error:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}
