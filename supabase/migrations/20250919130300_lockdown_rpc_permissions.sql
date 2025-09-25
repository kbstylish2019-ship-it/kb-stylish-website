-- Lock down EXECUTE privileges for secure RPCs to service_role only
-- Created: 2025-09-19 13:03:00

BEGIN;

-- Revoke from PUBLIC and web roles
REVOKE EXECUTE ON FUNCTION public.verify_guest_session(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_cart_secure(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cart_details_secure(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_to_cart_secure(UUID, TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_cart_item_secure(UUID, TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_item_secure(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_cart_secure(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_carts_secure(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Grant only to service_role (server-side only)
GRANT EXECUTE ON FUNCTION public.verify_guest_session(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_cart_secure(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cart_details_secure(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_to_cart_secure(UUID, TEXT, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_cart_item_secure(UUID, TEXT, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_item_secure(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_cart_secure(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_carts_secure(UUID, TEXT) TO service_role;

COMMIT;
