begin;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.parent_request(text,text,text,integer,text,uuid,uuid)'::regprocedure);
 if position('on conflict(id) do nothing;' in definition)=0 then raise exception 'Unexpected parent_request definition'; end if;
 definition:=replace(definition,'on conflict(id) do nothing;',$replacement$on conflict(id) do nothing;
   if not exists(select 1 from public.comments where id=p_id and report_link_id=link.id and child_id=link.child_id and report_id is not distinct from p_report and message=trim(p_message)) then
     raise exception 'Conflicting comment request' using errcode='PT409';
   end if;$replacement$);
 execute definition;
end $$;
commit;
