begin;
-- Token endpoints select a globally unique child without an Auth JWT. Their
-- indexes must start with child_id rather than the JWT ownership predicate.
create index reports_parent_history on public.lesson_reports(child_id,date desc,id);
create index attendance_parent_history on public.attendance(child_id,date desc,id);
create index schedules_parent_history on public.schedules(child_id,day_of_week,start_time,id);
create index comments_parent_history on public.comments(child_id,created_at desc,id);
create index invoices_parent_history on public.invoices(child_id,period desc,id);
create index media_parent_history on public.media_assets(child_id,kind,state,created_at desc,id);
create index transactions_invoice_lookup on public.payment_transactions(invoice_id,date desc,id);
commit;
