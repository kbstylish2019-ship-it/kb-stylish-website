import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Admin Service Management (Individual)
 * 
 * GET /api/admin/services/[id] - Get service details
 * PATCH /api/admin/services/[id] - Update service
 * DELETE /api/admin/services/[id] - Delete service (soft delete)
 */

// ============================================================================
// HELPER: Create Supabase Client
// ============================================================================

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

// ============================================================================
// HELPER: Verify Admin
// ============================================================================

async function verifyAdmin(supabase: any) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });

  if (roleError || !isAdmin) {
    return { error: 'Forbidden: Admin role required', status: 403 };
  }

  return { user };
}

// ============================================================================
// GET /api/admin/services/[id]
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await verifyAdmin(supabase);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { data: service, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !service) {
      return NextResponse.json(
        { success: false, error: 'Service not found' },
        { status: 404 }
      );
    }

    const transformedService = {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      basePriceCents: service.base_price_cents,
      durationMinutes: service.duration_minutes,
      isActive: service.is_active,
      createdAt: service.created_at,
      updatedAt: service.updated_at
    };

    return NextResponse.json({
      success: true,
      service: transformedService
    });

  } catch (error) {
    console.error('[admin/services/id] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/admin/services/[id]
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await verifyAdmin(supabase);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();

    // Build update object
    const updates: any = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      if (body.name.trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'Service name must be at least 3 characters' },
          { status: 400 }
        );
      }
      updates.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description?.trim() || null;
    }

    if (body.category !== undefined) {
      updates.category = body.category;
    }

    if (body.basePriceCents !== undefined) {
      if (body.basePriceCents < 0) {
        return NextResponse.json(
          { success: false, error: 'Price must be a positive number' },
          { status: 400 }
        );
      }
      updates.base_price_cents = body.basePriceCents;
    }

    if (body.durationMinutes !== undefined) {
      if (body.durationMinutes < 15) {
        return NextResponse.json(
          { success: false, error: 'Duration must be at least 15 minutes' },
          { status: 400 }
        );
      }
      updates.duration_minutes = body.durationMinutes;
    }

    if (body.isActive !== undefined) {
      updates.is_active = body.isActive;
    }

    // Update service
    const { data: service, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/services/id] Update error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update service' },
        { status: 500 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { success: false, error: 'Service not found' },
        { status: 404 }
      );
    }

    const transformedService = {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      basePriceCents: service.base_price_cents,
      durationMinutes: service.duration_minutes,
      isActive: service.is_active,
      createdAt: service.created_at,
      updatedAt: service.updated_at
    };

    return NextResponse.json({
      success: true,
      service: transformedService
    });

  } catch (error) {
    console.error('[admin/services/id] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/admin/services/[id]
// Note: This is actually a SOFT DELETE (deactivation) to preserve data integrity
// Hard delete is disabled to maintain customer history, analytics, and compliance
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await verifyAdmin(supabase);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // Soft delete: Mark as inactive (preserves historical data)
    const { data: service, error } = await supabase
      .from('services')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/services/id] Deactivate error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to deactivate service' },
        { status: 500 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { success: false, error: 'Service not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Service deactivated successfully'
    });

  } catch (error) {
    console.error('[admin/services/id] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
