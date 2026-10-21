-- Run only after migration 014, Edge deployment and Vault configuration.
-- Vault names: lms_push_function_url, lms_push_dispatch_secret.
-- Store the same random dispatch secret in the Edge Function environment.
-- Never embed secret values in a cron command, migration or browser variable.
begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(hashtextextended('lms-push-dispatch-setup',0));

do $$ declare endpoint text; dispatch text; begin
  if (select count(*) from vault.decrypted_secrets where name in ('lms_push_function_url','lms_push_dispatch_secret'))<>2 then
    raise exception 'Configure the two push Vault secrets before scheduling';
  end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='lms_push_function_url';
  select decrypted_secret into dispatch from vault.decrypted_secrets where name='lms_push_dispatch_secret';
  if endpoint is null or endpoint !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/push-dispatch$' then
    raise exception 'Invalid push function URL in Vault';
  end if;
  if dispatch is null or length(dispatch) not between 32 and 256 or dispatch !~ '^[!-~]+$' then
    raise exception 'Invalid dispatch secret in Vault';
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Keep net, vault and cron out of the Data API exposed schemas. The setup
-- helper verifies this boundary without altering Supabase-owned table grants.

-- pg_cron updates a named job for the same owner. Refuse a second owner rather
-- than creating another job or deleting another role's existing configuration.
do $$ begin
  if exists(select 1 from cron.job where jobname='lms-push-dispatch' and username<>current_user) then
    raise exception 'Push job belongs to another role; review ownership before setup';
  end if;
end $$;
select cron.schedule('lms-push-dispatch','* * * * *',$cron$
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='lms_push_function_url'),
    headers:=jsonb_build_object('Content-Type','application/json','x-lms-push-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='lms_push_dispatch_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  ) where exists(select 1 from private.lms_push_deliveries where state in ('pending','sending') and next_attempt_at<=now());
$cron$);
-- Re-running setup also re-enables a deliberately paused job of this owner.
select cron.alter_job(jobid,active:=true) from cron.job
  where jobname='lms-push-dispatch' and username=current_user;
do $$ begin
  if (select count(*) from cron.job where jobname='lms-push-dispatch')<>1 then
    raise exception 'Expected exactly one push scheduler job';
  end if;
end $$;
commit;
