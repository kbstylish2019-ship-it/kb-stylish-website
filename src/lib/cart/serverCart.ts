import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Server-side cart fetcher for SSR
 * This runs on the server during page generation
 */
export async function getServerCart() {
  try {
    const cookieStore = await cookies();
    
    // Create server-side Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );
    
    // Get auth session
    const { data: { session } } = await supabase.auth.getSession();
    
    // Get guest token if no session
    const guestToken = !session ? cookieStore.get('guest_token')?.value : null;
    
    // Don't fetch if neither auth nor guest token
    if (!session && !guestToken) {
      console.log('[ServerCart] No session or guest token, returning null');
      return null;
    }
    
    // Build headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    
    if (guestToken) {
      headers['X-Guest-Token'] = guestToken;
    }
    
    // Call Edge Function
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cart-manager`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'get' }),
        cache: 'no-store', // Always fresh data
      }
    );
    
    if (!response.ok) {
      console.error('[ServerCart] Failed to fetch cart:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('[ServerCart] Successfully fetched cart:', data.cart?.id);
    return data.cart;
    
  } catch (error) {
    console.error('[ServerCart] Error fetching cart:', error);
    return null;
  }
}

/**
 * Get or create a guest token on the server
 */
export async function getServerGuestToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('guest_token')?.value || null;
  } catch {
    return null;
  }
}
