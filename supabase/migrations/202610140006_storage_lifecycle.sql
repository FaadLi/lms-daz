begin;
create function public.can_upload_media(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 -- Coordinate Storage INSERT with deletion of the prepared asset.
 perform 1 from public.media_assets where object_path=p_path and owner_id=auth.uid() and state='pending' for share;
 return found;
end $$;
revoke all on function public.can_upload_media(text) from public,anon;
grant execute on function public.can_upload_media(text) to authenticated;
drop policy lesson_media_upload on storage.objects;
create policy lesson_media_upload on storage.objects for insert to authenticated with check(bucket_id='lesson-media' and public.can_upload_media(name));
commit;
