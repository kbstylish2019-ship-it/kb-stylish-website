/**
 * Cache Invalidator Edge Function
 * Production-Grade Blueprint v2.1
 * 
 * Listens for PostgreSQL NOTIFY events and invalidates Vercel KV cache entries
 * This ensures real-time cache consistency across the distributed system
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Using KV_* variables from Vercel/Upstash integration
const upstashRedisUrl = Deno.env.get('KV_REST_API_URL') || Deno.env.get('UPSTASH_REDIS_REST_URL')!;
const upstashRedisToken = Deno.env.get('KV_REST_API_TOKEN') || Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cache key prefixes matching apiClient.ts
const CACHE_PREFIX = {
  PRODUCT: 'product:',
  VENDOR_PRODUCTS: 'vendor:',
  CATEGORY: 'category:',
  SEARCH_INDEX: 'search:'
};

// Metrics tracking
interface CacheInvalidationMetrics {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

const metrics: CacheInvalidationMetrics = {
  total: 0,
  success: 0,
  failed: 0,
  errors: []
};

/**
 * Invalidates cache entries in Upstash Redis
 */
async function invalidateCache(keys: string[]): Promise<void> {
  if (!keys || keys.length === 0) return;

  for (const key of keys) {
    try {
      metrics.total++;
      
      // Delete from Upstash Redis using REST API
      const response = await fetch(`${upstashRedisUrl}/del/${key}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${upstashRedisToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        metrics.success++;
        console.log(`[CACHE INVALIDATED] Key: ${key}`);
      } else {
        metrics.failed++;
        const error = await response.text();
        console.error(`[CACHE INVALIDATION FAILED] Key: ${key}, Error: ${error}`);
        metrics.errors.push(`${key}: ${error}`);
      }
    } catch (error) {
      metrics.failed++;
      console.error(`[CACHE INVALIDATION ERROR] Key: ${key}`, error);
      metrics.errors.push(`${key}: ${String(error)}`);
    }
  }
}

/**
 * Processes product change notifications
 */
async function processProductChange(payload: any): Promise<void> {
  console.log('[NOTIFICATION RECEIVED]', JSON.stringify(payload));

  try {
    const { product_slug, vendor_id, operation, table, variant_id } = payload;
    
    // Build list of cache keys to invalidate
    const keysToInvalidate: string[] = [];

    // Always invalidate the main product cache
    if (product_slug) {
      keysToInvalidate.push(`${CACHE_PREFIX.PRODUCT}${product_slug}`);
    }

    // Invalidate vendor-specific caches
    if (vendor_id) {
      keysToInvalidate.push(`${CACHE_PREFIX.VENDOR_PRODUCTS}${vendor_id}:products`);
    }

    // For price or inventory changes, invalidate category caches
    if (table === 'product_variants' || table === 'inventory') {
      keysToInvalidate.push(`${CACHE_PREFIX.CATEGORY}products`);
    }

    // Add any additional cache keys from the payload
    if (payload.cache_keys && Array.isArray(payload.cache_keys)) {
      keysToInvalidate.push(...payload.cache_keys);
    }

    // Remove duplicates
    const uniqueKeys = [...new Set(keysToInvalidate)];

    console.log(`[INVALIDATING CACHE] Keys: ${uniqueKeys.join(', ')}`);
    await invalidateCache(uniqueKeys);

    // For significant changes, trigger incremental materialized view refresh
    if (operation === 'INSERT' || operation === 'DELETE') {
      console.log('[TRIGGERING MV REFRESH] Due to:', operation);
      await supabase.rpc('refresh_product_search_index_incremental');
    }

  } catch (error) {
    console.error('[PROCESS ERROR]', error);
    metrics.errors.push(`Processing: ${error}`);
  }
}

/**
 * Main HTTP handler for the edge function
 */
serve(async (req) => {
  try {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        metrics,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Webhook endpoint for receiving notifications
    if (url.pathname === '/notify' && req.method === 'POST') {
      const body = await req.json();
      
      // Validate webhook secret (optional but recommended)
      const webhookSecret = req.headers.get('X-Webhook-Secret');
      const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
      
      if (expectedSecret && webhookSecret !== expectedSecret) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Process the notification asynchronously
      processProductChange(body).catch(console.error);

      return new Response(JSON.stringify({
        message: 'Notification received',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Manual cache invalidation endpoint (for testing)
    if (url.pathname === '/invalidate' && req.method === 'POST') {
      const body = await req.json();
      const { keys } = body;

      if (!keys || !Array.isArray(keys)) {
        return new Response('Invalid request: keys array required', { status: 400 });
      }

      await invalidateCache(keys);

      return new Response(JSON.stringify({
        message: 'Cache invalidated',
        keys,
        metrics,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Reset metrics endpoint (for monitoring)
    if (url.pathname === '/metrics/reset' && req.method === 'POST') {
      metrics.total = 0;
      metrics.success = 0;
      metrics.failed = 0;
      metrics.errors = [];

      return new Response(JSON.stringify({
        message: 'Metrics reset',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Default 404 response
    return new Response('Not Found', { status: 404 });

  } catch (error) {
    console.error('[HANDLER ERROR]', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

console.log('[CACHE INVALIDATOR] Edge function started successfully');
console.log('[CACHE INVALIDATOR] Listening for product change notifications...');
