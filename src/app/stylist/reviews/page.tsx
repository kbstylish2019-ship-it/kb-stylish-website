import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StylistSidebar from '@/components/stylist/StylistSidebar';
import StylistReviewsClient from '@/components/stylist/StylistReviewsClient';

async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

export default async function StylistReviewsPage() {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  // Verify stylist role
  const { data: isStylist } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'stylist'
  });

  if (!isStylist) {
    redirect('/');
  }

  // Fetch stylist's ratings and reviews
  const { data: ratings, error } = await supabase
    .from('stylist_ratings')
    .select(`
      id,
      rating,
      review_text,
      created_at,
      is_approved,
      moderation_status,
      helpful_votes,
      unhelpful_votes,
      stylist_response,
      responded_at,
      bookings!stylist_ratings_booking_id_fkey (
        id,
        customer_name,
        customer_user_id,
        start_time,
        services!bookings_service_id_fkey (
          name
        )
      )
    `)
    .eq('stylist_user_id', user.id)
    .eq('is_approved', true)
    .order('created_at', { ascending: false });

  // Fetch user_profiles separately (FK exists but points to auth.users, not user_profiles)
  let profilesMap = new Map();
  if (ratings && ratings.length > 0) {
    const customerIds = ratings
      .map(r => {
        // PostgREST may return bookings as array or single object
        const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
        return booking?.customer_user_id;
      })
      .filter(Boolean);
    
    if (customerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', customerIds);
      
      profiles?.forEach(p => profilesMap.set(p.id, p));
    }
  }

  // Merge profiles into ratings  
  const ratingsWithProfiles = ratings?.map(rating => {
    // PostgREST may return bookings as array or single object
    const booking = Array.isArray(rating.bookings) ? rating.bookings[0] : rating.bookings;
    const service = booking?.services ? (Array.isArray(booking.services) ? booking.services[0] : booking.services) : null;
    
    return {
      ...rating,
      bookings: booking ? {
        id: booking.id,
        customer_name: booking.customer_name,
        customer_user_id: booking.customer_user_id,
        start_time: booking.start_time,
        services: service,
        customer_profiles: profilesMap.get(booking.customer_user_id) || null
      } : null
    };
  });

  if (error) {
    console.error('Error fetching ratings:', error);
  }

  // Calculate statistics using merged data
  const totalReviews = ratingsWithProfiles?.length || 0;
  const averageRating = totalReviews > 0
    ? (ratingsWithProfiles?.reduce((sum, r) => sum + r.rating, 0) || 0) / totalReviews
    : 0;

  const ratingDistribution = {
    5: ratingsWithProfiles?.filter(r => r.rating === 5).length || 0,
    4: ratingsWithProfiles?.filter(r => r.rating === 4).length || 0,
    3: ratingsWithProfiles?.filter(r => r.rating === 3).length || 0,
    2: ratingsWithProfiles?.filter(r => r.rating === 2).length || 0,
    1: ratingsWithProfiles?.filter(r => r.rating === 1).length || 0,
  };

  return (
    <DashboardLayout title="Reviews & Ratings" sidebar={<StylistSidebar />}>
      <StylistReviewsClient
        ratings={ratingsWithProfiles || []}
        stats={{
          totalReviews,
          averageRating,
          ratingDistribution
        }}
      />
    </DashboardLayout>
  );
}
