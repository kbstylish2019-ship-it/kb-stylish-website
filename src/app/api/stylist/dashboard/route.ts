import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: GET /api/stylist/dashboard
 * Fetches context-rich booking data for stylist dashboard
 * 
 * Security: Requires 'stylist' role
 * Privacy: Returns flags only (hasAllergies), not raw PII
 * Returns: Upcoming bookings with customer history enrichment + budget status
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || new Date().toISOString();
    const endDate = searchParams.get('endDate') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

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
        { error: 'Unauthorized' },
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
        { error: 'Forbidden: Stylist role required' },
        { status: 403 }
      );
    }

    // ========================================================================
    // FETCH DASHBOARD DATA
    // ========================================================================
    
    // Get bookings with customer history (privacy-safe)
    const { data: bookings, error: bookingsError } = await supabase
      .rpc('get_stylist_bookings_with_history', {
        p_stylist_id: user.id,
        p_start_date: startDate,
        p_end_date: endDate
      });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return NextResponse.json(
        { error: 'Failed to fetch dashboard data' },
        { status: 500 }
      );
    }

    // Get stylist budget status
    const { data: budget, error: budgetError } = await supabase
      .from('stylist_override_budgets')
      .select('*')
      .eq('stylist_user_id', user.id)
      .single();

    // Transform to camelCase for frontend
    const transformedBookings = (bookings || []).map((booking: any) => ({
      id: booking.booking_id,
      customerUserId: booking.customer_user_id,
      customerName: booking.customer_name,
      customerPhone: booking.customer_phone,
      customerEmail: booking.customer_email,
      customerNotes: booking.customer_notes,
      serviceId: booking.service_id,
      serviceName: booking.service_name,
      serviceDuration: booking.service_duration,
      startTime: booking.start_time,
      endTime: booking.end_time,
      status: booking.status,
      priceCents: booking.price_cents,
      
      // History enrichment
      isRepeatCustomer: booking.is_repeat_customer,
      history: {
        totalBookings: booking.total_bookings_count,
        lastVisit: booking.last_visit_date,
        lastService: booking.last_service_name,
        // PRIVACY: Flags only, not raw PII
        hasAllergies: booking.has_allergies,
        allergySummary: booking.allergy_summary,
        hasSafetyNotes: booking.has_safety_notes
      }
    }));

    return NextResponse.json({
      success: true,
      bookings: transformedBookings,
      budget: budget ? {
        monthlyLimit: budget.monthly_override_limit,
        monthlyUsed: budget.current_month_overrides,
        monthlyRemaining: budget.monthly_override_limit - budget.current_month_overrides,
        emergencyRemaining: budget.emergency_overrides_remaining,
        resetsAt: budget.budget_reset_at
      } : null
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
