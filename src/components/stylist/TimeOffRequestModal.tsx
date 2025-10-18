'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Textarea
} from '@/components/ui/custom-ui';
import { AlertTriangle, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { logError } from '@/lib/logging';

interface Budget {
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  emergencyRemaining: number;
  resetsAt: string;
}

interface TimeOffRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
}

export default function TimeOffRequestModal({
  isOpen,
  onClose,
  onSuccess,
  userId
}: TimeOffRequestModalProps) {
  const [targetDate, setTargetDate] = useState('');
  const [reason, setReason] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loadingBudget, setLoadingBudget] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);

  // Load budget and booked dates when modal opens
  useEffect(() => {
    if (isOpen) {
      loadBudget();
      loadBookedDates();
      // Reset form
      setTargetDate('');
      setReason('');
      setIsEmergency(false);
      setShowEmergencyConfirm(false);
      setError(null);
    }
  }, [isOpen]);

  async function loadBudget() {
    setLoadingBudget(true);
    try {
      const response = await fetch('/api/stylist/override/budget');
      if (response.ok) {
        const data = await response.json();
        setBudget(data.budget);
      }
    } catch (err) {
      logError('TimeOffModal', 'Failed to load budget', { error: err });
    } finally {
      setLoadingBudget(false);
    }
  }

  async function loadBookedDates() {
    try {
      const response = await fetch('/api/stylist/override/list');
      if (response.ok) {
        const data = await response.json();
        const dates = data.overrides
          .filter((o: any) => new Date(o.start_date) >= new Date())
          .map((o: any) => o.start_date);
        setBookedDates(dates);
      }
    } catch (err) {
      logError('TimeOffModal', 'Failed to load booked dates', { error: err });
    }
  }

  function validateForm(): string | null {
    if (!targetDate) {
      return 'Please select a date';
    }

    if (bookedDates.includes(targetDate)) {
      return 'This date already has a time-off request';
    }

    if (reason.length > 200) {
      return 'Reason must be 200 characters or less';
    }

    if (budget) {
      if (isEmergency && budget.emergencyRemaining <= 0) {
        return 'No emergency overrides remaining';
      }
      if (!isEmergency && budget.monthlyRemaining <= 0) {
        return 'Monthly override budget exhausted';
      }
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Emergency confirmation check
    if (isEmergency && !showEmergencyConfirm) {
      setShowEmergencyConfirm(true);
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/stylist/override/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDate,
          reason: reason.trim() || undefined,
          isEmergency,
          isClosed: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      toast.success(data.cached ? 'Request already submitted' : 'Time off request submitted!');
      
      // Update budget display
      if (data.budget) {
        setBudget(data.budget);
      }

      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit request';
      setError(message);
      toast.error(message);
      logError('TimeOffModal', 'Submit failed', { error: message, targetDate });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    if (showEmergencyConfirm) {
      setShowEmergencyConfirm(false);
      return;
    }
    onClose();
  }

  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const dateIsBooked = bookedDates.includes(targetDate);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-[var(--kb-surface-dark)] border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <CalendarIcon className="w-5 h-5" />
            Request Time Off
          </DialogTitle>
        </DialogHeader>

        {showEmergencyConfirm ? (
          // Emergency Confirmation
          <div className="space-y-4 py-4">
            <div className="flex justify-center">
              <AlertTriangle className="w-12 h-12 text-orange-500" />
            </div>
            <p className="text-center font-medium text-foreground">
              Emergency overrides are limited ({budget?.emergencyRemaining || 0} remaining)
            </p>
            <p className="text-center text-sm text-foreground/60">
              Use only for urgent, unforeseeable situations.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowEmergencyConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={(e) => { setShowEmergencyConfirm(false); handleSubmit(e as any); }}>
                Confirm Emergency Request
              </Button>
            </div>
          </div>
        ) : (
          // Regular Form
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Budget Display */}
            {loadingBudget ? (
              <div className="bg-white/5 border border-white/10 p-3 rounded-lg flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-foreground/40 mr-2" />
                <span className="text-sm text-foreground/70">Loading budget...</span>
              </div>
            ) : budget && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-sm space-y-1">
                <p className="font-medium text-blue-300">Budget Status:</p>
                <p className="text-blue-200/80">
                  Regular: {budget.monthlyRemaining}/{budget.monthlyLimit} remaining
                </p>
                <p className="text-blue-200/80">
                  Emergency: {budget.emergencyRemaining} remaining
                </p>
                <p className="text-xs text-blue-200/60">
                  Resets: {format(new Date(budget.resetsAt), 'MMM d, yyyy')}
                </p>
              </div>
            )}

            {/* Date Input */}
            <div>
              <Label htmlFor="date" className="text-foreground/80">Date *</Label>
              <input
                type="date"
                id="date"
                min={minDate}
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                  setError(null);
                }}
                className={`w-full rounded-lg border px-3 py-2 bg-white/5 text-foreground ${
                  dateIsBooked ? 'border-red-500/50 bg-red-500/10' : 'border-white/10'
                } focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20`}
                required
              />
              {dateIsBooked && (
                <p className="text-xs text-red-300 mt-1">
                  This date already has a time-off request
                </p>
              )}
              {bookedDates.length > 0 && (
                <p className="text-xs text-foreground/50 mt-1">
                  Already requested: {bookedDates.slice(0, 3).map(d => format(new Date(d), 'MMM d')).join(', ')}
                  {bookedDates.length > 3 && ` +${bookedDates.length - 3} more`}
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason" className="text-foreground/80">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="e.g., Personal appointment, family event"
                className="w-full bg-white/5 border-white/10 text-foreground placeholder:text-foreground/40 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                rows={3}
              />
              <p className="text-xs text-foreground/50 mt-1">
                {reason.length}/200 characters
              </p>
            </div>

            {/* Emergency Checkbox */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="emergency"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="mt-1"
              />
              <div>
                <Label htmlFor="emergency" className="cursor-pointer text-foreground">
                  Emergency override
                </Label>
                <p className="text-xs text-foreground/50">
                  Use sparingly for urgent situations (limited to {budget?.emergencyRemaining || 3})
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || dateIsBooked}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  'Request Time Off'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
