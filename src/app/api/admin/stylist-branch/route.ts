import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
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
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify admin role
    const { data: isAdmin } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'admin'
    });

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { stylistUserId, branchId } = await request.json();

    if (!stylistUserId || !branchId) {
      return NextResponse.json(
        { success: false, error: 'stylistUserId and branchId are required' },
        { status: 400 }
      );
    }

    // Verify the branch exists and is active
    const { data: branch, error: branchError } = await supabase
      .from('kb_branches')
      .select('id, name, is_active')
      .eq('id', branchId)
      .eq('is_active', true)
      .single();

    if (branchError || !branch) {
      return NextResponse.json(
        { success: false, error: 'Invalid or inactive branch' },
        { status: 400 }
      );
    }

    // Verify the stylist exists
    const { data: stylist, error: stylistError } = await supabase
      .from('stylist_profiles')
      .select('user_id, display_name')
      .eq('user_id', stylistUserId)
      .single();

    if (stylistError || !stylist) {
      return NextResponse.json(
        { success: false, error: 'Stylist not found' },
        { status: 400 }
      );
    }

    // Update stylist's branch assignment
    const { error: updateError } = await supabase
      .from('stylist_profiles')
      .update({ 
        branch_id: branchId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', stylistUserId);

    if (updateError) {
      console.error('Branch assignment error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to assign branch' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully assigned ${stylist.display_name} to ${branch.name}`,
      stylistUserId,
      branchId,
      branchName: branch.name
    });

  } catch (error) {
    console.error('Stylist branch assignment error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
