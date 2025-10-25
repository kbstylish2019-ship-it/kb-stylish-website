-- ============================================================================
-- AUTO-UPDATE STYLIST RATING AVERAGE
-- ============================================================================
-- When a rating is created/updated/deleted, automatically recalculate the
-- stylist's average rating and update stylist_profiles table
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_stylist_rating_average()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_stylist_id UUID;
  v_avg_rating NUMERIC;
  v_total_ratings INT;
BEGIN
  -- Determine which stylist to update
  IF TG_OP = 'DELETE' THEN
    v_stylist_id := OLD.stylist_user_id;
  ELSE
    v_stylist_id := NEW.stylist_user_id;
  END IF;

  -- Calculate average rating for approved ratings only
  SELECT 
    ROUND(AVG(rating)::numeric, 2),
    COUNT(*)
  INTO v_avg_rating, v_total_ratings
  FROM stylist_ratings
  WHERE stylist_user_id = v_stylist_id
    AND is_approved = TRUE
    AND moderation_status = 'approved';

  -- Update stylist profile
  UPDATE stylist_profiles
  SET 
    rating_average = COALESCE(v_avg_rating, 0),
    updated_at = NOW()
  WHERE user_id = v_stylist_id;

  -- Log for debugging
  RAISE NOTICE 'Updated stylist % rating: avg=%, total=%', 
    v_stylist_id, v_avg_rating, v_total_ratings;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_stylist_rating_average_trigger ON stylist_ratings;

-- Create trigger for INSERT, UPDATE, DELETE
CREATE TRIGGER update_stylist_rating_average_trigger
  AFTER INSERT OR UPDATE OR DELETE ON stylist_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_stylist_rating_average();

-- ============================================================================
-- BACKFILL EXISTING RATINGS
-- ============================================================================
-- Update all existing stylists' average ratings
DO $$
DECLARE
  v_stylist RECORD;
  v_avg_rating NUMERIC;
  v_total_ratings INT;
BEGIN
  FOR v_stylist IN 
    SELECT DISTINCT user_id FROM stylist_profiles WHERE is_active = TRUE
  LOOP
    -- Calculate average
    SELECT 
      ROUND(AVG(rating)::numeric, 2),
      COUNT(*)
    INTO v_avg_rating, v_total_ratings
    FROM stylist_ratings
    WHERE stylist_user_id = v_stylist.user_id
      AND is_approved = TRUE
      AND moderation_status = 'approved';

    -- Update profile
    UPDATE stylist_profiles
    SET rating_average = COALESCE(v_avg_rating, 0)
    WHERE user_id = v_stylist.user_id;

    RAISE NOTICE 'Backfilled stylist %: avg=%, total=%', 
      v_stylist.user_id, COALESCE(v_avg_rating, 0), COALESCE(v_total_ratings, 0);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_stylist_rating_average IS 
'Automatically updates stylist average rating when ratings are created, updated, or deleted. Only counts approved ratings.';
