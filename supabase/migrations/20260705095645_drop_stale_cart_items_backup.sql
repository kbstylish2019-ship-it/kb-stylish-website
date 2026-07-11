-- CATCH-UP: applied to live DB via MCP 2026-07-05. Standalone hygiene change (not loyalty):
-- stale 2026-01-17 combo-migration backup table, RLS-disabled in the exposed public schema.
-- Verified zero references in web/mobile code before dropping (8 rows of January cart data).
DROP TABLE public.cart_items_backup_20260117;
