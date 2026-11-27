create table public.ref_personal_references (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metadata jsonb not null,
  title text generated always as (metadata ->> 'title') stored,
  personal_note text not null default '' check (octet_length(personal_note) <= 48000),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint ref_personal_metadata_valid check (
    jsonb_typeof(metadata) = 'object'
    and metadata ? 'title'
    and jsonb_typeof(metadata -> 'title') = 'string'
    and length(btrim(metadata ->> 'title')) between 1 and 2000
    and octet_length(metadata::text) <= 240000
  )
);

create index ref_personal_references_owner_idx on public.ref_personal_references (owner_id, id);

alter table public.ref_personal_references enable row level security;
revoke all on public.ref_personal_references from public, anon, authenticated;
grant select, delete on public.ref_personal_references to authenticated;
grant insert (metadata, personal_note), update (metadata, personal_note)
  on public.ref_personal_references to authenticated;

create policy "Users read their own cloud references"
  on public.ref_personal_references for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Users add their own cloud references"
  on public.ref_personal_references for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Users edit their own cloud references"
  on public.ref_personal_references for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Users delete their own cloud references"
  on public.ref_personal_references for delete to authenticated
  using (owner_id = (select auth.uid()));

create function public.ref_personal_bump_revision()
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

revoke all on function public.ref_personal_bump_revision() from public, anon, authenticated;

create trigger ref_personal_revision
before update of metadata, personal_note on public.ref_personal_references
for each row execute function public.ref_personal_bump_revision();
