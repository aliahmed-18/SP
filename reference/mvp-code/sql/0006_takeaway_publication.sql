CREATE TABLE public.takeaways (
 session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 key_points jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(key_points)='array'),
 top_topics jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(top_topics)='array'),
 published_at timestamptz
);
GRANT ALL ON public.takeaways TO service_role;
ALTER TABLE public.takeaways ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.save_takeaway(_session_id uuid, _key_points jsonb, _top_topics jsonb, _publish boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sess public.sessions; item jsonb;
BEGIN
 SELECT * INTO sess FROM public.sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR sess.status<>'ENDED' OR sess.ended_at IS NULL OR sess.ended_at<=now()-interval '24 hours' THEN RETURN false; END IF;
 IF jsonb_typeof(_key_points) IS DISTINCT FROM 'array' OR jsonb_typeof(_top_topics) IS DISTINCT FROM 'array' OR jsonb_array_length(_key_points)>20 OR jsonb_array_length(_top_topics)>5 OR (_publish AND jsonb_array_length(_key_points)=0) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_top_topics) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.question_groups WHERE id=(item->>'id')::uuid AND session_id=sess.id) THEN RETURN false; END IF;
 END LOOP;
 INSERT INTO public.takeaways(session_id,status,key_points,top_topics,published_at)
 VALUES(sess.id,CASE WHEN _publish THEN 'PUBLISHED' ELSE 'DRAFT' END,_key_points,_top_topics,CASE WHEN _publish THEN now() ELSE NULL END)
 ON CONFLICT(session_id) DO UPDATE SET status=EXCLUDED.status,key_points=EXCLUDED.key_points,top_topics=EXCLUDED.top_topics,published_at=EXCLUDED.published_at;
 IF _publish THEN
  FOR item IN SELECT value FROM jsonb_array_elements(_top_topics) LOOP
   IF length(trim(coalesce(item->>'reply','')))>0 THEN UPDATE public.question_groups SET reply=item->>'reply',status='REPLIED' WHERE id=(item->>'id')::uuid AND session_id=sess.id; END IF;
  END LOOP;
 END IF;
 PERFORM public.bump_versions(sess.id,true,true); RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.save_takeaway(uuid,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_takeaway(uuid,jsonb,jsonb,boolean) TO service_role;