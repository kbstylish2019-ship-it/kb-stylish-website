"use client";
import * as React from "react";

export default function StylistFilter({
  specialties,
  value,
  onChange,
}: {
  specialties: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="stylist-specialty" className="text-sm text-foreground/70">
        Filter by
      </label>
      <select
        id="stylist-specialty"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-48 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-primary-brand)]/50"
      >
        {specialties.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
