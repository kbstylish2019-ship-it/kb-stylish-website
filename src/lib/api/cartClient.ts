'use client';

/**
 * Cart API Client - Client-Side Only
 * Production-Grade Integration Blueprint v1.0
 * 
 * This file contains only client-side code for cart operations.
 * Server-side code remains in apiClient.ts
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Session, User } from '@supabase/supabase-js';
import { getOrCreateGuestToken, setGuestTokenCookie as setGuestTokenCookieUtil, clearGuestToken as clearGuestTokenUtil } from '@/lib/cart/guestToken';

// ============================================
// Types
// ============================================

export interface CartResponse {
  success: boolean;
  cart?: {
    id: string;
    user_id: string | null;
    guest_session?: string;
    created_at: string;
    updated_at: string;
    items?: CartItem[];
    cart_items?: CartItem[];  // Edge Function uses this field name
    bookings?: Array<{
      id: string;
      service_id: string;
      service_name: string;
      stylist_user_id: string;
      stylist_name: string;
      start_time: string;
      end_time: string;
      price_cents: number;
      customer_name: string;
      customer_phone: string | null;
      customer_email: string;
      customer_notes: string | null;
      expires_at: string;
      status: string;
    }>;
    total_items?: number;
    item_count?: number;  // Edge Function might use this
    total_amount?: number;
    subtotal?: number;  // Edge Function might use this
  };
  error?: string;
  message?: string;
  guest_token?: string;
  warnings?: string[];  // ENTERPRISE: Price change warnings, stock warnings, etc.  // Edge Function returns this
}

export interface CartItem {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  price_snapshot: number;
  added_at: string;
  product_name: string;
  product_slug: string;
  variant_sku: string;
  product_image?: string;
}

export interface PaymentIntentResponse {
  success: boolean;
  payment_intent_id?: string;
  payment_method?: 'esewa' | 'khalti';
  payment_url?: string;
  form_fields?: Record<string, string>; // eSewa only
  amount_cents?: number;
  expires_at?: string;
  error?: string;
  details?: string[];
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface CreateOrderIntentRequest {
  payment_method: 'esewa' | 'khalti';
  shipping_address: ShippingAddress;
  metadata?: Record<string, any>;
}

export interface VerifyPaymentRequest {
  provider: 'esewa' | 'khalti';
  transaction_uuid?: string; // eSewa
  pidx?: string; // Khalti
}

export interface VerifyPaymentResponse {
  success: boolean;
  payment_intent_id?: string;
  amount_cents?: number;
  already_verified?: boolean;
  details?: any;
  error?: string;
}

/**
 * CartAPIClient - Client-side cart management
 * Handles authentication, optimistic updates, and server synchronization
 */
