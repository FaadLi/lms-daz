import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const child = "44444444-4444-4444-8444-444444444444";
const report = "66666666-6666-4666-8666-666666666666";
const legacyPath = `${owner}/preserved.png`;
const names = {
  public: [
    "profiles",
    "parents",
    "children",
    "subjects",
    "report_templates",
    "schedules",
    "attendance",
    "lesson_reports",
    "invoices",
    "payment_transactions",
    "comments",
    "media_assets",
  ],
  private: ["report_links", "audit_logs", "request_limits"],
};
let db: PGlite;
let before: unknown[];
let after: unknown[];
async function snapshot(prefix: string) {
  const rows = [];
  for (const [schema, tables] of Object.entries(names))
    for (const name of tables) {
      const table = `${schema}.${prefix}${name}`;
      rows.push(
        (
          await db.query(
            `select '${table}'::regclass::oid oid,coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') rows from ${table} t`,
          )
        ).rows[0],
      );
    }
  return rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
 insert into auth.users values('${owner}');select set_config('request.jwt.claim.sub','${owner}',false);`);
  for (const name of readdirSync("supabase/migrations")
    .filter((name) => /^20261014000[1-9]_/.test(name))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  // Intentional legacy names exercise the actual pre-migration schema and rows.
  await db.exec(`
 insert into public.profiles(id,name) values('${owner}','Preserved teacher');
 insert into public.parents(id,full_name,whatsapp_number) values('33333333-3333-4333-8333-333333333333','Preserved guardian','6281234567890');
 insert into public.children(id,parent_id,relationship,full_name,nickname,birth_date,gender,grade_level,start_date) values('${child}','33333333-3333-4333-8333-333333333333','Wali','Preserved pupil','Pupil','2018-01-01','P','SD','2026-10-14');
 insert into public.subjects(id,name) values('55555555-5555-4555-8555-555555555555','Preserved subject');
 insert into public.lesson_reports(id,child_id,subject_id,date,duration_minutes,topic,what_learned,learning_outcome,score) values('${report}','${child}','55555555-5555-4555-8555-555555555555','2026-10-14',60,'Topic','Material','Observed',80);
 insert into public.media_assets(owner_id,child_id,report_id,kind,object_path,mime_type,size_bytes,state) values('${owner}','${child}','${report}','photo','${legacyPath}','image/png',100,'ready');
 insert into storage.objects(bucket_id,name) values('lesson-media','${legacyPath}');
 create table public.unrelated_app(id integer primary key,payload text);insert into public.unrelated_app values(1,'Unchanged');
 `);
  before = await snapshot("");
  // The DB migration must fail atomically if the Storage API copy was skipped.
  await expect(
    db.exec(
      readFileSync(
        "supabase/migrations/202610150010_lms_namespace.sql",
        "utf8",
      ),
    ),
  ).rejects.toThrow(/Copy existing LMS objects/);
  await db.exec("rollback");
  expect(await snapshot("")).toEqual(before);
  // Simulate prepared Storage metadata only; the live script uses the Storage API.
  await db.exec(
    `insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('lms_media','lms_media',false,5242880,array['image/jpeg','image/png','image/webp']);insert into storage.objects(bucket_id,name) values('lms_media','${legacyPath}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610150010_lms_namespace.sql", "utf8"),
  );
  after = await snapshot("lms_");
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("LMS namespace migration", () => {
  it("preserves all business rows, IDs and relation OIDs including historical audit labels", () => {
    expect(after).toEqual(before);
  });
  it("leaves unrelated and Supabase-managed relations intact", async () => {
    expect(
      (await db.query("select payload from public.unrelated_app")).rows,
    ).toEqual([{ payload: "Unchanged" }]);
    expect((await db.query("select id from auth.users")).rows).toEqual([
      { id: owner },
    ]);
    expect(
      (
        await db.query(
          `select name from storage.objects where bucket_id='lms_media'`,
        )
      ).rows,
    ).toEqual([{ name: legacyPath }]);
  });
  it("renames constraints, indexes, policies, triggers and owned sequences", async () => {
    const relations = Object.entries(names)
      .flatMap(([schema, tables]) =>
        tables.map((name) => `'${schema}.lms_${name}'::regclass`),
      )
      .join(",");
    expect(
      (
        await db.query(
          `select conname from pg_constraint where conrelid in (${relations}) and conname not like 'lms\_%' escape '\'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select c.relname from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid in (${relations}) and c.relname not like 'lms\_%' escape '\'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select tgname from pg_trigger where tgrelid in (${relations}) and not tgisinternal and tgname not like 'lms\_%' escape '\'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select to_regclass('private.lms_audit_logs_id_seq') as sequence`,
        )
      ).rows[0],
    ).toEqual({ sequence: "private.lms_audit_logs_id_seq" });
  });
  it("accepts only prefixed physical table names in CRUD RPCs", async () => {
    await expect(
      db.query(
        `select public.lms_save_record('profiles','{"id":"${owner}","name":"Forbidden"}'::jsonb,1)`,
      ),
    ).rejects.toThrow(/Invalid entity/);
    expect(
      (
        await db.query(
          `select public.lms_save_record('lms_profiles','{"id":"${owner}","name":"Preserved teacher"}'::jsonb,1)->>'version' version`,
        )
      ).rows[0],
    ).toEqual({ version: "2" });
  });
  it("generates organized owner-scoped paths and retains secure legacy paths", async () => {
    const args = [
      ["profile", null, null, "avatars/"],
      ["avatar", child, null, "children/"],
      ["photo", child, report, "reports/"],
    ];
    for (const [kind, childId, reportId, prefix] of args) {
      const rows = (
        await db.query<{ path: string }>(
          `select public.lms_begin_upload('${kind}',${childId ? `'${childId}'` : "null"},${reportId ? `'${reportId}'` : "null"},'image/png',100)->>'object_path' path`,
        )
      ).rows;
      expect(rows[0].path).toMatch(new RegExp(`^${prefix}${owner}/`));
    }
    expect(
      (
        await db.query(
          `select object_path from public.lms_media_assets where state='ready'`,
        )
      ).rows,
    ).toEqual([{ object_path: legacyPath }]);
  });
});
