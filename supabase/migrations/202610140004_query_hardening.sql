begin;
create or replace function public.comment_teacher(p_child uuid,p_report uuid,p_message text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare existing public.comments;
begin
 if not exists(select 1 from public.children where id=p_child and owner_id=auth.uid()) then raise exception 'Child unavailable' using errcode='42501'; end if;
 insert into public.comments(id,owner_id,child_id,report_id,sender_user_id,message,read_by_teacher_at)
  values(p_id,auth.uid(),p_child,p_report,auth.uid(),trim(p_message),now()) on conflict(id) do nothing;
 select * into existing from public.comments where id=p_id;
 if existing.owner_id is distinct from auth.uid() or existing.child_id<>p_child or existing.report_id is distinct from p_report or existing.message<>trim(p_message) or existing.sender_user_id is distinct from auth.uid() then
   raise exception 'Conflicting comment request';
 end if;
end $$;

create function public.invoice_page(p_child uuid default null,p_page integer default 0) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('total',(select count(*) from public.invoices where p_child is null or child_id=p_child),'items',coalesce((select jsonb_agg(x) from (
  select i.*,jsonb_build_object('full_name',c.full_name) child,
   coalesce((select sum(t.amount) from public.payment_transactions t where t.invoice_id=i.id),0) paid_amount,
   (select count(*) from public.payment_transactions t where t.invoice_id=i.id) transaction_count,
   coalesce((select jsonb_agg(t) from (select amount,date,method from public.payment_transactions where invoice_id=i.id order by created_at desc,id limit 20) t),'[]') transactions
  from public.invoices i join public.children c on c.id=i.child_id where (p_child is null or i.child_id=p_child) and p_page between 0 and 10000
  order by i.period desc,i.id limit 20 offset greatest(p_page,0)*20
 ) x),'[]'));
$$;
revoke all on function public.invoice_page(uuid,integer) from public,anon;
grant execute on function public.invoice_page(uuid,integer) to authenticated;

create function public.transaction_page(p_invoice uuid,p_page integer default 0) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('total',(select count(*) from public.payment_transactions where invoice_id=p_invoice),'items',coalesce((select jsonb_agg(t) from (
  select id,amount,date,method,notes,created_at from public.payment_transactions where invoice_id=p_invoice and p_page between 0 and 10000 order by created_at desc,id limit 20 offset greatest(p_page,0)*20
 ) t),'[]'));
$$;
revoke all on function public.transaction_page(uuid,integer) from public,anon;
grant execute on function public.transaction_page(uuid,integer) to authenticated;

-- Tighten DELETE races: a report-scoped parent request locks the report too.
create function private.parent_comment_guard() returns trigger language plpgsql set search_path='' as $$
declare link private.report_links;
begin
 if new.report_link_id is not null then
  select * into link from private.report_links where id=new.report_link_id;
  if link.owner_id<>new.owner_id or link.child_id<>new.child_id or link.revoked_at is not null or link.expires_at<=now() or (link.report_id is not null and link.report_id is distinct from new.report_id) then raise exception 'Link outside comment scope' using errcode='42501'; end if;
 end if; return new;
end $$;
create trigger parent_comment_guard before insert on public.comments for each row execute function private.parent_comment_guard();
commit;
