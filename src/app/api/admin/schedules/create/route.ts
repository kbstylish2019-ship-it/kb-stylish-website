import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logError, logInfo } from '@/lib/logging';

interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface CreateScheduleRequest {
  stylistId: string;
  schedules: ScheduleDay[];
}

/**
 * API Route: POST /api/admin/schedules/create
 * 
 * Creates base schedule for a stylist (all 7 days)
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateScheduleRequest = await request.json();
    const { stylistId, schedules } = body;

    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    if (!stylistId || !schedules || !Array.isArray(schedules)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: stylistId, schedules', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Validate each schedule day
    for (const schedule of schedules) {
      if (
        schedule.day_of_week === undefined ||
        !schedule.start_time ||
        !schedule.end_time
      ) {
        return NextResponse.json(
          { success: false, error: 'Invalid schedule data', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }

      // Validate day range
      if (schedule.day_of_week < 0 || schedule.day_of_week > 6) {
        return NextResponse.json(
          { success: false, error: 'Invalid day_of_week (must be 0-6)', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }

      // Validate time format
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(schedule.start_time) || !timeRegex.test(schedule.end_time)) {
        return NextResponse.json(
          { success: false, error: 'Invalid time format (use HH:MM)', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
    }

    // ========================================================================
    // AUTHENTICATION & AUTHORIZATION
    // ========================================================================
    
    const cookieStore = await cookies();
    const supabase = createServerClient(
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
              // Server Component limitation
            }
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'admin'
    });

    if (roleError || !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // ========================================================================
    // CREATE SCHEDULE VIA RPC
    // ========================================================================
    
    const { data: result, error: rpcError } = await supabase.rpc(
      'admin_create_stylist_schedule',
      {
        p_stylist_id: stylistId,
        p_schedules: schedules
      }
    );

    if (rpcError) {
      logError('API:AdminScheduleCreate', 'RPC error', {
        stylistId,
        error: rpcError.message
      });
      return NextResponse.json(
        { success: false, error: 'Failed to create schedule', code: 'DATABASE_ERROR' },
        { status: 500 }
      );
    }

    if (!result || !result.success) {
      const statusCode = result?.code === 'NOT_FOUND' ? 404 :
                        result?.code === 'INVALID_TIME' ? 400 :
                        result?.code === 'FORBIDDEN' ? 403 : 500;

      return NextResponse.json(result, { status: statusCode });
    }

    logInfo('API:AdminScheduleCreate', 'Schedule created', {
      stylistId,
      createdCount: result.created_count
    });

    return NextResponse.json(result);

  } catch (error) {
    logError('API:AdminScheduleCreate', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
