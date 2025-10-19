import type { NavigationItem, UserCapability, NavArea } from "@/lib/types";

export const NAV_CONFIG: NavigationItem[] = [
  // Primary navigation
  {
    id: "shop",
    label: "Shop",
    href: "/shop",
    area: "primary",
    requires: ["view_shop"],
  },
  {
    id: "about",
    label: "About",
    href: "/about",
    area: "primary",
    requires: ["view_about"],
  },
  {
    id: "track-order",
    label: "Track Order",
    href: "/track-order",
    area: "primary",
    requires: ["view_shop"],
  },
  {
    id: "book-stylist",
    label: "Book a Stylist",
    href: "/book-a-stylist",
    area: "primary",
    requires: ["view_shop"],
  },
  {
    id: "apply-vendor",
    label: "Become a Vendor",
    href: "/vendor/apply",
    area: "primary",
    requires: ["apply_vendor"],
    emphasis: "cta",
  },

  // Utility (right side)
  {
    id: "cart",
    label: "Cart",
    href: "/cart",
    area: "utility",
    requires: ["view_cart"],
  },

  // Profile dropdown
  {
    id: "profile",
    label: "Profile",
    href: "/profile",
    area: "profile",
    requires: ["authenticated", "view_profile"],
  },
  {
    id: "profile-bookings",
    label: "My Bookings",
    href: "/bookings",
    area: "profile",
    requires: ["authenticated", "view_bookings"],
  },
  {
    id: "vendor-dashboard",
    label: "Vendor Dashboard",
    href: "/vendor/dashboard",
    area: "profile",
    requires: ["authenticated", "vendor_access"],
  },
  {
    id: "stylist-dashboard",
    label: "Stylist Dashboard",
    href: "/stylist/dashboard",
    area: "profile",
    requires: ["authenticated", "stylist_access"],
  },
  {
    id: "admin-dashboard",
    label: "Admin Dashboard",
    href: "/admin/dashboard",
    area: "profile",
    requires: ["authenticated", "admin_access"],
  },
];

export function hasCapabilities(
  userCaps: UserCapability[],
  required: UserCapability[]
): boolean {
  return required.every((cap) => userCaps.includes(cap));
}

export function filterNav(
  userCaps: UserCapability[],
  area?: NavArea
): NavigationItem[] {
  return NAV_CONFIG.filter((item) => {
    if (area && item.area !== area) return false;
    return hasCapabilities(userCaps, item.requires);
  });
}
