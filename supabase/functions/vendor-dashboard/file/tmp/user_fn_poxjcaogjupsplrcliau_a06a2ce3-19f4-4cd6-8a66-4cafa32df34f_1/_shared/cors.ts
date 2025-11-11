export function getCorsHeaders(origin) {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://kb-stylish.vercel.app'
  ];
  const responseOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': responseOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    'Access-Control-Allow-Headers': [
      'authorization',
      'x-client-info',
      'apikey',
      'content-type',
      'x-guest-token',
      'cookie',
      'stripe-signature',
      'x-webhook-signature',
      'x-hub-signature-256',
      'x-esewa-signature',
      'x-khalti-signature'
    ].join(', '),
    'Access-Control-Expose-Headers': 'set-cookie',
    'Access-Control-Max-Age': '3600'
  };
}
export const corsHeaders = getCorsHeaders('http://localhost:3000');
