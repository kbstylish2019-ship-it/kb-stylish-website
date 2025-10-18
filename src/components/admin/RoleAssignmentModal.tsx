"use client";

import React, { useState, useRef, useEffect } from "react";
import FocusTrap from "focus-trap-react";
import { X, Shield, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminUser } from "@/lib/apiClientBrowser";
import { assignUserRole, revokeUserRole } from "@/lib/apiClientBrowser";

interface RoleAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  user: AdminUser;
  currentUserId: string;
  onSuccess: (updatedUser: AdminUser) => void;
}

const AVAILABLE_ROLES = [
  { id: 'admin', name: 'Admin', description: 'Full platform access', color: 'purple' },
  { id: 'vendor', name: 'Vendor', description: 'Sell products & services', color: 'blue' },
  { id: 'customer', name: 'Customer', description: 'Shopping & booking', color: 'green' },
  { id: 'support', name: 'Support', description: 'Customer support access', color: 'amber' },
];

export default function RoleAssignmentModal({ 
  open, 
  onClose, 
  user, 
  currentUserId,
  onSuccess 
}: RoleAssignmentModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize selected roles from user
  useEffect(() => {
    if (open) {
      const activeRoles = new Set(
        user.roles.filter(r => r.is_active).map(r => r.role_name)
      );
      setSelectedRoles(activeRoles);
      setError(null);
    }
  }, [open, user]);
  
  // Set initial focus when modal opens
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);
  
  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  
  const toggleRole = (roleId: string) => {
    // Prevent removing admin role from self
    if (roleId === 'admin' && user.id === currentUserId) {
      const currentHasAdmin = user.roles.some(r => r.role_name === 'admin' && r.is_active);
      if (currentHasAdmin && selectedRoles.has('admin')) {
        setError('Cannot remove your own admin role');
        return;
      }
    }
    
    setError(null);
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };
  
  const handleSubmit = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const currentRoles = new Set(
        user.roles.filter(r => r.is_active).map(r => r.role_name)
      );
      
      // Determine roles to add and remove
      const rolesToAdd = Array.from(selectedRoles).filter(r => !currentRoles.has(r));
      const rolesToRemove = Array.from(currentRoles).filter(r => !selectedRoles.has(r));
      
      // Execute role changes
      for (const role of rolesToAdd) {
        const result = await assignUserRole(user.id, role);
        if (!result?.success) {
          throw new Error(result?.message || `Failed to assign ${role} role`);
        }
      }
      
      for (const role of rolesToRemove) {
        const result = await revokeUserRole(user.id, role);
        if (!result?.success) {
          throw new Error(result?.message || `Failed to revoke ${role} role`);
        }
      }
      
      // Update user object with new roles
      const updatedUser: AdminUser = {
        ...user,
        roles: AVAILABLE_ROLES
          .filter(r => selectedRoles.has(r.id))
          .map(r => ({
            role_name: r.id,
            role_id: r.id, // This will be updated from actual DB
            assigned_at: new Date().toISOString(),
            is_active: true,
          })),
      };
      
      onSuccess(updatedUser);
    } catch (err: any) {
      setError(err.message || 'Failed to update roles');
      setIsSubmitting(false);
    }
  };
  
  if (!open) return null;
  
  return (
    <FocusTrap active={open}>
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={onClose}
          role="button"
          tabIndex={0}
          aria-label="Close overlay"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose();
            }
          }}
        />
      
        {/* Modal */}
        <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-background p-6 shadow-xl ring-1 ring-white/10">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-500/15 p-2">
                <Shield className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h2 id="role-modal-title" className="text-lg font-semibold">
                  Manage Roles
                </h2>
                <p className="text-sm text-foreground/60">
                  {user.display_name}
                </p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="rounded-full p-2 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Error Display */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          
          {/* Warning for self-editing */}
          {user.id === currentUserId && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-400">
                ⚠️ You are editing your own roles. Be careful not to remove admin access.
              </p>
            </div>
          )}
          
          {/* Role Selection */}
          <div className="space-y-3 mb-6">
            {AVAILABLE_ROLES.map((role) => {
              const isSelected = selectedRoles.has(role.id);
              const colorClasses = {
                purple: isSelected 
                  ? "border-purple-500/50 bg-purple-500/10 ring-purple-500/30" 
                  : "border-white/10 bg-white/5 ring-white/10",
                blue: isSelected 
                  ? "border-blue-500/50 bg-blue-500/10 ring-blue-500/30" 
                  : "border-white/10 bg-white/5 ring-white/10",
                green: isSelected 
                  ? "border-emerald-500/50 bg-emerald-500/10 ring-emerald-500/30" 
                  : "border-white/10 bg-white/5 ring-white/10",
                amber: isSelected 
                  ? "border-amber-500/50 bg-amber-500/10 ring-amber-500/30" 
                  : "border-white/10 bg-white/5 ring-white/10",
              };
              
              return (
                <button
                  key={role.id}
                  onClick={() => toggleRole(role.id)}
                  className={cn(
                    "w-full rounded-xl border p-4 ring-1 transition-all text-left",
                    "hover:bg-white/5",
                    colorClasses[role.color as keyof typeof colorClasses]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{role.name}</div>
                      <div className="text-xs text-foreground/60 mt-1">
                        {role.description}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-5 w-5 text-emerald-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          
          {/* Current Roles Summary */}
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-foreground/70 mb-2">Selected Roles:</div>
            <div className="flex flex-wrap gap-2">
              {selectedRoles.size === 0 ? (
                <span className="text-sm text-foreground/60">No roles selected</span>
              ) : (
                Array.from(selectedRoles).map(roleId => (
                  <span
                    key={roleId}
                    className="inline-flex items-center rounded-full px-2 py-1 text-xs bg-white/10 text-foreground ring-1 ring-white/10"
                  >
                    {AVAILABLE_ROLES.find(r => r.id === roleId)?.name}
                  </span>
                ))
              )}
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-foreground hover:bg-white/5"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_80%,black)] px-4 py-2 text-sm font-semibold text-white transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Updating...' : 'Update Roles'}
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
