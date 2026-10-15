begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  phone text not null default '', institution_name text not null default '',
  avatar_id uuid,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id, id), check (id = owner_id)
);
create table public.parents (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  full_name text not null check(length(trim(full_name)) between 1 and 200),
  whatsapp_number text not null check(whatsapp_number ~ '^62[0-9]{8,13}$'),
  email text not null default '', address text not null default '',
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id, id), unique(owner_id, whatsapp_number)
);
create table public.children (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  parent_id uuid not null, relationship text not null check(relationship in ('Ibu','Ayah','Wali')),
  full_name text not null check(length(trim(full_name)) between 1 and 200), nickname text not null check(length(trim(nickname)) between 1 and 100),
  birth_date date not null, gender text not null check(gender in ('L','P')), grade_level text not null check(length(trim(grade_level)) > 0),
  address text not null default '', notes text not null default '', is_active boolean not null default true, start_date date not null,
  avatar_id uuid, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id, id), foreign key(owner_id, parent_id) references public.parents(owner_id, id) on delete restrict,
  check(birth_date <= start_date)
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check(length(trim(name)) between 1 and 100), is_active boolean not null default true,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, id)
);
create unique index subjects_name_unique on public.subjects(owner_id, lower(trim(name)));
create table public.report_templates (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check(length(trim(name)) > 0), subject_id uuid not null, topic text not null default '', what_learned text not null default '',
  next_step text not null default '', home_practice text not null default '',
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, id),
  foreign key(owner_id, subject_id) references public.subjects(owner_id, id) on delete restrict
);
create table public.schedules (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  child_id uuid not null, subject_id uuid not null, day_of_week integer not null check(day_of_week between 0 and 6),
  start_time time not null, end_time time not null, location text not null check(length(trim(location)) > 0), notes text not null default '',
  is_recurring boolean not null default true, is_active boolean not null default true,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id, id), unique(owner_id, child_id, id), check(end_time > start_time),
  foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  foreign key(owner_id, subject_id) references public.subjects(owner_id, id) on delete restrict
);
create unique index schedules_slot_unique on public.schedules(owner_id, child_id, day_of_week, start_time) where is_active;
create table public.attendance (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  child_id uuid not null, schedule_id uuid, date date not null,
  status text not null check(status in ('hadir','izin','sakit','alpa')), start_time time not null, end_time time not null, notes text not null default '',
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, id),
  foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  foreign key(owner_id, child_id, schedule_id) references public.schedules(owner_id, child_id, id) on delete restrict, check(end_time > start_time),
  unique(owner_id, child_id, date, start_time)
);
create unique index attendance_scheduled_unique on public.attendance(owner_id, schedule_id, date) where schedule_id is not null;
create table public.lesson_reports (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  child_id uuid not null, schedule_id uuid, subject_id uuid not null, date date not null,
  duration_minutes integer not null check(duration_minutes between 1 and 1440), topic text not null check(length(trim(topic)) > 0),
  what_learned text not null check(length(trim(what_learned)) > 0), learning_outcome text not null check(length(trim(learning_outcome)) > 0),
  score integer not null check(score between 0 and 100), teacher_notes text not null default '', next_step text not null default '', home_practice text not null default '',
  shared_at timestamptz,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, id), unique(owner_id, child_id, id),
  foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  foreign key(owner_id, child_id, schedule_id) references public.schedules(owner_id, child_id, id) on delete restrict,
  foreign key(owner_id, subject_id) references public.subjects(owner_id, id) on delete restrict
);
create unique index reports_scheduled_unique on public.lesson_reports(owner_id, schedule_id, date) where schedule_id is not null;
create table public.invoices (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  child_id uuid not null, invoice_number text not null check(length(trim(invoice_number)) > 0), period date not null,
  package_type text not null check(package_type in ('per_pertemuan','bulanan','paket_sesi')), session_count integer,
  amount bigint not null check(amount > 0 and amount <= 1000000000000), due_date date not null, notes text not null default '',
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, id), unique(owner_id, invoice_number),
  foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  check((package_type = 'paket_sesi' and session_count > 0) or (package_type <> 'paket_sesi' and session_count is null)),
  check(extract(day from period) = 1)
);
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete restrict,
  invoice_id uuid not null, amount bigint not null check(amount > 0), date date not null,
  method text not null check(method in ('Transfer Bank','Tunai','E-Wallet')), notes text not null default '',
  idempotency_key uuid not null, created_at timestamptz not null default now(),
  unique(owner_id, idempotency_key), foreign key(owner_id, invoice_id) references public.invoices(owner_id, id) on delete restrict
);
create table private.report_links (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete restrict, child_id uuid not null, report_id uuid,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null, revoked_at timestamptz,
  access_count bigint not null default 0, last_accessed_at timestamptz, created_at timestamptz not null default now(),
  foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  foreign key(owner_id, child_id, report_id) references public.lesson_reports(owner_id, child_id, id) on delete restrict
);
create unique index report_links_active_unique on private.report_links(owner_id, child_id) where revoked_at is null;
create table public.comments (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  child_id uuid not null, report_id uuid, sender_user_id uuid references auth.users(id) on delete restrict, report_link_id uuid references private.report_links(id) on delete restrict,
  message text not null check(length(trim(message)) between 1 and 2000), read_by_teacher_at timestamptz, created_at timestamptz not null default now(),
  unique(owner_id, id), foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  foreign key(owner_id, child_id, report_id) references public.lesson_reports(owner_id, child_id, id) on delete restrict,
  check((sender_user_id = owner_id and report_link_id is null) or (sender_user_id is null and report_link_id is not null))
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid, report_id uuid, kind text not null check(kind in ('profile','avatar','photo')),
  object_path text not null unique, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 5242880), caption text not null default '',
  state text not null default 'pending' check(state in ('pending','ready','deleting')), created_at timestamptz not null default now(), unique(owner_id, id),
  foreign key(owner_id, child_id) references public.children(owner_id, id) on delete restrict,
  foreign key(owner_id, child_id, report_id) references public.lesson_reports(owner_id, child_id, id) on delete restrict,
  check((kind = 'profile' and child_id is null and report_id is null) or (kind = 'avatar' and child_id is not null and report_id is null) or (kind = 'photo' and child_id is not null and report_id is not null)),
  check(object_path like owner_id::text || '/%')
);
alter table public.profiles add foreign key(owner_id, avatar_id) references public.media_assets(owner_id, id) on delete restrict;
alter table public.children add foreign key(owner_id, avatar_id) references public.media_assets(owner_id, id) on delete restrict;
create table private.audit_logs (
  id bigint generated always as identity primary key, owner_id uuid not null, actor_id uuid, action text not null, entity text not null, entity_id uuid, created_at timestamptz not null default now()
);
create table private.request_limits (key text not null, window_start timestamptz not null, count integer not null, primary key(key, window_start));

