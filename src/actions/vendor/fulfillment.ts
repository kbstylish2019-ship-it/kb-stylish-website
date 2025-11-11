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

    // ========================================================================
    // SEND ORDER SHIPPED EMAIL
    // ========================================================================
    if (params.newStatus === 'shipped') {
      try {
        // Get order details including customer info
        const { data: orderItem } = await supabase
          .from('order_items')
          .select(`
            *,
            orders!inner(
              id,
              user_id,
              order_number,
              shipping_name
            )
          `)
          .eq('id', params.orderItemId)
          .single();
        
        if (orderItem?.orders) {
          // Get customer email from auth
          const { data: { user } } = await supabase.auth.admin.getUserById(orderItem.orders.user_id);
          
          if (user?.email) {
            // Trigger send-email Edge Function
            await supabase.functions.invoke('send-email', {
              body: {
                email_type: 'order_shipped',
                recipient_email: user.email,
                recipient_user_id: orderItem.orders.user_id,
                recipient_name: orderItem.orders.shipping_name,
                reference_id: orderItem.orders.id,
                reference_type: 'order',
                template_data: {
                  customerName: orderItem.orders.shipping_name,
                  orderNumber: orderItem.orders.order_number,
                  trackingNumber: params.trackingNumber || null,
                  shippingCarrier: params.shippingCarrier || null,
                  estimatedDelivery: null, // Can add later
                  trackingUrl: `https://kbstylish.com.np/orders/${orderItem.orders.order_number}`,
                },
              },
            });
            console.log('[Fulfillment] Shipped email triggered for order:', orderItem.orders.order_number);
          }
        }
      } catch (emailError) {
        // Don't fail the status update if email fails
        console.error('[Fulfillment] Failed to send shipped email:', emailError);
      }
    }

    // ========================================================================
    // SEND ORDER CANCELLED EMAIL
    // ========================================================================
    if (params.newStatus === 'cancelled') {
      try {
        // Get order details including customer info and all items
        const { data: orderItem } = await supabase
          .from('order_items')
          .select(`
            *,
            orders!inner(
              id,
              user_id,
              order_number,
              shipping_name,
              subtotal_cents,
              total_cents,
              payment_status,
              order_items(
                id,
                product_name,
                quantity,
                price_at_purchase
              )
            )
          `)
          .eq('id', params.orderItemId)
          .single();
        
        if (orderItem?.orders) {
          // Get customer email from auth
          const { data: { user } } = await supabase.auth.admin.getUserById(orderItem.orders.user_id);
          
          if (user?.email) {
            // Build items array for email template
            const items = orderItem.orders.order_items.map((item: any) => ({
              name: item.product_name,
              quantity: item.quantity,
              price: item.price_at_purchase,
            }));

            // Determine refund info
            const refundAmount = orderItem.orders.payment_status === 'captured' 
              ? orderItem.orders.total_cents 
              : null;

            // Trigger send-email Edge Function
            await supabase.functions.invoke('send-email', {
              body: {
                email_type: 'order_cancelled',
                recipient_email: user.email,
                recipient_user_id: orderItem.orders.user_id,
                recipient_name: orderItem.orders.shipping_name,
                reference_id: orderItem.orders.id,
                reference_type: 'order_cancelled',
                template_data: {
                  customerName: orderItem.orders.shipping_name || 'Valued Customer',
                  orderNumber: orderItem.orders.order_number,
                  cancelledDate: new Date().toLocaleDateString('en-NP'),
                  cancelledTime: new Date().toLocaleTimeString('en-NP'),
                  reason: 'Cancelled by vendor', // Can be made dynamic
                  refundAmount: refundAmount,
                  refundMethod: 'Original payment method',
                  refundETA: '3-5 business days',
                  items: items,
                  subtotal: orderItem.orders.subtotal_cents,
                  supportEmail: 'support@kbstylish.com.np',
                },
              },
            });
            console.log('[Fulfillment] Cancelled email triggered for order:', orderItem.orders.order_number);
          }
        }
      } catch (emailError) {
        // Don't fail the status update if email fails
        console.error('[Fulfillment] Failed to send cancelled email:', emailError);
      }
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
