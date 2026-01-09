import React from "react";
import { cn } from "@/lib/utils";

export type AdminTrendDirection = "up" | "down" | "flat";

export interface AdminStatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  trend?: { label: string; direction?: AdminTrendDirection };
  icon?: React.ReactNode;
  className?: string;
}

/**
 * AdminStatCard component displays statistical information in admin dashboard.
 * Memoized to prevent unnecessary re-renders when dashboard data updates.
 * 
 * @param props - AdminStatCard properties
 * @returns Memoized admin stat card component
 */
const AdminStatCard = React.memo(function AdminStatCard({ title, value, subtitle, trend, icon, className }: AdminStatCardProps) {
  const trendClasses = trend?.direction === "up"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : trend?.direction === "down"
    ? "bg-red-50 text-red-700 ring-red-200"
    : "bg-gray-100 text-gray-700 ring-gray-200";

  return (
    <div className={cn("rounded-2xl border border-gray-200 bg-white p-4 ring-1 ring-gray-100 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
          {(subtitle || trend) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
              {trend && (
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1", trendClasses)}>
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>
        {icon ? (
          <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1976D2]/10 ring-1 ring-[#1976D2]/20">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default AdminStatCard;
