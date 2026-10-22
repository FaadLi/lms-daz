-- PREPARED ONLY: source rollback, after stopping Singapore LMS writers/jobs.
\set ON_ERROR_STOP on
\if :{?LMS_ROLLBACK_APPROVED}
\else
  \quit 1
\endif
\if :{?LMS_TARGET_WRITERS_STOPPED}
\else
  \quit 1
\endif
\if :LMS_ROLLBACK_APPROVED
\else
  \quit 1
\endif
\if :LMS_TARGET_WRITERS_STOPPED
\else
  \quit 1
\endif
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='lms_push_function_url'
    AND decrypted_secret='https://zfpfccznrbotrvfqcdzh.supabase.co/functions/v1/push-dispatch') THEN
    RAISE EXCEPTION 'Source identity guard failed';
  END IF;
END $guard$;
DO $remove$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname,tablename FROM pg_catalog.pg_tables
    WHERE schemaname IN ('public','private') AND left(tablename,4)='lms_'
      AND tablename NOT LIKE 'lms_cutover_%' ORDER BY schemaname,tablename LOOP
    EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',t.schemaname,t.tablename);
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_lms_cutover_write_fence ON %I.%I',t.schemaname,t.tablename);
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_lms_cutover_truncate_fence ON %I.%I',t.schemaname,t.tablename);
  END LOOP;
END $remove$;
DROP TRIGGER IF EXISTS aaa_lms_cutover_write_fence ON storage.objects;
DROP TRIGGER IF EXISTS aaa_lms_cutover_write_fence ON storage.buckets;
DROP POLICY IF EXISTS lms_cutover_no_insert ON storage.objects;
DROP POLICY IF EXISTS lms_cutover_no_update ON storage.objects;
DROP POLICY IF EXISTS lms_cutover_no_delete ON storage.objects;
SELECT cron.alter_job(j.jobid,active:=s.cron_was_active)
FROM cron.job j CROSS JOIN private.lms_cutover_state s WHERE j.jobname='lms-push-dispatch' AND s.active;
UPDATE private.lms_cutover_state SET active=false,unfrozen_at=now() WHERE singleton;
COMMIT;
-- Keep source Edge maintenance ON until rollback data reconciliation and routes
-- have been verified. Set it OFF last, with Singapore jobs/writers still stopped.
