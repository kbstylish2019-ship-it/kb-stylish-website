-- ============================================================================
-- AUTO-CLEANUP EXPIRED RESERVATIONS
-- ============================================================================
-- This ensures expired reservations are automatically cleaned up
-- and slots become available again after TTL expires
-- ============================================================================

-- Create a function to clean up expired reservations
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
    v_cleaned_count INTEGER;
BEGIN
    -- Update expired reservations to 'expired' status
    UPDATE booking_reservations
    SET 
        status = 'expired',
        updated_at = NOW()
    WHERE 
        status = 'reserved'
        AND expires_at < NOW();
    
    GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
    
    -- Log the cleanup
    IF v_cleaned_count > 0 THEN
        RAISE NOTICE 'Cleaned up % expired reservations', v_cleaned_count;
    END IF;
    
    RETURN v_cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reservations TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reservations TO authenticated;

-- Create a periodic cleanup job (if using pg_cron extension)
-- This runs every minute to clean up expired reservations
-- Note: pg_cron must be enabled in Supabase dashboard
DO $$
BEGIN
    -- Check if pg_cron extension exists
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Schedule cleanup job
        PERFORM cron.schedule(
            'cleanup-expired-reservations',
            '* * * * *', -- Every minute
            $$SELECT public.cleanup_expired_reservations();$$
        );
        RAISE NOTICE 'Scheduled automatic cleanup job';
    ELSE
        RAISE NOTICE 'pg_cron not available - manual cleanup or trigger needed';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not schedule cron job: %', SQLERRM;
END;
$$;

-- Also create a trigger to check on every slot query
CREATE OR REPLACE FUNCTION public.check_and_cleanup_before_slot_query()
RETURNS TRIGGER AS $$
BEGIN
    -- Cleanup expired reservations when checking slots
    PERFORM cleanup_expired_reservations();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clean up immediately on migration
SELECT cleanup_expired_reservations();

-- Add comment
COMMENT ON FUNCTION public.cleanup_expired_reservations IS 
'Automatically marks expired reservations as expired so slots become available again after TTL';
