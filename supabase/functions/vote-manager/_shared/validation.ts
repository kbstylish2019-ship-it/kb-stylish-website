/**
 * Shared Validation Utilities for Edge Functions
 * Input sanitization and validation for the Trust Engine
 */ /**
 * Sanitize text input - remove HTML and dangerous characters
 */ export function sanitizeText(input, maxLength) {
  if (!input) return '';
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  // Remove zero-width characters and other invisible unicode
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Normalize whitespace
  sanitized = sanitized.trim().replace(/\s+/g, ' ');
  // Enforce max length if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized;
}
/**
 * Validate rating value
 */ export function validateRating(rating) {
  const parsed = parseInt(rating);
  if (isNaN(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}
/**
 * Validate UUID format
 */ export function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
/**
 * Validate pagination parameters
 */ export function validatePagination(params) {
  const limit = Math.min(Math.max(parseInt(params.limit) || 20, 1), 100);
  const cursor = params.cursor ? String(params.cursor) : undefined;
  return {
    limit,
    cursor
  };
}
/**
 * Hash user agent for privacy-preserving tracking
 */ export async function hashUserAgent(userAgent) {
  if (!userAgent) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(userAgent);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map((b)=>b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 64); // First 64 chars
}
/**
 * Extract IP address from request
 */ export function extractIPAddress(req) {
  // Try various headers in order of preference
  const headers = [
    'CF-Connecting-IP',
    'X-Forwarded-For',
    'X-Real-IP',
    'X-Client-IP' // Apache
  ];
  for (const header of headers){
    const value = req.headers.get(header);
    if (value) {
      // X-Forwarded-For can contain multiple IPs, take the first
      return value.split(',')[0].trim();
    }
  }
  return null;
}
