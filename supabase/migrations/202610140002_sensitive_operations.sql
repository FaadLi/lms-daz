begin;
create function public.begin_upload(p_kind text, p_child uuid, p_report uuid, p_mime text, p_size integer, p_caption text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare asset public.media_assets; ext text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_kind='profile' and not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Save profile first'; end if;
  if p_kind in ('avatar','photo') and not exists(select 1 from public.children where id=p_child and owner_id=auth.uid()) then raise exception 'Child unavailable' using errcode='42501'; end if;
  if p_kind='photo' and not exists(select 1 from public.lesson_reports where id=p_report and child_id=p_child and owner_id=auth.uid()) then raise exception 'Report unavailable' using errcode='42501'; end if;
  ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
  if ext is null then raise exception 'Unsupported image'; end if;
  insert into public.media_assets(owner_id,kind,child_id,report_id,object_path,mime_type,size_bytes,caption)
    values(auth.uid(),p_kind,p_child,p_report,auth.uid()::text||'/'||gen_random_uuid()::text||'.'||ext,p_mime,p_size,left(p_caption,500)) returning * into asset;
  return to_jsonb(asset);
end $$;

create function public.finish_upload(p_owner uuid, p_asset uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id=p_asset and owner_id=p_owner for update;
  if not found or a.state='deleting' then raise exception 'Upload unavailable'; end if;
  if a.state='ready' then return; end if;
  if not exists(select 1 from storage.objects where bucket_id='lesson-media' and name=a.object_path) then raise exception 'File missing'; end if;
  if a.kind='avatar' then
    update public.children set avatar_id=a.id where id=a.child_id and owner_id=p_owner and version=p_version;
    if not found then raise exception 'Data changed. Reload before attaching avatar.' using errcode='40001'; end if;
  elsif a.kind='profile' then
    update public.profiles set avatar_id=a.id where id=p_owner and version=p_version;
    if not found then raise exception 'Profile changed. Reload before attaching avatar.' using errcode='40001'; end if;
  end if;
  update public.media_assets set state='ready' where id=a.id;
end $$;

create function public.prepare_media_delete(p_owner uuid, p_asset uuid, p_version integer default null) returns text
language plpgsql security definer set search_path = '' as $$
declare a public.media_assets;
begin
 select * into a from public.media_assets where id=p_asset and owner_id=p_owner for update;
 if not found then return null; end if;
 if a.state<>'deleting' then
   if a.kind='avatar' and exists(select 1 from public.children where avatar_id=a.id) then
     update public.children set avatar_id=null where id=a.child_id and owner_id=p_owner and version=p_version and avatar_id=a.id;
     if not found then raise exception 'Data changed' using errcode='40001'; end if;
   elsif a.kind='profile' and exists(select 1 from public.profiles where avatar_id=a.id) then
     update public.profiles set avatar_id=null where id=p_owner and version=p_version and avatar_id=a.id;
     if not found then raise exception 'Data changed' using errcode='40001'; end if;
   end if;
   update public.media_assets set state='deleting' where id=a.id;
 end if;
 return a.object_path;
end $$;
create function public.finish_media_delete(p_owner uuid, p_asset uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from storage.objects o join public.media_assets a on a.object_path=o.name where a.id=p_asset and a.owner_id=p_owner and o.bucket_id='lesson-media') then raise exception 'File still exists'; end if;
 delete from public.media_assets where id=p_asset and owner_id=p_owner and state='deleting';
end $$;

create function public.issue_report_link(p_owner uuid, p_child uuid, p_report uuid, p_hash text, p_expires timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result private.report_links;
begin
 -- Serialize rotations on the child, including when no link exists yet.
 perform 1 from public.children where id=p_child and owner_id=p_owner for update;
 if not found then raise exception 'Child unavailable' using errcode='42501'; end if;
 if p_expires<=now() or p_expires>now()+interval '90 days' then raise exception 'Expiry must be within 90 days'; end if;
 update private.report_links set revoked_at=now() where child_id=p_child and owner_id=p_owner and revoked_at is null;
 insert into private.report_links(owner_id,child_id,report_id,token_hash,expires_at) values(p_owner,p_child,p_report,p_hash,p_expires) returning * into result;
 return jsonb_build_object('id',result.id,'expires_at',result.expires_at,'report_id',result.report_id,'access_count',result.access_count);
end $$;
create function public.report_link_info(p_child uuid) returns jsonb language sql security definer set search_path = '' as $$
 select jsonb_build_object('id',id,'expires_at',expires_at,'revoked_at',revoked_at,'access_count',access_count,'last_accessed_at',last_accessed_at,'report_id',report_id)
 from private.report_links where owner_id=auth.uid() and child_id=p_child order by created_at desc limit 1;
$$;
create function public.revoke_report_link(p_child uuid) returns void language sql security definer set search_path = '' as $$
 update private.report_links set revoked_at=now() where owner_id=auth.uid() and child_id=p_child and revoked_at is null;
$$;

create function public.parent_request(p_hash text, p_action text, p_section text default 'reports', p_page integer default 0, p_message text default null, p_id uuid default null, p_report uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare link private.report_links; result jsonb; items jsonb; total integer; child jsonb; teacher jsonb;
begin
 if p_page not between 0 and 10000 then raise exception 'Invalid page'; end if;
 -- Lock holds through the request transaction: revoke/comment races are serialized.
 select * into link from private.report_links where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'Link invalid or expired' using errcode='42501'; end if;
 if p_action='open' then
   update private.report_links set access_count=access_count+1,last_accessed_at=now() where id=link.id;
 elsif p_action='comment' then
   if p_id is null or p_message is null or length(trim(p_message)) not between 1 and 2000 then raise exception 'Invalid comment'; end if;
   if link.report_id is not null and p_report is distinct from link.report_id then raise exception 'Report outside link scope' using errcode='42501'; end if;
   insert into public.comments(id,owner_id,child_id,report_id,report_link_id,message)
    values(p_id,link.owner_id,link.child_id,p_report,link.id,trim(p_message)) on conflict(id) do nothing;
 elsif p_action<>'read' then raise exception 'Invalid action'; end if;
 select jsonb_build_object('id',c.id,'full_name',c.full_name,'nickname',c.nickname,'grade_level',c.grade_level,'avatar_id',c.avatar_id,'relationship',c.relationship,
   'parent',jsonb_build_object('full_name',p.full_name)) into child from public.children c join public.parents p on p.id=c.parent_id where c.id=link.child_id;
 select jsonb_build_object('name',name,'phone',phone,'institution_name',institution_name,'avatar_id',avatar_id) into teacher from public.profiles where id=link.owner_id;
 if p_section='reports' then
   select count(*) into total from public.lesson_reports where child_id=link.child_id and (link.report_id is null or id=link.report_id);
   select coalesce(jsonb_agg(x), '[]') into items from (
     select r.id,r.date,r.duration_minutes,r.topic,r.what_learned,r.learning_outcome,r.score,r.teacher_notes,r.next_step,r.home_practice,
       jsonb_build_object('name',s.name) subject
     from public.lesson_reports r join public.subjects s on s.id=r.subject_id where r.child_id=link.child_id and (link.report_id is null or r.id=link.report_id)
     order by r.date desc,r.id limit 20 offset p_page*20
   ) x;
 elsif p_section='comments' then
   select count(*) into total from public.comments where child_id=link.child_id and (link.report_id is null or report_id=link.report_id);
   select coalesce(jsonb_agg(x), '[]') into items from (
    select id,message,created_at,(sender_user_id is not null) as from_teacher from public.comments where child_id=link.child_id and (link.report_id is null or report_id=link.report_id)
    order by created_at desc,id limit 20 offset p_page*20
   ) x;
 elsif link.report_id is not null then raise exception 'Section outside report scope' using errcode='42501';
 elsif p_section='schedules' then
   select count(*) into total from public.schedules where child_id=link.child_id and is_active;
   select coalesce(jsonb_agg(x), '[]') into items from (select a.id,a.day_of_week,a.start_time,a.end_time,a.location,jsonb_build_object('name',s.name) subject from public.schedules a join public.subjects s on s.id=a.subject_id where child_id=link.child_id and a.is_active order by day_of_week,start_time,a.id limit 20 offset p_page*20) x;
 elsif p_section='attendance' then
   select count(*) into total from public.attendance where child_id=link.child_id;
   select coalesce(jsonb_agg(x), '[]') into items from (select id,date,status,start_time,end_time,notes from public.attendance where child_id=link.child_id order by date desc,id limit 20 offset p_page*20) x;
 elsif p_section='invoices' then
   select count(*) into total from public.invoices where child_id=link.child_id;
   select coalesce(jsonb_agg(x), '[]') into items from (select i.id,i.invoice_number,i.period,i.amount,i.due_date,i.package_type,i.session_count,coalesce((select sum(amount) from public.payment_transactions t where t.invoice_id=i.id),0) as paid_amount from public.invoices i where child_id=link.child_id order by period desc,id limit 20 offset p_page*20) x;
 elsif p_section='photos' then
   select count(*) into total from public.media_assets where child_id=link.child_id and kind='photo' and state='ready';
   select coalesce(jsonb_agg(x), '[]') into items from (select id,object_path,caption from public.media_assets where child_id=link.child_id and kind='photo' and state='ready' order by created_at desc,id limit 20 offset p_page*20) x;
 else raise exception 'Invalid section'; end if;
 -- Only bounded media are returned. Edge signs paths and strips them from its response.
 select coalesce(jsonb_agg(x),'[]') into result from (
  select id,object_path,caption,report_id from public.media_assets a where a.state='ready' and a.owner_id=link.owner_id and (
    a.id=(child->>'avatar_id')::uuid or a.id=(teacher->>'avatar_id')::uuid or
    (p_section='reports' and a.report_id in (select (value->>'id')::uuid from jsonb_array_elements(items))))
 ) x;
 return jsonb_build_object('child',child,'teacher',teacher,'items',items,'total',total,'media',result,'report_id',link.report_id);
end $$;

create function public.consume_request_limit(p_key text, p_limit integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 insert into private.request_limits(key,window_start,count) values(p_key,date_trunc('minute',now()),1)
 on conflict(key,window_start) do update set count=private.request_limits.count+1 returning count into n;
 delete from private.request_limits where window_start < now()-interval '10 minutes';
 return n<=p_limit;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('begin_upload','finish_upload','prepare_media_delete','finish_media_delete','issue_report_link','report_link_info','revoke_report_link','parent_request','consume_request_limit') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  if f.proname in ('begin_upload','report_link_info','revoke_report_link') then execute format('grant execute on function %s to authenticated',f.signature);
  else execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
commit;
