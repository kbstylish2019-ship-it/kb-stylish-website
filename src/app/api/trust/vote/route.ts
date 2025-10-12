import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

async function hashUserAgent(userAgent: string): Promise<string | null> {
  if (!userAgent) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(userAgent);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 64);
}

export async function POST(req: NextRequest) {
  try {
    const { reviewId, voteType, action } = await req.json();

    if (!reviewId || typeof reviewId !== 'string') {
      return NextResponse.json({ success: false, error: 'Valid reviewId required', error_code: 'INVALID_REVIEW_ID' }, { status: 400 });
    }
    if (!['helpful', 'unhelpful'].includes(voteType)) {
      return NextResponse.json({ success: false, error: 'voteType must be "helpful" or "unhelpful"', error_code: 'INVALID_VOTE_TYPE' }, { status: 400 });
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // Read from the incoming request cookies
          get: (name: string) => req.cookies.get(name)?.value,
          // No-op setters for route handler (we don't need to mutate cookies here)
          set: () => {},
          remove: () => {},
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required', error_code: 'AUTH_REQUIRED' }, { status: 401 });
    }

    // Gather request context for audit fields
    const userAgent = req.headers.get('user-agent') || '';
    const xff = req.headers.get('x-forwarded-for');
    const ipAddress = xff ? xff.split(',')[0].trim() : null;
    const userAgentHash = await hashUserAgent(userAgent);

    // Primary action: cast vote
    const { data, error } = await supabase.rpc('cast_review_vote', {
      p_review_id: reviewId,
      p_vote_type: voteType,
      p_ip_address: ipAddress,
      p_user_agent_hash: userAgentHash,
    });

    if (error) {
      // Map common cases similar to Edge Function
      const msg = (error as any)?.message || '';
      if (msg.includes('self-vote') || msg.includes('self-voting')) {
        return NextResponse.json({ success: false, error: 'You cannot vote on your own review', error_code: 'SELF_VOTE_PROHIBITED' }, { status: 400 });
      }
      if (msg.includes('rate limit')) {
        return NextResponse.json({ success: false, error: 'Please slow down your voting', error_code: 'RATE_LIMIT_EXCEEDED' }, { status: 429 });
      }
      return NextResponse.json({ success: false, error: 'Failed to cast vote', error_code: 'VOTE_FAILED' }, { status: 400 });
    }

    // Toggle-off behavior when unchanged (mirrors vote-manager)
    if (data?.success === true && data?.changed === false) {
      const { data: unvoteData, error: unvoteError } = await supabase.rpc('unvote_review', {
        p_review_id: reviewId,
      });
      if (unvoteError) {
        return NextResponse.json({ success: false, error: 'Failed to toggle vote', error_code: 'UNVOTE_FAILED' }, { status: 400 });
      }
      return NextResponse.json({
        success: unvoteData?.success === true,
        changed: true,
        previous_vote: unvoteData?.previous_vote || null,
        message: unvoteData?.message || 'Vote removed',
      });
    }

    // Normal response passthrough
    return NextResponse.json({
      success: data?.success === true,
      changed: data?.changed || false,
      previous_vote: data?.previous_vote || null,
      message: data?.message || (data?.success ? 'Vote recorded successfully' : data?.error || 'Vote failed'),
    });
  } catch (e) {
    console.error('[API /trust/vote] Error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
