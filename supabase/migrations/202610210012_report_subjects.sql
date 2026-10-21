begin;
set local lock_timeout = '10s';
lock table public.lms_lesson_reports in access exclusive mode;

-- Preserve legacy columns and every report ID/version/timestamp. score becomes
-- a checked projection of the authoritative per-subject scores, with decimals.
alter table public.lms_lesson_reports alter column score type numeric using score::numeric;
create table public.lms_lesson_report_subjects (
  report_id uuid not null,
  subject_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  score numeric not null check(score between 0 and 100),
  created_at timestamptz not null default now(),
  primary key(report_id,subject_id),
  constraint lms_report_subjects_report_fkey foreign key(owner_id,report_id)
    references public.lms_lesson_reports(owner_id,id) on delete cascade,
  constraint lms_report_subjects_subject_fkey foreign key(owner_id,subject_id)
    references public.lms_subjects(owner_id,id) on delete restrict
);
create index lms_report_subjects_owner_report on public.lms_lesson_report_subjects(owner_id,report_id,subject_id);
create index lms_report_subjects_owner_subject on public.lms_lesson_report_subjects(owner_id,subject_id,report_id);
insert into public.lms_lesson_report_subjects(report_id,subject_id,owner_id,score,created_at)
  select id,subject_id,owner_id,score,created_at from public.lms_lesson_reports;
do $$ begin
  if exists(select 1 from public.lms_lesson_reports r where not exists(
    select 1 from public.lms_lesson_report_subjects rs where rs.report_id=r.id and rs.subject_id=r.subject_id
      and rs.owner_id=r.owner_id and rs.score=r.score and rs.created_at=r.created_at
  )) then raise exception 'Report subject backfill incomplete'; end if;
end $$;

alter table public.lms_lesson_report_subjects enable row level security;
revoke all on public.lms_lesson_report_subjects from public,anon,authenticated;
grant select on public.lms_lesson_report_subjects to authenticated;
grant all on public.lms_lesson_report_subjects to service_role;
create policy lms_report_subjects_owner_select on public.lms_lesson_report_subjects
  for select to authenticated using(owner_id=(select auth.uid()));
revoke insert,update,delete on public.lms_lesson_reports from authenticated;

-- The deferred invariant also rejects inconsistent privileged/direct SQL.
-- A replacement/delete is allowed within one transaction, never as partial writes.
create function private.lms_report_scores_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare identity uuid; report public.lms_lesson_reports; average numeric;
begin
  if TG_TABLE_NAME='lms_lesson_reports' then identity:=new.id;
  else
    identity:=coalesce(new.report_id,old.report_id);
    if TG_OP='UPDATE' and (new.report_id<>old.report_id or new.subject_id<>old.subject_id or new.owner_id<>old.owner_id) then
      raise exception 'Report subject identity is immutable' using errcode='42501';
    end if;
  end if;
  select * into report from public.lms_lesson_reports where id=identity;
  if not found then return null; end if;
  select round(avg(score),1) into average from public.lms_lesson_report_subjects where report_id=identity;
  if average is null or report.score is distinct from average or not exists(
    select 1 from public.lms_lesson_report_subjects where report_id=identity and subject_id=report.subject_id
  ) then raise exception 'Report requires subject scores and a consistent average' using errcode='23514'; end if;
  return null;
end $$;
create constraint trigger lms_report_scores_guard after insert or update on public.lms_lesson_reports
  deferrable initially deferred for each row execute function private.lms_report_scores_guard();
create constraint trigger lms_report_scores_guard after insert or update or delete on public.lms_lesson_report_subjects
  deferrable initially deferred for each row execute function private.lms_report_scores_guard();
create function private.lms_report_subject_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.lms_audit_logs(owner_id,actor_id,action,entity,entity_id)
    values(coalesce(new.owner_id,old.owner_id),auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(new.report_id,old.report_id));
  return coalesce(new,old);
end $$;
create trigger lms_report_subject_audit after insert or update or delete on public.lms_lesson_report_subjects
  for each row execute function private.lms_report_subject_audit();

