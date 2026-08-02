import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logError, logInfo } from '@/lib/logging';

interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface UpdateScheduleRequest {
  stylistId: string;
  schedules: ScheduleDay[];
  effectiveFrom?: string;  // Optional YYYY-MM-DD
  effectiveUntil?: string; // Optional YYYY-MM-DD
}

/**
 * API Route: POST /api/admin/schedules/update
 *
 * Replaces a stylist's active weekly schedule in one atomic operation.
 * Admin-only endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdateScheduleRequest = await request.json();
    const { stylistId, schedules, effectiveFrom, effectiveUntil } = body;

    // ========================================================================
    // VALIDATION
    // ========================================================================

    if (!stylistId || !schedules || !Array.isArray(schedules) || schedules.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // stylist_schedules_check2 requires effective_until > effective_from strictly,
    // so equal dates must be rejected here rather than surfacing a raw 23514.
    if (effectiveFrom && effectiveUntil) {
      if (new Date(effectiveFrom) >= new Date(effectiveUntil)) {
        return NextResponse.json(
          { success: false, error: 'End date must be later than the start date', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
    }

    const seenDays = new Set<number>();
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

      if (schedule.day_of_week < 0 || schedule.day_of_week > 6) {
        return NextResponse.json(
          { success: false, error: 'Invalid day_of_week (must be 0-6)', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }

      if (seenDays.has(schedule.day_of_week)) {
        return NextResponse.json(
          { success: false, error: 'Duplicate entry for the same day', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      seenDays.add(schedule.day_of_week);

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(schedule.start_time) || !timeRegex.test(schedule.end_time)) {
        return NextResponse.json(
          { success: false, error: 'Invalid time format (use HH:MM)', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }

      if (schedule.start_time >= schedule.end_time) {
        return NextResponse.json(
          { success: false, error: 'End time must be after start time', code: 'VALIDATION_ERROR' },
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
    // REPLACE SCHEDULE VIA RPC
    // ========================================================================

    const { data: result, error: rpcError } = await supabase.rpc(
      'admin_replace_stylist_schedule',
      {
        p_stylist_id: stylistId,
        p_schedules: schedules,
        p_effective_from: effectiveFrom || null,
        p_effective_until: effectiveUntil || null
      }
    );

    if (rpcError) {
      logError('API:AdminScheduleUpdate', 'RPC error', {
        stylistId,
        error: rpcError.message
      });
      return NextResponse.json(
        { success: false, error: 'Failed to update schedule', code: 'DATABASE_ERROR' },
        { status: 500 }
      );
    }

    if (!result || !result.success) {
      const statusCode = result?.code === 'NOT_FOUND' ? 404 :
                        result?.code === 'INVALID_TIME' ? 400 :
                        result?.code === 'INVALID_DATE_RANGE' ? 400 :
                        result?.code === 'VALIDATION_ERROR' ? 400 :
                        result?.code === 'FORBIDDEN' ? 403 : 500;

      return NextResponse.json(result, { status: statusCode });
    }

    logInfo('API:AdminScheduleUpdate', 'Schedule updated', {
      stylistId,
      createdCount: result.created_count,
      removedCount: result.removed_count
    });

    return NextResponse.json(result);

  } catch (error) {
    logError('API:AdminScheduleUpdate', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
