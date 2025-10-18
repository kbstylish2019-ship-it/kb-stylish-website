import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Toggle stylist active/inactive status
 * Admin-only endpoint for soft delete functionality
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Create Supabase client
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
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify admin role
    const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
    if (!userRoles.includes('admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }
    
    // Parse request body
    const body = await req.json();
    const { user_id, is_active } = body;
    
    if (!user_id || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: user_id and is_active' },
        { status: 400 }
      );
    }
    
    // Call RPC function
    const { data, error: rpcError } = await supabase.rpc('toggle_stylist_active', {
      p_user_id: user_id,
      p_is_active: is_active
    });
    
    if (rpcError) {
      console.error('[Toggle Active] RPC error:', rpcError);
      return NextResponse.json(
        { success: false, error: rpcError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Stylist ${is_active ? 'activated' : 'deactivated'} successfully`,
      data
    });
    
  } catch (error) {
    console.error('[Toggle Active] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
