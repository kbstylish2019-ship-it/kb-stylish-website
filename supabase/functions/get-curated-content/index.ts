import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';
import { createDualClients, errorResponse } from '../_shared/auth.ts';
/**
 * Curation & Ranking Engine API v1.0
 * 
 * Production-Grade Edge Function for serving curated content
 * Blueprint: Fortress Architecture v2.1
 * 
 * Features:
 * - Trending Products (hybrid ranking with 4-tier fallback)
 * - Featured Brands (admin-controlled)
 * - Product Recommendations (self-healing, auto-filters inactive/out-of-stock)
 * - Event Tracking (analytics for CTR/conversion)
 * 
 * Caching Strategy (Cache-Aside Pattern):
 * - L1: Upstash Redis (5-minute TTL, <10ms latency)
 * - L2: PostgreSQL RPC (50-200ms latency)
 * - Graceful degradation: Site stays up if Redis fails
 * - Cache stampede mitigation: Acceptable for MVP (max 1 stampede per 5 min)
 * 
 * Security:
 * - Public read access (no auth required for GET operations)
 * - RLS enforced at database level
 * - Anonymous event tracking allowed (for analytics)
 * - Input validation for UUIDs
 * 
 * Actions:
 * - fetch_trending_products: GET ?action=fetch_trending_products&limit=20
 * - fetch_featured_brands: GET ?action=fetch_featured_brands&limit=6
 * - fetch_recommendations: GET ?action=fetch_recommendations&product_id=[UUID]&limit=4
 * - track_event: POST ?action=track_event (body: { event_type, curation_type, ... })
 */ // =====================================================================
