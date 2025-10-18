import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logError } from '@/lib/logging';

/**
 * API Route: GET /api/stylist/override/budget
 * 
 * Fetches stylist's override budget status.
 * Shows monthly and emergency override limits and usage.
 * 
 * Security: Requires stylist role
 * Returns: Budget object with limits, usage, and reset date
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
    // FETCH BUDGET
    // ========================================================================
    
    const { data: budgetData, error: budgetError } = await supabase
      .from('stylist_override_budgets')
      .select('*')
      .eq('stylist_user_id', user.id)
      .single();

    if (budgetError && budgetError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (budget doesn't exist yet - that's OK)
      logError('API:Budget', 'Failed to fetch budget', {
        userId: user.id,
        error: budgetError.message
      });
      return NextResponse.json(
        { error: 'Failed to fetch budget' },
        { status: 500 }
      );
    }

    // If no budget record exists, return defaults
    if (!budgetData) {
      return NextResponse.json({
        budget: {
          monthlyLimit: 10,
          monthlyUsed: 0,
          monthlyRemaining: 10,
          emergencyRemaining: 3,
          resetsAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
          lastOverrideAt: null
        }
      });
    }

    // Calculate remaining
    const monthlyRemaining = Math.max(0, budgetData.monthly_override_limit - budgetData.current_month_overrides);

    return NextResponse.json({
      budget: {
        monthlyLimit: budgetData.monthly_override_limit,
        monthlyUsed: budgetData.current_month_overrides,
        monthlyRemaining,
        emergencyRemaining: budgetData.emergency_overrides_remaining,
        resetsAt: budgetData.budget_reset_at,
        lastOverrideAt: budgetData.last_override_at
      }
    });

  } catch (error) {
    logError('API:Budget', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
