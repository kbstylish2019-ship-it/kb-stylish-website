-- Create get_top_stylists for About page
CREATE OR REPLACE FUNCTION public.get_top_stylists(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
    stylist_id UUID,
    display_name TEXT,
    title TEXT,
    bio TEXT,
    years_experience INTEGER,
    specialties TEXT[],
    rating_average NUMERIC,
    total_bookings INTEGER,
    avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id as stylist_id,
        sp.display_name,
        sp.title,
        sp.bio,
        sp.years_experience,
        sp.specialties,
        sp.rating_average,
        sp.total_bookings,
        up.avatar_url
    FROM public.stylist_profiles sp
    LEFT JOIN public.user_profiles up ON sp.user_id = up.id
    WHERE sp.is_active = TRUE
    ORDER BY 
        sp.total_bookings DESC NULLS LAST, 
        sp.rating_average DESC NULLS LAST,
        sp.created_at ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_stylists TO anon, authenticated;
