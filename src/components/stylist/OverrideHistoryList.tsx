'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/custom-ui';
import { Loader2, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { logError } from '@/lib/logging';

interface Override {
  id: string;
  override_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_closed: boolean;
  created_at: string;
}

interface OverrideHistoryListProps {
  userId: string;
  refreshKey?: number;
}

export default function OverrideHistoryList({ userId, refreshKey }: OverrideHistoryListProps) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOverrides();
  }, [refreshKey]);

  async function loadOverrides() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stylist/override/list');

      if (!response.ok) {
        throw new Error('Failed to fetch overrides');
      }

      const data = await response.json();
      setOverrides(data.overrides || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load time off history';
      setError(message);
      logError('OverrideHistoryList', 'Load overrides failed', { error: message });
    } finally {
      setIsLoading(false);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = overrides.filter(o => new Date(o.start_date) >= today);
  const past = overrides.filter(o => new Date(o.start_date) < today);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-foreground/40" />
          <span className="ml-3 text-foreground/70">Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-300 text-sm">{error}</p>
          <button
            onClick={loadOverrides}
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
          <Clock className="w-5 h-5" />
          Time Off History
        </h3>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Upcoming */}
        <div>
          <h4 className="font-medium text-sm text-foreground/80 mb-3">Upcoming</h4>
          {upcoming.length === 0 ? (
            <div className="text-center py-6 bg-white/5 border border-white/10 rounded-lg">
              <p className="text-sm text-foreground/60">No upcoming time off</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map(override => (
                <div
                  key={override.id}
                  className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/15 transition"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">
                        {format(new Date(override.start_date), 'EEEE, MMM d, yyyy')}
                      </p>
                      {override.override_type === 'stylist_vacation' && (
                        <Badge variant="default" className="text-xs bg-blue-500/20 text-blue-300">
                          Vacation
                        </Badge>
                      )}
                    </div>
                    {override.reason && (
                      <p className="text-sm text-foreground/70 mt-1">{override.reason}</p>
                    )}
                    <p className="text-xs text-foreground/50 mt-1">
                      Requested: {format(new Date(override.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Past */}
        {past.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-foreground/80 mb-3">Past</h4>
            <div className="space-y-2">
              {past.slice(0, 5).map(override => (
                <div
                  key={override.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg opacity-75"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground/70">
                      {format(new Date(override.start_date), 'MMM d, yyyy')}
                    </p>
                    {override.reason && (
                      <p className="text-xs text-foreground/50 mt-1">{override.reason}</p>
                    )}
                  </div>
                  <CheckCircle className="w-4 h-4 text-foreground/40 flex-shrink-0" />
                </div>
              ))}
              {past.length > 5 && (
                <p className="text-xs text-foreground/50 text-center pt-2">
                  And {past.length - 5} more past requests
                </p>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {overrides.length === 0 && (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-foreground/20 mx-auto mb-3" />
            <p className="text-foreground/70">No time off requests yet</p>
            <p className="text-sm text-foreground/50 mt-1">
              Click "Request Time Off" to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
