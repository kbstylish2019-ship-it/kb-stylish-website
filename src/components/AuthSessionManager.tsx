'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cartAPI } from '@/lib/api/cartClient';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

/**
 * AuthSessionManager - Production-Grade Session Management
 * 
 * Listens for auth state changes and properly manages cart client session.
 * CRITICAL: This prevents cached JWT sessions from persisting after logout.
 */
export function AuthSessionManager() {
  useEffect(() => {
    const supabase = createClient();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('[AuthSessionManager] Auth state change:', event);
        
        if (event === 'SIGNED_OUT') {
          // CRITICAL: Clear cached session immediately on logout
          console.log('[AuthSessionManager] User signed out - clearing cart session');
          cartAPI.clearSession();
          
          // Force refresh the cart to use guest mode
          // This will use the new guest token set by the server
          try {
            // Small delay to allow cookie to be set by server
            setTimeout(async () => {
              await cartAPI.refreshSession();
              console.log('[AuthSessionManager] Cart session refreshed for guest mode');
            }, 100);
          } catch (error) {
            console.error('[AuthSessionManager] Error refreshing cart session:', error);
          }
        } else if (event === 'SIGNED_IN') {
          // User signed in - refresh cart session to use JWT
          console.log('[AuthSessionManager] User signed in - refreshing cart session');
          cartAPI.clearSession(); // Clear any cached guest session
          
          try {
            setTimeout(async () => {
              await cartAPI.refreshSession();
              console.log('[AuthSessionManager] Cart session refreshed for authenticated user');
            }, 100);
          } catch (error) {
            console.error('[AuthSessionManager] Error refreshing cart session:', error);
          }
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // This is a logic-only component - no render
  return null;
}
