ALTER TABLE public.activities ADD COLUMN explain_analysis jsonb;
CREATE TABLE public.explain_submissions (activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE, device_hash text NOT NULL, PRIMARY KEY(activity_id,device_hash));
GRANT ALL ON public.explain_submissions TO service_role;
ALTER TABLE public.explain_submissions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.create_explain(_session_id uuid,_prompt text,_model_answer text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 PERFORM id FROM public.sessions WHERE id=_session_id AND status='LIVE' AND created_at>now()-interval '6 hours' FOR UPDATE;
 IF NOT FOUND OR length(trim(_prompt)) NOT BETWEEN 1 AND 2000 OR length(trim(_model_answer)) NOT BETWEEN 1 AND 2000 THEN RETURN NULL; END IF;
 INSERT INTO public.activities(session_id,type,prompt,model_answer) VALUES(_session_id,'EXPLAIN',_prompt,_model_answer) RETURNING id INTO result;
 PERFORM public.bump_versions(_session_id,true,false); RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_explain(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_explain(uuid,text,text) TO service_role;
CREATE FUNCTION public.record_explain_response(_session_id uuid,_activity_id uuid,_device_hash text,_text text,_blocked boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sess public.sessions; act public.activities;
BEGIN
 SELECT * INTO sess FROM public.sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR sess.status<>'LIVE' OR sess.created_at<=now()-interval '6 hours' OR sess.live_activity_id IS DISTINCT FROM _activity_id THEN RETURN false; END IF;
 SELECT * INTO act FROM public.activities WHERE id=_activity_id AND session_id=_session_id FOR UPDATE;
 IF NOT FOUND OR act.status<>'LIVE' OR act.type<>'EXPLAIN' THEN RETURN false; END IF;
 IF NOT _blocked AND length(_text) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
 INSERT INTO public.explain_submissions(activity_id,device_hash) VALUES(act.id,_device_hash) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN true; END IF;
 INSERT INTO public.session_participants(session_id,device_hash) VALUES(sess.id,_device_hash) ON CONFLICT DO NOTHING;
 IF _blocked THEN
  UPDATE public.sessions SET flagged_count=flagged_count+1,flagged_total=flagged_total+1 WHERE id=sess.id;
 ELSE
  INSERT INTO public.activity_responses(activity_id,device_hash,round,answer,text) VALUES(act.id,_device_hash,1,'null'::jsonb,_text);
 END IF;
 PERFORM public.bump_versions(sess.id,true,false); RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.record_explain_response(uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_explain_response(uuid,uuid,text,text,boolean) TO service_role;
CREATE FUNCTION public.apply_explain_analysis(_session_id uuid,_activity_id uuid,_analysis jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sess public.sessions; act public.activities; item jsonb; total int; assigned int; flagged int;
BEGIN
 SELECT * INTO sess FROM public.sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR sess.status<>'LIVE' OR sess.created_at<=now()-interval '6 hours' THEN RETURN false; END IF;
 SELECT * INTO act FROM public.activities WHERE id=_activity_id AND session_id=sess.id FOR UPDATE;
 IF NOT FOUND OR act.type<>'EXPLAIN' OR act.status<>'CLOSED' THEN RETURN false; END IF;
 IF jsonb_typeof(_analysis->'buckets') IS DISTINCT FROM 'array' OR jsonb_typeof(_analysis->'misconceptions') IS DISTINCT FROM 'array' OR jsonb_array_length(_analysis->'misconceptions')>3 THEN RETURN false; END IF;
 SELECT count(*) INTO total FROM public.activity_responses WHERE activity_id=act.id;
 SELECT count(DISTINCT value->>'responseId') INTO assigned FROM jsonb_array_elements(_analysis->'buckets');
 IF total<>assigned OR assigned<>jsonb_array_length(_analysis->'buckets') THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_analysis->'buckets') LOOP
  IF item->>'bucket' NOT IN ('CORRECT','PARTIAL','MISCONCEPTION','FLAGGED') OR NOT EXISTS(SELECT 1 FROM public.activity_responses WHERE id=(item->>'responseId')::uuid AND activity_id=act.id) THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(_analysis->'buckets') LOOP
  UPDATE public.activity_responses SET bucket=item->>'bucket' WHERE id=(item->>'responseId')::uuid AND activity_id=act.id;
 END LOOP;
 DELETE FROM public.activity_responses WHERE activity_id=act.id AND bucket='FLAGGED';
 GET DIAGNOSTICS flagged=ROW_COUNT;
 UPDATE public.sessions SET flagged_count=flagged_count+flagged,flagged_total=flagged_total+flagged WHERE id=sess.id;
 UPDATE public.activities SET explain_analysis=jsonb_build_object('misconceptions',_analysis->'misconceptions','flaggedCount',coalesce((act.explain_analysis->>'flaggedCount')::int,0)+flagged) WHERE id=act.id;
 PERFORM public.bump_versions(sess.id,true,false); RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.apply_explain_analysis(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_explain_analysis(uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.transition_activity(_session_id uuid,_activity_id uuid,_action text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sess public.sessions; act public.activities; pct numeric;
BEGIN
 SELECT * INTO sess FROM public.sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR sess.status<>'LIVE' OR sess.created_at<=now()-interval '6 hours' THEN RETURN false; END IF;
 SELECT * INTO act FROM public.activities WHERE id=_activity_id AND session_id=_session_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF _action='LAUNCH' THEN
  IF act.status<>'DRAFT' OR sess.live_activity_id IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.activities SET status='LIVE' WHERE id=act.id;
  UPDATE public.sessions SET live_activity_id=act.id WHERE id=sess.id;
 ELSIF _action='CLOSE' THEN
  IF act.status<>'LIVE' OR sess.live_activity_id IS DISTINCT FROM act.id THEN RETURN false; END IF;
  UPDATE public.activities SET status='CLOSED' WHERE id=act.id;
  UPDATE public.sessions SET live_activity_id=NULL WHERE id=sess.id;
 ELSIF _action='REVEAL' THEN
  IF act.type<>'QUICK_CHECK' OR act.status<>'CLOSED' THEN RETURN false; END IF;
  UPDATE public.activities SET status='REVEALED' WHERE id=act.id;
 ELSIF _action='ROUND_2' THEN
  IF act.type<>'QUICK_CHECK' OR act.status<>'CLOSED' OR act.round<>1 OR sess.live_activity_id IS NOT NULL THEN RETURN false; END IF;
  SELECT 100.0*count(*) FILTER (WHERE public.quick_check_correct(answer,act.correct,act.kind,act.tolerance))/nullif(count(*),0) INTO pct FROM public.activity_responses WHERE activity_id=act.id AND round=1;
  IF pct IS NULL OR pct<30 OR pct>70 THEN RETURN false; END IF;
  UPDATE public.activities SET status='LIVE',round=2 WHERE id=act.id;
  UPDATE public.sessions SET live_activity_id=act.id WHERE id=sess.id;
 ELSE RETURN false;
 END IF;
 PERFORM public.bump_versions(sess.id,true,true); RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.transition_activity(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_activity(uuid,uuid,text) TO service_role;