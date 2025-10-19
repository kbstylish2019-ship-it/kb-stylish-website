'use client';

import { useEffect, useRef } from 'react';
import { useDecoupledCartStore } from '@/lib/store/decoupledCartStore';
import { 
  getOrCreateServerGuestToken,  // SECURITY FIX: Use server tokens
  getOrCreateGuestToken,         // Fallback for sync contexts
  setGuestTokenCookie, 
  adoptServerGuestToken 
} from '@/lib/cart/guestToken';
import { cartAPI } from '@/lib/api/cartClient';

/**
 * CartInitializer Component - Production-Grade Integration Blueprint v1.0
 * 
 * Purpose:
 * - Hydrates the client-side cart store with server-fetched data
 * - Ensures cart is ready before any user interaction
 * - Handles both authenticated and guest users seamlessly
 * - Automatically cleans up expired booking reservations
 * 
 * This component bridges the server-client gap by taking
 * server-fetched cart data and initializing the Zustand store
 */

interface CartInitializerProps {
  initialCart?: {
    id: string;
    user_id: string | null;
    guest_session?: string;
    created_at: string;
    updated_at: string;
    items: any[];
    // Live backend returns item_count and subtotal; keep legacy fields optional for back-compat
    item_count?: number;
    subtotal?: number;
    total_items?: number;
    total_amount?: number;
  } | null;
  isAuthenticated?: boolean;
}

export function CartInitializer({ 
  initialCart, 
  isAuthenticated = false 
}: CartInitializerProps) {
  const cleanupExpiredBookings = useDecoupledCartStore((state) => state.cleanupExpiredBookings);
  const hasInitialized = useRef(false);
  
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (hasInitialized.current) {
      console.log('[CartInitializer] Already initialized, skipping...');
      return;
    }
    hasInitialized.current = true;
    
    const initializeStore = async () => {
      // RESTORATION: Adopt server-issued token, don't overwrite
      // This preserves the cart after logout when server issues new guest token
      const tokenAdopted = adoptServerGuestToken();
      
      if (tokenAdopted) {
        console.log('[CartInitializer] Server token adopted, refreshing session...');
        // Critical: Refresh session to clear stale JWT from cartAPI
        await cartAPI.refreshSession();
      }
      
      // SECURITY FIX (CJ-SEC-001): Use server-generated tokens
      // Only create new token if we're guest and no server token was adopted
      if (!isAuthenticated && !tokenAdopted) {
        try {
          const guestToken = await getOrCreateServerGuestToken();
          if (guestToken) {
            console.log('[CartInitializer] ✅ Server token obtained:', guestToken.substring(0, 20) + '...');
            setGuestTokenCookie(guestToken);
          }
        } catch (error) {
          console.error('[CartInitializer] Failed to get server token, using fallback:', error);
          // Graceful fallback to sync version
          const fallbackToken = getOrCreateGuestToken();
          if (fallbackToken) {
            setGuestTokenCookie(fallbackToken);
          }
        }
      }
      
      // Get the store actions
      const { initializeCart, mergeCartAfterLogin } = useDecoupledCartStore.getState();
      
      // If we have initial cart data from server, use it
      if (initialCart) {
        console.log('[CartInitializer] Hydrating store with server cart:', {
          cartId: initialCart.id,
          itemCount: (initialCart.item_count ?? initialCart.total_items ?? initialCart.items?.length ?? 0),
          isGuest: !initialCart.user_id,
        });
        
        await initializeCart(initialCart);
      } else {
        // No initial cart provided, fetch from client
        console.log('[CartInitializer] No server cart provided, fetching from client...');
        await initializeCart();
      }
      
      // If user just logged in and had a guest cart, handle merge
      // This is detected by checking if the cart is marked as guest
      // but we have an authenticated user
      if (isAuthenticated && initialCart && !initialCart.user_id) {
        console.log('[CartInitializer] User authenticated with guest cart, initiating merge...');
        // The merge will be handled automatically by the server
        // when it sees both JWT and guest token
      }
    };
    
    // Initialize the store
    initializeStore().catch(error => {
      console.error('[CartInitializer] Failed to initialize cart:', error);
      // Store will handle error state internally
    });
  }, []); // Run once on mount
  
  // Periodic cleanup of expired bookings (every 30 seconds)
  useEffect(() => {
    // Initial cleanup
    cleanupExpiredBookings();
    
    // Set up periodic cleanup
    const interval = setInterval(() => {
      console.log('[CartInitializer] Running periodic cleanup of expired bookings...');
      cleanupExpiredBookings();
    }, 30000); // Check every 30 seconds

    // CRITICAL: Clean up interval on unmount to prevent memory leak
    return () => {
      console.log('[CartInitializer] Cleaning up interval...');
      clearInterval(interval);
    };
  }, [cleanupExpiredBookings]);
  
  // This component doesn't render anything
  return null;
}

/**
 * Optional: Cart Ready Provider
 * Can be used to show loading state while cart initializes
 */
export function CartReadyProvider({ children }: { children: React.ReactNode }) {
  const isLoading = useDecoupledCartStore(state => state.isLoading);
  const cartId = useDecoupledCartStore(state => state.cartId);
  
  // Cart is ready when we have a cartId or loading is complete
  const isCartReady = cartId !== null || !isLoading;
  
  if (!isCartReady) {
    // Optional: Show a subtle loading indicator
    // Most operations will be fast enough that this won't be visible
    return (
      <>
        {children}
        {/* Could add a toast or subtle indicator here if needed */}
      </>
    );
  }
  
  return <>{children}</>;
}
