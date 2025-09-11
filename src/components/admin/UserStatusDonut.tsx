import React from "react";
import { cn } from "@/lib/utils";

export interface DonutDatum {
  label: string;
  value: number;
  color: string; // CSS color string
}

export interface UserStatusDonutProps {
  title?: string;
  subtitle?: string;
  data?: DonutDatum[];
  className?: string;
}

const defaultData: DonutDatum[] = [
  { label: "Active", value: 68, color: "#10b981" }, // emerald-500
  { label: "Suspended", value: 12, color: "#f59e0b" }, // amber-500
  { label: "Pending", value: 15, color: "#a3a3a3" }, // neutral-400
  { label: "Banned", value: 5, color: "#ef4444" }, // red-500
];

function toConicGradient(data: DonutDatum[]) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const stops: string[] = [];
  data.forEach((d) => {
    const start = (acc / total) * 360;
    acc += d.value;
    const end = (acc / total) * 360;
    stops.push(`${d.color} ${start}deg ${end}deg`);
  });
  return `conic-gradient(${stops.join(', ')})`;
}

export default function UserStatusDonut({ title = "User Status", subtitle = "Accounts distribution", data = defaultData, className }: UserStatusDonutProps) {
  const gradient = toConicGradient(data);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10", className)} aria-label="User status donut chart">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-foreground/60">{subtitle}</p>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative h-40 w-40">
          <div className="h-full w-full rounded-full" style={{ backgroundImage: gradient }} />
          <div className="absolute inset-5 rounded-full bg-white/90 ring-1 ring-white/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-semibold">{total}</div>
              <div className="text-xs text-foreground/60">Users</div>
            </div>
          </div>
        </div>
        <ul className="grow space-y-2 text-sm">
          {data.map((d) => (
            <li key={d.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                <span className="text-foreground/80">{d.label}</span>
              </div>
              <span className="text-foreground/70">{Math.round((d.value / Math.max(total, 1)) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