create function public.lms_save_lesson_report(p_data jsonb,p_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); identity uuid; prior public.lms_lesson_reports; target public.lms_lesson_reports;
  payload jsonb; scores jsonb; current_scores jsonb; entry jsonb; ids uuid[]; current_ids uuid[];
  average numeric; anchor uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_data) k where k not in (
      'id','child_id','schedule_id','subject_scores','subject_id','score','date','duration_minutes','topic',
      'what_learned','learning_outcome','teacher_notes','next_step','home_practice'
    )
  ) then raise exception 'Invalid report fields' using errcode='22023'; end if;
  identity:=(p_data->>'id')::uuid;
  if identity is null then raise exception 'Report ID required' using errcode='22023'; end if;
  -- Same order as schedule writes: serialize schedule membership and report edits.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into prior from public.lms_lesson_reports where id=identity for update;
  if prior.id is not null and prior.owner_id<>actor then raise exception 'Report unavailable' using errcode='42501'; end if;
  if p_version is not null and (prior.id is null or prior.version<>p_version) then
    raise exception 'Data changed or unavailable. Reload before saving.' using errcode='PT409';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('subject_id',subject_id,'score',score) order by subject_id),'[]'),
    coalesce(array_agg(subject_id),'{}'::uuid[]) into current_scores,current_ids
    from public.lms_lesson_report_subjects where report_id=identity;
  payload:=p_data-'subject_scores'-'subject_id'-'score';
  target:=jsonb_populate_record(prior,payload);
  if p_data ? 'subject_scores' then
    if p_data ?| array['subject_id','score'] then raise exception 'Do not mix legacy and subject scores' using errcode='22023'; end if;
    scores:=p_data->'subject_scores';
  elsif p_data ?| array['subject_id','score'] then
    -- Old clients can create/edit a single subject. Never collapse a multi-subject report.
    if jsonb_array_length(current_scores)>1 then raise exception 'Reload the multi-subject report before editing scores' using errcode='PT409'; end if;
    scores:=jsonb_build_array(jsonb_build_object('subject_id',coalesce((p_data->>'subject_id')::uuid,prior.subject_id),
      'score',coalesce((p_data->>'score')::numeric,prior.score)));
  else scores:=current_scores; end if;
  if jsonb_typeof(scores) is distinct from 'array' then raise exception 'Subject scores must be an array' using errcode='22023'; end if;
  if jsonb_array_length(scores)=0 then raise exception 'Pilih minimal satu mata pelajaran dan isi nilainya' using errcode='23514'; end if;
  for entry in select value from jsonb_array_elements(scores) loop
    if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Invalid subject score' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(entry) k where k not in ('subject_id','score'))
      or entry->>'subject_id' is null or jsonb_typeof(entry->'score') is distinct from 'number'
      or not ((entry->>'score')::numeric between 0 and 100) then
      raise exception 'Setiap mata pelajaran wajib memiliki nilai 0 sampai 100' using errcode='23514';
    end if;
  end loop;
  select array_agg(subject_id order by subject_id),round(avg(score),1),
    jsonb_agg(jsonb_build_object('subject_id',subject_id,'score',score) order by subject_id)
    into ids,average,scores from jsonb_to_recordset(scores) as x(subject_id uuid,score numeric);
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Mata pelajaran duplikat' using errcode='23505'; end if;
  perform 1 from public.lms_subjects where owner_id=actor and id=any(ids) order by id for share;
  if exists(select 1 from unnest(ids) requested(id) where not exists(
    select 1 from public.lms_subjects s where s.id=requested.id and s.owner_id=actor
      and (target.schedule_id is not null or s.is_active or (s.id=any(current_ids) and prior.schedule_id is null))
  )) then raise exception 'Mata pelajaran tidak aktif atau tidak tersedia' using errcode='42501'; end if;
  if target.schedule_id is not null then
    perform 1 from public.lms_schedules where id=target.schedule_id and owner_id=actor and child_id=target.child_id for share;
    if not found or exists(select 1 from unnest(ids) requested(id) where not exists(
      select 1 from public.lms_schedule_subjects ss where ss.owner_id=actor and ss.schedule_id=target.schedule_id and ss.subject_id=requested.id
    )) then raise exception 'Mata pelajaran atau murid tidak sesuai jadwal. Periksa pilihan tanpa menghapus nilai tersimpan.' using errcode='23514'; end if;
  end if;
  anchor:=case when prior.subject_id=any(ids) then prior.subject_id else ids[1] end;
  if prior.id is not null and target.child_id<>prior.child_id then raise exception 'Report child is immutable' using errcode='42501'; end if;
  if prior.id is not null and p_version is null then
    if to_jsonb(prior)<>to_jsonb(target) or scores<>current_scores then raise exception 'Conflicting create request' using errcode='PT409'; end if;
    return to_jsonb(prior)||jsonb_build_object('subject_scores',scores);
  end if;
  if prior.id is null then
    target:=jsonb_populate_record(null::public.lms_lesson_reports,
      jsonb_build_object('teacher_notes','','next_step','','home_practice','')||payload);
    insert into public.lms_lesson_reports(id,owner_id,child_id,schedule_id,subject_id,score,date,duration_minutes,topic,what_learned,learning_outcome,teacher_notes,next_step,home_practice)
      values(identity,actor,target.child_id,target.schedule_id,anchor,average,target.date,target.duration_minutes,target.topic,target.what_learned,target.learning_outcome,target.teacher_notes,target.next_step,target.home_practice)
      returning * into target;
  else
    update public.lms_lesson_reports set schedule_id=target.schedule_id,subject_id=anchor,score=average,date=target.date,
      duration_minutes=target.duration_minutes,topic=target.topic,what_learned=target.what_learned,learning_outcome=target.learning_outcome,
      teacher_notes=target.teacher_notes,next_step=target.next_step,home_practice=target.home_practice
      where id=identity and owner_id=actor and version=p_version returning * into target;
  end if;
  delete from public.lms_lesson_report_subjects where report_id=identity and not(subject_id=any(ids));
  insert into public.lms_lesson_report_subjects(report_id,subject_id,owner_id,score)
    select identity,x.subject_id,actor,x.score from jsonb_to_recordset(scores) as x(subject_id uuid,score numeric)
    on conflict(report_id,subject_id) do update set score=excluded.score
      where lms_lesson_report_subjects.score is distinct from excluded.score;
  return to_jsonb(target)||jsonb_build_object('subject_scores',scores);
