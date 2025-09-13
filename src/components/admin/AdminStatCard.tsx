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
    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
    : trend?.direction === "down"
    ? "bg-red-500/15 text-red-300 ring-red-500/30"
    : "bg-white/10 text-foreground/80 ring-white/10";

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground/70">{title}</p>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          {(subtitle || trend) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {subtitle && <span className="text-xs text-foreground/60">{subtitle}</span>}
              {trend && (
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1", trendClasses)}>
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>
        {icon ? (
          <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default AdminStatCard;
