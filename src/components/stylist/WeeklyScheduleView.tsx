'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { logError } from '@/lib/logging';

interface ScheduleDay {
  schedule_date: string;
  day_of_week: number;
  start_time_local: string | null;
  end_time_local: string | null;
  break_start: string | null;
  break_end: string | null;
  is_available: boolean;
}

interface WeeklyScheduleViewProps {
  userId: string;
  refreshKey?: number;
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

export default function WeeklyScheduleView({ userId, refreshKey }: WeeklyScheduleViewProps) {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedule();
  }, [refreshKey]);

  async function loadSchedule() {
    setIsLoading(true);
    setError(null);

    try {
      const start = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

      const response = await fetch(`/api/stylist/schedule?start=${start}&end=${end}`);

      if (!response.ok) {
        throw new Error('Failed to fetch schedule');
      }

      const data = await response.json();
      setSchedule(data.schedule || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load schedule';
      setError(message);
      logError('WeeklyScheduleView', 'Load schedule failed', { error: message });
    } finally {
      setIsLoading(false);
    }
  }

  function formatTime(time: string | null): string {
    if (!time) return '-';
    try {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return time;
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-12 ring-1 ring-white/10">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/40" />
          <span className="ml-3 text-foreground/70">Loading schedule...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
          <button
            onClick={loadSchedule}
            className="mt-2 text-sm text-red-400 hover:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Weekly Schedule
        </h3>
      </div>
      
      {/* Content */}
      <div className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-sm font-medium text-foreground/80">Day</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-foreground/80">Hours</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-foreground/80">Break</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day => {
                const daySchedule = schedule.find(s => s.day_of_week === day.value);

                return (
                  <tr key={day.value} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 px-3 font-medium text-foreground">{day.label}</td>
                    <td className="py-3 px-3 text-foreground/90">
                      {daySchedule && daySchedule.start_time_local ? (
                        <span>
                          {formatTime(daySchedule.start_time_local)} - {formatTime(daySchedule.end_time_local)}
                        </span>
                      ) : (
                        <span className="text-foreground/50 italic">Day Off</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-foreground/90">
                      {daySchedule?.break_start ? (
                        <span className="text-sm">
                          {formatTime(daySchedule.break_start)} - {formatTime(daySchedule.break_end)}
                        </span>
                      ) : (
                        <span className="text-foreground/40">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {schedule.length === 0 && (
          <div className="text-center py-8">
            <p className="text-foreground/70">No schedule configured</p>
            <p className="text-sm text-foreground/50 mt-1">Contact admin to set up your working hours</p>
          </div>
        )}
      </div>
    </div>
  );
}
