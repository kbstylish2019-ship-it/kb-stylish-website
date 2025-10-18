import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logError } from '@/lib/logging';

/**
 * API Route: GET /api/admin/schedules
 * 
 * Fetches all stylists with their schedule status
 * Admin-only endpoint
 */
export async function GET(request: NextRequest) {
  try {
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
    // FETCH SCHEDULES
    // ========================================================================
    
    const { data, error } = await supabase.rpc('admin_get_all_schedules');

    if (error) {
      logError('API:AdminSchedules', 'Failed to fetch schedules', { error: error.message });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch schedules', code: 'DATABASE_ERROR' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      schedules: data || []
    });

  } catch (error) {
    logError('API:AdminSchedules', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
