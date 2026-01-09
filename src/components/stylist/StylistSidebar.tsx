'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Calendar, 
  Clock, 
  DollarSign, 
  User,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Stylist Sidebar Navigation
 * 
 * Provides navigation links for stylist-specific features.
 * Highlights the currently active page with visual feedback.
 * 
 * Pattern: Follows AdminSidebar.tsx design with enhancements
 * Enhancements: Active state highlighting + icons for better UX
 * Accessibility: Keyboard navigation + screen reader support
 */
export default function StylistSidebar() {
  const pathname = usePathname();
  
  const navItems: NavItem[] = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      href: '/stylist/dashboard',
      icon: LayoutDashboard 
    },
    { 
      id: 'bookings', 
      label: 'My Bookings', 
      href: '/stylist/bookings',
      icon: Calendar 
    },
    { 
      id: 'reviews', 
      label: 'Reviews', 
      href: '/stylist/reviews',
      icon: Star 
    },
    { 
      id: 'schedule', 
      label: 'Schedule', 
      href: '/stylist/schedule',
      icon: Clock 
    },
    { 
      id: 'earnings', 
      label: 'Earnings', 
      href: '/stylist/earnings',
      icon: DollarSign 
    },
    { 
      id: 'profile', 
      label: 'Profile', 
      href: '/stylist/profile',
      icon: User 
    },
  ];

  return (
    <nav className="flex flex-col gap-1" aria-label="Stylist navigation">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ring-1",
              isActive
                ? "bg-[#1976D2]/10 text-[#1976D2] ring-[#1976D2]/30"
                : "text-gray-700 hover:bg-gray-100 ring-transparent hover:ring-gray-200"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
