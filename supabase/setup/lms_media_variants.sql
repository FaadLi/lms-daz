-- Singapore only: allow immutable private derivatives of an owned LMS asset.
-- No application table, column, original object, or existing policy is modified.
BEGIN;
DO $identity$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='lms_push_function_url'
    AND decrypted_secret='https://zfhrzehocewhflytfbyl.supabase.co/functions/v1/push-dispatch') THEN
    RAISE EXCEPTION 'Singapore identity guard failed';
  END IF;
END $identity$;
DO $policy$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='lms_media_variant_insert') THEN
    EXECUTE $sql$CREATE POLICY lms_media_variant_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK(bucket_id='lms_media' AND owner_id=auth.uid()::text AND EXISTS(
      SELECT 1 FROM public.lms_media_assets asset
      WHERE asset.owner_id=auth.uid() AND asset.state IN ('pending','ready') AND storage.objects.name IN (
        asset.object_path||'.lms-v1-avatar.webp',asset.object_path||'.lms-v1-thumbnail.webp',asset.object_path||'.lms-v1-detail.webp'
      )
    ))$sql$;
  END IF;
END $policy$;
COMMIT;
