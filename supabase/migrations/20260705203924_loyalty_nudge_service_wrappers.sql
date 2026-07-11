-- CATCH-UP: applied to live DB via MCP 2026-07-05.
-- Service-role-only public wrappers so the nudge worker can call via PostgREST.
BEGIN;
CREATE FUNCTION public.get_loyalty_nudge_candidates_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Access denied - service role required' USING ERRCODE = '42501';
  END IF;
  RETURN private.get_loyalty_nudge_candidates();
END;
$$;
REVOKE ALL ON FUNCTION public.get_loyalty_nudge_candidates_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_loyalty_nudge_candidates_v1() TO service_role;

CREATE FUNCTION public.record_loyalty_nudge_v1(p_user_id uuid, p_nudge_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Access denied - service role required' USING ERRCODE = '42501';
  END IF;
  PERFORM private.record_loyalty_nudge(p_user_id, p_nudge_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_loyalty_nudge_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_loyalty_nudge_v1(uuid, text) TO service_role;
COMMIT;
