import React from "react";
import Link from "next/link";

/**
 * Shared Admin Sidebar Navigation
 * Used across all admin pages for consistency
 */
export default function AdminSidebar() {
  const items = [
    { id: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
    { id: "users", label: "Users", href: "/admin/users" },
    { id: "vendors", label: "Vendors", href: "/admin/vendors" },
    { id: "curation-brands", label: "Curation - Brands", href: "/admin/curation/featured-brands" },
    { id: "curation-stylists", label: "Curation - Stylists", href: "/admin/curation/featured-stylists" },
    { id: "curation-specialties", label: "Curation - Specialties", href: "/admin/curation/specialties" },
    { id: "curation-recs", label: "Curation - Recommendations", href: "/admin/curation/recommendations" },
    { id: "services", label: "Services", href: "/admin/services" },
    { id: "onboard", label: "Onboard Stylist", href: "/admin/stylists/onboard" },
    { id: "schedules", label: "Manage Schedules", href: "/admin/schedules/manage" },
    { id: "overrides", label: "Schedule Overrides", href: "/admin/schedules/overrides" },
    { id: "audit", label: "Audit Logs", href: "/admin/audit-logs" },
    { id: "analytics", label: "Analytics", href: "/admin/analytics" },
    { id: "finance", label: "Finance", href: "/admin/finance" },
    { id: "payouts", label: "Payouts", href: "/admin/payouts" },
    { id: "moderation", label: "Moderation", href: "/admin/moderation" },
    { id: "settings", label: "Settings", href: "/admin/settings" },
  ];

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
