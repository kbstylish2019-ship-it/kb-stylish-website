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
      <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Today</span>
          <Calendar className="w-4 h-4 text-green-600" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-gray-900" aria-label={`${stats.todayCompleted} bookings completed today`}>
            {stats.todayCompleted}
          </p>
          <p className="text-xs font-medium text-green-600">
            {formatCurrency(stats.todayRevenue)}
          </p>
        </div>
      </div>

      {/* This Week */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">This Week</span>
          <TrendingUp className="w-4 h-4 text-blue-600" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-gray-900" aria-label={`${stats.weeklyCompleted} bookings this week`}>
            {stats.weeklyCompleted}
          </p>
          <p className="text-xs text-gray-500">
            Avg {(stats.weeklyCompleted / 7).toFixed(1)}/day
          </p>
        </div>
      </div>

      {/* Upcoming */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Upcoming</span>
          <Clock className="w-4 h-4 text-purple-600" />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-gray-900" aria-label={`${stats.upcomingCount} upcoming bookings`}>
            {stats.upcomingCount}
          </p>
          <p className="text-xs text-gray-500">Next 7 days</p>
        </div>
      </div>

      {/* No-Show Rate */}
      <div className={`rounded-2xl border ${stats.noShowRate > 5 ? 'border-orange-300' : 'border-gray-200'} bg-white p-4 ring-1 ring-gray-100 shadow-sm`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">No-Show Rate</span>
          <AlertTriangle className={`w-4 h-4 ${stats.noShowRate > 5 ? 'text-orange-600' : 'text-gray-400'}`} />
        </div>
        <div className="space-y-1">
          <p 
            className={`text-2xl font-semibold ${stats.noShowRate > 5 ? 'text-orange-600' : 'text-gray-900'}`}
            aria-label={`${stats.noShowRate}% no-show rate`}
          >
            {stats.noShowRate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500">
            {stats.noShowRate > 5 ? 'Above average' : 'Excellent'}
          </p>
        </div>
      </div>
    </div>
  );
}
