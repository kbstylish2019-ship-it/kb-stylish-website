"use client";

import React, { useState, useEffect } from "react";
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
  const [totalUsers, setTotalUsers] = useState(initialData.total);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialData.total_pages || 1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  
  // Debounce search input (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Trigger server-side fetch when filters change
  useEffect(() => {
    if (debouncedSearch !== '' || roleFilter !== 'all' || statusFilter !== 'all') {
      handlePageChange(1); // Reset to page 1 when filters change
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, roleFilter, statusFilter]);
  
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
  
  // Handle pagination - fetch from server
  const handlePageChange = async (newPage: number) => {
    setIsLoading(true);
    try {
      const { fetchAdminUsersList } = await import('@/lib/apiClientBrowser');
      const result = await fetchAdminUsersList({
        page: newPage,
        per_page: 20,
        search: debouncedSearch || undefined,
        role_filter: roleFilter !== 'all' ? roleFilter : undefined,
        status_filter: statusFilter !== 'all' ? statusFilter : undefined,
      });
      
      if (result) {
        setUsers(result.users);
        setTotalUsers(result.total);
        setCurrentPage(result.page);
        setTotalPages(result.total_pages);
      } else {
        showToast('Failed to load users', 'error');
      }
    } catch (error) {
      showToast('Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle filter changes - refetch from server
  const handleFilterChange = async () => {
    setCurrentPage(1); // Reset to page 1
    await handlePageChange(1);
  };
  
  // ✅ FIXED: Server-side filtering (no client-side filter needed)
  const filteredUsers = users; // Already filtered by server
  
  return (
    <>
      <div className="space-y-6">
        {/* Toast Notification */}
        {toast && (
          <div 
            className={cn(
              "fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 shadow-lg",
              toast.type === 'success' 
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            )}
          >
            {toast.message}
          </div>
        )}
        
        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px] max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 py-2 text-sm ring-1 ring-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
              />
            </div>
          </div>
          
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm ring-1 ring-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
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
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm ring-1 ring-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
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
          <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Users</p>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{totalUsers}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Active (Current Page)</p>
            <div className="mt-2 text-2xl font-semibold text-emerald-600">
              {users.filter(u => u.status === 'active').length}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Banned (Current Page)</p>
            <div className="mt-2 text-2xl font-semibold text-red-600">
              {users.filter(u => u.status === 'banned').length}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Pending (Current Page)</p>
            <div className="mt-2 text-2xl font-semibold text-amber-600">
              {users.filter(u => u.status === 'pending').length}
            </div>
          </div>
        </div>
        
        {/* Users Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 ring-1 ring-gray-100 shadow-sm">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[1024px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
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
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-gray-100 p-4">
                          <User className="h-8 w-8 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-gray-700 font-medium">
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
                      className={cn(idx % 2 === 1 ? "bg-gray-50" : "bg-white")}
                    >
                      <td className="px-4 py-3">
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url} 
                            alt={user.display_name}
                            className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center ring-1 ring-gray-200">
                            <User className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                            {user.display_name || 'No Name'}
                            {user.is_verified && (
                              <span title="Email Verified" className="inline-flex">
                                <CheckCircle className="h-4 w-4 text-[#1976D2]" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">@{user.username || 'no-username'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
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
                                  ? "bg-purple-50 text-purple-700 ring-purple-200"
                                  : role.role_name === 'vendor'
                                  ? "bg-blue-50 text-blue-700 ring-blue-200"
                                  : "bg-gray-100 text-gray-700 ring-gray-200"
                              )}
                            >
                              {role.role_name}
                            </span>
                          ))}
                          {user.roles.filter(r => r.is_active).length === 0 && (
                            <span className="text-gray-500 text-xs">No roles</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1",
                          user.status === 'active'
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : user.status === 'banned'
                            ? "bg-red-50 text-red-700 ring-red-200"
                            : user.status === 'pending'
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : "bg-gray-100 text-gray-700 ring-gray-200"
                        )}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {user.last_sign_in_at 
                          ? new Date(user.last_sign_in_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenRoleModal(user)}
                            className="rounded-lg p-2 hover:bg-gray-100 ring-1 ring-transparent hover:ring-gray-200"
                            title="Manage Roles"
                            disabled={user.id === currentUserId}
                          >
                            <Shield className="h-4 w-4 text-purple-600" />
                          </button>
                          
                          {user.status === 'banned' ? (
                            <button
                              onClick={() => handleActivate(user)}
                              className="rounded-lg p-2 hover:bg-gray-100 ring-1 ring-transparent hover:ring-gray-200"
                              title="Activate User"
                            >
                              <CheckCircle className="h-4 w-4 text-emerald-600" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSuspend(user)}
                              className="rounded-lg p-2 hover:bg-gray-100 ring-1 ring-transparent hover:ring-gray-200"
                              title="Suspend User"
                              disabled={user.id === currentUserId}
                            >
                              <Ban className="h-4 w-4 text-red-600" />
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
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200">
            {/* Page Info */}
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, totalUsers)} of {totalUsers} users
            </div>
            
            {/* Pagination Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  currentPage === 1 || isLoading
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white text-gray-700 hover:bg-gray-100 ring-1 ring-gray-200"
                )}
              >
                Previous
              </button>
              
              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
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
                      onClick={() => handlePageChange(pageNum)}
                      disabled={isLoading}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        currentPage === pageNum
                          ? "bg-[#1976D2] text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100 ring-1 ring-gray-200"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoading}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  currentPage >= totalPages || isLoading
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white text-gray-700 hover:bg-gray-100 ring-1 ring-gray-200"
                )}
              >
                Next
              </button>
            </div>
          </div>
        )}
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
