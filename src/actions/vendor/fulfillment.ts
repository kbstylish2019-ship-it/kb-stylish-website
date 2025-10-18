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

export interface UpdateFulfillmentStatusParams {
  orderItemId: string;
  newStatus: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber?: string;
  shippingCarrier?: string;
}

export interface UpdateFulfillmentStatusResult {
  success: boolean;
  message: string;
  orderItemId?: string;
  newStatus?: string;
}

/**
 * Update fulfillment status of an order item
 * Server Action for vendors to update order fulfillment
 */
export async function updateFulfillmentStatus(
  params: UpdateFulfillmentStatusParams
): Promise<UpdateFulfillmentStatusResult> {
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
    const { data, error } = await supabase.rpc('update_fulfillment_status', {
      p_order_item_id: params.orderItemId,
      p_new_status: params.newStatus,
      p_tracking_number: params.trackingNumber || null,
      p_shipping_carrier: params.shippingCarrier || null,
    });

    if (error) {
      console.error('[updateFulfillmentStatus] Database error:', error);
      return {
        success: false,
        message: error.message || 'Failed to update status',
      };
    }

    const result = data as { success: boolean; message: string; order_item_id?: string; new_status?: string };

    if (!result.success) {
      return {
        success: false,
        message: result.message,
      };
    }

    // Revalidate orders page to show updated data
    revalidatePath('/vendor/orders');
    revalidatePath('/vendor/dashboard');

    return {
      success: true,
      message: result.message,
      orderItemId: result.order_item_id,
      newStatus: result.new_status,
    };
  } catch (error) {
    console.error('[updateFulfillmentStatus] Unexpected error:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}
