import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";
import { cookies, headers } from "next/headers";
import { CartInitializer } from "@/components/CartInitializer";
import { AuthSessionManager } from "@/components/AuthSessionManager";
import { createServerClient } from '@supabase/ssr';
import type { UserCapability } from "@/lib/types";

// Defer Header to reduce initial JS; render a lightweight skeleton during loading
const Header = dynamic(() => import("@/components/layout/Header"), {
  loading: () => (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-background/80 h-16" aria-label="Loading header" />
  ),
});

// Lazy load Footer as it's below the fold
const Footer = dynamic(() => import("@/components/layout/Footer"), {
  loading: () => <div className="h-64 mt-10 animate-pulse bg-white/5" />,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Reduce initial load
});

export const metadata: Metadata = {
  title: "KB Stylish",
  description: "KB Stylish — Nepal's premier multi-vendor fashion and style marketplace.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
  },
};

/**
 * Root Layout - Server Component
 * Implements server-side cart hydration as per Production-Grade Integration Blueprint v1.0
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ============ Server-Side Cart Fetching ============
  const cookieStore = await cookies();
  
  // Create Supabase server client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
  
  // Get user session
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthenticated = !!session?.user;
  
  // RESTORATION: Build correct headers for Edge Function
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
  
  // Add authentication header
  if (session?.access_token) {
    requestHeaders['Authorization'] = `Bearer ${session.access_token}`;
  } else {
    requestHeaders['Authorization'] = `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`;
  }
  
  // CRITICAL FIX: Extract guest_token from cookies and send as x-guest-token header
  // Edge Function does NOT read cookies - it requires the x-guest-token header
  const guestToken = cookieStore.get('guest_token')?.value;
  
  if (guestToken) {
    requestHeaders['x-guest-token'] = guestToken;
    console.log('[RootLayout] Setting x-guest-token header:', guestToken);
  } else if (!session) {
    console.log('[RootLayout] No guest token found in cookies for anonymous user');
  }
  
  // Fetch initial cart from Edge Function
  let initialCart = null;
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cart-manager`,
      {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ action: 'get' }), // FIXED: Correct action name
        cache: 'no-store', // Always fetch fresh cart data
      }
    );
    
    const data = await response.json();
    
    if (data.success && data.cart) {
      initialCart = data.cart;
      console.log('[RootLayout] Server-fetched cart:', {
        cartId: data.cart.id,
        itemCount: (data.cart.item_count ?? data.cart.items?.length ?? data.cart.cart_items?.length ?? 0),
        isGuest: !data.cart.user_id,
      });
      
      // Note: Edge Function no longer returns guest_token in response
      // Guest tokens are managed via cookies and adopted by client
    }
  } catch (error) {
    console.error('[RootLayout] Failed to fetch initial cart:', error);
    // Cart will be fetched client-side as fallback
  }
  
  // TODO: Replace with real capability hydration from auth/session
  const guestCapabilities: UserCapability[] = [
    "view_shop",
    "view_about",
    "apply_vendor",
    "view_cart",
  ];
  
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        {/* Initialize client-side cart store with server data */}
        <CartInitializer 
          initialCart={initialCart} 
          isAuthenticated={isAuthenticated} 
        />
        
        {/* CRITICAL: Manage auth session changes for cart */}
        <AuthSessionManager />
        
        {/* Header now gets cart data from the store */}
        <Header />
        
        {children}
        
        <Footer />
      </body>
    </html>
  );
}
