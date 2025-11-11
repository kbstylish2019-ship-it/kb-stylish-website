// CRITICAL: Proper CORS configuration for cross-origin credentials
// This allows the browser to send/receive cookies in cross-origin requests

const denoEnv = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } })
  .Deno?.env;

export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Allowed origins for development and production (update defaults as needed)
  const defaultAllowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://kb-stylish-website.vercel.app',
    'https://kbstylish.com.np',
    'https://www.kbstylish.com.np',
  ];

  const envOrigins = (denoEnv?.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);

  const allowedOrigins = Array.from(
    new Set([...defaultAllowedOrigins, ...envOrigins]),
  );

  const normalize = (value: string) => value.replace(/\/+$/, '');

  const responseOrigin = origin && allowedOrigins.some(
    (allowed) => normalize(allowed) === normalize(origin),
  )
    ? origin
    : allowedOrigins[0];
  
  return {
    // CRITICAL: Must be specific origin, NOT wildcard, for credentials
    'Access-Control-Allow-Origin': responseOrigin,
    
    // CRITICAL: Must be 'true' to allow cookies
    'Access-Control-Allow-Credentials': 'true',
    
    // All HTTP methods we use
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    
    // All headers the client might send
    'Access-Control-Allow-Headers': [
      'authorization',
      'x-client-info',
      'apikey',
      'content-type',
      'x-guest-token',
      'x-csrf-token',
      'cookie',
      'stripe-signature',
      'x-webhook-signature',
      'x-hub-signature-256',
      'x-esewa-signature',
      'x-khalti-signature',
    ].join(', '),
    
    // Expose headers that client might need to read
    'Access-Control-Expose-Headers': 'set-cookie',
    
    // Cache preflight for 1 hour
    'Access-Control-Max-Age': '3600',
  };
}

// Legacy export for backward compatibility
export const corsHeaders = getCorsHeaders('http://localhost:3000');
