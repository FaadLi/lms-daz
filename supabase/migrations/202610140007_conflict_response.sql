begin;
-- A stale form is an application conflict, not a serialization failure.
-- PT409 returns HTTP 409 without PostgREST's serialization retry loop.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='private' and p.proname='version_guard') or
  (n.nspname='public' and p.proname in ('save_record','mark_report_shared','finish_upload','prepare_media_delete','delete_record')) loop
  definition:=pg_get_functiondef(f.oid);
  execute replace(definition,'''40001''','''PT409''');
 end loop;
end $$;
commit;
