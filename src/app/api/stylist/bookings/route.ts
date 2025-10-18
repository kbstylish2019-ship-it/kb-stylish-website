import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: GET /api/stylist/bookings
 * 
 * Fetches stylist's bookings with filters
 * 
 * Query Parameters:
 * - status: 'all' | 'upcoming' | 'past' | 'cancelled' | 'completed'
 * - search: string (search by customer name)
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 * 
 * Response:
 * {
 *   success: boolean,
 *   bookings: Booking[],
 *   total: number,
 *   error?: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // ========================================================================
    // AUTHENTICATION
    // ========================================================================
    
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Server Component limitation
            }
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ========================================================================
    // AUTHORIZATION: Verify stylist role
    // ========================================================================
    
    const { data: isStylist, error: roleError } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'stylist'
    });

    if (roleError || !isStylist) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Stylist role required' },
        { status: 403 }
      );
    }

    // ========================================================================
    // PARSE QUERY PARAMETERS
    // ========================================================================
    
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get('status') || 'all';
    const searchQuery = searchParams.get('search') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // ========================================================================
    // BUILD QUERY
    // ========================================================================
    
    let query = supabase
      .from('bookings')
      .select(`
        id,
        customer_name,
        customer_phone,
        customer_email,
        customer_notes,
        stylist_notes,
        start_time,
        end_time,
        status,
        price_cents,
        booking_source,
        created_at,
        cancelled_at,
        cancellation_reason,
        service:services(
          name,
          duration_minutes,
          category
        )
      `, { count: 'exact' })
      .eq('stylist_user_id', user.id)
      .order('start_time', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply status filter
    const now = new Date().toISOString();
    
    if (statusFilter === 'upcoming') {
      query = query
        .gte('start_time', now)
        .in('status', ['confirmed', 'pending']);
    } else if (statusFilter === 'past') {
      query = query
        .lt('start_time', now)
        .not('status', 'in', '(cancelled)');
    } else if (statusFilter === 'cancelled') {
      query = query.eq('status', 'cancelled');
    } else if (statusFilter === 'completed') {
      query = query.eq('status', 'completed');
    }
    // 'all' = no additional filter

    // Apply search filter
    if (searchQuery) {
      query = query.ilike('customer_name', `%${searchQuery}%`);
    }

    // ========================================================================
    // EXECUTE QUERY
    // ========================================================================
    
    const { data: bookings, error, count } = await query;

    if (error) {
      console.error('[bookings] Query error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bookings' },
        { status: 500 }
      );
    }

    // ========================================================================
    // TRANSFORM RESPONSE
    // ========================================================================
    
    const transformedBookings = (bookings || []).map((booking: any) => ({
      id: booking.id,
      customerName: booking.customer_name,
      customerPhone: booking.customer_phone,
      customerEmail: booking.customer_email,
      customerNotes: booking.customer_notes,
      stylistNotes: booking.stylist_notes,
      startTime: booking.start_time,
      endTime: booking.end_time,
      status: booking.status,
      priceCents: booking.price_cents,
      bookingSource: booking.booking_source,
      createdAt: booking.created_at,
      cancelledAt: booking.cancelled_at,
      cancellationReason: booking.cancellation_reason,
      service: booking.service ? {
        name: booking.service.name,
        durationMinutes: booking.service.duration_minutes,
        category: booking.service.category
      } : null
    }));

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    
    return NextResponse.json({
      success: true,
      bookings: transformedBookings,
      total: count || 0,
      limit,
      offset
    });

  } catch (error) {
    console.error('[bookings] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
