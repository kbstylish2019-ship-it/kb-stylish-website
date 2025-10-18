'use client';

/**
 * Curation Engine Client - Client-Side Only
 * Blueprint v2.1 - Week 3 Frontend Integration
 * 
 * Handles click tracking and analytics for curated content
 * Fire-and-forget pattern - tracking never blocks user interaction
 */

// ============================================
// Types
// ============================================

export interface TrackEventParams {
  eventType: 'view' | 'click' | 'add_to_cart' | 'purchase';
  curationType: 'trending_products' | 'featured_brands' | 'product_recommendations' | 'top_stylists';
  sourceId?: string;
  targetId?: string;
  sessionId?: string;
}

export interface TrackEventResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================
// Session Management
// ============================================

/**
 * Generate or retrieve session ID for tracking
 * Persisted in sessionStorage for the duration of the browser session
 */
function generateSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  
  // Check if session ID exists in sessionStorage
  let sessionId = sessionStorage.getItem('curation_session_id');
  
  if (!sessionId) {
    // Generate new session ID
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('curation_session_id', sessionId);
  }
  
  return sessionId;
}

// ============================================
// Tracking API
// ============================================

/**
 * Track curation event (click, view, add_to_cart, purchase)
 * 
 * Client-side only - fire and forget for performance
 * Non-blocking - tracking failures are logged but don't throw
 * 
 * @param params - Event tracking parameters
 * @returns Promise with response (doesn't block UI)
 * 
 * @example
 * trackCurationEvent({
 *   eventType: 'click',
 *   curationType: 'trending_products',
 *   targetId: productId,
 * }).catch(console.warn);
 */
export async function trackCurationEvent(params: TrackEventParams): Promise<TrackEventResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    console.warn('[Curation Tracking] Missing Supabase environment variables');
    return { success: false, error: 'Missing configuration' };
  }
  
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=track_event`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: params.eventType,
          curation_type: params.curationType,
          source_id: params.sourceId || null,
          target_id: params.targetId || null,
          session_id: params.sessionId || generateSessionId(),
        }),
      }
    );
    
    if (!response.ok) {
      const data = await response.json();
      console.warn('[Curation Tracking] Tracking failed (non-blocking):', data);
      return { success: false, error: data.error || 'Tracking failed' };
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('[Curation Tracking] Failed to track event (non-blocking):', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Track product view event
 * Convenience wrapper for tracking views
 */
export async function trackProductView(
  productId: string,
  curationType: TrackEventParams['curationType']
): Promise<TrackEventResponse> {
  return trackCurationEvent({
    eventType: 'view',
    curationType,
    targetId: productId,
  });
}

/**
 * Track product click event
 * Convenience wrapper for tracking clicks
 */
export async function trackProductClick(
  productId: string,
  curationType: TrackEventParams['curationType'],
  sourceId?: string
): Promise<TrackEventResponse> {
  return trackCurationEvent({
    eventType: 'click',
    curationType,
    targetId: productId,
    sourceId,
  });
}

/**
 * Track add to cart event
 * Convenience wrapper for tracking add-to-cart actions
 */
export async function trackAddToCart(
  productId: string,
  curationType: TrackEventParams['curationType'],
  sourceId?: string
): Promise<TrackEventResponse> {
  return trackCurationEvent({
    eventType: 'add_to_cart',
    curationType,
    targetId: productId,
    sourceId,
  });
}

/**
 * Track purchase event
 * Convenience wrapper for tracking purchases
 */
export async function trackPurchase(
  productId: string,
  curationType: TrackEventParams['curationType'],
  sourceId?: string
): Promise<TrackEventResponse> {
  return trackCurationEvent({
    eventType: 'purchase',
    curationType,
    targetId: productId,
    sourceId,
  });
}
