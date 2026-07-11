-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Replaced gen_random_bytes (extensions schema, not on pinned search_path) with
-- md5(gen_random_uuid()) in private.get_or_create_referral_code. The fixed definition
-- is folded into 20260705203304 in this repo for clean replay.
SELECT 1; -- no-op on replay
