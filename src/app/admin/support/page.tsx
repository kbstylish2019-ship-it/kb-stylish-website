import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from '@/components/admin/AdminSidebar';
import DashboardLayout from '@/components/layout/DashboardLayout';
import SupportTicketManager from '@/components/admin/SupportTicketManager';
import { fetchAdminSupportTickets } from '@/lib/supportApi';
import { MessageCircle, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

// Helper to create Supabase server client
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
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

export default async function AdminSupportPage() {
  // Check authentication and admin role
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/support');
  }
  
  // Verify admin or support role from JWT
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin') && !userRoles.includes('support')) {
    redirect('/'); // Non-admin/support users redirected to home
  }

  // Fetch support tickets from database
  const ticketsResponse = await fetchAdminSupportTickets({ limit: 50, offset: 0 });
  
  // Handle error state
  if (!ticketsResponse.success || !ticketsResponse.tickets) {
    return (
      <DashboardLayout title="Support Management" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Support Tickets</h2>
          <p className="mt-2 text-sm text-red-400">
            {ticketsResponse.error || 'Unable to fetch support tickets. Please refresh the page or try again later.'}
          </p>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate stats from tickets
  const tickets = ticketsResponse.tickets;
  const openTicketsCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  
  // Resolved today - check if resolved_at is today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resolvedTodayCount = tickets.filter(t => {
    if (!t.resolved_at) return false;
    const resolvedDate = new Date(t.resolved_at);
    resolvedDate.setHours(0, 0, 0, 0);
    return resolvedDate.getTime() === today.getTime();
  }).length;
  
  // Calculate average response time (hours) for resolved tickets
  const resolvedTickets = tickets.filter(t => t.resolved_at && t.created_at);
  let avgResponseTime = '-';
  if (resolvedTickets.length > 0) {
    const totalHours = resolvedTickets.reduce((sum, t) => {
      const created = new Date(t.created_at).getTime();
      const resolved = new Date(t.resolved_at!).getTime();
      return sum + ((resolved - created) / (1000 * 60 * 60)); // Convert to hours
    }, 0);
    const avgHours = totalHours / resolvedTickets.length;
    avgResponseTime = avgHours < 1 ? `${Math.round(avgHours * 60)}m` : `${Math.round(avgHours)}h`;
  }

  return (
    <DashboardLayout title="Support Management" sidebar={<AdminSidebar />}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <MessageCircle className="h-6 w-6 text-[var(--kb-accent-gold)]" />
          <h1 className="text-2xl font-bold text-foreground">
            Support Ticket Management
          </h1>
        </div>
        <p className="text-foreground/70">
          Manage customer support tickets, respond to inquiries, and track resolution status.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-sm text-foreground/60">Open Tickets</div>
              <div className="text-xl font-bold text-foreground">{openTicketsCount}</div>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="text-sm text-foreground/60">In Progress</div>
              <div className="text-xl font-bold text-foreground">{inProgressCount}</div>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-sm text-foreground/60">Resolved Today</div>
              <div className="text-xl font-bold text-foreground">{resolvedTodayCount}</div>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-sm text-foreground/60">Avg Response Time</div>
              <div className="text-xl font-bold text-foreground">{avgResponseTime}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Support Ticket Manager */}
      <SupportTicketManager 
        initialTickets={ticketsResponse.tickets}
        totalCount={ticketsResponse.total || 0}
      />
    </DashboardLayout>
  );
}
