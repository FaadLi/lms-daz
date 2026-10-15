begin;
-- Enforce immutable association once child-bound history exists.
create function private.relation_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_TABLE_NAME='lesson_reports' and new.child_id<>old.child_id then raise exception 'Report child is immutable'; end if;
 if TG_TABLE_NAME='invoices' and new.child_id<>old.child_id then raise exception 'Invoice child is immutable'; end if;
 if TG_TABLE_NAME='schedules' and new.child_id<>old.child_id then raise exception 'Schedule child is immutable'; end if;
 return new;
end $$;
create trigger relation_guard before update on public.lesson_reports for each row execute function private.relation_guard();
create trigger relation_guard before update on public.invoices for each row execute function private.relation_guard();
create trigger relation_guard before update on public.schedules for each row execute function private.relation_guard();

create function private.avatar_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.avatar_id is not null and not exists(select 1 from public.media_assets a where a.id=new.avatar_id and a.owner_id=new.owner_id and
    ((TG_TABLE_NAME='children' and a.kind='avatar' and a.child_id=new.id) or (TG_TABLE_NAME='profiles' and a.kind='profile'))) then
   raise exception 'Avatar outside target scope' using errcode='42501';
 end if; return new;
end $$;
create trigger avatar_guard before insert or update on public.children for each row execute function private.avatar_guard();
create trigger avatar_guard before insert or update on public.profiles for each row execute function private.avatar_guard();

create function public.delete_record(p_table text,p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare row_id uuid;
begin
 if auth.uid() is null or p_table not in ('parents','children','subjects','report_templates','schedules','attendance','lesson_reports','invoices') then raise exception 'Forbidden' using errcode='42501'; end if;
 execute format('select id from public.%I where id=$1 and owner_id=auth.uid() and version=$2 for update',p_table) into row_id using p_id,p_version;
 if row_id is null then raise exception 'Data changed or unavailable' using errcode='40001'; end if;
 if p_table='lesson_reports' then
   if exists(select 1 from public.media_assets where report_id=p_id) then raise exception 'Remove report photos and clean pending uploads before deleting'; end if;
   delete from public.comments where report_id=p_id;
   update private.report_links set revoked_at=coalesce(revoked_at,now()),report_id=null where report_id=p_id;
 end if;
 execute format('delete from public.%I where id=$1 and owner_id=auth.uid()',p_table) using p_id;
end $$;
revoke all on function public.delete_record(text,uuid,integer) from public,anon;
grant execute on function public.delete_record(text,uuid,integer) to authenticated;

-- A finished replacement queues the previous avatar for retryable cleanup.
create function private.queue_old_avatar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.avatar_id is not null and new.avatar_id is distinct from old.avatar_id then
   update public.media_assets set state='deleting' where id=old.avatar_id;
 end if; return new;
end $$;
create trigger queue_old_avatar after update on public.children for each row execute function private.queue_old_avatar();
create trigger queue_old_avatar after update on public.profiles for each row execute function private.queue_old_avatar();

create function private.photo_limit() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='photo' then
  perform 1 from public.lesson_reports where id=new.report_id for update;
  if (select count(*) from public.media_assets where report_id=new.report_id and state<>'deleting')>=10 then raise exception 'Maximum 10 photos per report'; end if;
 end if; return new;
end $$;
create trigger photo_limit before insert on public.media_assets for each row execute function private.photo_limit();

-- Explicit service grants for Edge operations; no reliance on project defaults.
grant usage on schema public,private to service_role;
grant all on all tables in schema public,private to service_role;
grant usage,select on all sequences in schema private to service_role;
commit;
