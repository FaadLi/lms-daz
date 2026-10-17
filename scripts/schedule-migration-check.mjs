// Read-only pre/post deployment evidence; no credentials or record bodies logged.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";

const env = { ...parseEnv(readFileSync(".env.local", "utf8")), ...process.env };
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
const query = async (sql) => {
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
};
const mode = process.argv[2];
assert.ok(["before", "after"].includes(mode), "Use before or after");
const old = mode === "before";
const data = (
  await query(`select
  (select count(*) from public.lms_schedules) schedules,
  (select md5(coalesce(string_agg((to_jsonb(s)-'subject_id')::text,'' order by s.id),'')) from public.lms_schedules s) schedule_hash,
  (select count(*) from public.lms_attendance) attendance,
  (select md5(coalesce(string_agg(to_jsonb(a)::text,'' order by a.id),'')) from public.lms_attendance a) attendance_hash,
  (select count(*) from public.lms_lesson_reports) reports,
  (select md5(coalesce(string_agg(to_jsonb(r)::text,'' order by r.id),'')) from public.lms_lesson_reports r) report_hash,
  ${
    old
      ? `(select md5(coalesce(string_agg(jsonb_build_array(id,subject_id,owner_id,created_at)::text,'' order by id),'')) from public.lms_schedules)`
      : `(select md5(coalesce(string_agg(jsonb_build_array(schedule_id,subject_id,owner_id,created_at)::text,'' order by schedule_id),'')) from public.lms_schedule_subjects)`
  } relation_hash
`)
)[0];
mkdirSync("supabase/.temp", { recursive: true });
const baselineFile = "supabase/.temp/schedule-subjects-before.json";
if (old) {
  writeFileSync(baselineFile, JSON.stringify({ ref, ...data }, null, 2));
} else {
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  assert.equal(baseline.ref, ref);
  const { ref: ignored, ...expected } = baseline;
  assert.deepEqual(
    data,
    expected,
    "Existing schedules, subjects, attendance and reports must be identical",
  );
  const integrity = (
    await query(`select
    (select count(*) from public.lms_schedule_subjects) relations,
    (select count(*) from public.lms_schedules s where not exists(select 1 from public.lms_schedule_subjects ss where ss.schedule_id=s.id)) empty_schedules,
    (select count(*) from public.lms_schedule_subjects ss join public.lms_schedules s on s.id=ss.schedule_id join public.lms_subjects sub on sub.id=ss.subject_id where s.owner_id<>ss.owner_id or sub.owner_id<>ss.owner_id) owner_mismatches,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='lms_schedules' and column_name='subject_id') legacy_columns,
    (select count(*) from pg_tables where schemaname='public' and tablename like 'lms_%' and rowsecurity) rls_tables,
    has_table_privilege('authenticated','public.lms_schedules','INSERT,UPDATE,DELETE') direct_schedule_write,
    has_table_privilege('authenticated','public.lms_schedule_subjects','INSERT,UPDATE,DELETE') direct_relation_write,
    has_table_privilege('anon','public.lms_schedule_subjects','SELECT') anonymous_relation_read
  `)
  )[0];
  assert.equal(integrity.empty_schedules, 0);
  assert.equal(integrity.owner_mismatches, 0);
  assert.equal(integrity.legacy_columns, 0);
  assert.equal(integrity.rls_tables, 13);
  assert.equal(integrity.direct_schedule_write, false);
  assert.equal(integrity.direct_relation_write, false);
  assert.equal(integrity.anonymous_relation_read, false);
  // Inspect only aliases that actually refer to schedules; report/template and
  // junction-table subject_id columns remain valid and must not be flagged.
  const functions = await query("select p.proname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'lms_%'");
  const oldReferences = functions.filter(({ prosrc }) =>
    [...prosrc.matchAll(/\b(?:from|join)\s+public\.lms_schedules\s+(?:as\s+)?([a-z_]\w*)/gi)].some(
      ([, alias]) => new RegExp(`\\b${alias}\\.subject_id\\b`, "i").test(prosrc),
    ) || prosrc.includes("lms_schedules_owner_id_subject_id_fkey"),
  ).map(({ proname }) => proname);
  assert.deepEqual(oldReferences, [], "Stored RPCs must not read the removed schedule column");
  integrity.old_schedule_references = oldReferences.length;
  writeFileSync(
    "supabase/.temp/schedule-subjects-after.json",
    JSON.stringify({ ref, ...data, ...integrity, preserved: true }, null, 2),
  );
  console.log(JSON.stringify({ ...integrity, preserved: true }));
}
console.log(JSON.stringify({ mode, project: ref, ...data }));
console.log(
  JSON.stringify({
    migrations: await query(
      "select version from supabase_migrations.schema_migrations order by version",
    ),
  }),
);
