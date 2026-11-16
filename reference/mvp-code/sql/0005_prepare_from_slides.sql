CREATE TABLE public.lecture_context (session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE, text text NOT NULL CHECK (length(text) BETWEEN 1 AND 1000000), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.lecture_context TO service_role;
ALTER TABLE public.lecture_context ENABLE ROW LEVEL SECURITY;
INSERT INTO public.lecture_context(session_id,text) SELECT id,lecture_context FROM public.sessions WHERE lecture_context IS NOT NULL AND length(trim(lecture_context)) BETWEEN 1 AND 1000000;
COMMENT ON COLUMN public.sessions.lecture_context IS 'DEPRECATED: replaced by public.lecture_context';
CREATE TABLE public.takeaway_drafts (session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE, key_points jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.takeaway_drafts TO service_role;
ALTER TABLE public.takeaway_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ADD COLUMN confirmed boolean NOT NULL DEFAULT true;
CREATE FUNCTION public.guard_ai_launch() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.status='LIVE' AND NEW.source='AI' AND NOT NEW.confirmed THEN RAISE EXCEPTION 'Review and confirm the AI draft before launch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_ai_launch BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_ai_launch();
CREATE FUNCTION public.save_lecture_context(_session_id uuid,_text text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
PERFORM id FROM public.sessions WHERE id=_session_id AND status='LIVE' AND created_at>now()-interval '6 hours' FOR UPDATE;
IF NOT FOUND OR length(trim(_text)) NOT BETWEEN 1 AND 1000000 THEN RETURN false; END IF;
INSERT INTO public.lecture_context(session_id,text) VALUES(_session_id,_text) ON CONFLICT(session_id) DO UPDATE SET text=EXCLUDED.text,created_at=clock_timestamp();
PERFORM public.bump_versions(_session_id,true,false); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.save_lecture_context(uuid,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.save_lecture_context(uuid,text) TO service_role;
CREATE FUNCTION public.save_slide_drafts(_session_id uuid,_context_text text,_draft jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE item jsonb; BEGIN
PERFORM id FROM public.sessions WHERE id=_session_id AND status='LIVE' AND created_at>now()-interval '6 hours' FOR UPDATE;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.lecture_context WHERE session_id=_session_id AND text=_context_text) THEN RETURN false; END IF;
IF jsonb_array_length(_draft->'quickChecks') NOT BETWEEN 4 AND 8 OR jsonb_array_length(_draft->'explains') NOT BETWEEN 2 AND 3 OR jsonb_array_length(_draft->'keyPoints') NOT BETWEEN 5 AND 7 THEN RETURN false; END IF;
FOR item IN SELECT value FROM jsonb_array_elements(_draft->'quickChecks') LOOP
INSERT INTO public.activities(session_id,type,status,source,confirmed,prompt,kind,options,correct,explanation,tolerance) VALUES(_session_id,'QUICK_CHECK','DRAFT','AI',false,item->>'prompt',item->>'kind',item->'options',item->'correct',item->>'explanation',CASE WHEN item->>'kind'='NUMERIC' THEN 0 ELSE NULL END);
END LOOP;
FOR item IN SELECT value FROM jsonb_array_elements(_draft->'explains') LOOP
INSERT INTO public.activities(session_id,type,status,source,confirmed,prompt,model_answer) VALUES(_session_id,'EXPLAIN','DRAFT','AI',false,item->>'prompt',item->>'modelAnswer'); END LOOP;
INSERT INTO public.takeaway_drafts(session_id,key_points) VALUES(_session_id,_draft->'keyPoints') ON CONFLICT(session_id) DO UPDATE SET key_points=EXCLUDED.key_points,created_at=clock_timestamp();
PERFORM public.bump_versions(_session_id,true,false); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.save_slide_drafts(uuid,text,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.save_slide_drafts(uuid,text,jsonb) TO service_role;
CREATE FUNCTION public.confirm_slide_activity(_session_id uuid,_activity_id uuid,_draft jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE act public.activities; BEGIN
PERFORM id FROM public.sessions WHERE id=_session_id AND status='LIVE' AND created_at>now()-interval '6 hours' FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
SELECT * INTO act FROM public.activities WHERE id=_activity_id AND session_id=_session_id AND status='DRAFT' AND source='AI' FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
IF act.type='QUICK_CHECK' THEN UPDATE public.activities SET prompt=_draft->>'prompt',kind=_draft->>'kind',options=_draft->'options',correct=_draft->'correct',explanation=_draft->>'explanation',tolerance=(_draft->>'tolerance')::numeric,confirmed=true WHERE id=act.id;
ELSE UPDATE public.activities SET prompt=_draft->>'prompt',model_answer=_draft->>'modelAnswer',confirmed=true WHERE id=act.id; END IF;
PERFORM public.bump_versions(_session_id,true,false); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.confirm_slide_activity(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.confirm_slide_activity(uuid,uuid,jsonb) TO service_role;