begin;
alter table public.schedules add constraint recurring_only check(is_recurring);
create function private.schedule_conflict_guard() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 if new.is_active and exists(select 1 from public.schedules s where s.owner_id=new.owner_id and s.id<>new.id and s.is_active and s.day_of_week=new.day_of_week and s.start_time<new.end_time and s.end_time>new.start_time) then
  raise exception 'Schedule overlaps an existing session' using errcode='23505';
 end if;
 return new;
end $$;
create trigger schedule_conflict_guard before insert or update on public.schedules for each row execute function private.schedule_conflict_guard();
commit;
