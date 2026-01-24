'use client';

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, ShoppingCart, User, Menu, X, Phone, 
  ChevronDown, LogOut, LayoutDashboard, Package, 
  Calendar, Settings, Store, Users, Scissors
} from "lucide-react";
import { useDecoupledCartStore } from "@/lib/store/decoupledCartStore";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  isAuthed?: boolean;
}

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

// Role-based navigation items
const roleNavItems: Record<string, { label: string; href: string; icon: any }[]> = {
  admin: [
    { label: "Admin Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Manage Users", href: "/admin/users", icon: Users },
    { label: "Manage Vendors", href: "/admin/vendors", icon: Store },
    { label: "Manage Stylists", href: "/admin/stylists", icon: Scissors },
  ],
  vendor: [
    { label: "Vendor Dashboard", href: "/vendor/dashboard", icon: LayoutDashboard },
    { label: "My Products", href: "/vendor/products", icon: Package },
    { label: "Orders", href: "/vendor/orders", icon: Package },
    { label: "Settings", href: "/vendor/settings", icon: Settings },
  ],
  stylist: [
    { label: "Stylist Dashboard", href: "/stylist/dashboard", icon: LayoutDashboard },
    { label: "My Bookings", href: "/stylist/bookings", icon: Calendar },
    { label: "My Schedule", href: "/stylist/schedule", icon: Calendar },
    { label: "Earnings", href: "/stylist/earnings", icon: Package },
  ],
  customer: [
    { label: "My Bookings", href: "/bookings", icon: Calendar },
    { label: "Track Orders", href: "/track-order", icon: Package },
  ],
};

