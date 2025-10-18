import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: GET /api/admin/users/search?q={query}
 * Searches for users by username or email for onboarding wizard
 * Admin-only endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    // Validation
    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'Search query must be at least 2 characters',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

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

    // Admin role check
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

    // Search users - exclude users who are already stylists
    const searchPattern = `%${query.trim()}%`;
    
    // First get user profiles - search by username OR display_name
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, username, display_name')
      .or(`username.ilike.${searchPattern},display_name.ilike.${searchPattern}`)
      .limit(20);

    if (profileError) {
      console.error('User profile search error:', profileError);
      return NextResponse.json({
        success: false,
        error: 'Failed to search users',
        code: 'SEARCH_ERROR'
      }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        success: true,
        users: [],
        count: 0
      });
    }

    // Create service role client for admin operations (listing all users)
    // Regular client doesn't have permission to call auth.admin.listUsers()
    const supabaseAdmin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    
    // Get emails for remaining users using service role for elevated access
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      console.warn('Could not fetch auth users for emails:', authError);
    }
    
    const emailMap = new Map(
      (authUsers?.users || []).map(u => [u.id, u.email])
    );
    
    // Also search by email if the query looks like an email
    const emailSearchResults: typeof profiles = [];
    if (query.includes('@') && authUsers?.users) {
      const matchingAuthUsers = authUsers.users.filter(u => 
        u.email?.toLowerCase().includes(query.toLowerCase())
      );
      
      // Get profiles for these users
      if (matchingAuthUsers.length > 0) {
        const emailUserIds = matchingAuthUsers.map(u => u.id);
        const { data: emailProfiles } = await supabase
          .from('user_profiles')
          .select('id, username, display_name')
          .in('id', emailUserIds);
        
        if (emailProfiles) {
          emailSearchResults.push(...emailProfiles);
        }
      }
    }
    
    // Combine username/display_name results with email results (deduplicate)
    const allProfilesMap = new Map();
    [...(profiles || []), ...emailSearchResults].forEach(p => {
      allProfilesMap.set(p.id, p);
    });
    const combinedProfiles = Array.from(allProfilesMap.values());

    // Get user IDs of existing stylists
    const { data: stylists } = await supabase
      .from('stylist_profiles')
      .select('user_id');

    const stylistIds = new Set((stylists || []).map(s => s.user_id));

    // Filter out stylists
    const nonStylistProfiles = combinedProfiles.filter(p => !stylistIds.has(p.id));

    // Transform results
    const results = nonStylistProfiles.slice(0, 10).map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      email: emailMap.get(u.id) || undefined
    }));

    return NextResponse.json({
      success: true,
      users: results,
      count: results.length
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
