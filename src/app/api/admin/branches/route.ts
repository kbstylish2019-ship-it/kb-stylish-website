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

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAdminAccess();
    if ('error' in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      );
    }

    const { supabase } = authResult;
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

    // Check for duplicate name
    const { data: existingBranch } = await supabase
      .from('kb_branches')
      .select('id')
      .eq('name', name.trim())
      .single();

    if (existingBranch) {
      return NextResponse.json(
        { success: false, error: 'A branch with this name already exists' },
        { status: 400 }
      );
    }

    // Create new branch
    const { data: newBranch, error: createError } = await supabase
      .from('kb_branches')
      .insert({
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        is_active: isActive ?? true,
        display_order: displayOrder || 0,
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Branch creation error:', createError);
      return NextResponse.json(
        { success: false, error: 'Failed to create branch' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Branch created successfully',
      branchId: newBranch.id
    });

  } catch (error) {
    console.error('Create branch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