create index children_owner_active on public.children(owner_id, is_active, full_name);
create index children_parent on public.children(owner_id, parent_id);
create index templates_subject on public.report_templates(owner_id, subject_id);
create index schedules_day on public.schedules(owner_id, day_of_week, start_time);
create index schedules_subject on public.schedules(owner_id, subject_id);
create index attendance_history on public.attendance(owner_id, child_id, date desc, id);
create index attendance_schedule on public.attendance(owner_id, child_id, schedule_id);
create index reports_history on public.lesson_reports(owner_id, child_id, date desc, id);
create index reports_schedule on public.lesson_reports(owner_id, child_id, schedule_id);
create index reports_subject on public.lesson_reports(owner_id, subject_id);
create index invoices_due on public.invoices(owner_id, child_id, due_date);
create index transactions_invoice on public.payment_transactions(owner_id, invoice_id, date desc);
create index comments_history on public.comments(owner_id, child_id, created_at desc, id);
create index comments_report on public.comments(owner_id, child_id, report_id);
create index comments_unread on public.comments(owner_id, child_id) where read_by_teacher_at is null;
create index media_report on public.media_assets(owner_id, report_id, state);
create index media_child on public.media_assets(owner_id, child_id, state);
create index links_report on private.report_links(owner_id, child_id, report_id);
create index audit_owner on private.audit_logs(owner_id, created_at desc);

create function private.version_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.version := 1; new.created_at := now();
  else
    if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then raise exception 'Ownership is immutable' using errcode = '42501'; end if;
    if new.version <> old.version then raise exception 'Data changed. Reload before saving.' using errcode = '40001'; end if;
    new.version := old.version + 1; new.created_at := old.created_at;
  end if;
  new.updated_at := now(); return new;
