begin;

create table public.lms_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null unique,
  child_id uuid not null,
  type text not null default 'parent_comment' check (type='parent_comment'),
  title text not null default 'Komentar baru',
  body text not null default 'Ada komentar baru pada laporan belajar. Buka aplikasi untuk melihatnya.',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(user_id,comment_id) references public.lms_comments(owner_id,id) on delete cascade,
  foreign key(user_id,child_id) references public.lms_children(owner_id,id) on delete cascade
);
create index lms_notifications_user_created on public.lms_notifications(user_id,created_at desc,id);
create index lms_notifications_unread on public.lms_notifications(user_id) where read_at is null;

create table public.lms_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check(length(endpoint) between 20 and 2048),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lms_push_subscriptions_user on public.lms_push_subscriptions(user_id);

-- One durable delivery per comment and device, with an exclusive, expiring lease.
-- No network work happens inside the parent comment transaction.
create table private.lms_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.lms_notifications(id) on delete cascade,
  subscription_id uuid not null references public.lms_push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  leased_until timestamptz,
  last_status integer,
  finished_at timestamptz,
  unique(notification_id,subscription_id)
);
create index lms_push_deliveries_due on private.lms_push_deliveries(next_attempt_at) where state in ('pending','sending');

alter table public.lms_notifications enable row level security;
alter table public.lms_push_subscriptions enable row level security;
alter table private.lms_push_deliveries enable row level security;
create policy lms_notifications_recipient on public.lms_notifications for select to authenticated using(user_id=(select auth.uid()));
create policy lms_push_subscriptions_owner on public.lms_push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.lms_notifications,public.lms_push_subscriptions from public,anon,authenticated;
grant select on public.lms_notifications,public.lms_push_subscriptions to authenticated;
grant all on public.lms_notifications,public.lms_push_subscriptions to service_role;
revoke all on private.lms_push_deliveries from public,anon,authenticated;

create function private.lms_notify_parent_comment() returns trigger
language plpgsql security definer set search_path='' as $$
declare notification uuid;
begin
  if new.sender_user_id is not null or new.report_link_id is null then return new; end if;
  insert into public.lms_notifications(user_id,comment_id,child_id)
    values(new.owner_id,new.id,new.child_id) on conflict(comment_id) do nothing
    returning id into notification;
  if notification is not null then
    insert into private.lms_push_deliveries(notification_id,subscription_id)
      select notification,id from public.lms_push_subscriptions where user_id=new.owner_id
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger lms_notify_parent_comment after insert on public.lms_comments
  for each row execute function private.lms_notify_parent_comment();

-- Keep the existing Comments tab and Notification Center read state consistent.
create function private.lms_sync_comment_notification_read() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.lms_notifications set read_at=new.read_by_teacher_at
    where comment_id=new.id and read_at is null;
  return new;
end $$;
create trigger lms_sync_comment_notification_read after update of read_by_teacher_at on public.lms_comments
  for each row when(new.read_by_teacher_at is not null)
  execute function private.lms_sync_comment_notification_read();

create function public.lms_notification_feed() returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'unread',(select count(*) from public.lms_notifications where read_at is null),
    'items',(select coalesce(jsonb_agg(n order by n.created_at desc,n.id),'[]') from
      (select id,comment_id,child_id,type,title,body,read_at,created_at from public.lms_notifications order by created_at desc,id limit 20) n)
  );
