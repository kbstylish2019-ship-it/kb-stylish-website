/**
 * CSRF Protection Utility
 * Prevents Cross-Site Request Forgery attacks on review submissions
 * 
 * Uses double-submit cookie pattern:
 * 1. Server generates token and sets as httpOnly cookie
 * 2. Server also returns token in response body
 * 3. Client includes token in request header
 * 4. Server verifies cookie matches header
 */

import { cookies } from 'next/headers';
import crypto from 'crypto';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'kb-csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('base64url');
}

/**
 * Set CSRF token as httpOnly cookie and return token
 * Call this from API route that initializes the token
 */
export async function setCsrfToken(): Promise<string> {
  const token = generateCsrfToken();
  const cookieStore = await cookies();
  
  // Set as httpOnly cookie (can't be accessed by JavaScript)
  cookieStore.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 // 24 hours
  });
  
  return token;
}

/**
 * Verify CSRF token from request
 * Returns true if valid, false otherwise
 */
export async function verifyCsrfToken(headerToken: string | null): Promise<boolean> {
  if (!headerToken) {
    console.error('[CSRF] No token in header');
    return false;
  }
  
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  
  if (!cookieToken) {
    console.error('[CSRF] No token in cookie');
    return false;
  }
  
  // Constant-time comparison to prevent timing attacks
  const valid = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );
  
  if (!valid) {
    console.error('[CSRF] Token mismatch');
  }
  
  return valid;
}

/**
 * Get CSRF token from cookie (for client-side use)
 */
export async function getCsrfToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * Clear CSRF token
 */
export async function clearCsrfToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CSRF_COOKIE_NAME);
}

// Export constants for use in other files
export const CSRF_TOKEN_HEADER = CSRF_HEADER_NAME;
