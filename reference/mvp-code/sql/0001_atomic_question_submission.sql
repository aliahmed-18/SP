CREATE OR REPLACE FUNCTION public.record_question(_session_id uuid, _device_hash text, _text text, _blocked boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  live_status text;
  saved_count bigint;
  last_saved timestamptz;
BEGIN
  SELECT status INTO live_status FROM public.sessions WHERE id = _session_id FOR UPDATE;
  IF live_status IS DISTINCT FROM 'LIVE' THEN RETURN false; END IF;
  IF _blocked THEN
    UPDATE public.sessions SET flagged_count = flagged_count + 1, flagged_total = flagged_total + 1,
      activity_version = activity_version + 1 WHERE id = _session_id;
    RETURN true;
  END IF;
  IF _text IS NULL OR char_length(_text) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Invalid question length';
  END IF;
  SELECT count(*), max(created_at) INTO saved_count, last_saved FROM public.questions
    WHERE session_id = _session_id AND device_hash = _device_hash;
  IF saved_count >= 40 OR last_saved > clock_timestamp() - interval '5 seconds' THEN RETURN true; END IF;
  INSERT INTO public.questions(session_id, device_hash, text) VALUES (_session_id, _device_hash, _text);
  UPDATE public.sessions SET activity_version = activity_version + 1 WHERE id = _session_id;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_question(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_question(uuid, text, text, boolean) TO service_role;