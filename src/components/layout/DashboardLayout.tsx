"use client";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <main className={cn("mx-auto max-w-7xl px-4 py-8", className)}>
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 self-start hidden lg:block">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            {sidebar}
          </div>
        </aside>

        {/* Content */}
        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile: sidebar toggle */}
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50 lg:hidden"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-expanded={sidebarOpen}
                aria-controls="admin-sidebar-mobile"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              {title ? <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1> : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>

          {/* Mobile sidebar panel */}
          <div
            id="admin-sidebar-mobile"
            className={cn(
              "lg:hidden transition-all",
              sidebarOpen ? "block" : "hidden"
            )}
          >
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              {sidebar}
            </div>
          </div>

          {children}
        </section>
      </div>
    </main>
  );
}
