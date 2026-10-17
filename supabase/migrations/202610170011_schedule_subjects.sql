begin;
set local lock_timeout = '10s';

-- Serialize the backfill and cutover against writes. IDs, versions and history
-- remain unchanged. A failed backfill/cutover rolls back this entire migration.
lock table public.lms_schedules in access exclusive mode;
create table public.lms_schedule_subjects (
  schedule_id uuid not null,
  subject_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lms_schedule_subjects_pkey primary key (schedule_id, subject_id),
  constraint lms_schedule_subjects_owner_id_schedule_id_fkey
    foreign key (owner_id, schedule_id) references public.lms_schedules(owner_id, id) on delete cascade,
  constraint lms_schedule_subjects_owner_id_subject_id_fkey
    foreign key (owner_id, subject_id) references public.lms_subjects(owner_id, id) on delete restrict
);
create index lms_schedule_subjects_owner_schedule on public.lms_schedule_subjects(owner_id, schedule_id, subject_id);
create index lms_schedule_subjects_owner_subject on public.lms_schedule_subjects(owner_id, subject_id, schedule_id);

insert into public.lms_schedule_subjects(schedule_id, subject_id, owner_id, created_at)
select id, subject_id, owner_id, created_at from public.lms_schedules;
do $$ begin
  if exists (
    select 1 from public.lms_schedules s
    left join public.lms_schedule_subjects ss
      on ss.schedule_id=s.id and ss.subject_id=s.subject_id and ss.owner_id=s.owner_id
    where ss.schedule_id is null
  ) then raise exception 'Schedule subject backfill incomplete'; end if;
end $$;

alter table public.lms_schedule_subjects enable row level security;
revoke all on public.lms_schedule_subjects from public, anon, authenticated;
grant select on public.lms_schedule_subjects to authenticated;
grant all on public.lms_schedule_subjects to service_role;
create policy lms_schedule_subjects_owner_select on public.lms_schedule_subjects
  for select to authenticated using (owner_id=(select auth.uid()));
-- All teacher writes go through the versioned atomic RPC; no two-request writes.
revoke insert, update, delete on public.lms_schedules from authenticated;

-- Even privileged SQL must not commit a schedule with zero subjects. Deferred
-- checks allow replacing associations inside one transaction and cascading delete.
create function private.lms_schedule_subject_required() returns trigger
language plpgsql security definer set search_path='' as $$
declare schedule uuid;
begin
  if TG_TABLE_NAME='lms_schedules' then schedule:=new.id;
  else schedule:=old.schedule_id; end if;
  if exists(select 1 from public.lms_schedules where id=schedule)
    and not exists(select 1 from public.lms_schedule_subjects where schedule_id=schedule) then
    raise exception 'Pilih minimal satu mata pelajaran' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger lms_schedule_subject_required after insert or update on public.lms_schedules
  deferrable initially deferred for each row execute function private.lms_schedule_subject_required();
create constraint trigger lms_schedule_subject_required after delete or update on public.lms_schedule_subjects
  deferrable initially deferred for each row execute function private.lms_schedule_subject_required();

create function private.lms_schedule_subject_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.lms_audit_logs(owner_id,actor_id,action,entity,entity_id)
    values(coalesce(new.owner_id,old.owner_id),auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(new.schedule_id,old.schedule_id));
  return coalesce(new,old);
end $$;
create trigger lms_schedule_subject_audit after insert or update or delete on public.lms_schedule_subjects
  for each row execute function private.lms_schedule_subject_audit();

