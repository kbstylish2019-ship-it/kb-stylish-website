import { v4 as uuidv4 } from 'uuid';

/**
 * Guest token management for client-side
 * SECURITY UPDATE (2025-10-18): Migrating to server-generated tokens
 * - Old: Client-generated UUIDs (CJ-SEC-001 vulnerability)
 * - New: Server-generated CSPRNG tokens (256-bit entropy)
 * - Backwards compatible during migration
 */

const GUEST_TOKEN_KEY = 'guest_token';
const TOKEN_EXPIRY_KEY = 'guest_token_expiry';
const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

// Feature flag for gradual rollout
const USE_SERVER_TOKENS = true; // Set to false to rollback

/**
 * SECURITY FIX (CJ-SEC-001): Get or create server-generated guest token
 * 
 * New behavior:
 * 1. Check localStorage for existing token (old or new format)
 * 2. If none, request server-generated token via RPC
 * 3. Fallback to client UUID if server unavailable
 * 
 * @returns Promise<string> - Server-generated token or UUID fallback
 */
export async function getOrCreateServerGuestToken(): Promise<string> {
  // Server-side guard
  if (typeof window === 'undefined') {
    console.warn('[GuestToken] Called on server, returning empty string');
    return '';
  }
  
  try {
    // Check for existing token (supports both old UUID and new guest_ format)
    const existingToken = localStorage.getItem(GUEST_TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    // Validate token and expiry
    if (existingToken && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (!isNaN(expiryTime) && Date.now() < expiryTime) {
        console.log('[GuestToken] Using existing token:', existingToken);
        return existingToken;
      }
      // Token expired, clear it
      console.log('[GuestToken] Token expired, requesting new server token');
      clearGuestToken();
    }
    
    // Request new token from server if feature enabled
    if (USE_SERVER_TOKENS) {
      try {
        console.log('[GuestToken] Requesting server-generated token...');
        
        // Call the Supabase RPC function
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_guest_token_secure`,
          {
            method: 'POST',
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({})
          }
        );
        
        if (!response.ok) {
          throw new Error(`Server token request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.guest_token && data.guest_token.startsWith('guest_')) {
          const newToken = data.guest_token;
          const newExpiry = Date.now() + TOKEN_TTL;
          
          localStorage.setItem(GUEST_TOKEN_KEY, newToken);
          localStorage.setItem(TOKEN_EXPIRY_KEY, newExpiry.toString());
          
          console.log('[GuestToken] ✅ Server token created:', newToken.substring(0, 20) + '...');
          return newToken;
        }
        
        throw new Error('Invalid token format from server');
        
      } catch (serverError) {
        console.warn('[GuestToken] Server token generation failed, falling back to UUID:', serverError);
        // Fall through to UUID fallback
      }
    }
    
    // Fallback: Create UUID token (old behavior)
    const newToken = uuidv4();
    const newExpiry = Date.now() + TOKEN_TTL;
    
    localStorage.setItem(GUEST_TOKEN_KEY, newToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, newExpiry.toString());
    
    console.log('[GuestToken] ⚠️ Fallback UUID token created:', newToken);
    return newToken;
    
  } catch (error) {
    console.error('[GuestToken] Error managing guest token:', error);
    // Last resort fallback
    return uuidv4();
  }
}

/**
 * LEGACY: Get or create a guest token on the client (synchronous)
 * Tokens are UUID v4 and expire after 30 days
 * 
 * @deprecated Use getOrCreateServerGuestToken() for secure tokens
 * This function kept for backwards compatibility only
 */
export function getOrCreateGuestToken(): string {
  // Server-side guard
  if (typeof window === 'undefined') {
    console.warn('[GuestToken] Called on server, returning empty string');
    return '';
  }
  
  try {
    // Check for existing token
    const existingToken = localStorage.getItem(GUEST_TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    // Validate token and expiry
    if (existingToken && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (!isNaN(expiryTime) && Date.now() < expiryTime) {
        console.log('[GuestToken] Using existing token:', existingToken);
        return existingToken;
      }
      // Token expired, clear it
      console.log('[GuestToken] Token expired, creating new one');
      clearGuestToken();
    }
    
    // Create new token
    const newToken = uuidv4();
    const newExpiry = Date.now() + TOKEN_TTL;
    
    localStorage.setItem(GUEST_TOKEN_KEY, newToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, newExpiry.toString());
    
    console.log('[GuestToken] Created new token:', newToken);
    return newToken;
    
  } catch (error) {
    console.error('[GuestToken] Error managing guest token:', error);
    // Fallback to session token
    return uuidv4();
  }
}

/**
 * Clear guest token (used after login)
 */
export function clearGuestToken(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(GUEST_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    console.log('[GuestToken] Cleared guest token');
  } catch (error) {
    console.error('[GuestToken] Error clearing guest token:', error);
  }
}

/**
 * Get existing guest token without creating
 */
export function getGuestToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const token = localStorage.getItem(GUEST_TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (!isNaN(expiryTime) && Date.now() < expiryTime) {
        return token;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Read guest token from cookie
 */
export function getGuestTokenFromCookie(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'guest_token' && value) {
        return value;
      }
    }
    return null;
  } catch (error) {
    console.error('[GuestToken] Error reading cookie:', error);
    return null;
  }
}

/**
 * Adopt server-issued guest token into localStorage
 * RESTORATION: Critical for preserving cart after logout
 */
export function adoptServerGuestToken(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const cookieToken = getGuestTokenFromCookie();
    if (!cookieToken) {
      console.log('[GuestToken] No server token to adopt');
      return false;
    }
    
    const localToken = localStorage.getItem(GUEST_TOKEN_KEY);
    
    if (cookieToken !== localToken) {
      console.log('[GuestToken] Adopting server token:', cookieToken, 'replacing:', localToken);
      
      // Adopt the server's token
      localStorage.setItem(GUEST_TOKEN_KEY, cookieToken);
      const newExpiry = Date.now() + TOKEN_TTL;
      localStorage.setItem(TOKEN_EXPIRY_KEY, newExpiry.toString());
      
      return true;
    }
    
    console.log('[GuestToken] Server and local tokens match:', cookieToken);
    return false;
  } catch (error) {
    console.error('[GuestToken] Error adopting server token:', error);
    return false;
  }
}

/**
 * Set guest token cookie for server-side access
 */
export function setGuestTokenCookie(token: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Set cookie that's accessible to server
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    
    // Use Secure flag in production
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieString = `guest_token=${token}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${isProduction ? '; Secure' : ''}`;
    
    document.cookie = cookieString;
    console.log('[GuestToken] Set cookie for server access');
  } catch (error) {
    console.error('[GuestToken] Error setting cookie:', error);
  }
}
