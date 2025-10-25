'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Label
} from '@/components/ui/custom-ui';
import { Loader2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { logError } from '@/lib/logging';

interface StylistSchedule {
  stylist_user_id: string;
  display_name: string;
}

interface DaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  isOff: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stylist: StylistSchedule;
  onSuccess: () => void;
}

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];

const DEFAULT_SCHEDULE: Record<number, DaySchedule> = {
  1: { day_of_week: 1, start_time: '09:00', end_time: '17:00', isOff: false },
  2: { day_of_week: 2, start_time: '09:00', end_time: '17:00', isOff: false },
  3: { day_of_week: 3, start_time: '09:00', end_time: '17:00', isOff: false },
  4: { day_of_week: 4, start_time: '09:00', end_time: '17:00', isOff: false },
  5: { day_of_week: 5, start_time: '09:00', end_time: '17:00', isOff: false },
  6: { day_of_week: 6, start_time: '10:00', end_time: '16:00', isOff: true },
  0: { day_of_week: 0, start_time: '10:00', end_time: '16:00', isOff: true }
};

export default function CreateScheduleModal({ isOpen, onClose, stylist, onSuccess }: Props) {
  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>(DEFAULT_SCHEDULE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [effectiveUntil, setEffectiveUntil] = useState<string>('');

  function updateDay(dayOfWeek: number, field: keyof DaySchedule, value: any) {
    setSchedule(prev => ({
      ...prev,
      [dayOfWeek]: {
        ...prev[dayOfWeek],
        [field]: value
      }
    }));
    setError(null);
  }

  function validateSchedule(): string | null {
    const workingDays = Object.values(schedule).filter(day => !day.isOff);
    
    if (workingDays.length === 0) {
      return 'At least one working day is required';
    }

    for (const day of workingDays) {
      if (day.start_time >= day.end_time) {
        return `Invalid time range for ${DAYS.find(d => d.value === day.day_of_week)?.label}`;
      }
    }

    // Validate effective date range
    if (effectiveFrom && effectiveUntil) {
      if (new Date(effectiveFrom) > new Date(effectiveUntil)) {
        return 'End date must be after start date';
      }
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validateSchedule();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Filter out days that are off
      const workingDays = Object.values(schedule)
        .filter(day => !day.isOff)
        .map(({ isOff, ...rest }) => rest);

      const response = await fetch('/api/admin/schedules/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylistId: stylist.stylist_user_id,
          schedules: workingDays,
          effectiveFrom: effectiveFrom || undefined,
          effectiveUntil: effectiveUntil || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create schedule');
      }

      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create schedule';
      setError(message);
      toast.error(message);
      logError('CreateScheduleModal', 'Submit failed', { error: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] bg-[var(--kb-surface-dark)] border-white/10 flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Calendar className="w-5 h-5" />
            Create Schedule for {stylist.display_name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-sm">
              <p className="font-medium text-blue-300">Default Schedule Applied</p>
              <p className="text-blue-200/80 text-xs">Mon-Fri: 9am-5pm | Sat-Sun: Off</p>
              <p className="text-blue-200/60 text-xs mt-1">Customize below as needed</p>
            </div>

            <div>
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--kb-surface-dark)]">
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-2 text-sm text-foreground/80">Day</th>
                  <th className="text-left py-2 px-2 text-sm text-foreground/80">Start Time</th>
                  <th className="text-left py-2 px-2 text-sm text-foreground/80">End Time</th>
                  <th className="text-left py-2 px-2 text-sm text-foreground/80">Day Off</th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => (
                  <tr key={day.value} className="border-b border-white/5">
                    <td className="py-2 px-2 font-medium text-sm text-foreground">{day.label}</td>
                    <td className="py-2 px-2">
                      <input
                        type="time"
                        value={schedule[day.value].start_time}
                        onChange={(e) => updateDay(day.value, 'start_time', e.target.value)}
                        disabled={schedule[day.value].isOff}
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-foreground disabled:opacity-50 disabled:bg-white/5 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="time"
                        value={schedule[day.value].end_time}
                        onChange={(e) => updateDay(day.value, 'end_time', e.target.value)}
                        disabled={schedule[day.value].isOff}
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-foreground disabled:opacity-50 disabled:bg-white/5 focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={schedule[day.value].isOff}
                        onChange={(e) => updateDay(day.value, 'isOff', e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Effective Dates Section */}
          <div className="border-t border-white/10 pt-4 mt-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-blue-300" />
                <span className="font-medium text-blue-300">Optional: Set Effective Dates</span>
              </div>
              <p className="text-xs text-blue-200/80">
                Use this for seasonal workers, temporary schedules, or time-limited arrangements.
                Leave empty for permanent schedules.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="effective-from" className="text-sm text-foreground/80">Start Date (Optional)</Label>
                <input
                  type="date"
                  id="effective-from"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                />
                <p className="text-xs text-foreground/60 mt-1">
                  Schedule starts on this date (default: today)
                </p>
              </div>

              <div>
                <Label htmlFor="effective-until" className="text-sm text-foreground/80">End Date (Optional)</Label>
                <input
                  type="date"
                  id="effective-until"
                  value={effectiveUntil}
                  onChange={(e) => setEffectiveUntil(e.target.value)}
                  min={effectiveFrom || undefined}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:border-[var(--kb-accent-gold)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]/20"
                />
                <p className="text-xs text-foreground/60 mt-1">
                  Schedule ends on this date (leave empty for permanent)
                </p>
              </div>
            </div>

            {/* Examples Accordion */}
            <details className="mt-3">
              <summary className="text-xs text-foreground/60 cursor-pointer hover:text-foreground/80 select-none">
                📚 When to use effective dates? (Click to expand)
              </summary>
              <div className="mt-2 space-y-1 text-xs text-foreground/70 pl-4 border-l-2 border-blue-500/30 ml-1">
                <div>✅ <strong>Summer intern:</strong> Jun 1 - Aug 31</div>
                <div>✅ <strong>Holiday staff:</strong> Nov 15 - Jan 15</div>
                <div>✅ <strong>Maternity cover:</strong> Mar 1 - May 31</div>
                <div>✅ <strong>Temporary schedule:</strong> Specific week or month</div>
                <div>💡 <strong>Permanent staff:</strong> Leave end date empty</div>
              </div>
            </details>
          </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex-shrink-0">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t border-white/10 flex-shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create Schedule'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
