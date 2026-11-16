CREATE TABLE public.session_divisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE, label text NOT NULL, question_count int NOT NULL DEFAULT 0, flagged_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.session_divisions TO service_role;
ALTER TABLE public.session_divisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX session_divisions_session_idx ON public.session_divisions(session_id);
CREATE TABLE public.question_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE, title text NOT NULL, me_too_count int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ANSWERED_IN_CLASS','REPLIED')), reply text, division_id uuid REFERENCES public.session_divisions(id), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.question_groups TO service_role;
ALTER TABLE public.question_groups ENABLE ROW LEVEL SECURITY;
CREATE INDEX question_groups_session_idx ON public.question_groups(session_id);
CREATE TABLE public.group_votes (group_id uuid NOT NULL REFERENCES public.question_groups(id) ON DELETE CASCADE, device_hash text NOT NULL, PRIMARY KEY(group_id,device_hash));
GRANT ALL ON public.group_votes TO service_role;
ALTER TABLE public.group_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ADD COLUMN lecture_context text;
CREATE FUNCTION public.vote_group(_session_id uuid,_group_id uuid,_device_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted int;
BEGIN
 PERFORM 1 FROM public.sessions WHERE id=_session_id AND status='LIVE' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.question_groups WHERE id=_group_id AND session_id=_session_id AND division_id IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.group_votes VALUES (_group_id,_device_hash) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted>0 THEN
 UPDATE public.question_groups SET me_too_count=me_too_count+1 WHERE id=_group_id;
 UPDATE public.sessions SET activity_version=activity_version+1,public_version=public_version+1 WHERE id=_session_id;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.vote_group(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vote_group(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.divide_session(_session_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE division uuid; part int; qcount int; flags int;
BEGIN
 SELECT flagged_count INTO flags FROM public.sessions WHERE id=_session_id AND status='LIVE' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT count(*)+1 INTO part FROM public.session_divisions WHERE session_id=_session_id;
 SELECT count(*) INTO qcount FROM public.questions WHERE session_id=_session_id AND division_id IS NULL;
 INSERT INTO public.session_divisions(session_id,label,question_count,flagged_count) VALUES (_session_id,'Part '||part,qcount,flags) RETURNING id INTO division;
 UPDATE public.questions SET division_id=division WHERE session_id=_session_id AND division_id IS NULL;
 UPDATE public.question_groups SET division_id=division WHERE session_id=_session_id AND division_id IS NULL;
 UPDATE public.sessions SET flagged_count=0,activity_version=activity_version+1,public_version=public_version+1 WHERE id=_session_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.divide_session(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.divide_session(uuid) TO service_role;
CREATE FUNCTION public.apply_grouping(_session_id uuid,_part int,_assignments jsonb,_flagged jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; gid uuid; qid uuid; title_value text; removed int:=0; affected int;
BEGIN
 PERFORM 1 FROM public.sessions WHERE id=_session_id AND status='LIVE' FOR UPDATE;
 IF NOT FOUND OR (SELECT count(*) FROM public.session_divisions WHERE session_id=_session_id)<>_part THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(_flagged) LOOP
 qid:=(item->>'questionId')::uuid;
 DELETE FROM public.questions WHERE id=qid AND session_id=_session_id AND division_id IS NULL AND group_id IS NULL;
 GET DIAGNOSTICS affected=ROW_COUNT; removed:=removed+affected;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(_assignments) LOOP
 qid:=(item->>'questionId')::uuid;
 PERFORM 1 FROM public.questions WHERE id=qid AND session_id=_session_id AND division_id IS NULL AND group_id IS NULL;
 IF NOT FOUND THEN CONTINUE; END IF;
 gid:=NULL;
 IF item->>'groupId' IS NOT NULL THEN
 SELECT id INTO gid FROM public.question_groups WHERE id=(item->>'groupId')::uuid AND session_id=_session_id AND division_id IS NULL;
 ELSE
 title_value:=trim(item->>'newGroupTitle');
 IF title_value IS NOT NULL AND length(title_value)>0 THEN
 SELECT id INTO gid FROM public.question_groups WHERE session_id=_session_id AND division_id IS NULL AND lower(title)=lower(title_value) LIMIT 1;
 IF gid IS NULL THEN INSERT INTO public.question_groups(session_id,title) VALUES (_session_id,title_value) RETURNING id INTO gid; END IF;
 END IF;
 END IF;
 IF gid IS NOT NULL THEN UPDATE public.questions SET group_id=gid WHERE id=qid; END IF;
 END LOOP;
 UPDATE public.sessions SET flagged_count=flagged_count+removed,flagged_total=flagged_total+removed,activity_version=activity_version+1,public_version=public_version+1 WHERE id=_session_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apply_grouping(uuid,int,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_grouping(uuid,int,jsonb,jsonb) TO service_role;
CREATE FUNCTION public.publish_group(_session_id uuid,_group_id uuid,_status text,_reply text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.sessions WHERE id=_session_id AND status='LIVE' FOR UPDATE;
 IF NOT FOUND OR _status NOT IN ('ANSWERED_IN_CLASS','REPLIED') THEN RETURN false; END IF;
 UPDATE public.question_groups SET status=_status,reply=CASE WHEN _status='REPLIED' THEN _reply ELSE reply END WHERE id=_group_id AND session_id=_session_id AND division_id IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.sessions SET activity_version=activity_version+1,public_version=public_version+1 WHERE id=_session_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.publish_group(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_group(uuid,uuid,text,text) TO service_role;