CREATE TABLE public.activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
 type text NOT NULL CHECK(type IN ('QUICK_CHECK','EXPLAIN')), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LIVE','CLOSED','REVEALED')),
 round int NOT NULL DEFAULT 1 CHECK(round IN (1,2)), prompt text NOT NULL, kind text CHECK(kind IN ('MCQ','TRUE_FALSE','NUMERIC')),
 options jsonb NOT NULL DEFAULT '[]', correct jsonb, explanation text, model_answer text, tolerance numeric,
 source text NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('AI','MANUAL')), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX activities_session_idx ON public.activities(session_id);
CREATE UNIQUE INDEX activities_one_live ON public.activities(session_id) WHERE status='LIVE';
CREATE TABLE public.activity_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
 device_hash text NOT NULL, round int NOT NULL DEFAULT 1, answer jsonb NOT NULL, confident boolean, text text, bucket text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(activity_id,device_hash,round)
);
GRANT ALL ON public.activity_responses TO service_role;
ALTER TABLE public.activity_responses ENABLE ROW LEVEL SECURITY;
CREATE INDEX activity_responses_activity_idx ON public.activity_responses(activity_id,round);
CREATE TABLE public.session_participants (
 session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE, device_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,device_hash)
);
GRANT ALL ON public.session_participants TO service_role;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.register_participant(_session_id uuid,_device_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM id FROM public.sessions WHERE id=_session_id AND status='LIVE' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO public.session_participants(session_id,device_hash) VALUES(_session_id,_device_hash) ON CONFLICT DO NOTHING;
 IF FOUND THEN PERFORM public.bump_versions(_session_id,true,false); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.register_participant(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_participant(uuid,text) TO service_role;
CREATE FUNCTION public.quick_check_correct(_answer jsonb,_correct jsonb,_kind text,_tolerance numeric) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN _kind='NUMERIC' AND jsonb_typeof(_answer)='number' AND jsonb_typeof(_correct)='number' THEN abs((_answer#>>'{}')::numeric-(_correct#>>'{}')::numeric)<=coalesce(_tolerance,0) ELSE _answer=_correct END;
$$;
REVOKE ALL ON FUNCTION public.quick_check_correct(jsonb,jsonb,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quick_check_correct(jsonb,jsonb,text,numeric) TO service_role;
CREATE FUNCTION public.create_quick_check(_session_id uuid,_draft jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 PERFORM id FROM public.sessions WHERE id=_session_id AND status='LIVE' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.activities(session_id,type,prompt,kind,options,correct,explanation,tolerance,source)
 VALUES(_session_id,'QUICK_CHECK',_draft->>'prompt',_draft->>'kind',_draft->'options',_draft->'correct',_draft->>'explanation',(_draft->>'tolerance')::numeric,'MANUAL') RETURNING id INTO result;
 PERFORM public.bump_versions(_session_id,true,false); RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_quick_check(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_quick_check(uuid,jsonb) TO service_role;
CREATE FUNCTION public.transition_activity(_session_id uuid,_activity_id uuid,_action text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sess public.sessions; act public.activities; pct numeric;
BEGIN
 SELECT * INTO sess FROM public.sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR sess.status<>'LIVE' OR sess.created_at<=now()-interval '6 hours' THEN RETURN false; END IF;
 SELECT * INTO act FROM public.activities WHERE id=_activity_id AND session_id=_session_id FOR UPDATE;
 IF NOT FOUND OR act.type<>'QUICK_CHECK' THEN RETURN false; END IF;
 IF _action='LAUNCH' THEN
  IF act.status<>'DRAFT' OR sess.live_activity_id IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.activities SET status='LIVE' WHERE id=act.id;
  UPDATE public.sessions SET live_activity_id=act.id WHERE id=sess.id;
 ELSIF _action='CLOSE' THEN
  IF act.status<>'LIVE' OR sess.live_activity_id IS DISTINCT FROM act.id THEN RETURN false; END IF;
  UPDATE public.activities SET status='CLOSED' WHERE id=act.id;
  UPDATE public.sessions SET live_activity_id=NULL WHERE id=sess.id;
 ELSIF _action='REVEAL' THEN
  IF act.status<>'CLOSED' THEN RETURN false; END IF;
  UPDATE public.activities SET status='REVEALED' WHERE id=act.id;
 ELSIF _action='ROUND_2' THEN
  IF act.status<>'CLOSED' OR act.round<>1 OR sess.live_activity_id IS NOT NULL THEN RETURN false; END IF;
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
CREATE FUNCTION public.record_activity_response(_session_id uuid,_activity_id uuid,_device_hash text,_round int,_answer jsonb,_confident boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sess public.sessions; act public.activities;
BEGIN
 SELECT * INTO sess FROM public.sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR sess.status<>'LIVE' OR sess.created_at<=now()-interval '6 hours' OR sess.live_activity_id IS DISTINCT FROM _activity_id THEN RETURN false; END IF;
 SELECT * INTO act FROM public.activities WHERE id=_activity_id AND session_id=_session_id FOR UPDATE;
 IF NOT FOUND OR act.status<>'LIVE' OR act.type<>'QUICK_CHECK' OR act.round<>_round OR _confident IS NULL THEN RETURN false; END IF;
 IF act.kind='MCQ' AND (jsonb_typeof(_answer)<>'number' OR NOT EXISTS (SELECT 1 FROM generate_series(0,jsonb_array_length(act.options)-1) i WHERE to_jsonb(i)=_answer)) THEN RETURN false; END IF;
 IF act.kind='TRUE_FALSE' AND jsonb_typeof(_answer)<>'boolean' THEN RETURN false; END IF;
 IF act.kind='NUMERIC' AND jsonb_typeof(_answer)<>'number' THEN RETURN false; END IF;
 INSERT INTO public.session_participants(session_id,device_hash) VALUES(sess.id,_device_hash) ON CONFLICT DO NOTHING;
 INSERT INTO public.activity_responses(activity_id,device_hash,round,answer,confident) VALUES(act.id,_device_hash,_round,_answer,_confident) ON CONFLICT DO NOTHING;
 IF FOUND THEN PERFORM public.bump_versions(sess.id,true,false); END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.record_activity_response(uuid,uuid,text,int,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_activity_response(uuid,uuid,text,int,jsonb,boolean) TO service_role;
CREATE FUNCTION public.close_activities_on_end() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='ENDED' AND OLD.status='LIVE' THEN
  UPDATE public.activities SET status='CLOSED' WHERE session_id=NEW.id AND status='LIVE'; NEW.live_activity_id=NULL;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER close_activities_when_ended BEFORE UPDATE OF status ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.close_activities_on_end();
REVOKE ALL ON FUNCTION public.close_activities_on_end() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_activities_on_end() TO service_role;