// REDIS CONFIGURATION
// =====================================================================
const REDIS_URL = Deno.env.get('KV_REST_API_URL') || Deno.env.get('UPSTASH_REDIS_REST_URL');
const REDIS_TOKEN = Deno.env.get('KV_REST_API_TOKEN') || Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
const CACHE_TTL = 300; // 5 minutes (300 seconds)
// Cache key prefixes (consistent with apiClient.ts)
const CACHE_PREFIX = {
  TRENDING: 'curation:trending:',
  BRANDS: 'curation:brands:',
  RECOMMENDATIONS: 'curation:rec:',
  STYLISTS: 'curation:stylists:'
};
// =====================================================================
// CACHE UTILITIES (Cache-Aside Pattern)
// =====================================================================
/**
 * Fetch from Redis cache using Upstash REST API
 * Returns null on cache miss or Redis failure (graceful degradation)
 */ async function getFromCache(key) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('[Cache] Redis not configured, skipping cache layer');
    return null;
  }
  try {
    const response = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`
      }
    });
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`[Cache] Redis GET failed with status ${response.status}`);
      }
      return null;
    }
    const result = await response.json();
    // Upstash returns { result: value } or { result: null }
    if (result.result !== null && result.result !== undefined) {
      console.log(`[Cache] HIT - Key: ${key}`);
      return result.result;
    }
    return null;
  } catch (error) {
    console.warn('[Cache] Redis GET error (falling back to DB):', error);
    return null;
  }
}
/**
 * Write to Redis cache using Upstash REST API
 * Fire-and-forget: Errors are logged but don't block response
 */ async function setCache(key, value) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    // Upstash REST API: POST /set/:key with body containing value and options
    const response = await fetch(`${REDIS_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: value,
        ex: CACHE_TTL
      })
    });
    if (response.ok) {
      console.log(`[Cache] SET - Key: ${key} (TTL: ${CACHE_TTL}s)`);
    } else {
      console.warn(`[Cache] SET failed with status ${response.status}`);
    }
  } catch (error) {
    console.warn('[Cache] Redis SET error (non-blocking):', error);
  }
}
// =====================================================================
// ACTION HANDLERS
// =====================================================================
/**
 * Handler: Fetch Trending Products
 * 
 * Cache Key Pattern: curation:trending:{limit}
 * Example: curation:trending:20
 * 
 * Database Function: get_trending_products(p_limit)
 * Returns: Hybrid ranking (trending → new arrivals → top rated → active)
 */ async function handleFetchTrending(client, url, cors) {
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const cacheKey = `${CACHE_PREFIX.TRENDING}${limit}`;
  // L1: Try cache first
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      success: true,
      data: cached,
      source: 'cache',
      cached_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
  console.log(`[Trending] Cache MISS - fetching from database (limit: ${limit})`);
  // L2: Fetch from database
  const { data, error } = await client.rpc('get_trending_products', {
    p_limit: limit
  });
  if (error) {
    console.error('[Trending] RPC error:', error);
    return errorResponse(error.message || 'Failed to fetch trending products', 'RPC_ERROR', 500, cors);
  }
  // L3: Write back to cache (fire-and-forget, non-blocking)
  setCache(cacheKey, data).catch((err)=>console.warn('[Trending] Cache write failed:', err));
  return new Response(JSON.stringify({
    success: true,
    data,
    source: 'database',
    fetched_at: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Handler: Fetch Featured Brands
 * 
 * Cache Key Pattern: curation:brands:{limit}
 * Example: curation:brands:6
 * 
 * Database Function: get_featured_brands(p_limit)
 * Returns: Brands where is_featured=true AND has active products
 */ async function handleFetchFeaturedBrands(client, url, cors) {
  const limit = parseInt(url.searchParams.get('limit') || '6');
  const cacheKey = `${CACHE_PREFIX.BRANDS}${limit}`;
  // L1: Try cache first
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      success: true,
      data: cached,
      source: 'cache',
      cached_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
  console.log(`[Featured Brands] Cache MISS - fetching from database (limit: ${limit})`);
  // L2: Fetch from database
  const { data, error } = await client.rpc('get_featured_brands', {
    p_limit: limit
  });
  if (error) {
    console.error('[Featured Brands] RPC error:', error);
    return errorResponse(error.message || 'Failed to fetch featured brands', 'RPC_ERROR', 500, cors);
  }
  // L3: Write back to cache (fire-and-forget, non-blocking)
  setCache(cacheKey, data).catch((err)=>console.warn('[Featured Brands] Cache write failed:', err));
  return new Response(JSON.stringify({
    success: true,
    data,
    source: 'database',
    fetched_at: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Handler: Fetch Product Recommendations
 * 
 * Cache Key Pattern: curation:rec:{product_id}:{limit}
 * Example: curation:rec:550e8400-e29b-41d4-a716-446655440000:4
 * 
 * Database Function: get_product_recommendations(p_source_product_id, p_limit)
 * Returns: Self-healing recommendations (auto-filters inactive/out-of-stock)
 */ async function handleFetchRecommendations(client, url, cors) {
  const productId = url.searchParams.get('product_id');
  const limit = parseInt(url.searchParams.get('limit') || '4');
  // Validate product_id (must be valid UUID)
  if (!productId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
    return errorResponse('Invalid or missing product_id parameter (must be valid UUID)', 'INVALID_INPUT', 400, cors);
  }
  const cacheKey = `${CACHE_PREFIX.RECOMMENDATIONS}${productId}:${limit}`;
  // L1: Try cache first
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      success: true,
      data: cached,
      source: 'cache',
      cached_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
  console.log(`[Recommendations] Cache MISS - fetching from database (product: ${productId}, limit: ${limit})`);
  // L2: Fetch from database
  const { data, error } = await client.rpc('get_product_recommendations', {
    p_source_product_id: productId,
    p_limit: limit
  });
  if (error) {
    console.error('[Recommendations] RPC error:', error);
    return errorResponse(error.message || 'Failed to fetch recommendations', 'RPC_ERROR', 500, cors);
  }
  // L3: Write back to cache (fire-and-forget, non-blocking)
  setCache(cacheKey, data).catch((err)=>console.warn('[Recommendations] Cache write failed:', err));
  return new Response(JSON.stringify({
    success: true,
    data,
    source: 'database',
    fetched_at: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Handler: Fetch Featured Stylists
 * 
 * Cache Key Pattern: curation:stylists:{limit}
 * Example: curation:stylists:6
 * 
 * Database Function: get_featured_stylists(p_limit)
 * Returns: Stylists where is_featured=true AND is_active=true with avatar_url from user_profiles
 */ async function handleFetchFeaturedStylists(client, url, cors) {
  const limit = parseInt(url.searchParams.get('limit') || '6');
  const cacheKey = `${CACHE_PREFIX.STYLISTS}${limit}`;
  // L1: Try cache first
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      success: true,
      data: cached,
      source: 'cache',
      cached_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
  console.log(`[Featured Stylists] Cache MISS - fetching from database (limit: ${limit})`);
  // L2: Fetch from database
  const { data, error } = await client.rpc('get_featured_stylists', {
    p_limit: limit
  });
  if (error) {
    console.error('[Featured Stylists] RPC error:', error);
    return errorResponse(error.message || 'Failed to fetch featured stylists', 'RPC_ERROR', 500, cors);
  }
  // L3: Write back to cache (fire-and-forget, non-blocking)
  setCache(cacheKey, data).catch((err)=>console.warn('[Featured Stylists] Cache write failed:', err));
  return new Response(JSON.stringify({
    success: true,
    data,
    source: 'database',
    fetched_at: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * Handler: Track Curation Event
 * 
 * No caching (write operation)
 * Inserts into curation_events table for analytics
 * 
 * Required fields: event_type, curation_type
 * Optional fields: source_id, target_id, session_id
 */ async function handleTrackEvent(client, req, cors) {
  try {
    const body = await req.json();
    const { event_type, curation_type, source_id, target_id, session_id } = body;
    // Validate required fields
    if (!event_type || !curation_type) {
      return errorResponse('Missing required fields: event_type, curation_type', 'INVALID_INPUT', 400, cors);
    }
    // Validate event_type enum
    const validEventTypes = [
      'view',
      'click',
      'add_to_cart',
      'purchase'
    ];
    if (!validEventTypes.includes(event_type)) {
      return errorResponse(`Invalid event_type. Must be one of: ${validEventTypes.join(', ')}`, 'INVALID_INPUT', 400, cors);
    }
    // Validate curation_type enum
    const validCurationTypes = [
      'trending_products',
      'featured_brands',
      'product_recommendations',
      'featured_stylists'
    ];
    if (!validCurationTypes.includes(curation_type)) {
      return errorResponse(`Invalid curation_type. Must be one of: ${validCurationTypes.join(', ')}`, 'INVALID_INPUT', 400, cors);
    }
    console.log(`[Track Event] ${curation_type} - ${event_type} - Target: ${target_id || 'N/A'}`);
    // Insert event (RLS allows public insert)
    const { error } = await client.from('curation_events').insert({
      event_type,
      curation_type,
      source_id: source_id || null,
      target_id: target_id || null,
      session_id: session_id || null
    });
    if (error) {
      console.error('[Track Event] Insert error:', error);
      return errorResponse(error.message || 'Failed to track event', 'INSERT_ERROR', 500, cors);
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Event tracked successfully'
    }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[Track Event] Parse error:', error);
    return errorResponse('Invalid JSON body', 'PARSE_ERROR', 400, cors);
  }
}
// =====================================================================
// MAIN EDGE FUNCTION HANDLER
// =====================================================================
Deno.serve(async (req)=>{
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);
  // Handle OPTIONS preflight for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    });
  }
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (!action) {
      return errorResponse('Missing required query parameter: action', 'MISSING_ACTION', 400, cors);
    }
    // Create Supabase clients
    // serviceClient needed for RPC calls (functions have SECURITY INVOKER but need service_role to execute)
    // userClient used only for tracking events (no auth required)
    const { userClient, serviceClient } = createDualClients(req.headers.get('Authorization'));
    // Route to appropriate handler based on action
    switch(action){
      case 'fetch_trending_products':
        return await handleFetchTrending(serviceClient, url, cors);
      case 'fetch_featured_brands':
        return await handleFetchFeaturedBrands(serviceClient, url, cors);
      case 'fetch_recommendations':
        return await handleFetchRecommendations(serviceClient, url, cors);
      case 'fetch_featured_stylists':
        return await handleFetchFeaturedStylists(serviceClient, url, cors);
      case 'track_event':
        return await handleTrackEvent(userClient, req, cors);
      default:
        return errorResponse(`Unknown action: ${action}. Valid actions: fetch_trending_products, fetch_featured_brands, fetch_recommendations, fetch_featured_stylists, track_event`, 'INVALID_ACTION', 400, cors);
    }
  } catch (error) {
    console.error('[Curation API] Unhandled error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500, cors);
  }
});
console.log('[Curation API] Edge Function started successfully');
console.log('[Curation API] Redis caching:', REDIS_URL ? 'ENABLED' : 'DISABLED');
console.log('[Curation API] Cache TTL:', `${CACHE_TTL}s (${CACHE_TTL / 60} minutes)`);
