// CRITICAL: Proper CORS configuration for cross-origin credentials
// This allows the browser to send/receive cookies in cross-origin requests

export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Allowed origins for development and production
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'https://kb-stylish.vercel.app',
    // Add production domain when deployed
  ];
  
  // Use the request origin if it's allowed, otherwise use the first allowed origin
  const responseOrigin = origin && allowedOrigins.includes(origin) 
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
