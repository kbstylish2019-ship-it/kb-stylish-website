"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Shared Admin Sidebar Navigation
 * Organized into collapsible groups for better UX
 */

interface NavGroup {
  id: string;
  label: string;
  items: { id: string; label: string; href: string }[];
}

export default function AdminSidebar() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    // Default collapsed for mobile to avoid tall sidebar; overview open
    new Set(["overview"])
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const groups: NavGroup[] = [
    {
      id: "overview",
      label: "Overview",
      items: [
        { id: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
        { id: "analytics", label: "Analytics", href: "/admin/analytics" },
      ]
    },
    {
      id: "users",
      label: "User Management",
      items: [
        { id: "users", label: "Users", href: "/admin/users" },
        { id: "vendors", label: "Vendors", href: "/admin/vendors" },
      ]
    },
    {
      id: "curation",
      label: "Content Curation",
      items: [
        { id: "curation-brands", label: "Featured Brands", href: "/admin/curation/featured-brands" },
        { id: "curation-stylists", label: "Featured Stylists", href: "/admin/curation/featured-stylists" },
        { id: "curation-specialties", label: "Specialties", href: "/admin/curation/specialties" },
        { id: "curation-recs", label: "Recommendations", href: "/admin/curation/recommendations" },
      ]
    },
    {
      id: "stylists",
      label: "Stylist Operations",
      items: [
        { id: "services", label: "Services", href: "/admin/services" },
        { id: "onboard", label: "Onboard Stylist", href: "/admin/stylists/onboard" },
        { id: "schedules", label: "Manage Schedules", href: "/admin/schedules/manage" },
        { id: "overrides", label: "Schedule Overrides", href: "/admin/schedules/overrides" },
      ]
    },
    {
      id: "commerce",
      label: "Commerce & Finance",
      items: [
        { id: "categories", label: "Categories", href: "/admin/categories" },
        { id: "finance", label: "Finance", href: "/admin/finance" },
        { id: "payouts", label: "Payouts", href: "/admin/payouts" },
      ]
    },
    {
      id: "system",
      label: "System & Moderation",
      items: [
        { id: "moderation", label: "Moderation", href: "/admin/moderation" },
        { id: "audit", label: "Audit Logs", href: "/admin/logs/audit" },
        { id: "settings", label: "Settings", href: "/admin/settings" },
      ]
    },
  ];

  return (
    <nav className="flex flex-col gap-3 text-sm max-h-[70vh] overflow-y-auto pr-1 lg:max-h-none">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        
        return (
          <div key={group.id} className="space-y-1">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground/60 hover:bg-white/5 hover:text-foreground/80"
            >
              <span>{group.label}</span>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {/* Group Items */}
            {isExpanded && (
              <div className="ml-2 space-y-0.5 border-l border-white/10 pl-2">
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
