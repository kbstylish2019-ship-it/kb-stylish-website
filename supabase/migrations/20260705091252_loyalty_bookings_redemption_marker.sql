-- CATCH-UP MIGRATION: already applied to the live DB via Supabase MCP on 2026-07-05.
-- Rollback: ALTER TABLE public.bookings DROP COLUMN is_reward_redemption;
ALTER TABLE public.bookings ADD COLUMN is_reward_redemption boolean NULL DEFAULT false;
COMMENT ON COLUMN public.bookings.is_reward_redemption IS 'TRUE when booking was paid with a loyalty free-booking voucher. Redemption bookings never earn stamps.';
