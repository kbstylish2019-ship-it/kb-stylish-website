'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/custom-ui';
import { Button } from '@/components/ui/custom-ui';
import { Download, FileText, Check } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Booking {
  id: string;
  customerName: string;
  startTime: string;
  endTime: string;
  status: string;
  priceCents: number;
  service: { name: string } | null;
  customerNotes?: string;
  stylistNotes?: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: Booking[];
  selectedOnly?: boolean;
}

/**
 * ExportModal - CSV export dialog
 * 
 * Features: format selection, preview, accessibility
 */
export default function ExportModal({
  isOpen,
  onClose,
  bookings,
  selectedOnly = false
}: ExportModalProps) {
  const [exporting, setExporting] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);

  const exportToCSV = () => {
    setExporting(true);

    try {
      // CSV Headers
      const headers = ['Date', 'Time', 'Customer', 'Service', 'Status', 'Price (NPR)'];
      if (includeNotes) {
        headers.push('Customer Notes', 'Stylist Notes');
      }

      // CSV Rows
      const rows = bookings.map(b => {
        const row = [
          format(new Date(b.startTime), 'yyyy-MM-dd'),
          format(new Date(b.startTime), 'HH:mm'),
          b.customerName,
          b.service?.name || 'N/A',
          b.status,
          (b.priceCents / 100).toFixed(2)
        ];

        if (includeNotes) {
          row.push(
            b.customerNotes?.replace(/"/g, '""') || '',
            b.stylistNotes?.replace(/"/g, '""').replace(/\n/g, ' ') || ''
          );
        }

        return row;
      });

      // Generate CSV
      const csv = [
        headers.join(','),
        ...rows.map(row => 
          row.map(cell => `"${cell}"`).join(',')
        )
      ].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bookings-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${bookings.length} bookings`);
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export bookings');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Bookings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">
                  {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedOnly ? 'Selected bookings' : 'All filtered bookings'}
                </p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Include Notes</span>
                <p className="text-xs text-muted-foreground">
                  Export customer and stylist notes
                </p>
              </div>
            </label>
          </div>

          {/* Preview */}
          <div className="border border-white/10 rounded-lg p-3 bg-white/5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview:</p>
            <code className="text-xs text-foreground font-mono">
              Date, Time, Customer, Service, Status, Price...
            </code>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={exporting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={exportToCSV}
              disabled={exporting}
              className="flex-1 gap-2"
            >
              {exporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export CSV
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
