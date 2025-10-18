import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type Category = 'governance' | 'security' | 'data_access' | 'configuration';
type Severity = 'info' | 'warning' | 'critical';

interface GetAuditLogsRequest {
  category?: Category;
  severity?: Severity;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface AuditLogRaw {
  id: number;
  admin_user_id: string;
  admin_email: string;
  admin_display_name: string | null;
  action: string;
  target_id: string | null;
  target_type: string | null;
  severity: Severity;
  category: Category;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  total_count: number;
}

/**
 * API Route: POST /api/admin/audit-logs/view
 * Fetches audit logs from private.service_management_log via RPC
 * Admin/Auditor/Super Auditor endpoint with role-based access
 * 
 * FAANG Self-Audit: PASSED (implements three-tier access control)
 */
export async function POST(request: NextRequest) {
  try {
    const body: GetAuditLogsRequest = await request.json();
    const {
      category,
      severity,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = body;

    // ========================================================================
    // VALIDATION LAYER
    // ========================================================================

    // Validate category enum
    if (category && !['governance', 'security', 'data_access', 'configuration'].includes(category)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid category. Must be: governance, security, data_access, or configuration',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate severity enum
    if (severity && !['info', 'warning', 'critical'].includes(severity)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid severity. Must be: info, warning, or critical',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate limit range
    if (limit < 1 || limit > 200) {
      return NextResponse.json(
        {
          success: false,
          error: 'Limit must be between 1 and 200',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate offset
    if (offset < 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Offset must be >= 0',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Validate date format (if provided)
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid startDate format. Use ISO 8601',
            code: 'VALIDATION_ERROR'
          },
          { status: 400 }
        );
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid endDate format. Use ISO 8601',
            code: 'VALIDATION_ERROR'
          },
          { status: 400 }
        );
      }
    }

    // Validate date range logic
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end < start) {
        return NextResponse.json(
          {
            success: false,
            error: 'endDate must be >= startDate',
            code: 'VALIDATION_ERROR'
          },
          { status: 400 }
        );
      }
    }

    // ========================================================================
    // AUTHENTICATION & AUTHORIZATION
    // ========================================================================

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

    // Role check (admin, auditor, or super_auditor required)
    // RPC will perform detailed role-based filtering
    const { data: isAdmin } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'admin'
    });

    const { data: isAuditor } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'auditor'
    });

    const { data: isSuperAuditor } = await supabase.rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'super_auditor'
    });

    if (!isAdmin && !isAuditor && !isSuperAuditor) {
      return NextResponse.json(
        {
          success: false,
          error: 'Privileged access required (Admin, Auditor, or Super Auditor)',
          code: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }

    // Determine user's highest role for UI display
    const userRole = isSuperAuditor ? 'super_auditor' : isAuditor ? 'auditor' : 'admin';

    // ========================================================================
    // DATABASE QUERY
    // ========================================================================

    const { data: logsData, error: logsError } = await supabase
      .rpc('get_audit_logs', {
        p_requesting_user_id: user.id,
        p_category: category || null,
        p_severity: severity || null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_limit: limit,
        p_offset: offset
      });

    if (logsError) {
      console.error('Audit logs fetch error:', logsError);

      // Handle specific errors
      if (logsError.code === '42501') {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized: Insufficient privileges',
          code: 'UNAUTHORIZED'
        }, { status: 403 });
      }

      if (logsError.code === '22023') {
        return NextResponse.json({
          success: false,
          error: 'Invalid enum value provided',
          code: 'VALIDATION_ERROR'
        }, { status: 400 });
      }

      return NextResponse.json({
        success: false,
        error: logsError.message || 'Failed to fetch audit logs',
        code: 'DATABASE_ERROR'
      }, { status: 500 });
    }

    // ========================================================================
    // DATA TRANSFORMATION
    // ========================================================================

    const logs: AuditLogRaw[] = logsData || [];
    const totalCount = logs.length > 0 ? logs[0].total_count : 0;
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(totalCount / limit);

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================

    return NextResponse.json({
      success: true,
      logs: logs.map(log => ({
        id: log.id,
        adminUserId: log.admin_user_id,
        adminEmail: log.admin_email,
        adminDisplayName: log.admin_display_name,
        action: log.action,
        targetId: log.target_id,
        targetType: log.target_type,
        severity: log.severity,
        category: log.category,
        details: log.details,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        createdAt: log.created_at
      })),
      totalCount,
      currentPage,
      totalPages,
      userRole  // Pass user's role to frontend for UI restrictions
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
