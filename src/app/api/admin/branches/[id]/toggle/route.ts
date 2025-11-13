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

async function verifyAdminAccess() {
  const supabase = await createClient();
  
  // Verify authentication
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: 'Authentication required', status: 401 };
  }

  // Verify admin role
  const { data: isAdmin } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });

  if (!isAdmin) {
    return { error: 'Admin access required', status: 403 };
  }

  return { user, supabase };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await verifyAdminAccess();
    if ('error' in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const { supabase } = authResult;
    const branchId = params.id;
    const { isActive } = await request.json();

    // Check if branch exists
    const { data: existingBranch } = await supabase
      .from('kb_branches')
      .select('id, name, is_active')
      .eq('id', branchId)
      .single();

    if (!existingBranch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found' },
        { status: 404 }
      );
    }

    // Update branch status
    const { error: updateError } = await supabase
      .from('kb_branches')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', branchId);

    if (updateError) {
      console.error('Branch toggle error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update branch status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Branch ${isActive ? 'activated' : 'deactivated'} successfully`
    });

  } catch (error) {
    console.error('Toggle branch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
