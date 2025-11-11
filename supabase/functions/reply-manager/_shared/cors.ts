export function getCorsHeaders(origin) {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://kb-stylish.vercel.app'
  ];
  const responseOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    // Dynamic origin based on request
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
      'x-khalti-signature'
    ].join(', '),
    // Expose headers that client might need to read
    'Access-Control-Expose-Headers': 'set-cookie',
    // Cache preflight for 1 hour
    'Access-Control-Max-Age': '3600'
  };
}
export const corsHeaders = getCorsHeaders('http://localhost:3000');
