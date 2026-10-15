import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const parent = "33333333-3333-4333-8333-333333333333";
const child = "44444444-4444-4444-8444-444444444444";
const subject = "55555555-5555-4555-8555-555555555555";
const invoice = "66666666-6666-4666-8666-666666666666";
let db: PGlite;
async function asUser(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function rpc(name: string, args: string) {
  return db.query<{ value: unknown }>(
    `select public.${name}(${args}) as value`,
  );
}
const j = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;
    insert into auth.users values('${a}'),('${b}');
  `);
  await db.exec(
    readFileSync("supabase/migrations/202610140001_foundation.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140002_sensitive_operations.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610140003_integrity.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140004_query_hardening.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140005_schedule_integrity.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140006_storage_lifecycle.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140007_conflict_response.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610140008_comment_retry.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610140009_parent_query_indexes.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610150010_lms_namespace.sql", "utf8"),
  );
  await asUser(a);
  await rpc(
    "lms_save_record",
    `'lms_profiles',${j({ id: a, name: "Test teacher" })}`,
  );
  await rpc(
    "lms_save_record",
    `'lms_parents',${j({ id: parent, full_name: "Test guardian", whatsapp_number: "6281234567890" })}`,
  );
  await rpc(
    "lms_save_record",
    `'lms_children',${j({ id: child, parent_id: parent, relationship: "Wali", full_name: "Test pupil", nickname: "Pupil", birth_date: "2018-01-01", gender: "P", grade_level: "SD", start_date: "2026-10-14" })}`,
  );
  await rpc(
    "lms_save_record",
    `'lms_subjects',${j({ id: subject, name: "Test subject" })}`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL ownership and validation", () => {
  it("isolates reads, writes and joined relations between teachers", async () => {
    await asUser(b);
    expect(
      (await db.query("select * from public.lms_children")).rows,
    ).toHaveLength(0);
    await expect(
      rpc(
        "lms_save_record",
        `'lms_children',${j({ id: child, nickname: "Changed" })},1`,
      ),
    ).rejects.toThrow();
    await expect(
      rpc(
        "lms_save_record",
        `'lms_children',${j({ id: "77777777-7777-4777-8777-777777777777", parent_id: parent, relationship: "Wali", full_name: "Foreign", nickname: "Foreign", birth_date: "2018-01-01", gender: "P", grade_level: "SD", start_date: "2026-10-14" })}`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.lms_subjects(owner_id,name) values('${a}','Forbidden')`,
      ),
    ).rejects.toThrow();
    await db.exec("reset role; set role anon");
    await expect(
      db.query("select * from public.lms_children"),
    ).rejects.toThrow();
    await expect(rpc("lms_dashboard_stats", "")).rejects.toThrow();
  });
  it("rejects stale edits and preserves the winning update", async () => {
    await asUser(a);
    await rpc(
      "lms_save_record",
      `'lms_children',${j({ id: child, nickname: "Updated" })},1`,
    );
    await expect(
      rpc(
        "lms_save_record",
        `'lms_children',${j({ id: child, nickname: "Stale" })},1`,
      ),
    ).rejects.toThrow();
    const row = (
      await db.query<{ nickname: string; version: number }>(
        "select nickname,version from public.lms_children",
      )
    ).rows[0];
    expect(row).toEqual({ nickname: "Updated", version: 2 });
  });
  it("atomically creates guardian and child and rolls back invalid child", async () => {
    const id = "88888888-8888-4888-8888-888888888888";
    await expect(
      rpc(
        "lms_create_child",
        `${j({ id: "99999999-9999-4999-8999-999999999999", parent_id: id })},${j({ id, full_name: "Rollback", whatsapp_number: "6281234567891" })}`,
      ),
    ).rejects.toThrow();
    expect(
      (await db.query(`select id from public.lms_parents where id='${id}'`))
        .rows,
    ).toHaveLength(0);
  });
  it("enforces natural attendance identity and score range", async () => {
    const att = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      child_id: child,
      date: "2026-10-14",
      status: "hadir",
      start_time: "09:00",
      end_time: "10:00",
    };
    await rpc("lms_save_record", `'lms_attendance',${j(att)}`);
    await expect(
      rpc(
        "lms_save_record",
        `'lms_attendance',${j({ ...att, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })}`,
      ),
    ).rejects.toThrow();
    await expect(
      rpc(
        "lms_save_record",
        `'lms_lesson_reports',${j({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", child_id: child, subject_id: subject, date: "2026-10-14", duration_minutes: 60, topic: "Topic", what_learned: "Material", learning_outcome: "Observed", score: 101 })}`,
      ),
    ).rejects.toThrow();
  });
  it("records partial payments, retries idempotently and rejects overpayment", async () => {
    await rpc(
      "lms_save_record",
      `'lms_invoices',${j({ id: invoice, child_id: child, invoice_number: "TEST-1", period: "2026-10-01", package_type: "bulanan", amount: 100000, due_date: "2026-10-20" })}`,
    );
    const key = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const args = `'${invoice}',40000,'2026-10-14','Tunai','${key}'`;
    await rpc("lms_record_payment", args);
    await rpc("lms_record_payment", args);
    expect(
      (await db.query("select * from public.lms_payment_transactions")).rows,
    ).toHaveLength(1);
    await expect(
      rpc(
        "lms_record_payment",
        `'${invoice}',50000,'2026-10-14','Tunai','${key}'`,
      ),
    ).rejects.toThrow();
    await expect(
      rpc(
        "lms_record_payment",
        `'${invoice}',70000,'2026-10-14','Tunai','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.lms_payment_transactions(owner_id,invoice_id,amount,date,method,idempotency_key) values('${a}','${invoice}',1,current_date,'Tunai',gen_random_uuid())`,
      ),
    ).rejects.toThrow();
  });
  it("restricts private Storage objects to owned prepared uploads", async () => {
    const result = await rpc(
      "lms_begin_upload",
      `'avatar','${child}',null,'image/png',100`,
    );
    const asset = result.rows[0].value as { object_path: string };
    await db.exec(
      `insert into storage.objects(bucket_id,name) values('lms_media','${asset.object_path}')`,
    );
    await asUser(b);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await expect(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('lms_media','${a}/arbitrary.png')`,
      ),
    ).rejects.toThrow();
    await expect(
      rpc("lms_finish_upload", `'${a}',gen_random_uuid(),1`),
    ).rejects.toThrow();
  });
  it("denies anonymous token RPCs; checks expiry and revocation at trusted boundary", async () => {
    await db.exec("reset role");
    const hash = "a".repeat(64);
    await rpc(
      "lms_issue_report_link",
      `'${a}','${child}',null,'${hash}',now()+interval '1 hour'`,
    );
    await rpc("lms_parent_request", `'${hash}','open'`);
    expect(
      (
        await db.query<{ access_count: number }>(
          "select access_count from private.lms_report_links",
        )
      ).rows[0].access_count,
    ).toBe(1);
    await db.exec("set role anon");
    await expect(
      rpc("lms_parent_request", `'${hash}','read'`),
    ).rejects.toThrow();
    await asUser(b);
    await rpc("lms_revoke_report_link", `'${child}'`);
    await db.exec("reset role");
    await rpc("lms_parent_request", `'${hash}','read'`);
    await asUser(a);
    await rpc("lms_revoke_report_link", `'${child}'`);
    await db.exec("reset role");
    await expect(
      rpc("lms_parent_request", `'${hash}','read'`),
    ).rejects.toThrow();
    await rpc(
      "lms_issue_report_link",
      `'${a}','${child}',null,'${"b".repeat(64)}',now()+interval '1 hour'`,
    );
    await db.exec(
      "update private.lms_report_links set expires_at=now()-interval '1 second' where revoked_at is null",
    );
    await expect(
      rpc("lms_parent_request", `'${"b".repeat(64)}','read'`),
    ).rejects.toThrow();
  });
});
