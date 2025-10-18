import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Toggle stylist featured status via toggle_stylist_featured RPC
 * Admin-only endpoint
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
    const { user_id, is_featured } = body;
    
    if (!user_id || typeof is_featured !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Missing user_id or is_featured' },
        { status: 400 }
      );
    }
    
    // Call RPC function
    const { error: rpcError } = await supabase.rpc('toggle_stylist_featured', {
      p_user_id: user_id,
      p_is_featured: is_featured
    });
    
    if (rpcError) {
      console.error('[Toggle Stylist] RPC error:', rpcError);
      return NextResponse.json(
        { success: false, error: rpcError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Stylist ${is_featured ? 'featured' : 'unfeatured'} successfully`
    });
    
  } catch (error) {
    console.error('[Toggle Stylist] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
