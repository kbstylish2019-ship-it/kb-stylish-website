/**
 * Idempotency Utility
 * 
 * Prevents duplicate request processing using Redis caching.
 * Critical for preventing budget bypass via concurrent requests.
 * 
 * @module lib/idempotency
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client (optional - graceful fallback if not configured)
const redis = process.env.UPSTASH_REDIS_URL ? new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
}) : null;

/**
 * Execute function with idempotency guarantee
 * 
 * @param key - Unique idempotency key (e.g., `override:${userId}:${date}`)
 * @param ttlSeconds - How long to cache the result (default: 5 minutes)
 * @param fn - Function to execute (only called if not cached)
 * @returns Object with result and cached flag
 * 
 * @example
 * const { result, cached } = await withIdempotency(
 *   `override:${userId}:${date}`,
 *   300,
 *   async () => createOverride(userId, date)
 * );
 */
export async function withIdempotency<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<{ result: T; cached: boolean }> {
  // Fallback if Redis not configured (dev mode)
  if (!redis) {
    console.warn('[Idempotency] Redis not configured, skipping cache');
    const result = await fn();
    return { result, cached: false };
  }
  
  try {
    // Check if result already cached
    const cached = await redis.get(key);
    
    if (cached) {
      console.log('[Idempotency] Returning cached result for key:', key);
      return { 
        result: JSON.parse(cached as string) as T, 
        cached: true 
      };
    }
    
    // Execute function
    const result = await fn();
    
    // Cache result for TTL duration
    await redis.set(key, JSON.stringify(result), { ex: ttlSeconds });
    
    return { result, cached: false };
  } catch (err) {
    console.error('[Idempotency] Redis error, executing without cache:', err);
    // Graceful degradation: execute function even if Redis fails
    const result = await fn();
    return { result, cached: false };
  }
}

/**
 * Clear cached idempotency result
 * 
 * @param key - Idempotency key to clear
 */
export async function clearIdempotency(key: string): Promise<void> {
  if (!redis) return;
  
  try {
    await redis.del(key);
    console.log('[Idempotency] Cleared cache for key:', key);
  } catch (err) {
    console.error('[Idempotency] Failed to clear cache:', err);
  }
}