export class CartAPIClient {
  private baseUrl: string;
  private anonKey: string;
  private browserClient: any;
  private currentSession: any = null;  // Cache the current session

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    // Initialize browser client only if we have the required environment variables
    if (typeof window !== 'undefined' && this.baseUrl && this.anonKey) {
      try {
        this.browserClient = createBrowserClient(
          this.baseUrl,
          this.anonKey
        );
        
        // Subscribe to auth changes to keep session updated
        this.browserClient.auth.onAuthStateChange((event: any, session: any) => {
          console.log('[CartAPIClient] Auth state changed in client:', event, session?.user?.id);
          
          // Update cached session based on auth event
          if (event === 'SIGNED_OUT') {
            console.log('[CartAPIClient] User signed out, clearing cached session');
            this.currentSession = null;
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            this.currentSession = session;
          } else if (event === 'INITIAL_SESSION') {
            // Set initial session (could be null if not logged in)
            this.currentSession = session;
          }
        });
        
        // Get initial session
        this.browserClient.auth.getSession().then(({ data }: any) => {
          this.currentSession = data.session;
        });
      } catch (error) {
        console.warn('[CartAPIClient] Failed to initialize browser client:', error);
        this.browserClient = null;
      }
    }
  }

  /**
   * Refresh authentication state
   * Call this after login to ensure the client uses the new auth state
   */
  public async refreshAuth(): Promise<void> {
    if (this.browserClient) {
      const { data } = await this.browserClient.auth.getSession();
      this.currentSession = data.session;
      console.log('[CartAPI] Auth state refreshed, user:', data.session?.user?.id);
    }
  }

  /**
   * Clear guest token (used after login)
   */
  public clearGuestToken(): void {
    // Use shared utility to clear cookie and localStorage
    clearGuestTokenUtil();
    console.log('[CartAPI] Guest token cleared (cookie + localStorage)');
  }
  
  /**
   * Clear cached session - CRITICAL for logout
   */
  clearSession(): void {
    console.log('[CartAPI] Clearing cached session');
    this.currentSession = null;
    this.clearGuestToken();
    console.log('[CartAPI] Session and guest token cleared');
  }
  
  /**
   * Force refresh session from Supabase
   */
  async refreshSession(): Promise<void> {
    console.log('[CartAPI] Force refreshing session');
    this.currentSession = null;
    if (this.browserClient) {
      const { data } = await this.browserClient.auth.getSession();
      this.currentSession = data.session;
      console.log('[CartAPI] Session refreshed, user:', data.session?.user?.id || 'guest');
    }
  }

  /**
   * Get auth headers for requests
   * 
   * RESTORATION: Implements resilient fallback chain (JWT → Guest Token → Anon Key)
   * Always sends x-guest-token for fallback, even when authenticated
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Use cached session if available, otherwise get fresh
    let session = this.currentSession;
    
    if (!session && this.browserClient) {
      // Get fresh session if not cached
      const { data } = await this.browserClient.auth.getSession();
      session = data.session;
      this.currentSession = session;
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    };

    // CRITICAL RESTORATION FIX: Always attach guest token for resilient fallback
    // This ensures the Edge Function can fall back to guest mode if JWT verification fails
    const guestToken = getOrCreateGuestToken();
    if (guestToken) {
      headers['x-guest-token'] = guestToken;
      console.log('[CartAPI] Guest token attached for fallback:', guestToken);
    }

    if (session?.access_token) {
      // Authenticated user - use JWT as primary auth
      headers['Authorization'] = `Bearer ${session.access_token}`;
      console.log('[CartAPI] Using authenticated headers for user:', session.user.id, 'with guest fallback');
    } else {
      // Guest user - use anon key for auth
      headers['Authorization'] = `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`;
      console.log('[CartAPI] Using guest headers with token:', guestToken || 'none');
      
      if (!guestToken) {
        console.warn('[CartAPI] No guest token available - cart operations may fail');
      }
    }

    return headers;
  }


  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Fetch the current user's cart (authenticated or guest)
   */
  async getCart(): Promise<CartResponse> {
    try {
      console.log('[CartAPI] Getting cart...');
      const headers = await this.getAuthHeaders();
      
      const response = await this.executeWithRetry(async () => {
        return await fetch(`${this.baseUrl}/functions/v1/cart-manager`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'get' }),
          credentials: 'include',  // CRITICAL: Include cookies for cross-origin requests
        });
      });

      const data = await response.json();
      
      // Log error responses for debugging
      if (!response.ok) {
        console.error('[CartAPI] getCart error response:', data);
      }
      
      // Store guest token if provided
      if (data.guest_token) {
        setGuestTokenCookieUtil(data.guest_token);
      }

      return data;
    } catch (error) {
      console.error('[CartAPI] Failed to fetch cart:', error);
      return {
        success: false,
        error: 'Network error while fetching cart',
      };
    }
  }

  /**
   * Add item to cart with quantity
   */
  async addToCart(variantId: string, quantity: number = 1): Promise<CartResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      console.log('[CartAPI] addToCart called with:', { variantId, quantity });
      
      const response = await this.executeWithRetry(async () => {
        const body = JSON.stringify({
          action: 'add',
          variant_id: variantId,
          quantity,
        });
        console.log('[CartAPI] Sending request with body:', body);
        
        return await fetch(`${this.baseUrl}/functions/v1/cart-manager`, {
          method: 'POST',
          headers,
          body,
          credentials: 'include',  // CRITICAL: Include cookies for cross-origin requests
        });
      });

      const data = await response.json();
      
      // ALWAYS log response for debugging
      console.log('[CartAPI] addToCart response:', { ok: response.ok, status: response.status, data });
      
      // Log error responses for debugging
      if (!response.ok) {
        console.error('[CartAPI] addToCart error response:', data);
      }
      
      // Store guest token if provided
      if (data.guest_token) {
        setGuestTokenCookieUtil(data.guest_token);
      }

      return data;
    } catch (error) {
      console.error('[CartAPI] Failed to add item to cart (network/parse error):', error);
      console.error('[CartAPI] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: error?.constructor?.name
      });
      return {
        success: false,
        error: `Failed to add item to cart: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Update cart item quantity
   * Note: The store passes itemId (cart_items.id), but we need to find the variant_id
   */
  async updateCartItem(itemIdOrVariantId: string, quantity: number): Promise<CartResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      // First, get the current cart to find the variant_id if needed
      const currentCart = await this.getCart();
      let variantId = itemIdOrVariantId;
      
      if (currentCart.success && currentCart.cart) {
        const items = currentCart.cart.cart_items || currentCart.cart.items || [];
        const item = items.find((i: any) => i.id === itemIdOrVariantId || i.variant_id === itemIdOrVariantId);
        if (item) {
          variantId = item.variant_id;
        }
      }
      
      const response = await this.executeWithRetry(async () => {
        return await fetch(`${this.baseUrl}/functions/v1/cart-manager`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'update',
            variant_id: variantId,
            quantity,
          }),
          credentials: 'include',  // CRITICAL: Include cookies for cross-origin requests
        });
      });

      return await response.json();
    } catch (error) {
      console.error('[CartAPI] Failed to update cart item:', error);
      return {
        success: false,
        error: 'Failed to update cart item',
      };
    }
  }

  /**
   * Remove item from cart
   * Note: The store passes itemId (cart_items.id), but we need to find the variant_id
   */
  async removeFromCart(itemIdOrVariantId: string): Promise<CartResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      // First, get the current cart to find the variant_id if needed
      const currentCart = await this.getCart();
      let variantId = itemIdOrVariantId;
      
      if (currentCart.success && currentCart.cart) {
        const items = currentCart.cart.cart_items || currentCart.cart.items || [];
        const item = items.find((i: any) => i.id === itemIdOrVariantId || i.variant_id === itemIdOrVariantId);
        if (item) {
          variantId = item.variant_id;
        }
      }
      
      const response = await this.executeWithRetry(async () => {
        return await fetch(`${this.baseUrl}/functions/v1/cart-manager`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'remove',
            variant_id: variantId,
          }),
          credentials: 'include',  // CRITICAL: Include cookies for cross-origin requests
        });
      });

      return await response.json();
    } catch (error) {
      console.error('[CartAPI] Failed to remove cart item:', error);
      return {
        success: false,
        error: 'Failed to remove cart item',
      };
    }
  }

  /**
   * Clear entire cart
   */
  async clearCart(): Promise<CartResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await this.executeWithRetry(async () => {
        return await fetch(`${this.baseUrl}/functions/v1/cart-manager`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'clear',
          }),
          credentials: 'include',  // CRITICAL: Include cookies for cross-origin requests
        });
      });

      return await response.json();
    } catch (error) {
      console.error('[CartAPI] Failed to clear cart:', error);
      return {
        success: false,
        error: 'Failed to clear cart',
      };
    }
  }

  /**
   * Create payment intent for checkout with payment gateway integration
   */
  async createOrderIntent(request: CreateOrderIntentRequest): Promise<PaymentIntentResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await this.executeWithRetry(async () => {
        return await fetch(`${this.baseUrl}/functions/v1/create-order-intent`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            payment_method: request.payment_method,
            shipping_address: request.shipping_address,
            metadata: {
              source: 'web_checkout',
              timestamp: new Date().toISOString(),
              ...request.metadata,
            },
          }),
        });
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || 'Failed to create payment intent',
          details: error.details,
        };
      }

      return await response.json();
    } catch (error) {
      console.error('[CartAPI] Failed to create order intent:', error);
      return {
        success: false,
        error: 'Failed to initiate checkout',
      };
    }
  }

  /**
   * Verify payment with gateway after user returns from payment page
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    try {
      const response = await this.executeWithRetry(async () => {
        return await fetch(`${this.baseUrl}/functions/v1/verify-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.anonKey,
          },
          body: JSON.stringify(request),
        });
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || 'Failed to verify payment',
        };
      }

      return await response.json();
    } catch (error) {
      console.error('[CartAPI] Failed to verify payment:', error);
      return {
        success: false,
        error: 'Failed to verify payment',
      };
    }
  }

}

// Export singleton instance
export const cartAPI = new CartAPIClient();
