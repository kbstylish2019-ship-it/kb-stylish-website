'use client';

import React from 'react';
import { Button } from '@/components/ui/custom-ui';
import { Check, X, Download, Trash2 } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onMarkCompleted: () => void;
  onCancel: () => void;
  onExport: () => void;
  onClearSelection: () => void;
  loading?: boolean;
}

/**
 * BulkActionsBar - Floating action bar for bulk operations
 * 
 * Appears when bookings are selected
 * Features: sticky positioning, accessible, mobile-responsive
 */
export default function BulkActionsBar({
  selectedCount,
  onMarkCompleted,
  onCancel,
  onExport,
  onClearSelection,
  loading = false
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div 
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <div className="bg-card border border-border rounded-full shadow-2xl px-6 py-3">
        <div className="flex items-center gap-4">
          {/* Selection Count */}
          <span className="text-sm font-medium text-foreground">
            {selectedCount} selected
          </span>

          <div className="h-6 w-px bg-border" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              onClick={onMarkCompleted}
              disabled={loading}
              size="sm"
              className="gap-2"
              aria-label={`Mark ${selectedCount} bookings as completed`}
            >
              <Check className="w-4 h-4" />
              <span className="hidden sm:inline">Complete</span>
            </Button>

            <Button
              onClick={onExport}
              disabled={loading}
              size="sm"
              variant="outline"
              className="gap-2"
              aria-label={`Export ${selectedCount} bookings`}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <div className="h-6 w-px bg-border" />

            <Button
              onClick={onClearSelection}
              disabled={loading}
              size="sm"
              variant="ghost"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