end $$;
revoke all on function public.lms_save_lesson_report(jsonb,integer) from public,anon;
grant execute on function public.lms_save_lesson_report(jsonb,integer) to authenticated;
revoke all on function private.lms_report_scores_guard(),private.lms_report_subject_audit() from public,anon,authenticated;

do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.lms_save_record(text,jsonb,integer)'::regprocedure);
  if position('  if auth.uid() is null' in definition)=0 then raise exception 'Unexpected save_record definition'; end if;
  execute replace(definition,'  if auth.uid() is null',
    E'  if p_table=''lms_lesson_reports'' then return public.lms_save_lesson_report(p_data,p_version); end if;\n  if auth.uid() is null');
end $$;

-- Only replace the report projection in the existing trusted token boundary.
do $$ declare definition text; old_query text; new_query text; begin
  definition:=pg_get_functiondef('public.lms_parent_request(text,text,text,integer,text,uuid,uuid)'::regprocedure);
  old_query:=$old$select r.id,r.date,r.duration_minutes,r.topic,r.what_learned,r.learning_outcome,r.score,r.teacher_notes,r.next_step,r.home_practice,
       jsonb_build_object('name',s.name) subject
     from public.lms_lesson_reports r join public.lms_subjects s on s.id=r.subject_id where r.child_id=link.child_id and (link.report_id is null or r.id=link.report_id)$old$;
  new_query:=$new$select r.id,r.date,r.duration_minutes,r.topic,r.what_learned,r.learning_outcome,r.score,r.teacher_notes,r.next_step,r.home_practice,
       (select jsonb_agg(jsonb_build_object('subject_id',rs.subject_id,'score',rs.score,'subject',jsonb_build_object('id',s.id,'name',s.name)) order by s.name,s.id)
        from public.lms_lesson_report_subjects rs join public.lms_subjects s on s.owner_id=rs.owner_id and s.id=rs.subject_id
        where rs.report_id=r.id and rs.owner_id=link.owner_id) report_subjects
     from public.lms_lesson_reports r where r.owner_id=link.owner_id and r.child_id=link.child_id and (link.report_id is null or r.id=link.report_id)$new$;
  if position(old_query in definition)=0 then raise exception 'Unexpected parent report projection'; end if;
  execute replace(definition,old_query,new_query);
end $$;
notify pgrst,'reload schema';
commit;
