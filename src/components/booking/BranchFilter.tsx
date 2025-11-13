"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import type { KBBranch } from "@/lib/apiClient";

interface BranchFilterProps {
  branches: KBBranch[];
  selectedBranch: string | null;
  onBranchChange: (branchId: string | null) => void;
  className?: string;
}

export default function BranchFilter({
  branches,
  selectedBranch,
  onBranchChange,
  className = ""
}: BranchFilterProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MapPin className="h-4 w-4" />
        Branch Location
      </label>
      
      <select
        value={selectedBranch || ''}
        onChange={(e) => onBranchChange(e.target.value || null)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm ring-1 ring-white/10 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)] focus:border-transparent"
      >
        <option value="">All Locations</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.address && ` - ${branch.address}`}
          </option>
        ))}
      </select>
      
      {selectedBranch && (
        <div className="text-xs text-foreground/60">
          {(() => {
            const branch = branches.find(b => b.id === selectedBranch);
            return branch ? `Showing stylists from ${branch.name}` : '';
          })()}
        </div>
      )}
    </div>
  );
}
