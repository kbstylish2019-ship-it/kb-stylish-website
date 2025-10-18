"use client";

import React, { useState } from "react";
import { Search, Store, CheckCircle, XCircle, Ban, DollarSign, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminVendorsListResponse } from "@/lib/apiClient";
import type { AdminVendor } from "@/lib/apiClientBrowser";
import { approveVendor, rejectVendor, reactivateVendor, updateVendorCommission, suspendVendor, activateVendor } from "@/lib/apiClientBrowser";

interface VendorsPageClientProps {
  initialData: AdminVendorsListResponse;
}

export default function VendorsPageClient({ initialData }: VendorsPageClientProps) {
  const [vendors, setVendors] = useState(initialData.vendors);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  
  // Handle vendor approval
  const handleApprove = async (vendor: AdminVendor) => {
    const notes = prompt(`Approve ${vendor.business_name}?\n\nOptional admin notes:`);
    if (notes === null) return; // Cancelled
    
    setIsLoading(true);
    const result = await approveVendor(vendor.user_id, notes || undefined);
    
    if (result?.success) {
      setVendors(prev => prev.map(v => 
        v.user_id === vendor.user_id 
          ? { ...v, verification_status: 'verified' as const }
          : v
      ));
      showToast(`${vendor.business_name} approved successfully`, 'success');
    } else {
      showToast(result?.message || 'Failed to approve vendor', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle vendor rejection
  const handleReject = async (vendor: AdminVendor) => {
    const reason = prompt(`Reject ${vendor.business_name}?\n\nReason for rejection (optional):`);
    if (reason === null) return; // Cancelled
    
    setIsLoading(true);
    const result = await rejectVendor(vendor.user_id, reason || undefined);
    
    if (result?.success) {
      setVendors(prev => prev.map(v => 
        v.user_id === vendor.user_id 
          ? { ...v, verification_status: 'rejected' as const }
          : v
      ));
      showToast(`${vendor.business_name} rejected`, 'success');
    } else {
      showToast(result?.message || 'Failed to reject vendor', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle commission update
  const handleUpdateCommission = async (vendor: AdminVendor) => {
    const currentRate = (vendor.commission_rate * 100).toFixed(0);
    const newRateStr = prompt(
      `Update commission for ${vendor.business_name}?\n\nCurrent rate: ${currentRate}%\n\nEnter new rate (0-100):`,
      currentRate
    );
    
    if (newRateStr === null) return; // Cancelled
    
    const newRatePercent = parseFloat(newRateStr);
    if (isNaN(newRatePercent) || newRatePercent < 0 || newRatePercent > 100) {
      showToast('Invalid rate. Must be between 0 and 100', 'error');
      return;
    }
    
    const newRateDecimal = newRatePercent / 100;
    
    setIsLoading(true);
    const result = await updateVendorCommission(vendor.user_id, newRateDecimal);
    
    if (result?.success) {
      setVendors(prev => prev.map(v => 
        v.user_id === vendor.user_id 
          ? { ...v, commission_rate: newRateDecimal }
          : v
      ));
      showToast(`Commission updated to ${newRatePercent}%`, 'success');
    } else {
      showToast(result?.message || 'Failed to update commission', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle vendor suspension
  const handleSuspend = async (vendor: AdminVendor) => {
    // Warn if vendor has pending orders
    if (vendor.pending_orders > 0) {
      const confirmSuspend = confirm(
        `⚠️ ${vendor.business_name} has ${vendor.pending_orders} pending order(s)!\n\n` +
        `Suspending will:\n` +
        `- Ban the vendor account\n` +
        `- Deactivate all ${vendor.active_products} active products\n` +
        `- Pending orders may need manual handling\n\n` +
        `Continue with suspension?`
      );
      if (!confirmSuspend) return;
    }
    
    const reason = prompt(
      `Suspend ${vendor.business_name}?\n\n` +
      `This will deactivate ${vendor.active_products} product(s).\n\n` +
      `Reason for suspension (optional):`
    );
    
    if (reason === null) return; // Cancelled
    
    setIsLoading(true);
    const result = await suspendVendor(vendor.user_id, reason || undefined);
    
    if (result?.success) {
      setVendors(prev => prev.map(v => 
        v.user_id === vendor.user_id 
          ? { ...v, banned_until: 'infinity', active_products: 0 }
          : v
      ));
      showToast(
        `${vendor.business_name} suspended (${result.products_deactivated} products deactivated)`,
        'success'
      );
    } else {
      showToast(result?.message || 'Failed to suspend vendor', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle vendor activation
  const handleActivate = async (vendor: AdminVendor) => {
    if (!confirm(`Activate ${vendor.business_name}?\n\nNote: Products remain inactive and must be reactivated by the vendor.`)) {
      return;
    }
    
    setIsLoading(true);
    const result = await activateVendor(vendor.user_id);
    
    if (result?.success) {
      setVendors(prev => prev.map(v => 
        v.user_id === vendor.user_id 
          ? { ...v, banned_until: undefined }
          : v
      ));
      showToast(`${vendor.business_name} activated`, 'success');
    } else {
      showToast(result?.message || 'Failed to activate vendor', 'error');
    }
    setIsLoading(false);
  };
  
  // Handle vendor reactivation (for rejected vendors)
  const handleReactivate = async (vendor: AdminVendor) => {
    const confirmMsg = 
      `Reactivate ${vendor.business_name}?\n\n` +
      `This will:\n` +
      `- Change status from rejected → verified\n` +
      `- Restore vendor role\n` +
      `- Reactivate ALL products (${vendor.total_products} products)\n\n` +
      `Optional admin notes:`;
    
    const notes = prompt(confirmMsg);
    if (notes === null) return; // Cancelled
    
    setIsLoading(true);
    const result = await reactivateVendor(vendor.user_id, notes || undefined);
    
    if (result?.success) {
      setVendors(prev => prev.map(v => 
        v.user_id === vendor.user_id 
          ? { ...v, verification_status: 'verified' as const, active_products: vendor.total_products }
          : v
      ));
      showToast(
        `${vendor.business_name} reactivated! ${result.products_reactivated || 0} products restored`,
        'success'
      );
    } else {
      showToast(result?.message || 'Failed to reactivate vendor', 'error');
    }
    setIsLoading(false);
  };
  
  // Filter vendors
  const filteredVendors = vendors.filter(vendor => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        vendor.business_name.toLowerCase().includes(query) ||
        vendor.display_name.toLowerCase().includes(query) ||
        vendor.email.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && vendor.verification_status !== statusFilter) {
      return false;
    }
    
    return true;
  });
  
  // Calculate stats
  const totalRevenue = vendors.reduce((sum, v) => sum + v.total_revenue_cents, 0);
  const pendingCount = vendors.filter(v => v.verification_status === 'pending').length;
  const verifiedCount = vendors.filter(v => v.verification_status === 'verified').length;
  
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
                placeholder="Search vendors..."
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
              />
            </div>
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        
        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Total Vendors</p>
            <div className="mt-2 text-2xl font-semibold">{vendors.length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Pending Applications</p>
            <div className="mt-2 text-2xl font-semibold text-amber-400">{pendingCount}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Verified Vendors</p>
            <div className="mt-2 text-2xl font-semibold text-emerald-400">{verifiedCount}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-1 ring-white/10">
            <p className="text-xs font-medium text-foreground/70">Total Revenue</p>
            <div className="mt-2 text-2xl font-semibold text-[var(--kb-accent-gold)]">
              NPR {(totalRevenue / 100).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        
        {/* Vendors Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10 ring-1 ring-white/10">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-foreground/70">
                  <th className="px-4 py-3 w-12"></th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-foreground/60">
                      Loading...
                    </td>
                  </tr>
                ) : filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-white/5 p-4">
                          <Store className="h-8 w-8 text-foreground/40" />
                        </div>
                        <div>
                          <p className="text-foreground/80 font-medium">
                            {searchQuery || statusFilter !== 'all'
                              ? `No vendors found`
                              : 'No vendors yet'}
                          </p>
                          {pendingCount > 0 && statusFilter === 'all' && (
                            <p className="text-sm text-foreground/60 mt-1">
                              {pendingCount} pending application{pendingCount !== 1 ? 's' : ''} waiting for review
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map((vendor, idx) => {
                    const isSuspended = vendor.banned_until && vendor.banned_until !== 'null';
                    
                    return (
                      <tr 
                        key={vendor.user_id} 
                        className={cn(idx % 2 === 1 ? "bg-white/[0.02]" : undefined)}
                      >
                        <td className="px-4 py-3">
                          {vendor.avatar_url ? (
                            <img 
                              src={vendor.avatar_url} 
                              alt={vendor.business_name}
                              className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                              <Store className="h-5 w-5 text-foreground/40" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{vendor.business_name}</div>
                          {vendor.business_type && (
                            <div className="text-xs text-foreground/60 capitalize">{vendor.business_type}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span>{vendor.display_name}</span>
                            {vendor.is_verified && (
                              <CheckCircle className="h-3 w-3 text-[var(--kb-primary-brand)]" />
                            )}
                          </div>
                          <div className="text-xs text-foreground/60">{vendor.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1",
                            vendor.verification_status === 'verified'
                              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                              : vendor.verification_status === 'pending'
                              ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                              : "bg-red-500/15 text-red-300 ring-red-500/30"
                          )}>
                            {vendor.verification_status}
                          </span>
                          {isSuspended && (
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-red-500/15 text-red-300 ring-1 ring-red-500/30">
                                suspended
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground/80">
                            {vendor.active_products} / {vendor.total_products}
                          </div>
                          <div className="text-xs text-foreground/60">active</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground/80">
                            NPR {(vendor.total_revenue_cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-foreground/60">{vendor.total_orders} orders</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground/80">
                            {(vendor.commission_rate * 100).toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground/60 text-xs">
                          {new Date(vendor.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {vendor.verification_status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(vendor)}
                                  className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                  title="Approve Vendor"
                                >
                                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                                </button>
                                <button
                                  onClick={() => handleReject(vendor)}
                                  className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                  title="Reject Application"
                                >
                                  <XCircle className="h-4 w-4 text-red-400" />
                                </button>
                              </>
                            )}
                            
                            {vendor.verification_status === 'rejected' && (
                              <button
                                onClick={() => handleReactivate(vendor)}
                                className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                title="Reactivate Vendor"
                                disabled={isLoading}
                              >
                                <CheckCircle className="h-4 w-4 text-[var(--kb-primary-brand)]" />
                              </button>
                            )}
                            
                            {vendor.verification_status === 'verified' && (
                              <>
                                <button
                                  onClick={() => handleUpdateCommission(vendor)}
                                  className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                  title="Update Commission"
                                  disabled={isLoading}
                                >
                                  <DollarSign className="h-4 w-4 text-[var(--kb-accent-gold)]" />
                                </button>
                                
                                {isSuspended ? (
                                  <button
                                    onClick={() => handleActivate(vendor)}
                                    className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                    title="Activate Vendor"
                                    disabled={isLoading}
                                  >
                                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSuspend(vendor)}
                                    className="rounded-lg p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                                    title="Suspend Vendor"
                                    disabled={isLoading}
                                  >
                                    <Ban className="h-4 w-4 text-red-400" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Pagination Info */}
        <div className="text-sm text-foreground/60 text-center">
          Showing {filteredVendors.length} of {vendors.length} vendors
        </div>
      </div>
    </>
  );
}
