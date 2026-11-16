REVOKE SELECT ON public.sessions FROM anon,authenticated;
GRANT SELECT (id,status,activity_version,public_version,live_activity_id) ON public.sessions TO anon,authenticated;