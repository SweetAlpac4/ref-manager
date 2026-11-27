insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ref-personal-pdfs', 'ref-personal-pdfs', false, 20971520, array['application/pdf']);

create schema if not exists ref_manager_private;
revoke all on schema ref_manager_private from public;
grant usage on schema ref_manager_private to authenticated;

create function ref_manager_private.can_attach_pdf(object_name text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  reference_id text := split_part(object_name, '/', 2);
begin
  if account_id is null
    or reference_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or object_name <> account_id::text || '/' || reference_id || '/document.pdf'
  then
    return false;
  end if;

  -- Keep the reference alive until Storage commits the object row.
  perform 1
  from public.ref_personal_references
  where id = reference_id::uuid and owner_id = account_id
  for key share;
  return found;
end;
$$;

revoke all on function ref_manager_private.can_attach_pdf(text) from public;
grant execute on function ref_manager_private.can_attach_pdf(text) to authenticated;

create policy "Users read their own reference PDFs"
on storage.objects for select to authenticated
using (bucket_id = 'ref-personal-pdfs' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "Users attach a PDF to their own reference"
on storage.objects for insert to authenticated
with check (bucket_id = 'ref-personal-pdfs' and ref_manager_private.can_attach_pdf(name));

create policy "Users delete their own reference PDFs"
on storage.objects for delete to authenticated
using (bucket_id = 'ref-personal-pdfs' and split_part(name, '/', 1) = (select auth.uid())::text);

create function ref_manager_private.require_pdf_removal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id = 'ref-personal-pdfs' and name = old.owner_id::text || '/' || old.id::text || '/document.pdf'
  ) then
    raise exception using errcode = '23514', message = 'Delete the cloud PDF before deleting this reference.';
  end if;
  return old;
end;
$$;

revoke all on function ref_manager_private.require_pdf_removal() from public;

create trigger ref_personal_remove_pdf_first
before delete on public.ref_personal_references
for each row execute function ref_manager_private.require_pdf_removal();
