import React from "react";
import { cn } from "@/lib/utils";

export interface RevenuePoint {
  label: string;
  value: number;
}

export interface RevenueChartProps {
  title?: string;
  subtitle?: string;
  data?: RevenuePoint[];
  className?: string;
}

const defaultData: RevenuePoint[] = [
  { label: "Mon", value: 3200000 },
  { label: "Tue", value: 2800000 },
  { label: "Wed", value: 4200000 },
  { label: "Thu", value: 3600000 },
  { label: "Fri", value: 5200000 },
  { label: "Sat", value: 6100000 },
  { label: "Sun", value: 4500000 },
];

function formatCurrency(npr: number) {
  try {
    return new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(npr);
  } catch {
    return `NPR ${npr.toLocaleString()}`;
  }
}

export default function RevenueChart({ title = "Revenue (Last 7 days)", subtitle = "Aggregated across platform", data = defaultData, className }: RevenueChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10", className)} aria-label="Revenue chart">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-foreground/60">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-end gap-3 h-40">
        {data.map((d, idx) => (
          <div key={idx} className="group flex-1">
            <div
              className="w-full rounded-t-md bg-[var(--kb-primary-brand)]/70 ring-1 ring-[var(--kb-primary-brand)]/30 transition-all group-hover:bg-[var(--kb-primary-brand)]"
              style={{ height: `${Math.max(8, (d.value / max) * 100)}%` }}
              title={`${d.label}: ${formatCurrency(d.value)}`}
            />
            <div className="mt-1 text-center text-[11px] text-foreground/70">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
