import { NextResponse } from 'next/server';
import { setCsrfToken } from '@/lib/csrf';

/**
 * CSRF Token Generation Endpoint
 * 
 * Called by client on page load to obtain CSRF token.
 * Sets token as httpOnly cookie and returns it in response.
 * 
 * Usage:
 *   const response = await fetch('/api/auth/csrf');
 *   const { token } = await response.json();
 *   // Use token in X-CSRF-Token header for protected requests
 */
export async function GET() {
  try {
    const token = await setCsrfToken();
    
    return NextResponse.json({
      token,
      expiresIn: 60 * 60 * 24 // 24 hours in seconds
    });
  } catch (error) {
    console.error('[CSRF API] Error generating token:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
