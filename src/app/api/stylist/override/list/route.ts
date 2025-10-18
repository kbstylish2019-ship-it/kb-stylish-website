import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logError } from '@/lib/logging';

/**
 * API Route: GET /api/stylist/override/list
 * 
 * Fetches stylist's schedule overrides (time off requests).
 * Returns both upcoming and past overrides.
 * 
 * Security: Requires stylist role
 * Returns: Array of override objects
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
    // FETCH OVERRIDES
    // ========================================================================
    
    const { data: overrides, error: overridesError } = await supabase
      .from('schedule_overrides')
      .select('*')
      .eq('stylist_user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(50); // Limit to last 50 overrides

    if (overridesError) {
      logError('API:OverrideList', 'Failed to fetch overrides', {
        userId: user.id,
        error: overridesError.message
      });
      return NextResponse.json(
        { error: 'Failed to fetch overrides' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      overrides: overrides || []
    });

  } catch (error) {
    logError('API:OverrideList', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
