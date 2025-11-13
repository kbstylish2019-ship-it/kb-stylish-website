"use client";

import * as React from "react";
import { MapPin, Building } from "lucide-react";
import type { KBBranch } from "@/lib/apiClient";

interface BranchSelectionProps {
  selectedBranch: string | null;
  onBranchChange: (branchId: string | null) => void;
}

export default function BranchSelection({
  selectedBranch,
  onBranchChange
}: BranchSelectionProps) {
  const [branches, setBranches] = React.useState<KBBranch[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        const data = await response.json();
        if (data.success) {
          setBranches(data.branches);
        }
      } catch (error) {
        console.error('Failed to load branches:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBranches();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Select Branch Location</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/10 rounded"></div>
          <div className="h-12 bg-white/10 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Select Branch Location
        </h2>
        <p className="text-sm text-foreground/60 mt-1">
          Choose which KB Stylish branch this stylist will work at
        </p>
      </div>

      <div className="space-y-3">
        {branches.map((branch) => (
          <button
            key={branch.id}
            onClick={() => onBranchChange(branch.id)}
            className={`w-full flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] focus:ring-offset-2 focus:ring-offset-background ${
              selectedBranch === branch.id
                ? 'border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/10'
                : 'border-white/10 bg-white/5 hover:border-[var(--kb-primary-brand)]/40 hover:bg-[var(--kb-primary-brand)]/5'
            }`}
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--kb-primary-brand)]/30 to-[var(--kb-primary-brand)]/10 ring-2 ring-[var(--kb-primary-brand)]/30">
              <Building className="h-6 w-6 text-[var(--kb-primary-brand)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base text-foreground">
                {branch.name}
              </p>
              {branch.address && (
                <p className="text-sm text-foreground/70 mt-0.5">
                  {branch.address}
                </p>
              )}
              {branch.phone && (
                <p className="text-xs text-foreground/50 mt-1">
                  📞 {branch.phone}
                </p>
              )}
            </div>
            {selectedBranch === branch.id && (
              <div className="flex-shrink-0">
                <div className="rounded-full bg-[var(--kb-primary-brand)] p-1">
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
          <p className="text-red-300 font-medium">No active branches found</p>
          <p className="text-red-200/80 text-sm mt-1">
            Please contact an administrator to set up branch locations.
          </p>
        </div>
      )}
    </div>
  );
}
