"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2, MapPin, Building, Phone, Mail, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface BranchManagementClientProps {
  branches: any[]; // Use any[] to handle raw database data
}

interface BranchFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
  displayOrder: number;
}

export default function BranchManagementClient({ branches: initialBranches }: BranchManagementClientProps) {
  const [branches, setBranches] = useState(initialBranches);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<BranchFormData>({
    name: '',
    address: '',
    phone: '',
    email: '',
    isActive: true,
    displayOrder: 0,
  });
  
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  
  const handleOpenModal = (branch?: any) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        address: branch.address || '',
        phone: branch.phone || '',
        email: branch.email || '',
        isActive: branch.is_active,
        displayOrder: branch.display_order,
      });
    } else {
      setEditingBranch(null);
      setFormData({
        name: '',
        address: '',
        phone: '',
        email: '',
        isActive: true,
        displayOrder: Math.max(...branches.map(b => b.display_order || 0), 0) + 1,
      });
    }
    setIsModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBranch(null);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const url = editingBranch 
        ? `/api/admin/branches/${editingBranch.id}`
        : '/api/admin/branches';
      
      const method = editingBranch ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to save branch');
      }
      
      // Update local state
      if (editingBranch) {
        setBranches(prev => prev.map(b => 
          b.id === editingBranch.id ? { ...b, ...formData, id: editingBranch.id } : b
        ));
        showToast('Branch updated successfully', 'success');
      } else {
        setBranches(prev => [...prev, { ...formData, id: data.branchId }]);
        showToast('Branch created successfully', 'success');
      }
      
      handleCloseModal();
    } catch (error) {
      console.error('Save branch error:', error);
      showToast(error instanceof Error ? error.message : 'Failed to save branch', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleToggleActive = async (branchId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/branches/${branchId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to toggle branch status');
      }
      
      setBranches(prev => prev.map(b => 
        b.id === branchId ? { ...b, isActive: !currentStatus } : b
      ));
      
      showToast(`Branch ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 'success');
    } catch (error) {
      console.error('Toggle branch error:', error);
      showToast(error instanceof Error ? error.message : 'Failed to toggle branch status', 'error');
    }
  };
  
  const handleDelete = async (branchId: string, branchName: string) => {
    if (!confirm(`Are you sure you want to delete "${branchName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/admin/branches/${branchId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete branch');
      }
      
      setBranches(prev => prev.filter(b => b.id !== branchId));
      showToast('Branch deleted successfully', 'success');
    } catch (error) {
      console.error('Delete branch error:', error);
      showToast(error instanceof Error ? error.message : 'Failed to delete branch', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg",
          toast.type === 'success' ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"
        )}>
          {toast.message}
        </div>
      )}
      
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Branch Locations ({branches.length})</h2>
          <p className="text-sm text-foreground/60">
            Manage KB Stylish salon locations across Kathmandu
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add Branch
        </button>
      </div>
      
      {/* Branches Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className={cn(
              "rounded-xl border p-4 transition-all hover:shadow-md",
              branch.is_active 
                ? "border-white/10 bg-white/5" 
                : "border-red-500/20 bg-red-500/5"
            )}
          >
            {/* Branch Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "rounded-full p-2",
                  branch.is_active ? "bg-[var(--kb-primary-brand)]/20" : "bg-red-500/20"
                )}>
                  <Building className={cn(
                    "h-4 w-4",
                    branch.is_active ? "text-[var(--kb-primary-brand)]" : "text-red-400"
                  )} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{branch.name}</h3>
                  <p className="text-xs text-foreground/50">Order: {branch.display_order}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleActive(branch.id, branch.is_active)}
                  className={cn(
                    "rounded p-1 transition-colors",
                    branch.is_active 
                      ? "text-green-400 hover:bg-green-500/10" 
                      : "text-red-400 hover:bg-red-500/10"
                  )}
                  title={branch.is_active ? "Deactivate branch" : "Activate branch"}
                >
                  {branch.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => handleOpenModal(branch)}
                  className="rounded p-1 text-foreground/60 hover:bg-white/10 hover:text-foreground transition-colors"
                  title="Edit branch"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(branch.id, branch.name)}
                  className="rounded p-1 text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete branch"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            
            {/* Branch Details */}
            <div className="space-y-2 text-xs">
              {branch.address && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{branch.address}</span>
                </div>
              )}
              {branch.phone && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span>{branch.phone}</span>
                </div>
              )}
              {branch.email && (
                <div className="flex items-center gap-2 text-foreground/70">
                  <Mail className="h-3 w-3 flex-shrink-0" />
                  <span>{branch.email}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {branches.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-white/20 p-8 text-center">
            <Building className="mx-auto h-12 w-12 text-foreground/30 mb-4" />
            <h3 className="font-semibold text-foreground/70 mb-2">No branches yet</h3>
            <p className="text-sm text-foreground/50 mb-4">
              Create your first KB Stylish branch location to get started.
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Add First Branch
            </button>
          </div>
        )}
      </div>
      
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-background p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">
              {editingBranch ? 'Edit Branch' : 'Add New Branch'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Information */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2">Branch Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-[var(--kb-primary-brand)] focus:outline-none"
                    placeholder="KB Stylish Pulchowk"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Display Order</label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-[var(--kb-primary-brand)] focus:outline-none"
                    min="0"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-[var(--kb-primary-brand)] focus:outline-none"
                  placeholder="Pulchowk, Lalitpur, Nepal"
                />
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-[var(--kb-primary-brand)] focus:outline-none"
                    placeholder="+977-1-5555555"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-[var(--kb-primary-brand)] focus:outline-none"
                    placeholder="pulchowk@kbstylish.com"
                  />
                </div>
              </div>
              
              {/* Removed Manager Name and Operating Hours for simplicity */}
              
              {/* Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-white/10"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active (visible to users)
                </label>
              </div>
              
              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : editingBranch ? 'Update Branch' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
