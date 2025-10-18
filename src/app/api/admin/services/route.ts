import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Admin Services Management
 * 
 * GET /api/admin/services - List all services
 * POST /api/admin/services - Create new service
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

  // Check admin role
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
// GET /api/admin/services
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await verifyAdmin(supabase);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'all';
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('services')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category !== 'all') {
      query = query.eq('category', category);
    }

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: services, error, count } = await query;

    if (error) {
      console.error('[admin/services] Query error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch services' },
        { status: 500 }
      );
    }

    // Transform response
    const transformedServices = (services || []).map((service: any) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      basePriceCents: service.base_price_cents,
      durationMinutes: service.duration_minutes,
      isActive: service.is_active,
      createdAt: service.created_at,
      updatedAt: service.updated_at
    }));

    return NextResponse.json({
      success: true,
      services: transformedServices,
      total: count || 0
    });

  } catch (error) {
    console.error('[admin/services] Unexpected error:', error);
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
// POST /api/admin/services
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await verifyAdmin(supabase);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // Parse request body
    const body = await request.json();

    // Validation
    if (!body.name || body.name.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Service name must be at least 3 characters' },
        { status: 400 }
      );
    }

    if (!body.category) {
      return NextResponse.json(
        { success: false, error: 'Category is required' },
        { status: 400 }
      );
    }

    if (!body.basePriceCents || body.basePriceCents < 0) {
      return NextResponse.json(
        { success: false, error: 'Price must be a positive number' },
        { status: 400 }
      );
    }

    if (!body.durationMinutes || body.durationMinutes < 15) {
      return NextResponse.json(
        { success: false, error: 'Duration must be at least 15 minutes' },
        { status: 400 }
      );
    }

    // Generate slug from name
    const slug = body.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Insert service
    const { data: service, error } = await supabase
      .from('services')
      .insert({
        name: body.name.trim(),
        slug: slug,
        description: body.description?.trim() || null,
        category: body.category,
        base_price_cents: body.basePriceCents,
        duration_minutes: body.durationMinutes,
        is_active: body.isActive !== undefined ? body.isActive : true
      })
      .select()
      .single();

    if (error) {
      console.error('[admin/services] Insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create service' },
        { status: 500 }
      );
    }

    // Transform response
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
    }, { status: 201 });

  } catch (error) {
    console.error('[admin/services] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
