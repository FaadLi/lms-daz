begin;
-- Keep the prior parent payload label while the static frontend is rolling out.
-- The relation details and token authorization remain the same as migration 012.
do $$ declare definition text; marker text; replacement text; begin
  definition:=pg_get_functiondef('public.lms_parent_request(text,text,text,integer,text,uuid,uuid)'::regprocedure);
  marker:='r.score,r.teacher_notes,r.next_step,r.home_practice,';
  replacement:=$sql$r.score,r.teacher_notes,r.next_step,r.home_practice,
       (select jsonb_build_object('name',s.name) from public.lms_subjects s where s.owner_id=r.owner_id and s.id=r.subject_id) subject,$sql$;
  if position(marker in definition)=0 or position(') report_subjects' in definition)=0 then
    raise exception 'Unexpected multi-subject parent projection';
  end if;
  execute replace(definition,marker,replacement);
end $$;
notify pgrst,'reload schema';
commit;
