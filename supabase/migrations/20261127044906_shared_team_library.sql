create table public.ref_team_members (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.ref_team_references (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  metadata jsonb not null,
  title text generated always as (metadata ->> 'title') stored,
  shared_note text not null default '' check (octet_length(shared_note) <= 48000),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint ref_team_metadata_valid check (
    jsonb_typeof(metadata) = 'object'
    and metadata ? 'title'
    and jsonb_typeof(metadata -> 'title') = 'string'
    and length(btrim(metadata ->> 'title')) between 1 and 2000
    and octet_length(metadata::text) <= 240000
  )
);

create index ref_team_references_creator_idx on public.ref_team_references (created_by);

alter table public.ref_team_members enable row level security;
alter table public.ref_team_references enable row level security;

revoke all on public.ref_team_members, public.ref_team_references from public, anon, authenticated;
grant select on public.ref_team_members to authenticated;
grant select, delete on public.ref_team_references to authenticated;
grant insert (metadata, shared_note), update (metadata, shared_note)
  on public.ref_team_references to authenticated;

create policy "Read own team membership"
  on public.ref_team_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Members read team references"
  on public.ref_team_references for select to authenticated
  using ((select exists (
    select 1 from public.ref_team_members where user_id = (select auth.uid())
  )));

create policy "Members add team references"
  on public.ref_team_references for insert to authenticated
  with check (created_by = (select auth.uid()) and (select exists (
    select 1 from public.ref_team_members where user_id = (select auth.uid())
  )));

create policy "Members edit team references"
  on public.ref_team_references for update to authenticated
  using ((select exists (
    select 1 from public.ref_team_members where user_id = (select auth.uid())
  )))
  with check ((select exists (
    select 1 from public.ref_team_members where user_id = (select auth.uid())
  )));

create policy "Members delete references they added"
  on public.ref_team_references for delete to authenticated
  using (created_by = (select auth.uid()) and (select exists (
    select 1 from public.ref_team_members where user_id = (select auth.uid())
  )));

create function public.ref_team_bump_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.ref_team_bump_revision() from public, anon, authenticated;

create trigger ref_team_revision
before update of metadata, shared_note on public.ref_team_references
for each row execute function public.ref_team_bump_revision();
