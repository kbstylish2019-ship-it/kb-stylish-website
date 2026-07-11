-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- D6 hardening: auto_complete_past_bookings is SECURITY DEFINER with no internal auth
-- check and was EXECUTE-granted to any logged-in user. Verified before applying: no
-- pg_cron job, no web/mobile/edge-function callers (dormant). service_role + definer
-- contexts unaffected. Rollback: GRANT EXECUTE ON FUNCTION
-- public.auto_complete_past_bookings() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_complete_past_bookings() FROM PUBLIC, anon, authenticated;
