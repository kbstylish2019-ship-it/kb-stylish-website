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

export async function PUT(
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
    
    const {
      name,
      address,
      phone,
      email,
      isActive,
      displayOrder
    } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Branch name is required' },
        { status: 400 }
      );
    }

    // Check if branch exists
    const { data: existingBranch } = await supabase
      .from('kb_branches')
      .select('id, name')
      .eq('id', branchId)
      .single();

    if (!existingBranch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found' },
        { status: 404 }
      );
    }

    // Check for duplicate name (excluding current branch)
    const { data: duplicateBranch } = await supabase
      .from('kb_branches')
      .select('id')
      .eq('name', name.trim())
      .neq('id', branchId)
      .single();

    if (duplicateBranch) {
      return NextResponse.json(
        { success: false, error: 'A branch with this name already exists' },
        { status: 400 }
      );
    }

    // Update branch
    const { error: updateError } = await supabase
      .from('kb_branches')
      .update({
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        is_active: isActive ?? true,
        display_order: displayOrder || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', branchId);

    if (updateError) {
      console.error('Branch update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update branch' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Branch updated successfully'
    });

  } catch (error) {
    console.error('Update branch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Check if branch exists
    const { data: existingBranch } = await supabase
      .from('kb_branches')
      .select('id, name')
      .eq('id', branchId)
      .single();

    if (!existingBranch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found' },
        { status: 404 }
      );
    }

    // Check if any stylists are assigned to this branch
    const { data: assignedStylists, error: stylistsError } = await supabase
      .from('stylist_profiles')
      .select('user_id, display_name')
      .eq('branch_id', branchId)
      .limit(1);

    if (stylistsError) {
      console.error('Error checking assigned stylists:', stylistsError);
      return NextResponse.json(
        { success: false, error: 'Failed to check branch dependencies' },
        { status: 500 }
      );
    }

    if (assignedStylists && assignedStylists.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete branch with assigned stylists. Please reassign stylists first.' },
        { status: 400 }
      );
    }

    // Delete branch
    const { error: deleteError } = await supabase
      .from('kb_branches')
      .delete()
      .eq('id', branchId);

    if (deleteError) {
      console.error('Branch deletion error:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete branch' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Branch deleted successfully'
    });

  } catch (error) {
    console.error('Delete branch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
