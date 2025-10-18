/**
 * Rate Limiting Utility
 * 
 * Distributed rate limiting using Redis sorted sets.
 * Prevents abuse by limiting requests per user per time window.
 * 
 * @module lib/rate-limit
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = process.env.UPSTASH_REDIS_URL ? new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
}) : null;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt?: number;
}

/**
 * Check if user is within rate limit
 * 
 * Uses sliding window algorithm with Redis sorted sets.
 * 
 * @param userId - User ID to check
 * @param limit - Maximum requests allowed (default: 10)
 * @param windowSeconds - Time window in seconds (default: 60)
 * @returns Rate limit result with allowed flag and remaining count
 * 
 * @example
 * const { allowed, remaining } = await checkRateLimit(userId, 10, 60);
 * if (!allowed) {
 *   return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
 * }
 */
export async function checkRateLimit(
  userId: string,
  limit: number = 10,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  // Dev mode - always allow
  if (!redis) {
    return { allowed: true, remaining: limit };
  }
  
  const key = `ratelimit:override:${userId}`;
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  try {
    // Remove entries outside the current window
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Count requests in current window
    const count = await redis.zcard(key);
    
    // Check if limit exceeded
    if (count >= limit) {
      // Get oldest request timestamp to calculate reset time
      const oldestRequests = await redis.zrange(key, 0, 0, { withScores: true });
      const resetAt = oldestRequests.length > 0 
        ? (oldestRequests[0].score as number) + (windowSeconds * 1000)
        : now + (windowSeconds * 1000);
      
      return { 
        allowed: false, 
        remaining: 0,
        resetAt
      };
    }
    
    // Add current request to set
    await redis.zadd(key, { score: now, member: `${now}-${Math.random()}` });
    
    // Set expiry on key
    await redis.expire(key, windowSeconds);
    
    return { 
      allowed: true, 
      remaining: limit - count - 1 
    };
  } catch (err) {
    console.error('[RateLimit] Redis error, allowing request:', err);
    // Graceful degradation: allow request if Redis fails
    return { allowed: true, remaining: limit };
  }
}

/**
 * Reset rate limit for a user
 * 
 * @param userId - User ID to reset
 */
export async function resetRateLimit(userId: string): Promise<void> {
  if (!redis) return;
  
  const key = `ratelimit:override:${userId}`;
  
  try {
    await redis.del(key);
    console.log('[RateLimit] Reset rate limit for user:', userId);
  } catch (err) {
    console.error('[RateLimit] Failed to reset rate limit:', err);
  }
}

/**
 * Get current rate limit status for a user
 * 
 * @param userId - User ID to check
 * @param limit - Maximum requests allowed
 * @param windowSeconds - Time window in seconds
 * @returns Current count and limit
 */
export async function getRateLimitStatus(
  userId: string,
  limit: number = 10,
  windowSeconds: number = 60
): Promise<{ count: number; limit: number; remaining: number }> {
  if (!redis) {
    return { count: 0, limit, remaining: limit };
  }
  
  const key = `ratelimit:override:${userId}`;
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  try {
    // Remove expired entries
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Get current count
    const count = await redis.zcard(key);
    
    return {
      count,
      limit,
      remaining: Math.max(0, limit - count)
    };
  } catch (err) {
    console.error('[RateLimit] Failed to get status:', err);
    return { count: 0, limit, remaining: limit };
  }
}
