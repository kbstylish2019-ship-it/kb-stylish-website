import React from "react";
import type { AdminUser, AccountStatus, UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

function formatCurrency(npr?: number) {
  if (typeof npr !== "number") return "-";
  try {
    return new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(npr);
  } catch {
    return `NPR ${npr.toLocaleString()}`;
  }
}

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  const map: Record<AdminUser["role"], string> = {
    guest: "bg-white/10 text-foreground/70 ring-white/10",
    customer: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
    vendor: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    admin: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1", map[role])}>{role}</span>;
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const map: Record<AccountStatus, string> = {
    Active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    Suspended: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    Pending: "bg-white/10 text-foreground/80 ring-white/10",
    Banned: "bg-red-500/15 text-red-300 ring-red-500/30",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1", map[status])}>{status}</span>;
}

export type UserAction = "view" | "suspend" | "activate" | "ban";

export interface UsersTableProps {
  users: AdminUser[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  roleFilter?: UserRole | "all";
  onRoleFilterChange?: (role: UserRole | "all") => void;
  statusFilter?: AccountStatus | "all";
  onStatusFilterChange?: (status: AccountStatus | "all") => void;
  currentPage?: number;
  totalPages?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  totalUsers?: number;
  isLoading?: boolean;
  onAction?: (user: AdminUser, action: UserAction) => void;
  className?: string;
}

export default function UsersTable({ 
  users, 
  searchQuery, 
  onSearchChange, 
  roleFilter = "all",
  onRoleFilterChange,
  statusFilter = "all",
  onStatusFilterChange,
  currentPage = 1,
  totalPages = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  totalUsers = 0,
  isLoading, 
  onAction, 
  className 
}: UsersTableProps) {
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalUsers);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters Row */}
      <div className="flex flex-wrap gap-3">
        {onSearchChange && (
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="users-search-input" className="sr-only">Search users</label>
            <input
              id="users-search-input"
              type="text"
              value={searchQuery || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search users by name, email, role, or status..."
              aria-label="Search users"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
              data-testid="users-search-input"
            />
          </div>
        )}
        
        {onRoleFilterChange && (
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value as UserRole | "all")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
            data-testid="role-filter"
          >
            <option value="all">All Roles</option>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="admin">Admin</option>
            <option value="guest">Guest</option>
          </select>
        )}
        
        {onStatusFilterChange && (
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as AccountStatus | "all")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
            data-testid="status-filter"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
            <option value="Pending">Pending</option>
            <option value="Banned">Banned</option>
          </select>
        )}
        
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] [&>option]:bg-[#1a1a1a] [&>option]:text-foreground"
            data-testid="page-size-select"
          >
            <option value="5">5 per page</option>
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10" data-testid="users-table">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-foreground/60">Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-foreground/60">{searchQuery ? `No users found matching "${searchQuery}"` : "No users found"}</td>
                </tr>
              ) : (
                users.map((u, idx) => (
                  <tr key={u.id} className={cn(idx % 2 === 1 ? "bg-white/[0.02]" : undefined)}>
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-foreground/80">{u.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-foreground/80">{typeof u.orders === 'number' ? u.orders : '-'}</td>
                    <td className="px-4 py-3">{formatCurrency(u.revenue)}</td>
                    <td className="px-4 py-3 text-foreground/80">{new Date(u.createdAt).toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" })}</td>
                    <td className="px-4 py-3 text-foreground/80">{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" }) : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-full px-2.5 py-1 text-xs ring-1 ring-white/10 hover:bg-white/10" onClick={() => onAction?.(u, "view")}>View</button>
                        {u.status !== "Active" && (
                          <button className="rounded-full px-2.5 py-1 text-xs ring-1 ring-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" onClick={() => onAction?.(u, "activate")}>
                            Activate
                          </button>
                        )}
                        {u.status === "Active" && (
                          <button className="rounded-full px-2.5 py-1 text-xs ring-1 ring-amber-500/30 text-amber-300 hover:bg-amber-500/10" onClick={() => onAction?.(u, "suspend")}>
                            Suspend
                          </button>
                        )}
                        {u.status !== "Banned" && (
                          <button className="rounded-full px-2.5 py-1 text-xs ring-1 ring-red-500/30 text-red-300 hover:bg-red-500/10" onClick={() => onAction?.(u, "ban")}>
                            Ban
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Pagination */}
      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-foreground/60">
            Showing {startIndex} to {endIndex} of {totalUsers} users
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-lg p-2 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    aria-current={pageNum === currentPage ? "page" : undefined}
                    aria-label={`Go to page ${pageNum}`}
                    className={cn(
                      "rounded-lg px-3 py-1 text-sm ring-1",
                      pageNum === currentPage
                        ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)]/50 text-[var(--kb-primary-brand)]"
                        : "ring-white/10 hover:bg-white/5"
                    )}
                    data-testid={`page-${pageNum}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-lg p-2 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
