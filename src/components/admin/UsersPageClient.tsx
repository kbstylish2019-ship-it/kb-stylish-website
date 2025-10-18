"use client";

import React, { useState } from "react";
import { Search, UserPlus, Shield, Ban, CheckCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminUsersListResponse } from "@/lib/apiClient";
import type { AdminUser } from "@/lib/apiClientBrowser";
import { suspendUser, activateUser } from "@/lib/apiClientBrowser";
import RoleAssignmentModal from "./RoleAssignmentModal";

interface UsersPageClientProps {
  initialData: AdminUsersListResponse;
  currentUserId: string;
}

export default function UsersPageClient({ initialData, currentUserId }: UsersPageClientProps) {
  const [users, setUsers] = useState(initialData.users);
  const [totalUsers] = useState(initialData.total); // Store total from server
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  
  // Handle user suspension
  const handleSuspend = async (user: AdminUser) => {
    // Prevent self-suspension
    if (user.id === currentUserId) {
      showToast('Cannot suspend your own account', 'error');
      return;
    }
    
    const duration = prompt(
      `Suspend ${user.display_name}?\n\nEnter duration in days (leave empty for permanent):`,
      '7'
    );
    
    if (duration === null) return; // Cancelled
    
    const reason = prompt('Reason for suspension (optional):');
    
    setIsLoading(true);
    const result = await suspendUser(
      user.id,
      duration ? parseInt(duration) : undefined,
      reason || undefined
    );
    
    if (result?.success) {
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === user.id 
          ? { ...u, banned_until: result.banned_until, status: 'banned' as const }
          : u
      ));
      showToast(`${user.display_name} suspended successfully`, 'success');
    } else {
      showToast(result?.message || 'Failed to suspend user', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle user activation
  const handleActivate = async (user: AdminUser) => {
    if (!confirm(`Activate ${user.display_name}?`)) return;
    
    setIsLoading(true);
    const result = await activateUser(user.id);
    
    if (result?.success) {
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === user.id 
          ? { ...u, banned_until: undefined, status: 'active' as const }
          : u
      ));
      showToast(`${user.display_name} activated successfully`, 'success');
    } else {
      showToast(result?.message || 'Failed to activate user', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle role assignment modal
  const handleOpenRoleModal = (user: AdminUser) => {
    setSelectedUser(user);
    setIsRoleModalOpen(true);
  };
  
  // Filter users
  const filteredUsers = users.filter(user => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        (user.display_name?.toLowerCase() || '').includes(query) ||
        (user.username?.toLowerCase() || '').includes(query) ||
        (user.email?.toLowerCase() || '').includes(query);
      if (!matchesSearch) return false;
    }
    
    // Role filter
    if (roleFilter !== 'all') {
      const hasRole = user.roles.some(r => r.role_name === roleFilter && r.is_active);
      if (!hasRole) return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && user.status !== statusFilter) {
      return false;
    }
    
    return true;
  });
  
  return (
    <>
      <div className="space-y-6">
        {/* Toast Notification */}
        {toast && (
          <div 
            className={cn(
              "fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 shadow-lg",
              toast.type === 'success' 
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/20 bg-red-500/10 text-red-300"
            )}
          >
            {toast.message}
          </div>
        )}
        
        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px] max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
              />
            </div>
          </div>
          
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="vendor">Vendor</option>
            <option value="customer">Customer</option>
            <option value="support">Support</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="banned">Banned</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        
        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Total Users</p>
            <div className="mt-2 text-2xl font-semibold">{totalUsers}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Active (Current Page)</p>
            <div className="mt-2 text-2xl font-semibold text-emerald-400">
              {users.filter(u => u.status === 'active').length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Banned (Current Page)</p>
            <div className="mt-2 text-2xl font-semibold text-red-400">
              {users.filter(u => u.status === 'banned').length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Pending (Current Page)</p>
            <div className="mt-2 text-2xl font-semibold text-amber-400">
              {users.filter(u => u.status === 'pending').length}
            </div>
          </div>
        </div>
        
        {/* Users Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                  <th className="px-4 py-3 w-12"></th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-foreground/60">
                      Loading...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-white/5 p-4">
                          <User className="h-8 w-8 text-foreground/40" />
                        </div>
                        <div>
                          <p className="text-foreground/80 font-medium">
                            {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                              ? `No users found`
                              : 'No users yet'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, idx) => (
                    <tr 
                      key={user.id} 
                      className={cn(idx % 2 === 1 ? "bg-white/[0.02]" : undefined)}
                    >
                      <td className="px-4 py-3">
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url} 
                            alt={user.display_name}
                            className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                            <User className="h-5 w-5 text-foreground/40" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {user.display_name || 'No Name'}
                            {user.is_verified && (
                              <span title="Email Verified" className="inline-flex">
                                <CheckCircle className="h-4 w-4 text-[var(--kb-primary-brand)]" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-foreground/60">@{user.username || 'no-username'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground/80">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.filter(r => r.is_active).map(role => (
                            <span
                              key={role.role_id}
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1",
                                role.role_name === 'admin'
                                  ? "bg-purple-500/15 text-purple-300 ring-purple-500/30"
                                  : role.role_name === 'vendor'
                                  ? "bg-blue-500/15 text-blue-300 ring-blue-500/30"
                                  : "bg-white/10 text-foreground/80 ring-white/10"
                              )}
                            >
                              {role.role_name}
                            </span>
                          ))}
                          {user.roles.filter(r => r.is_active).length === 0 && (
                            <span className="text-foreground/60 text-xs">No roles</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1",
                          user.status === 'active'
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                            : user.status === 'banned'
                            ? "bg-red-500/15 text-red-300 ring-red-500/30"
                            : user.status === 'pending'
                            ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                            : "bg-white/10 text-foreground/80 ring-white/10"
                        )}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground/60 text-xs">
                        {user.last_sign_in_at 
                          ? new Date(user.last_sign_in_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenRoleModal(user)}
                            className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                            title="Manage Roles"
                            disabled={user.id === currentUserId}
                          >
                            <Shield className="h-4 w-4 text-purple-400" />
                          </button>
                          
                          {user.status === 'banned' ? (
                            <button
                              onClick={() => handleActivate(user)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                              title="Activate User"
                            >
                              <CheckCircle className="h-4 w-4 text-emerald-400" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSuspend(user)}
                              className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                              title="Suspend User"
                              disabled={user.id === currentUserId}
                            >
                              <Ban className="h-4 w-4 text-red-400" />
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
        
        {/* Pagination Info */}
        <div className="text-sm text-foreground/60 text-center">
          Showing {filteredUsers.length} of {totalUsers} users
          {totalUsers > 20 && (
            <div className="mt-2 text-xs text-amber-400">
              Note: Pagination controls coming soon. Currently showing first 20 users only.
            </div>
          )}
        </div>
      </div>
      
      {/* Role Assignment Modal */}
      {selectedUser && (
        <RoleAssignmentModal 
          open={isRoleModalOpen} 
          onClose={() => {
            setIsRoleModalOpen(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          currentUserId={currentUserId}
          onSuccess={(updatedUser) => {
            setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
            showToast('Roles updated successfully', 'success');
            setIsRoleModalOpen(false);
            setSelectedUser(null);
          }}
        />
      )}
    </>
  );
}
