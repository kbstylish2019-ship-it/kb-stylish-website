import { v4 as uuidv4 } from 'uuid';

/**
 * Guest token management for client-side
 * Uses localStorage for persistence
 */

const GUEST_TOKEN_KEY = 'guest_token';
const TOKEN_EXPIRY_KEY = 'guest_token_expiry';
const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

/**
 * Get or create a guest token on the client
 * Tokens are UUID v4 and expire after 30 days
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
