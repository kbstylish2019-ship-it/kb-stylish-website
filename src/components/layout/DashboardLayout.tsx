import React from "react";
import { cn } from "@/lib/utils";

export interface DashboardLayoutProps {
  title?: string;
  actions?: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function DashboardLayout({
  title,
  actions,
  sidebar,
  children,
  className,
}: DashboardLayoutProps) {
  return (
    <main className={cn("mx-auto max-w-7xl px-4 py-8", className)}>
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 self-start">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            {sidebar}
          </div>
        </aside>

        {/* Content */}
        <section>
          {(title || actions) && (
            <div className="mb-6 flex items-center justify-between gap-4">
              {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : <span />}
              {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>
          )}

          {children}
        </section>
      </div>
    </main>
  );
}