create function public.lms_save_schedule(p_data jsonb, p_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); identity uuid; prior public.lms_schedules;
  target public.lms_schedules; payload jsonb; subjects uuid[]; current_subjects uuid[];
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_data) k where k not in (
      'id','child_id','day_of_week','start_time','end_time','location','notes','is_recurring','is_active','subject_ids'
    )
  ) then raise exception 'Invalid schedule fields' using errcode='22023'; end if;
  identity:=(p_data->>'id')::uuid;
  if identity is null then raise exception 'Schedule ID required' using errcode='22023'; end if;
  -- Same owner lock/order as the existing conflict trigger, before row locks.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into prior from public.lms_schedules where id=identity for update;
  if prior.id is not null and prior.owner_id<>actor then
    raise exception 'Schedule unavailable' using errcode='42501';
  end if;
  if p_version is not null and (prior.id is null or prior.version<>p_version) then
    raise exception 'Data changed or unavailable. Reload before saving.' using errcode='PT409';
  end if;
  select coalesce(array_agg(subject_id order by subject_id),'{}'::uuid[]) into current_subjects
    from public.lms_schedule_subjects where schedule_id=identity;
  if p_data ? 'subject_ids' then
    if jsonb_typeof(p_data->'subject_ids') is distinct from 'array' then
      raise exception 'subject_ids must be an array' using errcode='22023';
    end if;
    select array_agg(value::uuid order by value::uuid) into subjects from jsonb_array_elements_text(p_data->'subject_ids');
  elsif prior.id is not null and p_version is not null then subjects:=current_subjects;
  else raise exception 'Pilih minimal satu mata pelajaran' using errcode='23514'; end if;
  if coalesce(cardinality(subjects),0)=0 or array_position(subjects,null) is not null then
    raise exception 'Pilih minimal satu mata pelajaran' using errcode='23514';
  end if;
  if cardinality(subjects)<>(select count(distinct id) from unnest(subjects) id) then
    raise exception 'Mata pelajaran duplikat' using errcode='23505';
  end if;
  -- Lock against concurrent deactivation/deletion. Existing inactive associations
  -- may remain for historical editing, but inactive subjects cannot be added.
  perform 1 from public.lms_subjects where owner_id=actor and id=any(subjects) order by id for share;
  if exists(select 1 from unnest(subjects) requested(subject_id) where not exists(
    select 1 from public.lms_subjects s where s.id=requested.subject_id and s.owner_id=actor
      and (s.is_active or requested.subject_id=any(current_subjects))
  )) then raise exception 'Mata pelajaran tidak aktif atau tidak tersedia' using errcode='42501'; end if;
  payload:=p_data-'subject_ids';
  if prior.id is not null and p_version is null then
    target:=jsonb_populate_record(prior,payload);
    if to_jsonb(prior)<>to_jsonb(target) or subjects<>current_subjects then
      raise exception 'Conflicting create request' using errcode='PT409';
    end if;
    return to_jsonb(prior)||jsonb_build_object('subject_ids',subjects);
  end if;
  if prior.id is null then
    target:=jsonb_populate_record(null::public.lms_schedules,
      jsonb_build_object('notes','','is_recurring',true,'is_active',true)||payload);
    insert into public.lms_schedules(id,owner_id,child_id,day_of_week,start_time,end_time,location,notes,is_recurring,is_active)
      values(identity,actor,target.child_id,target.day_of_week,target.start_time,target.end_time,target.location,target.notes,target.is_recurring,target.is_active)
      returning * into target;
  else
    target:=jsonb_populate_record(prior,payload);
    update public.lms_schedules set child_id=target.child_id,day_of_week=target.day_of_week,
      start_time=target.start_time,end_time=target.end_time,location=target.location,notes=target.notes,
      is_recurring=target.is_recurring,is_active=target.is_active
      where id=identity and owner_id=actor and version=p_version returning * into target;
  end if;
  delete from public.lms_schedule_subjects where schedule_id=identity and not(subject_id=any(subjects));
  insert into public.lms_schedule_subjects(schedule_id,subject_id,owner_id)
    select identity,id,actor from unnest(subjects) id on conflict(schedule_id,subject_id) do nothing;
  return to_jsonb(target)||jsonb_build_object('subject_ids',subjects);
end $$;
revoke all on function public.lms_save_schedule(jsonb,integer) from public,anon;
grant execute on function public.lms_save_schedule(jsonb,integer) to authenticated;
revoke all on function private.lms_schedule_subject_required(), private.lms_schedule_subject_audit() from public,anon,authenticated;

-- Keep the generic CRUD entry point compatible with schedule callers, but route
-- them through the same atomic boundary. Preserve all other entities verbatim.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.lms_save_record(text,jsonb,integer)'::regprocedure);
  if position('  if auth.uid() is null' in definition)=0 then raise exception 'Unexpected lms_save_record definition'; end if;
  definition:=replace(definition,'  if auth.uid() is null',
    E'  if p_table=''lms_schedules'' then return public.lms_save_schedule(p_data,p_version); end if;\n  if auth.uid() is null');
  execute definition;
end $$;

-- Patch only the schedule branch of the trusted parent RPC. Token scope,
-- revocation, report subjects, attendance and all other sections stay intact.
do $$ declare definition text; old_query text; new_query text; begin
  definition:=pg_get_functiondef('public.lms_parent_request(text,text,text,integer,text,uuid,uuid)'::regprocedure);
  old_query:=$old$select a.id,a.day_of_week,a.start_time,a.end_time,a.location,jsonb_build_object('name',s.name) subject from public.lms_schedules a join public.lms_subjects s on s.id=a.subject_id where child_id=link.child_id and a.is_active order by day_of_week,start_time,a.id limit 20 offset p_page*20$old$;
  new_query:=$new$select a.id,a.day_of_week,a.start_time,a.end_time,a.location,
    coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id)
      from public.lms_schedule_subjects ss join public.lms_subjects s on s.owner_id=ss.owner_id and s.id=ss.subject_id
      where ss.owner_id=a.owner_id and ss.schedule_id=a.id),'[]'::jsonb) subjects
    from public.lms_schedules a where a.owner_id=link.owner_id and a.child_id=link.child_id and a.is_active
    order by a.day_of_week,a.start_time,a.id limit 20 offset p_page*20$new$;
  if position(old_query in definition)=0 then raise exception 'Unexpected lms_parent_request schedule query'; end if;
  execute replace(definition,old_query,new_query);
end $$;

-- Every runtime reference is now migrated; no CASCADE hides dependencies.
alter table public.lms_schedules drop column subject_id;
notify pgrst, 'reload schema';
commit;
