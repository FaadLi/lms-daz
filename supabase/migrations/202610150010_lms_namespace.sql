begin;

-- Only these relations belong to LMS. Supabase-managed and unrelated application
-- relations are deliberately excluded. ALTER preserves relation OIDs and row IDs.
create temporary table lms_namespace_tables(schema_name text, old_name text, primary key(schema_name,old_name)) on commit drop;
insert into lms_namespace_tables values
 ('public','profiles'),('public','parents'),('public','children'),('public','subjects'),
 ('public','report_templates'),('public','schedules'),('public','attendance'),
 ('public','lesson_reports'),('public','invoices'),('public','payment_transactions'),
 ('public','comments'),('public','media_assets'),
 ('private','report_links'),('private','audit_logs'),('private','request_limits');

create temporary table lms_namespace_functions(signature text primary key, function_oid oid) on commit drop;
insert into lms_namespace_functions(signature) values
 ('public.save_record(text,jsonb,integer)'),('public.create_child(jsonb,jsonb)'),
 ('public.record_payment(uuid,bigint,date,text,uuid,text)'),('public.comment_teacher(uuid,uuid,text,uuid)'),
 ('public.read_comments(uuid)'),('public.mark_report_shared(uuid,integer)'),('public.dashboard_stats()'),
 ('public.begin_upload(text,uuid,uuid,text,integer,text)'),('public.finish_upload(uuid,uuid,integer)'),
 ('public.prepare_media_delete(uuid,uuid,integer)'),('public.finish_media_delete(uuid,uuid)'),
 ('public.issue_report_link(uuid,uuid,uuid,text,timestamp with time zone)'),
 ('public.report_link_info(uuid)'),('public.revoke_report_link(uuid)'),
 ('public.parent_request(text,text,text,integer,text,uuid,uuid)'),('public.consume_request_limit(text,integer)'),
 ('public.delete_record(text,uuid,integer)'),('public.invoice_page(uuid,integer)'),
 ('public.transaction_page(uuid,integer)'),('public.can_upload_media(text)'),
 ('private.version_guard()'),('private.audit_change()'),('private.invoice_guard()'),
 ('private.relation_guard()'),('private.avatar_guard()'),('private.queue_old_avatar()'),
 ('private.photo_limit()'),('private.parent_comment_guard()'),('private.schedule_conflict_guard()');
update lms_namespace_functions set function_oid=to_regprocedure(signature);

do $$ declare t record; f record; begin
 if exists(select 1 from lms_namespace_functions where function_oid is null) then raise exception 'LMS function inventory is incomplete'; end if;
 for t in select * from lms_namespace_tables loop
  if to_regclass(format('%I.%I',t.schema_name,t.old_name)) is null or to_regclass(format('%I.%I',t.schema_name,'lms_'||t.old_name)) is not null then
   raise exception 'Unexpected namespace source/target: %.%',t.schema_name,t.old_name;
  end if;
 end loop;
 -- Acquire every LMS table lock before changing any identifiers.
 for t in select * from lms_namespace_tables order by schema_name,old_name loop
  execute format('lock table %I.%I in access exclusive mode',t.schema_name,t.old_name);
 end loop;
 for t in select * from lms_namespace_tables loop
  execute format('alter table %I.%I rename to %I',t.schema_name,t.old_name,'lms_'||t.old_name);
 end loop;
 for f in select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace join lms_namespace_functions inventory on inventory.function_oid=p.oid loop
  execute format('alter function %I.%I(%s) rename to %I',f.nspname,f.proname,f.args,'lms_'||f.proname);
 end loop;
end $$;

-- Rename constraints (and their backing indexes), other indexes, policies,
-- triggers, and owned identity sequences. FK and policy dependencies follow OIDs.
do $$ declare t record; object record; relation oid; begin
 for t in select * from lms_namespace_tables loop
  relation:=to_regclass(format('%I.%I',t.schema_name,'lms_'||t.old_name));
  for object in select conname from pg_constraint where conrelid=relation and conname not like 'lms\_%' escape '\' loop
   execute format('alter table %I.%I rename constraint %I to %I',t.schema_name,'lms_'||t.old_name,object.conname,'lms_'||object.conname);
  end loop;
  for object in select c.relname from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=relation and c.relname not like 'lms\_%' escape '\' loop
   execute format('alter index %I.%I rename to %I',t.schema_name,object.relname,'lms_'||object.relname);
  end loop;
  for object in select polname from pg_policy where polrelid=relation and polname not like 'lms\_%' escape '\' loop
   execute format('alter policy %I on %I.%I rename to %I',object.polname,t.schema_name,'lms_'||t.old_name,'lms_'||object.polname);
  end loop;
  for object in select tgname from pg_trigger where tgrelid=relation and not tgisinternal and tgname not like 'lms\_%' escape '\' loop
   execute format('alter trigger %I on %I.%I rename to %I',object.tgname,t.schema_name,'lms_'||t.old_name,'lms_'||object.tgname);
  end loop;
  for object in select s.relname from pg_class s join pg_depend d on d.objid=s.oid where s.relkind='S' and d.refobjid=relation and d.deptype in ('a','i') and s.relname not like 'lms\_%' escape '\' loop
   execute format('alter sequence %I.%I rename to %I',t.schema_name,object.relname,'lms_'||object.relname);
  end loop;
 end loop;
