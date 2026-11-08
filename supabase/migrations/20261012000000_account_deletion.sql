-- Account deletion removes the user from auth.users and cascades to everything
-- they made. Posted photos already queue their files for deletion
-- (post_media_outbox); this does the same for photos uploaded but never posted.

create function public.outbox_upload_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload)
  values ('media.deleted', jsonb_build_object('storage_key', old.storage_key));
  return null;
end;
$$;

revoke execute on function public.outbox_upload_deleted() from public, anon, authenticated;

create trigger uploads_outbox
  after delete on public.uploads
  for each row when (old.used_at is null)
  execute function public.outbox_upload_deleted();
