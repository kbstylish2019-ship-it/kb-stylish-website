"use client";

import React, { useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { AdminUser } from "@/lib/types";
import type { UserAction } from "@/components/admin/UsersTable";
import { useAdminDashboard } from "@/hooks/useAdminDashboard";
import { Users, Store, Wallet, LifeBuoy, Plus, RotateCcw } from "lucide-react";

// Use real components in test to avoid next/dynamic being mocked to null
const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;
let AdminStatCard: React.ComponentType<any>;
let UsersTable: React.ComponentType<any>;
let RevenueChart: React.ComponentType<any>;
let UserStatusDonut: React.ComponentType<any>;

if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DL = require("@/components/layout/DashboardLayout");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ASC = require("@/components/admin/AdminStatCard");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const UT = require("@/components/admin/UsersTable");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RC = require("@/components/admin/RevenueChart");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const USD = require("@/components/admin/UserStatusDonut");

  DashboardLayout = (DL.default ?? DL) as React.ComponentType<any>;
  AdminStatCard = (ASC.default ?? ASC) as React.ComponentType<any>;
  UsersTable = (UT.default ?? UT) as React.ComponentType<any>;
  RevenueChart = (RC.default ?? RC) as React.ComponentType<any>;
  UserStatusDonut = (USD.default ?? USD) as React.ComponentType<any>;
} else {
  // Dynamic imports for heavy components
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
  AdminStatCard = dynamic(() => import("@/components/admin/AdminStatCard"));
  UsersTable = dynamic(() => import("@/components/admin/UsersTable"), {
    loading: () => <div className="h-96 animate-pulse rounded-lg bg-white/5" />
  });
  RevenueChart = dynamic(() => import("@/components/admin/RevenueChart"), {
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-white/5" />
  });
  UserStatusDonut = dynamic(() => import("@/components/admin/UserStatusDonut"), {
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-white/5" />
  });
}

