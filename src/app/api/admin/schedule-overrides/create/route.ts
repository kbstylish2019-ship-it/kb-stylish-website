import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Type definitions
type OverrideType = 'business_closure' | 'stylist_vacation' | 'seasonal_hours' | 'special_event';

interface CreateOverrideRequest {
  overrideType: OverrideType;
  appliesToAllStylists: boolean;
  stylistUserId?: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  overrideStartTime?: string;
  overrideEndTime?: string;
  priority?: number;
  reason?: string;
}

/**
 * API Route: POST /api/admin/schedule-overrides/create
 * Creates a new schedule override (business closure, vacation, etc.)
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateOverrideRequest = await request.json();
    const {
      overrideType,
      appliesToAllStylists,
      stylistUserId,
      startDate,
      endDate,
      isClosed,
      overrideStartTime,
      overrideEndTime,
      priority,
      reason
    } = body;

    // ============================================================================
    // VALIDATION LAYER 1: Required Fields
    // ============================================================================
    if (!overrideType || !startDate || !endDate || isClosed === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: overrideType, startDate, endDate, isClosed',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate override type enum
    const validTypes: OverrideType[] = ['business_closure', 'stylist_vacation', 'seasonal_hours', 'special_event'];
    if (!validTypes.includes(overrideType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid overrideType. Must be one of: ${validTypes.join(', ')}`,
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // ============================================================================
    // VALIDATION LAYER 2: Business Logic
    // ============================================================================

    // Validate applies_to_all_stylists logic
    if (appliesToAllStylists && stylistUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot specify stylistUserId when appliesToAllStylists is true',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    if (!appliesToAllStylists && !stylistUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'stylistUserId is required when appliesToAllStylists is false',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    if (end < start) {
      return NextResponse.json(
        {
          success: false,
          error: 'endDate must be >= startDate',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate time requirements
    if (!isClosed && (!overrideStartTime || !overrideEndTime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'overrideStartTime and overrideEndTime required when isClosed is false',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (overrideStartTime && !timeRegex.test(overrideStartTime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid overrideStartTime format. Use HH:MM (24-hour)',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    if (overrideEndTime && !timeRegex.test(overrideEndTime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid overrideEndTime format. Use HH:MM (24-hour)',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate time range (end > start)
    if (overrideStartTime && overrideEndTime) {
      const [startHour, startMin] = overrideStartTime.split(':').map(Number);
      const [endHour, endMin] = overrideEndTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (endMinutes <= startMinutes) {
        return NextResponse.json(
          {
            success: false,
            error: 'overrideEndTime must be after overrideStartTime',
            code: 'VALIDATION_ERROR'
          },
          { status: 400 }
        );
      }
    }

    // Validate priority range
    if (priority !== undefined && (priority < 0 || priority > 100)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Priority must be between 0 and 100',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // ============================================================================
    // AUTHENTICATION & AUTHORIZATION
    // ============================================================================

    // Create Supabase client
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

    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        },
        { status: 401 }
      );
    }

    // Admin role check using database function
    const { data: isAdmin, error: roleError } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_name: 'admin'
      });

    if (roleError || !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Admin access required',
          code: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }

    // ============================================================================
    // DATABASE INSERTION
    // ============================================================================

    // Set default priority based on type if not specified
    const finalPriority = priority !== undefined ? priority : {
      'business_closure': 100,
      'stylist_vacation': 50,
      'seasonal_hours': 10,
      'special_event': 30
    }[overrideType];

    const { data: insertData, error: insertError } = await supabase
      .from('schedule_overrides')
      .insert({
        override_type: overrideType,
        applies_to_all_stylists: appliesToAllStylists,
        stylist_user_id: stylistUserId || null,
        start_date: startDate,
        end_date: endDate,
        override_start_time: overrideStartTime || null,
        override_end_time: overrideEndTime || null,
        is_closed: isClosed,
        priority: finalPriority,
        reason: reason || null,
        created_by: user.id
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Schedule override creation error:', insertError);
      
      // Handle specific database errors
      if (insertError.code === '23503') {
        return NextResponse.json({
          success: false,
          error: 'Invalid stylistUserId - stylist not found',
          code: 'FOREIGN_KEY_VIOLATION'
        }, { status: 400 });
      }

      if (insertError.code === '23514') {
        return NextResponse.json({
          success: false,
          error: 'Database constraint violation - check your input data',
          code: 'CHECK_VIOLATION'
        }, { status: 400 });
      }

      return NextResponse.json({
        success: false,
        error: insertError.message || 'Failed to create schedule override',
        code: 'DATABASE_ERROR'
      }, { status: 500 });
    }

    // ============================================================================
    // SUCCESS RESPONSE
    // ============================================================================

    return NextResponse.json({
      success: true,
      overrideId: insertData.id,
      message: `${overrideType.replace(/_/g, ' ')} created successfully`
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
