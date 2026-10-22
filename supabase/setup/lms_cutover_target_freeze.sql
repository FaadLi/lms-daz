-- PREPARED ONLY. Singapore LMS emergency write fence; execute only for a rollback/incident.
-- psql -X --set=LMS_TARGET_FREEZE_APPROVED=true --file=... (connection via protected env).
\set ON_ERROR_STOP on
\if :{?LMS_TARGET_FREEZE_APPROVED}
\else
  \echo 'Explicit LMS_TARGET_FREEZE_APPROVED is required.'
  \quit 1
\endif
\if :LMS_TARGET_FREEZE_APPROVED
\else
  \quit 1
\endif
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='lms_push_function_url'
    AND decrypted_secret='https://zfhrzehocewhflytfbyl.supabase.co/functions/v1/push-dispatch') THEN
    RAISE EXCEPTION 'Source identity guard failed';
  END IF;
END $guard$;
-- BEGIN LMS FENCE BODY -- also exercised inside a rolled-back target transaction.
CREATE TABLE IF NOT EXISTS private.lms_cutover_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  active boolean NOT NULL,
  cron_was_active boolean NOT NULL,
  frozen_at timestamptz NOT NULL,
  unfrozen_at timestamptz
);
REVOKE ALL ON private.lms_cutover_state FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.lms_cutover_state(singleton,active,cron_was_active,frozen_at)
SELECT true,true,coalesce((SELECT active FROM cron.job WHERE jobname='lms-push-dispatch'),false),now()
ON CONFLICT(singleton) DO UPDATE SET
  cron_was_active=CASE WHEN lms_cutover_state.active THEN lms_cutover_state.cron_was_active ELSE excluded.cron_was_active END,
  active=true,frozen_at=CASE WHEN lms_cutover_state.active THEN lms_cutover_state.frozen_at ELSE excluded.frozen_at END,
  unfrozen_at=NULL;
SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='lms-push-dispatch';
CREATE OR REPLACE FUNCTION private.lms_cutover_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fence$
BEGIN
  IF TG_TABLE_SCHEMA='storage' THEN
    IF TG_TABLE_NAME='objects' THEN
      IF TG_OP='INSERT' AND NEW.bucket_id<>'lms_media' THEN RETURN NEW; END IF;
      IF TG_OP='DELETE' AND OLD.bucket_id<>'lms_media' THEN RETURN OLD; END IF;
      IF TG_OP='UPDATE' AND OLD.bucket_id<>'lms_media' AND NEW.bucket_id<>'lms_media' THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME='buckets' THEN
      IF TG_OP='INSERT' AND NEW.id<>'lms_media' THEN RETURN NEW; END IF;
      IF TG_OP='DELETE' AND OLD.id<>'lms_media' THEN RETURN OLD; END IF;
      IF TG_OP='UPDATE' AND OLD.id<>'lms_media' AND NEW.id<>'lms_media' THEN RETURN NEW; END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'LMS_MAINTENANCE: writes temporarily disabled' USING ERRCODE='55000';
END $fence$;
REVOKE ALL ON FUNCTION private.lms_cutover_fence() FROM PUBLIC,anon,authenticated,service_role;
DO $install$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname,tablename FROM pg_catalog.pg_tables
    WHERE schemaname IN ('public','private') AND left(tablename,4)='lms_'
      AND tablename NOT LIKE 'lms_cutover_%' ORDER BY schemaname,tablename LOOP
    EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',t.schemaname,t.tablename);
    EXECUTE format('CREATE OR REPLACE TRIGGER aaa_lms_cutover_write_fence BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION private.lms_cutover_fence()',t.schemaname,t.tablename);
    EXECUTE format('CREATE OR REPLACE TRIGGER aaa_lms_cutover_truncate_fence BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION private.lms_cutover_fence()',t.schemaname,t.tablename);
  END LOOP;
END $install$;
CREATE OR REPLACE TRIGGER aaa_lms_cutover_write_fence BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.lms_cutover_fence();
CREATE OR REPLACE TRIGGER aaa_lms_cutover_write_fence BEFORE INSERT OR UPDATE OR DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION private.lms_cutover_fence();
DROP POLICY IF EXISTS lms_cutover_no_insert ON storage.objects;
DROP POLICY IF EXISTS lms_cutover_no_update ON storage.objects;
DROP POLICY IF EXISTS lms_cutover_no_delete ON storage.objects;
CREATE POLICY lms_cutover_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'lms_media');
CREATE POLICY lms_cutover_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'lms_media') WITH CHECK(bucket_id<>'lms_media');
CREATE POLICY lms_cutover_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'lms_media');
-- END LMS FENCE BODY
COMMIT;
-- Set target Edge LMS_MAINTENANCE=1 before this fence, then drain in-flight work.
-- This stops only LMS writes/cron in Singapore. Do not reopen writers before reconciliation.
