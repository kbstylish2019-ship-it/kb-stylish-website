import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Cache Cleanup Worker - Listens to pg_notify and deletes stale cache
 * 
 * This Edge Function listens to the 'cache_invalidate' channel via polling
 * and performs async cache cleanup when bookings/schedules change.
 * 
 * Triggered by: pg_notify from invalidate_availability_cache_async()
 * Performance: Removes 15-20ms blocking time from booking creation
 */

serve(async (req) => {
  try {
    // Only allow POST requests from cron or internal calls
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verify authorization (cron secret or service role)
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${Deno.env.get('CACHE_CLEANUP_SECRET')}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse payload if provided (stylist_id for targeted cleanup)
    const body = await req.json().catch(() => ({}))
    const targetStylistId = body.stylist_id

    // Delete cache entries
    let query = supabase
      .from('availability_cache')
      .delete()
      .gte('cache_date', new Date().toISOString().split('T')[0]) // Today onwards

    // If specific stylist provided, only delete their cache
    if (targetStylistId) {
      query = query.eq('stylist_user_id', targetStylistId)
    }

    const { error, count } = await query

    if (error) {
      console.error('[Cache Cleanup] Error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Cache Cleanup] Deleted ${count || 0} cache entries`)

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: count || 0,
        stylist_id: targetStylistId || 'all'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Cache Cleanup] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