export default function Header({ isAuthed = false }: HeaderProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Use the decoupled cart store for accurate cart count
  const totalItems = useDecoupledCartStore((state) => state.totalItems);

  // Fetch user roles when authenticated
  useEffect(() => {
    async function fetchUserRoles() {
      if (!isAuthed) {
        setUserRoles([]);
        setUserInfo(null);
        return;
      }

      try {
        const response = await fetch('/api/user/roles');
        if (response.ok) {
          const data = await response.json();
          setUserRoles(data.roles || ['customer']);
          setUserInfo(data.user || null);
        }
      } catch (error) {
        console.error('Failed to fetch user roles:', error);
        setUserRoles(['customer']);
      }
    }
    fetchUserRoles();
  }, [isAuthed]);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      // Clear cart store
      useDecoupledCartStore.getState().clearCart();
      // Redirect to home
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
      setUserMenuOpen(false);
    }
  };

  // Get navigation items based on user roles
  const getNavItems = () => {
    const items: { label: string; href: string; icon: any }[] = [];
    
    // Add role-specific items (prioritize higher roles)
    if (userRoles.includes('admin')) {
      items.push(...roleNavItems.admin);
    } else if (userRoles.includes('vendor')) {
      items.push(...roleNavItems.vendor);
    } else if (userRoles.includes('stylist')) {
      items.push(...roleNavItems.stylist);
    }
    
    // Always add customer items for all authenticated users
    items.push(...roleNavItems.customer);
    
    return items;
  };

  // Get primary role for display
  const getPrimaryRole = () => {
    if (userRoles.includes('admin')) return 'Admin';
    if (userRoles.includes('vendor')) return 'Vendor';
    if (userRoles.includes('stylist')) return 'Stylist';
    return 'Customer';
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Top Bar - Contact & Help */}
      <div className="bg-[#1565C0] text-white text-sm sm:text-xs">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <a href="tel:+9779801227448" className="flex items-center gap-1.5 hover:text-yellow-300 transition-colors font-medium">
              <Phone className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              <span className="text-xs sm:text-xs">+977 9801227448</span>
            </a>
            <span className="hidden sm:inline text-white/50">|</span>
            <span className="hidden sm:inline text-white/80 text-xs">Free delivery on orders above Rs. 2000</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-xs">
            <Link href="/book-a-stylist" className="hover:text-yellow-300 transition-colors font-medium">
              Book a Stylist
            </Link>
            <Link href="/vendor/apply" className="hover:text-yellow-300 transition-colors font-medium hidden sm:inline">
              Become a Seller
            </Link>
            <Link href="/support" className="hover:text-yellow-300 transition-colors font-medium hidden md:inline">
              Help & Support
            </Link>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-[#1976D2]">
        <div className="max-w-7xl mx-auto px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-8">
            {/* Logo - Hidden on mobile when search is focused */}
            <Link href="/" className="hidden sm:flex flex-shrink-0">
              <div className="flex items-center gap-3">
                <img 
                  src="/kbStylishlogo.png" 
                  alt="KB Stylish Logo" 
                  className="h-8 md:h-9 w-auto"
                />
              </div>
            </Link>

            {/* Mobile Logo - Compact version for mobile only */}
            <Link href="/" className="sm:hidden flex-shrink-0 transition-all duration-200 search-unfocused:block search-focused:hidden">
              <div className="flex items-center">
                <img 
                  src="/kbStylishlogo.png" 
                  alt="KB Stylish" 
                  className="h-7 w-auto max-w-[70px] object-contain"
                />
              </div>
            </Link>

            {/* Search Bar - Expands on mobile when focused */}
            <form onSubmit={handleSearch} className="flex-1 max-w-3xl">
              <div className="relative flex">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for facial kits, hair care..."
                  className="w-full h-9 sm:h-10 pl-3 sm:pl-4 pr-10 sm:pr-12 rounded-l-lg bg-white text-gray-800 placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all"
                />
                <button
                  type="submit"
                  className="px-3 sm:px-5 h-9 sm:h-10 bg-[#FFD400] hover:bg-[#FFC107] rounded-r-lg transition-colors flex items-center justify-center flex-shrink-0"
                >
                  <Search className="h-4 sm:h-5 w-4 sm:w-5 text-gray-800" />
                </button>
              </div>
            </form>

            {/* Right Side Actions - Compact on mobile */}
            <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
              {/* User Menu */}
              {isAuthed ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="hidden sm:flex items-center gap-2 text-white hover:text-yellow-300 transition-colors"
                  >
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                      {userInfo?.avatarUrl ? (
                        <img 
                          src={userInfo.avatarUrl} 
                          alt="" 
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>
                    <div className="hidden lg:block text-left">
                      <p className="text-[10px] text-white/70">Hello, {userInfo?.displayName || 'User'}</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        {getPrimaryRole()}
                        <ChevronDown className={`h-4 w-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                      </p>
                    </div>
                  </button>

                  {/* Dropdown Menu */}
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-gray-900 font-medium">{userInfo?.displayName || 'User'}</p>
                        <p className="text-gray-500 text-sm">{userInfo?.email}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-[#1976D2]/10 text-[#1976D2] text-xs rounded-full">
                          {getPrimaryRole()}
                        </span>
                      </div>

                      {/* Profile Link */}
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                      >
                        <User className="h-4 w-4" />
                        <span>My Profile</span>
                      </Link>

                      {/* Role-based Navigation */}
                      <div className="border-t border-gray-200 mt-1 pt-1">
                        {getNavItems().map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </div>

                      {/* Logout */}
                      <div className="border-t border-gray-200 mt-1 pt-1">
                        <button
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="flex items-center gap-3 px-4 py-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors w-full disabled:opacity-50"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className="hidden sm:flex items-center gap-2 text-white hover:text-yellow-300 transition-colors"
                >
                  <User className="h-6 w-6" />
                  <div className="hidden lg:block text-left">
                    <p className="text-[10px] text-white/70">Hello, Sign in</p>
                    <p className="text-sm font-medium">Account</p>
                  </div>
                </Link>
              )}

              {/* Cart - Compact on mobile */}
              <Link
                href="/checkout"
                className="relative flex items-center gap-1 bg-[#FFD400] text-gray-900 px-1.5 sm:px-3 py-1.5 rounded-lg hover:bg-[#FFC107] transition-colors flex-shrink-0"
                data-testid="cart-button"
              >
                <div className="relative">
                  <ShoppingCart className="h-5 sm:h-6 w-5 sm:w-6" />
                  {totalItems > 0 && (
                    <span
                      data-testid="cart-badge"
                      className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 h-4 w-4 sm:h-5 sm:w-5 bg-red-500 text-white text-[9px] sm:text-xs font-bold rounded-full flex items-center justify-center"
                    >
                      {totalItems > 9 ? "9+" : totalItems}
                    </span>
                  )}
                </div>
                <span className="hidden lg:inline text-sm font-semibold">Cart</span>
              </Link>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-1 sm:p-2 text-white hover:text-yellow-300 transition-colors flex-shrink-0"
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-5 sm:h-6 w-5 sm:w-6" /> : <Menu className="h-5 sm:h-6 w-5 sm:w-6" />}
              </button>
            </div>
          </div>
        </div>


      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b shadow-lg max-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-4">
            {/* Mobile Search */}
            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative flex">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full h-10 pl-4 pr-12 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
                />
                <button
                  type="submit"
                  className="absolute right-0 top-0 px-4 h-10 bg-[#1976D2] rounded-r-lg"
                >
                  <Search className="h-4 w-4 text-white" />
                </button>
              </div>
            </form>

            {/* Mobile User Info */}
            {isAuthed && userInfo && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-800">{userInfo.displayName}</p>
                <p className="text-sm text-gray-500">{getPrimaryRole()}</p>
              </div>
            )}

            {/* Mobile Categories */}
            <nav className="space-y-1">
              <Link
                href="/shop"
                className="block px-4 py-3 text-gray-800 font-medium hover:bg-gray-100 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                All Categories
              </Link>
              
              <hr className="my-2" />
              
              {/* Mobile Role-based Navigation */}
              {isAuthed ? (
                <>
                  <Link
                    href="/profile"
                    className="block px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    My Profile
                  </Link>
                  {getNavItems().map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center gap-2 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg w-full"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </button>
                </>
              ) : (
                <Link
                  href="/auth/login"
                  className="block px-4 py-3 text-[#1976D2] font-medium hover:bg-blue-50 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login / Register
                </Link>
              )}
              
              <Link
                href="/book-a-stylist"
                className="block px-4 py-3 bg-[#FFD400] text-gray-900 font-semibold hover:bg-[#FFC107] rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Book a Stylist
              </Link>
              <Link
                href="/vendor/apply"
                className="block px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Become a Seller
              </Link>
              <Link
                href="/support"
                className="block px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Help & Support
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
