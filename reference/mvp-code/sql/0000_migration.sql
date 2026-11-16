create extension if not exists pg_cron;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  topic text not null check (char_length(topic) between 1 and 80),
  academic boolean not null default true,
  status text not null default 'LIVE' check (status in ('LIVE','ENDED')),
  flagged_count int not null default 0,
  flagged_total int not null default 0,
  activity_version int not null default 0,
  public_version int not null default 0,
  live_activity_id uuid,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);
grant select on public.sessions to anon, authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;
create policy "Read sessions for realtime" on public.sessions for select to anon, authenticated using (true);

create table public.session_secrets (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  secret_hash text not null
);
grant all on public.session_secrets to service_role;
alter table public.session_secrets enable row level security;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  device_hash text not null,
  satisfied boolean not null default false,
  group_id uuid,
  division_id uuid,
  created_at timestamptz not null default now()
);
create index questions_session_id_idx on public.questions(session_id);
create index questions_session_device_idx on public.questions(session_id, device_hash, created_at);
grant all on public.questions to service_role;
alter table public.questions enable row level security;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();

create or replace function public.sweep_sessions() returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sessions set status='ENDED', ended_at=now(), public_version=public_version+1, activity_version=activity_version+1
    where status='LIVE' and created_at < now() - interval '6 hours';
  delete from public.sessions where status='ENDED' and ended_at < now() - interval '24 hours';
end $$;
revoke execute on function public.sweep_sessions() from public, anon, authenticated;

create or replace function public.bump_flagged(_session_id uuid) returns void language sql security definer set search_path = public as $$
  update public.sessions set flagged_count=flagged_count+1, flagged_total=flagged_total+1, activity_version=activity_version+1 where id=_session_id;
$$;
revoke execute on function public.bump_flagged(uuid) from public, anon, authenticated;
grant execute on function public.bump_flagged(uuid) to service_role;

create or replace function public.bump_versions(_session_id uuid, _activity boolean, _public boolean) returns void language sql security definer set search_path = public as $$
  update public.sessions set activity_version=activity_version + (case when _activity then 1 else 0 end),
    public_version=public_version + (case when _public then 1 else 0 end) where id=_session_id;
$$;
revoke execute on function public.bump_versions(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.bump_versions(uuid, boolean, boolean) to service_role;

alter publication supabase_realtime add table public.sessions;

select cron.schedule('getit-sweep-sessions', '23 3 * * *', $$select public.sweep_sessions();$$);