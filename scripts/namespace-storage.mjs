// Server-side namespace cutover. No privileged credentials are written to disk.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const config = {
  ...parseEnv(readFileSync(".env.local", "utf8")),
  ...process.env,
};
const ref = new URL(config.VITE_SUPABASE_URL).hostname.split(".")[0];
const management = async (path, body) => {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${config.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (!response.ok)
    throw new Error(`Management API failed (${response.status})`);
  return response.json();
};
const query = (sql) => management("/database/query", { query: sql });
const tables = {
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
const baselineFile = "supabase/.temp/namespace-baseline.json";
const oldBucket = "lesson-media"; // Intentional cutover source; never an application query.
const newBucket = "lms_media";
const result = async (request) => {
  const { data, error } = await request;
  if (error)
    throw new Error(
      `Storage API failed (${error.status || error.code || "unknown"})`,
    );
  return data;
};
const keys = await management("/api-keys?reveal=true");
const serverKey =
  keys.find((key) => key.name === "service_role")?.api_key ||
  keys.find((key) => key.type === "secret")?.api_key;
if (!serverKey)
  throw new Error("Server-side API access is required for Storage cutover");
const admin = createClient(config.VITE_SUPABASE_URL, serverKey, {
  db: { retry: false, timeout: 15000 },
  auth: { persistSession: false, autoRefreshToken: false },
});
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
async function snapshot(prefixed) {
  const rows = [];
  for (const [schema, names] of Object.entries(tables))
    for (const name of names) {
      const table = `${schema}.${prefixed ? "lms_" : ""}${name}`;
      const [row] = await query(
        `select ${quote(schema)} schema,${quote(name)} original_name,${quote(table)}::regclass::oid::text oid,count(*)::integer row_count,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) row_hash from ${table} t`,
      );
      rows.push(row);
    }
  return rows;
}
const blobHash = async (bucket, name) =>
  createHash("sha256")
    .update(
      Buffer.from(
        await (
          await result(admin.storage.from(bucket).download(name))
        ).arrayBuffer(),
      ),
    )
    .digest("hex");
const objects = () =>
  query(
    `select id::text,name from storage.objects where bucket_id=${quote(oldBucket)} order by name`,
  );
async function validateCopies(rows) {
  for (const row of rows)
    assert.equal(
      await blobHash(newBucket, row.name),
      await blobHash(oldBucket, row.name),
      "Storage object contents differ",
    );
}
const mode = process.argv[2];
if (mode === "prepare") {
  if (!existsSync(baselineFile)) {
    const ownedTables = Object.entries(tables).flatMap(([schema, names]) =>
      names.map((name) => `${schema}.${name}`),
    );
    const unrelated = await query(
      `select n.nspname schema,c.relname name,c.oid::text oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and n.nspname||'.'||c.relname not in (${ownedTables.map(quote).join(",")}) order by n.nspname,c.relname`,
    );
    const buckets = await query(
      `select id,name,public from storage.buckets where id<>${quote(oldBucket)} and id<>${quote(newBucket)} order by id`,
    );
    writeFileSync(
      baselineFile,
      JSON.stringify(
        { ref, tables: await snapshot(false), unrelated, buckets },
        null,
        2,
      ),
    );
  }
  const old = await result(admin.storage.getBucket(oldBucket));
  assert.equal(old.public, false, "LMS source bucket must be private");
  const destination = await admin.storage.getBucket(newBucket);
  if (destination.error)
    await result(
      admin.storage.createBucket(newBucket, {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      }),
    );
  else
    assert.equal(
      destination.data.public,
      false,
      "Target bucket must be private",
    );
  const source = await objects();
  const copied = await query(
    `select name from storage.objects where bucket_id=${quote(newBucket)}`,
  );
  const existing = new Set(copied.map((row) => row.name));
  for (const row of source)
    if (!existing.has(row.name))
      await result(
        admin.storage
          .from(oldBucket)
          .copy(row.name, row.name, { destinationBucket: newBucket }),
      );
  await validateCopies(source);
  console.log(
    JSON.stringify({
      preparedObjects: source.length,
      baselineTables: 15,
      privateTarget: newBucket,
    }),
  );
} else if (mode === "verify") {
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  assert.equal(baseline.ref, ref);
  assert.deepEqual(
    await snapshot(true),
    baseline.tables,
    "LMS data/IDs/table OIDs changed during rename",
  );
  const ownedTables = Object.entries(tables).flatMap(([schema, names]) =>
    names.map((name) => `${schema}.lms_${name}`),
  );
  const unrelated = await query(
    `select n.nspname schema,c.relname name,c.oid::text oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and n.nspname||'.'||c.relname not in (${ownedTables.map(quote).join(",")}) order by n.nspname,c.relname`,
  );
  assert.deepEqual(unrelated, baseline.unrelated, "Unrelated tables changed");
  const buckets = await query(
    `select id,name,public from storage.buckets where id<>${quote(oldBucket)} and id<>${quote(newBucket)} order by id`,
  );
  assert.deepEqual(buckets, baseline.buckets, "Unrelated buckets changed");
  console.log(
    "PASS table OIDs, all existing row contents/IDs, unrelated tables and buckets preserved",
  );
} else if (mode === "finalize") {
  const sourceBucket = await admin.storage.getBucket(oldBucket);
  if (sourceBucket.error) {
    const [missing] = await query(
      `select count(*)::integer count from storage.buckets where id=${quote(oldBucket)}`,
    );
    if (missing.count !== 0)
      throw new Error("Legacy bucket state could not be verified");
    console.log("Legacy LMS bucket already removed");
    process.exit(0);
  }
  const source = await objects();
  await validateCopies(source);
  for (let offset = 0; offset < source.length; offset += 100)
    await result(
      admin.storage
        .from(oldBucket)
        .remove(source.slice(offset, offset + 100).map((row) => row.name)),
    );
  assert.equal(
    (await objects()).length,
    0,
    "New legacy files appeared: repeat prepare before removing the bucket",
  );
  await result(admin.storage.deleteBucket(oldBucket));
  console.log(
    JSON.stringify({
      retiredBucket: oldBucket,
      finalPrivateBucket: newBucket,
      copiedObjectsPreserved: source.length,
    }),
  );
} else throw new Error("Use prepare, verify, or finalize");