end $$;

-- PL/pgSQL text/dynamic SQL does not follow relation renames automatically.
-- Rebuild only the captured LMS functions, preserving signatures, security,
-- grants, defaults and previously applied PT409 behavior.
do $$ declare f record; t record; called record; definition text; original_name text; begin
 for f in select p.oid,p.proname from pg_proc p join lms_namespace_functions inventory on inventory.function_oid=p.oid loop
  definition:=pg_get_functiondef(f.oid);
  original_name:=substr(f.proname,5);
  for t in select * from lms_namespace_tables loop
   definition:=regexp_replace(definition,'\m'||t.schema_name||'\.'||t.old_name||'\M',t.schema_name||'.lms_'||t.old_name,'g');
   if original_name in ('save_record','create_child','delete_record','relation_guard','avatar_guard') then
    definition:=replace(definition,quote_literal(t.old_name),quote_literal('lms_'||t.old_name));
   end if;
  end loop;
  for called in select n.nspname,substr(p.proname,5) old_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace join lms_namespace_functions inventory on inventory.function_oid=p.oid loop
   definition:=regexp_replace(definition,'\m'||called.nspname||'\.'||called.old_name||'\M',called.nspname||'.lms_'||called.old_name,'g');
  end loop;
  definition:=replace(definition,quote_literal('lesson-media'),quote_literal('lms_media'));
  execute definition;
 end loop;
end $$;

-- Old audit entity labels and existing object paths are historical data, not
-- identifiers used in queries. Preserve them and the business rows unchanged.
-- New uploads use organized, owner-scoped directories.
do $$ declare constraint_name text; definition text; begin
 select conname into constraint_name from pg_constraint where conrelid='public.lms_media_assets'::regclass and contype='c' and pg_get_constraintdef(oid) like '%object_path%';
 if constraint_name is null then raise exception 'Media path ownership constraint missing'; end if;
 execute format('alter table public.lms_media_assets drop constraint %I',constraint_name);
 alter table public.lms_media_assets add constraint lms_media_assets_owned_path_check check(
  object_path like owner_id::text||'/%' or
  (kind='profile' and object_path like 'avatars/'||owner_id::text||'/%') or
  (kind='avatar' and object_path like 'children/'||owner_id::text||'/'||child_id::text||'/%') or
  (kind='photo' and object_path like 'reports/'||owner_id::text||'/'||child_id::text||'/'||report_id::text||'/%')
 );
 definition:=pg_get_functiondef('public.lms_begin_upload(text,uuid,uuid,text,integer,text)'::regprocedure);
 if position('auth.uid()::text||''/''||gen_random_uuid()::text||''.''||ext' in definition)=0 then raise exception 'Unexpected upload path generator'; end if;
 definition:=replace(definition,'auth.uid()::text||''/''||gen_random_uuid()::text||''.''||ext',
  '(case p_kind when ''profile'' then ''avatars/''||auth.uid()::text when ''avatar'' then ''children/''||auth.uid()::text||''/''||p_child::text else ''reports/''||auth.uid()::text||''/''||p_child::text||''/''||p_report::text end)||''/''||gen_random_uuid()::text||''.''||ext');
 execute definition;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('lms_media','lms_media',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='lms_media' and not public and file_size_limit=5242880 and allowed_mime_types=array['image/jpeg','image/png','image/webp']) then
  raise exception 'Target LMS bucket settings do not match';
 end if;
 -- Non-empty projects must run prepare-storage before this database cutover.
 if exists(select 1 from storage.objects old where old.bucket_id='lesson-media' and not exists(select 1 from storage.objects copied where copied.bucket_id='lms_media' and copied.name=old.name)) then
  raise exception 'Copy existing LMS objects using Storage API before applying namespace migration';
 end if;
end $$;
drop policy lesson_media_read on storage.objects;
drop policy lesson_media_upload on storage.objects;
create policy lms_media_read on storage.objects for select to authenticated using(
 bucket_id='lms_media' and exists(select 1 from public.lms_media_assets a where a.object_path=name and a.owner_id=(select auth.uid()) and a.state='ready')
);
create policy lms_media_upload on storage.objects for insert to authenticated with check(bucket_id='lms_media' and public.lms_can_upload_media(name));

-- No compatibility aliases: unprefixed names are free for unrelated apps.
-- Existing storage blobs/bucket are finalized using Storage API, never SQL DELETE.
notify pgrst,'reload schema';
commit;
