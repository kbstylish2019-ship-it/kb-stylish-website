// ============================================================================
// BOOKING REMINDER WORKER (CRON JOB)
// Purpose: Send 24-hour reminder emails for upcoming appointments
// Schedule: Every hour (0 * * * *)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

Deno.serve(async (req) => {
  try {
    console.log('[BookingReminder] Cron job started');
    
    // Verify this is a cron request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Query bookings 24-25 hours in future
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        customer_email,
        customer_name,
        start_time,
        service_name,
        stylist_user_id,
        stylist_profiles!inner(
          user_id,
          user_profiles!inner(display_name)
        )
      `)
      .eq('status', 'confirmed')
      .is('reminder_sent_at', null)
      .gte('start_time', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .lt('start_time', new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString())
      .limit(100);
    
    if (error) {
      console.error('[BookingReminder] Query error:', error);
      throw error;
    }
    
    if (!bookings || bookings.length === 0) {
      console.log('[BookingReminder] No bookings to remind');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[BookingReminder] Found ${bookings.length} bookings`);
    
    // Process in batches of 20
    const BATCH_SIZE = 20;
    let processed = 0;
    let failed = 0;
    
    for (let i = 0; i < bookings.length; i += BATCH_SIZE) {
      const batch = bookings.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(async (booking: any) => {
          try {
            const stylistName = booking.stylist_profiles?.user_profiles?.display_name || 'Your stylist';
            const startTime = new Date(booking.start_time);
            
            // Send email
            const { error: emailError } = await supabase.functions.invoke('send-email', {
              body: {
                email_type: 'booking_reminder',
                recipient_email: booking.customer_email,
                recipient_name: booking.customer_name,
                reference_id: booking.id,
                reference_type: 'booking_reminder',
                template_data: {
                  customerName: booking.customer_name || 'Valued Customer',
                  stylistName: stylistName,
                  serviceName: booking.service_name,
                  appointmentDate: startTime.toLocaleDateString('en-NP', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  }),
                  appointmentTime: startTime.toLocaleTimeString('en-NP', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  }),
                  duration: '60 minutes', // Default
                  rescheduleUrl: `https://kbstylish.com.np/bookings/${booking.id}/reschedule`,
                  viewDetailsUrl: `https://kbstylish.com.np/bookings/${booking.id}`,
                },
              },
            });
            
            if (emailError) throw emailError;
            
            // Mark as sent
            await supabase
              .from('bookings')
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq('id', booking.id);
            
            console.log(`[BookingReminder] Sent for booking ${booking.id}`);
            return { success: true, booking_id: booking.id };
            
          } catch (err) {
            console.error(`[BookingReminder] Failed for ${booking.id}:`, err);
            return { success: false, booking_id: booking.id, error: err };
          }
        })
      );
      
      // Count successes/failures
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          processed++;
        } else {
          failed++;
        }
      });
    }
    
    console.log(`[BookingReminder] Complete: ${processed} sent, ${failed} failed`);
    
    return new Response(JSON.stringify({ 
      processed, 
      failed,
      total: bookings.length 
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[BookingReminder] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