function AdminSidebar() {
  const items = [
    { id: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
    { id: "users", label: "Users", href: "/admin/users" },
    { id: "vendors", label: "Vendors", href: "/admin/vendors" },
    { id: "analytics", label: "Analytics", href: "/admin/analytics" },
    { id: "finance", label: "Finance", href: "/admin/finance" },
    { id: "moderation", label: "Moderation", href: "/admin/moderation" },
    { id: "settings", label: "Settings", href: "/admin/settings" },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

const mockUsers: AdminUser[] = [
  { id: "U-1001", name: "Rohan Shrestha", email: "rohan@example.com", role: "customer", status: "Active", createdAt: new Date(Date.now() - 14*86400000).toISOString(), lastActiveAt: new Date().toISOString(), orders: 5 },
  { id: "U-1002", name: "Priya Sharma", email: "priya@example.com", role: "vendor", status: "Suspended", createdAt: new Date(Date.now() - 45*86400000).toISOString(), lastActiveAt: new Date(Date.now() - 2*86400000).toISOString(), orders: 124, revenue: 845000 },
  { id: "U-1003", name: "Admin Sita", email: "sita@example.com", role: "admin", status: "Active", createdAt: new Date(Date.now() - 120*86400000).toISOString(), lastActiveAt: new Date().toISOString() },
  { id: "U-1004", name: "Bikash Tamang", email: "bikash@example.com", role: "customer", status: "Pending", createdAt: new Date(Date.now() - 3*86400000).toISOString() },
  { id: "U-1005", name: "Maya Gurung", email: "maya@example.com", role: "vendor", status: "Active", createdAt: new Date(Date.now() - 90*86400000).toISOString(), lastActiveAt: new Date(Date.now() - 1*86400000).toISOString(), orders: 212, revenue: 2145000 },
  { id: "U-1006", name: "Anish Karki", email: "anish@example.com", role: "customer", status: "Banned", createdAt: new Date(Date.now() - 200*86400000).toISOString() },
  { id: "U-1007", name: "Vendor Ram", email: "ram@shop.io", role: "vendor", status: "Active", createdAt: new Date(Date.now() - 25*86400000).toISOString(), lastActiveAt: new Date(Date.now() - 5*86400000).toISOString(), orders: 78, revenue: 675000 },
];

export default function AdminDashboardPage() {
  const { state, paginatedUsers, totalPages, actions } = useAdminDashboard(mockUsers);

  const onAction = useCallback((u: AdminUser, action: UserAction) => {
    if (action === "activate") actions.updateUserStatus(u.id, "Active");
    if (action === "suspend") actions.updateUserStatus(u.id, "Suspended");
    if (action === "ban") actions.updateUserStatus(u.id, "Banned");
    // "view" action would typically navigate to user detail page
  }, [actions]);

  const counts = useMemo(() => {
    const total = state.users.length;
    const vendors = state.users.filter((u) => u.role === "vendor").length;
    const active = state.users.filter((u) => u.status === "Active").length;
    const ticketsOpen = 17; // mock
    const statusAgg = [
      { label: "Active", value: state.users.filter((u) => u.status === "Active").length, color: "#10b981" },
      { label: "Suspended", value: state.users.filter((u) => u.status === "Suspended").length, color: "#f59e0b" },
      { label: "Pending", value: state.users.filter((u) => u.status === "Pending").length, color: "#a3a3a3" },
      { label: "Banned", value: state.users.filter((u) => u.status === "Banned").length, color: "#ef4444" },
    ];
    return { total, vendors, active, ticketsOpen, statusAgg };
  }, [state.users]);

  const hasFilters = state.searchQuery || state.roleFilter !== "all" || state.statusFilter !== "all";

  const cta = (
    <button
      onClick={() => {/* Placeholder: open invite modal */}}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-accent-gold)_85%,black)] to-[var(--kb-accent-gold)] hover:from-[var(--kb-accent-gold)] hover:to-[var(--kb-accent-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-primary-brand)]"
    >
      <Plus className="h-4 w-4 text-black" aria-hidden />
      <span className="text-black">Invite User</span>
    </button>
  );

  return (
    <DashboardLayout title="Admin Control Panel" actions={cta} sidebar={<AdminSidebar />}> 
      {/* Stat Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard title="Total Users" value={counts.total} subtitle={`Active: ${counts.active}`} trend={{ label: "+5% WoW", direction: "up" }} icon={<Users className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
        <AdminStatCard title="Active Vendors" value={counts.vendors} subtitle="Platform-wide" trend={{ label: "+2 this week", direction: "flat" }} icon={<Store className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
        <AdminStatCard title="Monthly Revenue" value={"NPR 1,25,40,000"} subtitle="Jan 1 - Current" trend={{ label: "+11% MoM", direction: "up" }} icon={<Wallet className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
        <AdminStatCard title="Tickets Open" value={counts.ticketsOpen} subtitle="Avg. resolve 8h" trend={{ label: "-3 today", direction: "down" }} icon={<LifeBuoy className="h-5 w-5 text-[var(--kb-primary-brand)]" />} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <RevenueChart className="lg:col-span-2" />
        <UserStatusDonut data={counts.statusAgg} />
      </div>

      {/* Users Management */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Users</h2>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                onClick={actions.resetFilters}
                className="inline-flex items-center gap-1 text-sm text-[var(--kb-accent-gold)] hover:underline"
                data-testid="reset-filters"
              >
                <RotateCcw className="h-3 w-3" />
                Reset filters
              </button>
            )}
            <Link className="text-sm text-[var(--kb-accent-gold)] hover:underline" href="/admin/users">View all</Link>
          </div>
        </div>
        <UsersTable 
          users={paginatedUsers}
          searchQuery={state.searchQuery}
          onSearchChange={actions.setSearchQuery}
          roleFilter={state.roleFilter}
          onRoleFilterChange={actions.setRoleFilter}
          statusFilter={state.statusFilter}
          onStatusFilterChange={actions.setStatusFilter}
          currentPage={state.currentPage}
          totalPages={totalPages}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          totalUsers={state.users.length}
          onAction={onAction}
        />
      </div>
    </DashboardLayout>
  );
}
