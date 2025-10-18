'use client';

import React from 'react';
import { Card } from '@/components/ui/custom-ui';
import { Calendar, DollarSign, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

interface QuickStats {
  todayCompleted: number;
  todayRevenue: number;
  upcomingCount: number;
  weeklyCompleted: number;
  noShowRate: number;
}

interface QuickStatsBarProps {
  stats: QuickStats;
  loading?: boolean;
}

/**
 * QuickStatsBar - Enterprise-grade stats dashboard
 * 
 * Shows real-time booking statistics at a glance
 * Features: responsive grid, trend indicators, accessibility
 */
export default function QuickStatsBar({ stats, loading }: QuickStatsBarProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-20 mb-2" />
            <div className="h-8 bg-muted rounded w-12 mb-1" />
            <div className="h-3 bg-muted rounded w-16" />
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (cents: number) => `NPR ${(cents / 100).toFixed(0)}`;

  return (
    <div 
      className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      role="region"
      aria-label="Booking statistics"
    >
      {/* Today's Completed */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground/70">Today</span>
          <Calendar className="w-4 h-4 text-green-400" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold" aria-label={`${stats.todayCompleted} bookings completed today`}>
            {stats.todayCompleted}
          </p>
          <p className="text-xs font-medium text-green-400">
            {formatCurrency(stats.todayRevenue)}
          </p>
        </div>
      </div>

      {/* This Week */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground/70">This Week</span>
          <TrendingUp className="w-4 h-4 text-blue-400" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold" aria-label={`${stats.weeklyCompleted} bookings this week`}>
            {stats.weeklyCompleted}
          </p>
          <p className="text-xs text-foreground/70">
            Avg {(stats.weeklyCompleted / 7).toFixed(1)}/day
          </p>
        </div>
      </div>

      {/* Upcoming */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground/70">Upcoming</span>
          <Clock className="w-4 h-4 text-purple-400" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold" aria-label={`${stats.upcomingCount} upcoming bookings`}>
            {stats.upcomingCount}
          </p>
          <p className="text-xs text-foreground/70">Next 7 days</p>
        </div>
      </div>

      {/* No-Show Rate */}
      <div className={`rounded-2xl border ${stats.noShowRate > 5 ? 'border-orange-500/50' : 'border-white/10'} bg-white/5 p-4 ring-1 ring-white/10`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground/70">No-Show Rate</span>
          <AlertTriangle className={`w-4 h-4 ${stats.noShowRate > 5 ? 'text-orange-400' : 'text-foreground/70'}`} />
        </div>
        <div className="space-y-1">
          <p 
            className={`text-2xl font-semibold ${stats.noShowRate > 5 ? 'text-orange-400' : ''}`}
            aria-label={`${stats.noShowRate}% no-show rate`}
          >
            {stats.noShowRate.toFixed(1)}%
          </p>
          <p className="text-xs text-foreground/70">
            {stats.noShowRate > 5 ? 'Above average' : 'Excellent'}
          </p>
        </div>
      </div>
    </div>
  );
}