end $$;
create function private.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.audit_logs(owner_id, actor_id, action, entity, entity_id)
    values(coalesce(new.owner_id, old.owner_id), auth.uid(), TG_OP, TG_TABLE_NAME, coalesce(new.id, old.id));
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','parents','children','subjects','report_templates','schedules','attendance','lesson_reports','invoices'] loop
    execute format('create trigger version_guard before insert or update on public.%I for each row execute function private.version_guard()', t);
  end loop;
  foreach t in array array['profiles','parents','children','subjects','report_templates','schedules','attendance','lesson_reports','invoices','comments','payment_transactions','media_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_select on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()', t);
  end loop;
  foreach t in array array['profiles','parents','children','subjects','report_templates','schedules','attendance','lesson_reports','invoices'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_update on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;
alter table private.report_links enable row level security;
alter table private.audit_logs enable row level security;
alter table private.request_limits enable row level security;

create function public.save_record(p_table text, p_data jsonb, p_version integer default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; cols text; vals text; changes text; identity uuid := (p_data->>'id')::uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_table not in ('profiles','parents','children','subjects','report_templates','schedules','attendance','lesson_reports','invoices') then raise exception 'Invalid entity'; end if;
  if identity is null or p_data ?| array['owner_id','version','created_at','updated_at','shared_at','avatar_id'] then raise exception 'Invalid fields'; end if;
  select string_agg(format('%I', key), ', '), string_agg(format('(jsonb_populate_record(null::public.%I, $1)).%I', p_table, key), ', '), string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', key, p_table, key), ', ')
    into cols, vals, changes from jsonb_object_keys(p_data) key where key <> 'id';
  if cols is null then raise exception 'No values'; end if;
  if p_version is null then
    execute format('insert into public.%I (id, %s) values ($2, %s) on conflict (id) do nothing returning to_jsonb(%I.*)', p_table, cols, vals, p_table) into r using p_data, identity;
    if r is null then
      execute format('select to_jsonb(t.*) from public.%I t where id=$1 and owner_id=auth.uid()', p_table) into r using identity;
      if r is null or not r @> p_data then raise exception 'Conflicting create request' using errcode='40001'; end if;
    end if;
  else
    execute format('update public.%I set %s where id=$2 and version=$3 returning to_jsonb(%I.*)', p_table, changes, p_table) into r using p_data, identity, p_version;
    if r is null then raise exception 'Data changed or unavailable. Reload before saving.' using errcode='40001'; end if;
  end if;
  return r;
end $$;

create function public.create_child(p_child jsonb, p_parent jsonb default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if p_parent is not null then perform public.save_record('parents', p_parent); end if;
  return public.save_record('children', p_child);
end $$;

create function public.record_payment(p_invoice uuid, p_amount bigint, p_date date, p_method text, p_key uuid, p_notes text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare bill public.invoices; prior public.payment_transactions; total bigint; result public.payment_transactions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into bill from public.invoices where id=p_invoice and owner_id=auth.uid() for update;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  select * into prior from public.payment_transactions where owner_id=auth.uid() and idempotency_key=p_key;
  if found then
    if prior.invoice_id<>p_invoice or prior.amount<>p_amount or prior.date<>p_date or prior.method<>p_method or prior.notes<>p_notes then raise exception 'Idempotency key reused with different values'; end if;
    return to_jsonb(prior);
  end if;
  select coalesce(sum(amount),0) into total from public.payment_transactions where invoice_id=p_invoice;
  if p_amount is null or p_amount<=0 or total+p_amount>bill.amount then raise exception 'Amount exceeds outstanding balance'; end if;
  insert into public.payment_transactions(owner_id,invoice_id,amount,date,method,idempotency_key,notes)
    values(auth.uid(),p_invoice,p_amount,p_date,p_method,p_key,p_notes) returning * into result;
  return to_jsonb(result);
end $$;

create function private.invoice_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP='UPDATE' and exists(select 1 from public.payment_transactions where invoice_id=old.id) then
    raise exception 'Invoice with payments is immutable';
  end if; return new;
end $$;
create trigger invoice_guard before update on public.invoices for each row execute function private.invoice_guard();

create function public.comment_teacher(p_child uuid, p_report uuid, p_message text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.children where id=p_child and owner_id=auth.uid()) then raise exception 'Child unavailable' using errcode='42501'; end if;
  insert into public.comments(id,owner_id,child_id,report_id,sender_user_id,message,read_by_teacher_at)
    values(p_id,auth.uid(),p_child,p_report,auth.uid(),trim(p_message),now()) on conflict(id) do nothing;
end $$;
create function public.read_comments(p_child uuid) returns void language sql security definer set search_path = '' as $$
  update public.comments set read_by_teacher_at=now() where owner_id=auth.uid() and child_id=p_child and read_by_teacher_at is null;
$$;
create function public.mark_report_shared(p_id uuid, p_version integer) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.lesson_reports set shared_at=now() where id=p_id and owner_id=auth.uid() and version=p_version;
  if not found then raise exception 'Data changed or unavailable' using errcode='40001'; end if;
end $$;

create function public.dashboard_stats() returns jsonb language sql security invoker set search_path = '' as $$
 select jsonb_build_object(
 'children', (select count(*) from public.children where is_active),
 'sessions', (select count(*) from public.schedules where is_active and day_of_week=extract(dow from now() at time zone 'Asia/Jakarta')),
 'present', (select count(*) from public.attendance where date=(now() at time zone 'Asia/Jakarta')::date and status='hadir'),
 'reports', (select count(*) from public.lesson_reports),
 'unread', (select count(*) from public.comments where read_by_teacher_at is null),
 'outstanding', (select coalesce(sum(i.amount - coalesce((select sum(t.amount) from public.payment_transactions t where t.invoice_id=i.id),0)),0) from public.invoices i)
 );
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('lesson-media','lesson-media',false,5242880,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy lesson_media_read on storage.objects for select to authenticated using (
 bucket_id='lesson-media' and exists(select 1 from public.media_assets a where a.object_path=name and a.owner_id=(select auth.uid()) and a.state='ready')
);
create policy lesson_media_upload on storage.objects for insert to authenticated with check (
 bucket_id='lesson-media' and exists(select 1 from public.media_assets a where a.object_path=name and a.owner_id=(select auth.uid()) and a.state='pending')
);
-- No UPDATE/DELETE object grants: deletion goes through the cleanup function.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_record','create_child','record_payment','comment_teacher','read_comments','mark_report_shared','dashboard_stats') loop
   execute format('revoke all on function %s from public, anon', f.signature);
   execute format('grant execute on function %s to authenticated', f.signature);
 end loop;
end $$;
commit;
