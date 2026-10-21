-- Run only after migration 014, Edge deployment and Vault configuration.
-- Vault names: lms_push_function_url, lms_push_dispatch_secret.
-- Store the same random dispatch secret in the Edge Function environment.
-- Never embed secret values in a cron command, migration or browser variable.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$ begin
  if (select count(*) from vault.decrypted_secrets where name in ('lms_push_function_url','lms_push_dispatch_secret'))<>2 then
    raise exception 'Configure the two push Vault secrets before scheduling';
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
