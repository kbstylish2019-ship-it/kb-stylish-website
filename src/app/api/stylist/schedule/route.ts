import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logError } from '@/lib/logging';

/**
 * API Route: GET /api/stylist/schedule
 * 
 * Fetches stylist's weekly schedule for a date range.
 * Uses get_stylist_schedule RPC to get working hours by day.
 * 
 * Query params:
 * - start: Start date (YYYY-MM-DD)
 * - end: End date (YYYY-MM-DD)
 * 
 * Security: Requires stylist role
 * Returns: Array of schedule days with working hours and breaks
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: start, end' },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

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
    // FETCH SCHEDULE
    // ========================================================================
    
    const { data: schedule, error: scheduleError } = await supabase
      .rpc('get_stylist_schedule', {
        p_stylist_id: user.id,
        p_start_date: startDate,
        p_end_date: endDate
      });

    if (scheduleError) {
      logError('API:Schedule', 'Failed to fetch schedule', {
        userId: user.id,
        error: scheduleError.message
      });
      return NextResponse.json(
        { error: 'Failed to fetch schedule' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      schedule: schedule || [],
      startDate,
      endDate
    });

  } catch (error) {
    logError('API:Schedule', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
