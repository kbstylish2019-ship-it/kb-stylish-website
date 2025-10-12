-- Phase 2: Schedule metrics queue processor via pg_cron (every 5 minutes)
-- Idempotent: re-creates the job if it already exists

-- Ensure extension is available (Supabase has pg_cron installed by default)
-- CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron; -- commented to avoid privilege issues

DO $$
DECLARE
  v_jobid int;
BEGIN
  -- Try to find existing job by name
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'metrics_queue_processor' LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    -- Update schedule/command if needed
    PERFORM cron.alter_job(v_jobid, schedule => '*/5 * * * *', command => 'select private.process_metrics_update_queue(50);');
  ELSE
    -- Create a new job
    PERFORM cron.schedule('metrics_queue_processor', '*/5 * * * *', 'select private.process_metrics_update_queue(50);');
  END IF;
END $$;