$$;
create function public.lms_mark_notification_read(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare comment uuid;
begin
  update public.lms_notifications set read_at=coalesce(read_at,now())
    where id=p_id and user_id=auth.uid() returning comment_id into comment;
  if comment is null then return false; end if;
  update public.lms_comments set read_by_teacher_at=coalesce(read_by_teacher_at,now())
    where id=comment and owner_id=auth.uid();
  return true;
end $$;

create function public.lms_save_push_subscription(p_endpoint text,p_p256dh text,p_auth text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
  -- Only known browser push services: an authenticated caller cannot turn the
  -- dispatcher into a general HTTP client for arbitrary/private destinations.
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)?push\.apple\.com|([a-z0-9-]+\.)?notify\.windows\.com)/[A-Za-z0-9/_?=.%~:+-]+$'
    or length(p_endpoint)>2048 or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth !~ '^[A-Za-z0-9_-]{22}$'
    or p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'Invalid push subscription' using errcode='22023';
  end if;
  if (select count(*) from public.lms_push_subscriptions where user_id=auth.uid())>=20
     and not exists(select 1 from public.lms_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid()) then
    raise exception 'Too many devices' using errcode='22023';
  end if;
  insert into public.lms_push_subscriptions(user_id,endpoint,p256dh,auth)
    values(auth.uid(),p_endpoint,p_p256dh,p_auth)
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now()
      where public.lms_push_subscriptions.user_id=auth.uid()
    returning id into result;
  if result is null then raise exception 'Device belongs to another session' using errcode='42501'; end if;
  return result;
end $$;
create function public.lms_get_push_subscription(p_endpoint text) returns uuid
language sql security invoker set search_path='' as $$
  select id from public.lms_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
$$;
create function public.lms_remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path='' as $$
  delete from public.lms_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
$$;

create function public.lms_claim_push(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update private.lms_push_deliveries d set state='failed',finished_at=now(),lease_id=null,leased_until=null
    from public.lms_notifications n where n.id=d.notification_id and d.state in ('pending','sending')
    and (n.read_at is not null or n.created_at<now()-interval '24 hours' or (d.attempts>=3 and coalesce(d.leased_until,now())<=now()));
  with candidates as (
    select d.id from private.lms_push_deliveries d
    where d.attempts<3 and ((d.state='pending' and d.next_attempt_at<=now()) or (d.state='sending' and d.leased_until<now()))
    order by d.next_attempt_at,d.id limit greatest(1,least(coalesce(p_limit,25),25)) for update skip locked
  ), claimed as (
    update private.lms_push_deliveries d set state='sending',attempts=attempts+1,lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes'
    from candidates c where d.id=c.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease_id',d.lease_id,'notification_id',n.id,'child_id',n.child_id,
    'subscription_id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)),'[]') into result
    from claimed d join public.lms_notifications n on n.id=d.notification_id
    join public.lms_push_subscriptions s on s.id=d.subscription_id and s.user_id=n.user_id;
  return result;
end $$;
create function public.lms_finish_push(p_id uuid,p_lease uuid,p_status integer) returns void
language plpgsql security definer set search_path='' as $$
declare delivery private.lms_push_deliveries;
begin
  select * into delivery from private.lms_push_deliveries where id=p_id and lease_id=p_lease and state='sending' for update;
  if not found then return; end if;
  if p_status in (404,410) then
    delete from public.lms_push_subscriptions where id=delivery.subscription_id;
    return;
  end if;
  update private.lms_push_deliveries set
    state=case when p_status between 200 and 299 then 'sent'
      when (p_status in (0,408,429) or p_status between 500 and 599) and attempts<3 then 'pending' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>30*(2^delivery.attempts)::integer),
    finished_at=case when p_status between 200 and 299 or delivery.attempts>=3 or not(p_status in (0,408,429) or p_status between 500 and 599) then now() end,
    last_status=p_status,lease_id=null,leased_until=null where id=p_id;
end $$;

revoke all on function private.lms_notify_parent_comment(),private.lms_sync_comment_notification_read() from public,anon,authenticated;
revoke all on function public.lms_notification_feed(),public.lms_mark_notification_read(uuid),public.lms_save_push_subscription(text,text,text),public.lms_get_push_subscription(text),public.lms_remove_push_subscription(text),public.lms_claim_push(integer),public.lms_finish_push(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.lms_notification_feed(),public.lms_mark_notification_read(uuid),public.lms_save_push_subscription(text,text,text),public.lms_get_push_subscription(text),public.lms_remove_push_subscription(text) to authenticated;
grant execute on function public.lms_claim_push(integer),public.lms_finish_push(uuid,uuid,integer) to service_role;

-- No publication-wide changes; only this recipient-protected table is added.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lms_notifications') then
    alter publication supabase_realtime add table public.lms_notifications;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
