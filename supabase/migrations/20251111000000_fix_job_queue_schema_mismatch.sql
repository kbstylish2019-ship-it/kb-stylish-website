-- ============================================================================
-- CRITICAL PRODUCTION FIX: Job Queue Schema Mismatch
-- Migration: Add missing columns to job_queue table
-- Created: 2025-11-11 00:00:00
-- Author: Production Incident Response Team
-- ============================================================================

-- PROBLEM:
-- The verify-payment Edge Function inserts jobs with column names that don't exist:
-- - Uses 'payload' but table has 'job_data'
-- - Uses 'idempotency_key' but column doesn't exist
-- This causes silent failures - jobs are never enqueued, orders are never created.

-- SOLUTION:
-- Add missing idempotency_key column with unique constraint
-- Keep existing columns for backward compatibility

-- ============================================================================
-- STEP 1: Add idempotency_key column
-- ============================================================================

ALTER TABLE public.job_queue 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Add unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_idempotency_key 
ON public.job_queue(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- STEP 2: Add payload column as alias/copy of job_data
-- ============================================================================

-- Add payload column (same as job_data for now)
ALTER TABLE public.job_queue 
ADD COLUMN IF NOT EXISTS payload JSONB;

-- Backfill existing jobs (copy job_data to payload)
UPDATE public.job_queue 
SET payload = job_data 
WHERE payload IS NULL AND job_data IS NOT NULL;

-- ============================================================================
-- STEP 3: Add attempts and max_attempts columns
-- ============================================================================

ALTER TABLE public.job_queue 
ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

ALTER TABLE public.job_queue 
ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3;

-- Backfill from existing columns
UPDATE public.job_queue 
SET attempts = COALESCE(retry_count, 0),
    max_attempts = COALESCE(max_retries, 3)
WHERE attempts IS NULL OR max_attempts IS NULL;

-- ============================================================================
-- STEP 4: Update acquire_next_job function to use new columns
-- ============================================================================

DROP FUNCTION IF EXISTS public.acquire_next_job(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.acquire_next_job(
    p_worker_id TEXT,
    p_lock_timeout_seconds INTEGER DEFAULT 30
) RETURNS TABLE (
    id UUID,
    job_type TEXT,
    payload JSONB,
    attempts INTEGER,
    max_attempts INTEGER
) AS $$
BEGIN
    RETURN QUERY
    UPDATE job_queue jq
    SET 
        status = 'processing',
        locked_by = p_worker_id,
        locked_at = NOW(),
        locked_until = NOW() + (p_lock_timeout_seconds || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE jq.id = (
        SELECT jq2.id 
        FROM job_queue jq2
        WHERE jq2.status = 'pending'
            AND (jq2.scheduled_for IS NULL OR jq2.scheduled_for <= NOW())
            AND (
                jq2.locked_until IS NULL 
                OR jq2.locked_until < NOW()
            )
        ORDER BY jq2.priority ASC, jq2.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING 
        jq.id,
        jq.job_type,
        COALESCE(jq.payload, jq.job_data) AS payload,  -- Use new column, fallback to old
        COALESCE(jq.attempts, jq.retry_count, 0) AS attempts,
        COALESCE(jq.max_attempts, jq.max_retries, 3) AS max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.acquire_next_job(TEXT, INTEGER) TO service_role;

-- ============================================================================
-- STEP 5: Add locked_until column if it doesn't exist
-- ============================================================================

ALTER TABLE public.job_queue 
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Update any currently locked jobs
UPDATE public.job_queue 
SET locked_until = locked_at + INTERVAL '30 seconds'
WHERE status = 'processing' 
    AND locked_at IS NOT NULL 
    AND locked_until IS NULL;

-- ============================================================================
-- STEP 6: Add completed_at and failed_at columns if they don't exist
-- ============================================================================

ALTER TABLE public.job_queue 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- ============================================================================
-- STEP 7: Add index for efficient polling
-- ============================================================================

-- Drop old index if exists
DROP INDEX IF EXISTS idx_job_queue_pending;

-- Create new composite index for efficient job acquisition
CREATE INDEX IF NOT EXISTS idx_job_queue_pending_optimized 
ON public.job_queue (priority ASC, created_at ASC) 
WHERE status = 'pending' 
    AND (scheduled_for IS NULL OR scheduled_for <= NOW())
    AND (locked_until IS NULL OR locked_until < NOW());

-- ============================================================================
-- STEP 8: Add trigger to sync job_data and payload
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_job_queue_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- If payload is set, copy to job_data for backward compatibility
    IF NEW.payload IS NOT NULL AND NEW.job_data IS NULL THEN
        NEW.job_data := NEW.payload;
    END IF;
    
    -- If job_data is set, copy to payload for new code
    IF NEW.job_data IS NOT NULL AND NEW.payload IS NULL THEN
        NEW.payload := NEW.job_data;
    END IF;
    
    -- Sync attempt counters
    IF NEW.attempts IS NOT NULL AND NEW.retry_count IS NULL THEN
        NEW.retry_count := NEW.attempts;
    END IF;
    
    IF NEW.max_attempts IS NOT NULL AND NEW.max_retries IS NULL THEN
        NEW.max_retries := NEW.max_attempts;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_job_queue_columns_trigger ON public.job_queue;

CREATE TRIGGER sync_job_queue_columns_trigger
BEFORE INSERT OR UPDATE ON public.job_queue
FOR EACH ROW
EXECUTE FUNCTION public.sync_job_queue_columns();

-- ============================================================================
-- VERIFICATION QUERY (Run this to verify fix)
-- ============================================================================

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' 
--   AND table_name = 'job_queue'
-- ORDER BY ordinal_position;

COMMENT ON COLUMN public.job_queue.idempotency_key IS 
'Unique key for idempotent job processing. Prevents duplicate jobs from being enqueued.';

COMMENT ON COLUMN public.job_queue.payload IS 
'Job data (alias for job_data, used by Edge Functions)';

COMMENT ON COLUMN public.job_queue.attempts IS 
'Number of processing attempts (alias for retry_count)';

COMMENT ON COLUMN public.job_queue.max_attempts IS 
'Maximum number of attempts before marking as failed (alias for max_retries)';
