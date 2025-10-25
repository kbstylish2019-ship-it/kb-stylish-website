import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: GET /api/bookings
 * 
 * Fetches customer's bookings with optional filters
 * 
 * Query Parameters:
 * - status: 'all' | 'upcoming' | 'past' | 'cancelled' (default: 'all')
 * - search: string (search by service or stylist name)
 * - limit: number (max results, default: 100, max: 1000)
 * - offset: number (pagination offset, default: 0)
 * 
 * Response:
 * {
 *   success: boolean,
 *   bookings: Booking[],
 *   total: number,
 *   error?: string
 * }
 * 
 * Security:
 * - Requires authentication (JWT)
 * - RLS automatically filters to customer's bookings only
 * - Input validation on all parameters
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
    // PARSE & VALIDATE QUERY PARAMETERS
    // ========================================================================
    
    const searchParams = request.nextUrl.searchParams;
    
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    
    // Validate and sanitize inputs
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam), 1), 1000) : 100;
    const offset = offsetParam ? Math.max(parseInt(offsetParam), 0) : 0;
    
    const validStatuses = ['all', 'upcoming', 'past', 'cancelled'];
    const filterStatus = validStatuses.includes(status) ? status : 'all';

    // ========================================================================
    // BUILD QUERY
    // ========================================================================
    
    let query = supabase
      .from('bookings')
      .select(`
        *,
        service:services!bookings_service_id_fkey (
          name,
          duration_minutes,
          category
        ),
        stylist:stylist_profiles!bookings_stylist_user_id_fkey (
          display_name,
          user_id
        ),
        rating:stylist_ratings!stylist_ratings_booking_id_fkey (
          rating,
          review_text,
          created_at
        )
      `)
      .eq('customer_user_id', user.id)
      .order('start_time', { ascending: false });

    // Apply status filter
    if (filterStatus === 'upcoming') {
      query = query
        .gte('start_time', new Date().toISOString())
        .in('status', ['pending', 'confirmed']);
    } else if (filterStatus === 'past') {
      query = query
        .lt('start_time', new Date().toISOString())
        .not('status', 'eq', 'cancelled');
    } else if (filterStatus === 'cancelled') {
      query = query.eq('status', 'cancelled');
    }

    // Apply pagination
    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.range(offset, offset + limit - 1);
    }

    // ========================================================================
    // EXECUTE QUERY
    // ========================================================================
    
    const { data: bookings, error: queryError } = await query;

    if (queryError) {
      console.error('[/api/bookings] Query error:', queryError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bookings' },
        { status: 500 }
      );
    }

    // ========================================================================
    // TRANSFORM DATA
    // ========================================================================
    
    const transformedBookings = (bookings || []).map(booking => ({
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
        category: booking.service.category,
      } : null,
      stylist: booking.stylist ? {
        displayName: booking.stylist.display_name,
        avatarUrl: null, // TODO: Fetch from user_profiles separately if needed
      } : null,
      rating: booking.rating && (Array.isArray(booking.rating) ? booking.rating.length > 0 : booking.rating) ? {
        rating: Array.isArray(booking.rating) ? booking.rating[0].rating : booking.rating.rating,
        review_text: Array.isArray(booking.rating) ? booking.rating[0].review_text : booking.rating.review_text,
        created_at: Array.isArray(booking.rating) ? booking.rating[0].created_at : booking.rating.created_at,
      } : null,
    }));

    // Apply client-side search filter (if needed for small datasets)
    // For large datasets, this should be done in the database query
    const filteredBookings = search
      ? transformedBookings.filter(b =>
          b.service?.name.toLowerCase().includes(search.toLowerCase()) ||
          b.stylist?.displayName.toLowerCase().includes(search.toLowerCase())
        )
      : transformedBookings;

    // ========================================================================
    // RETURN RESPONSE
    // ========================================================================
    
    return NextResponse.json({
      success: true,
      bookings: filteredBookings,
      total: filteredBookings.length,
    });

  } catch (error) {
    console.error('[/api/bookings] Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
