import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { withIdempotency } from '@/lib/idempotency';
import { checkRateLimit } from '@/lib/rate-limit';
import { logError, logInfo } from '@/lib/logging';

/**
 * API Route: POST /api/stylist/override/request
 * Allows stylists to request schedule overrides
 * 
 * Security: Requires 'stylist' role
 * Budget: Enforced via RPC (10/month + 3 emergency)
 * Returns: Override ID + updated budget status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetDate, isClosed = true, reason, isEmergency = false } = body;

    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    if (!targetDate) {
      return NextResponse.json(
        { error: 'Missing required field: targetDate' },
        { status: 400 }
      );
    }

    // Validate date is in future
    const target = new Date(targetDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (target < today) {
      return NextResponse.json(
        { error: 'Cannot request override for past dates' },
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
    // AUTHORIZATION: Verify stylist role (RPC also checks, defense in depth)
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
    // RATE LIMITING: Prevent abuse
    // ========================================================================
    
    const { allowed, remaining } = await checkRateLimit(user.id, 10, 60);
    
    if (!allowed) {
      logInfo('API:OverrideRequest', 'Rate limit exceeded', { userId: user.id });
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'Retry-After': '60'
          }
        }
      );
    }

    // ========================================================================
    // IDEMPOTENCY: Prevent duplicate requests
    // ========================================================================
    
    const idempotencyKey = `override:${user.id}:${targetDate}:${isEmergency}`;
    
    const { result: rpcResult, cached } = await withIdempotency(
      idempotencyKey,
      300, // 5 minutes cache
      async () => {
        // Call RPC with budget check
        const { data: result, error: rpcError } = await supabase
          .rpc('request_availability_override', {
            p_stylist_id: user.id,
            p_target_date: targetDate,
            p_is_closed: isClosed,
            p_reason: reason || 'Stylist requested override',
            p_is_emergency: isEmergency
          });

        if (rpcError) {
          logError('API:OverrideRequest', 'RPC error', {
            userId: user.id,
            error: rpcError.message
          });
          throw new Error('Failed to create override request');
        }

        return result;
      }
    );
    
    const result = rpcResult;

    // Handle RPC result (JSONB response)
    if (!result || !result.success) {
      const statusCode = result?.code === 'BUDGET_EXHAUSTED' ? 429 : 
                        result?.code === 'INVALID_DATE' ? 400 : 500;
      
      return NextResponse.json(
        { 
          success: false,
          error: result?.error || 'Override request failed',
          code: result?.code || 'UNKNOWN_ERROR',
          budget: result?.budget || null
        },
        { status: statusCode }
      );
    }

    // Log successful override creation
    logInfo('API:OverrideRequest', 'Override created', {
      userId: user.id,
      targetDate,
      isEmergency,
      cached
    });

    return NextResponse.json({
      success: true,
      overrideId: result.overrideId,
      budget: result.budget,
      message: result.message,
      cached // Inform client if this was a cached response
    });

  } catch (error) {
    logError('API:OverrideRequest', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
