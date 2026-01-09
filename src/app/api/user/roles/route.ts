import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/user/roles
 * Fetches the current user's roles from the database
 * Returns array of role names the user has
 */
export async function GET() {
  try {
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
              // Ignore - called from Server Component
            }
          },
        },
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ roles: [], isAuthenticated: false });
    }

    // Fetch user's active roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        roles (
          name
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return NextResponse.json({ roles: ['customer'], isAuthenticated: true });
    }

    // Extract role names
    const roles = userRoles
      ?.map((ur: any) => ur.roles?.name)
      .filter(Boolean) || ['customer'];

    // Also fetch user profile for display name
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      roles,
      isAuthenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: profile?.display_name || user.email?.split('@')[0] || 'User',
        avatarUrl: profile?.avatar_url,
      }
    });
  } catch (error) {
    console.error('User roles API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', roles: [], isAuthenticated: false },
      { status: 500 }
    );
  }
}
