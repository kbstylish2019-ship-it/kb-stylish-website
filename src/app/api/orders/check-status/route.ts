import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Check if order exists for a payment intent
 * Used by payment callback to poll for order completion
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const paymentIntentId = searchParams.get('payment_intent_id');

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: 'Missing payment_intent_id parameter' },
      { status: 400 }
    );
  }

  try {
    // Auth: prefer the caller's bearer token, fall back to cookies.
    //
    // The payment callback runs right after a cross-site return from the gateway,
    // where the cookie session is often not visible to this route. The rest of the
    // app authenticates with the browser session's access token (see cartClient's
    // getAuthHeaders), and verify-payment succeeds on that same token. Without this,
    // RLS ("auth.uid() = user_id") matched no rows, the poll reported "order not
    // created" for its full 120s window, and the customer sat on "Finalizing Your
    // Order" while their paid order existed the whole time.
    const authHeader = request.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const isUserToken = bearerToken && bearerToken !== process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
        ...(isUserToken
          ? { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
          : {}),
      }
    );

    // Check if order exists
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at')
      .eq('payment_intent_id', paymentIntentId)
      .single();

    if (error) {
      // Order doesn't exist yet (this is normal during polling)
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          exists: false,
          message: 'Order not created yet'
        });
      }

      console.error('[CheckOrderStatus] Database error:', error);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    // Order exists!
    return NextResponse.json({
      exists: true,
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      created_at: order.created_at
    });

  } catch (error) {
    console.error('[CheckOrderStatus] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
