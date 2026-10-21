// Read-only migration evidence. Logs counts/hashes/schema, never record bodies or credentials.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
const env = { ...parseEnv(readFileSync(".env.local", "utf8")), ...process.env };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
export async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql, read_only: true }),
    },
  );
  if (!response.ok)
    throw new Error(`Database audit failed (${response.status})`);
  return response.json();
}
const mode = process.argv[2];
assert.ok(["before", "after"].includes(mode), "Use before or after");
const snapshot = (
  await query(`select
  (select count(*) from public.lms_lesson_reports) reports,
  (select md5(coalesce(string_agg(to_jsonb(r)::text,'' order by id),'')) from public.lms_lesson_reports r) report_hash,
  (select md5(coalesce(string_agg(jsonb_build_array(id,subject_id,owner_id,score,created_at)::text,'' order by id),'')) from public.lms_lesson_reports) legacy_relation_hash,
  (select md5(coalesce(string_agg(to_jsonb(m)::text,'' order by id),'')) from public.lms_media_assets m) media_hash,
  (select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),'')) from public.lms_comments c) comment_hash,
  (select md5(coalesce(string_agg(to_jsonb(a)::text,'' order by id),'')) from private.lms_audit_logs a) audit_hash
`)
)[0];
mkdirSync("supabase/.temp", { recursive: true });
const file = "supabase/.temp/report-subjects-before.json";
if (mode === "before") {
  const schema = await query(
    `select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in ('lms_lesson_reports','lms_subjects','lms_schedule_subjects') order by table_name,ordinal_position`,
  );
  const constraints = await query(
    `select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.lms_lesson_reports'::regclass`,
  );
  const migrations = await query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  writeFileSync(
    file,
    JSON.stringify({ ref, snapshot, schema, constraints, migrations }, null, 2),
  );
  console.log(
    JSON.stringify({ ref, snapshot, schema, constraints, migrations }),
  );
} else {
  const before = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(before.ref, ref);
  // jsonb numeric textual representations can differ after integer -> numeric.
  assert.deepEqual(
    snapshot,
    before.snapshot,
    "Existing report rows/media/comments/audit must remain unchanged",
  );
  const integrity = (
    await query(`select
    (select count(*) from public.lms_lesson_report_subjects) relations,
    (select md5(coalesce(string_agg(jsonb_build_array(report_id,subject_id,owner_id,score,created_at)::text,'' order by report_id),'')) from public.lms_lesson_report_subjects) relation_hash,
    (select count(*) from public.lms_lesson_reports r where r.score is distinct from (select round(avg(rs.score),1) from public.lms_lesson_report_subjects rs where rs.report_id=r.id)) inconsistent,
    (select count(*) from public.lms_lesson_report_subjects rs join public.lms_lesson_reports r on r.id=rs.report_id join public.lms_subjects s on s.id=rs.subject_id where r.owner_id<>rs.owner_id or s.owner_id<>rs.owner_id) owner_mismatches,
    has_table_privilege('authenticated','public.lms_lesson_report_subjects','INSERT,UPDATE,DELETE') direct_relation_write,
    has_table_privilege('authenticated','public.lms_lesson_reports','INSERT,UPDATE,DELETE') direct_report_write,
    has_table_privilege('anon','public.lms_lesson_report_subjects','SELECT') anonymous_read,
    (select rowsecurity from pg_tables where schemaname='public' and tablename='lms_lesson_report_subjects') rls
  `)
  )[0];
  assert.equal(integrity.relation_hash, before.snapshot.legacy_relation_hash);
  assert.equal(integrity.inconsistent, 0);
  assert.equal(integrity.owner_mismatches, 0);
  assert.equal(integrity.direct_relation_write, false);
  assert.equal(integrity.direct_report_write, false);
  assert.equal(integrity.anonymous_read, false);
  assert.equal(integrity.rls, true);
  writeFileSync(
    "supabase/.temp/report-subjects-after.json",
    JSON.stringify({ ref, snapshot, integrity, preserved: true }, null, 2),
  );
  console.log(JSON.stringify({ ref, snapshot, integrity, preserved: true }));
}
