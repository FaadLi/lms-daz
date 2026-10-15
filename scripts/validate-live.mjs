import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const e = { ...parseEnv(readFileSync(".env.local", "utf8")), ...process.env };
const ref = new URL(e.VITE_SUPABASE_URL).hostname.split(".")[0];
const url = e.VITE_SUPABASE_URL;
const management = async (path, body) => {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${e.SUPABASE_ACCESS_TOKEN}`,
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
const keys = await management("/api-keys?reveal=true");
const secret =
  keys.find((key) => key.name === "service_role")?.api_key ||
  keys.find((key) => key.type === "secret")?.api_key;
if (!secret)
  throw new Error(
    "Account token cannot access server-side validation credentials.",
  );
// This key exists only in this Node process, never in a browser or saved file.
const admin = createClient(url, secret, {
  db: { retry: false, timeout: 15000 },
  auth: { persistSession: false, autoRefreshToken: false },
});
const fresh = () =>
  createClient(url, e.VITE_SUPABASE_PUBLISHABLE_KEY, {
    db: { retry: false, timeout: 15000 },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const result = async (promise) => {
  const { data, error } = await promise;
  if (error)
    throw new Error(
      `Supabase operation failed (${error.code || error.status || "unknown"})`,
    );
  return data;
};
const rpc = (client, name, args) => result(client.rpc(name, args));
const edge = async (body, session) => {
  const response = await fetch(`${url}/functions/v1/lesreport`, {
    method: "POST",
    headers: {
      apikey: e.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
};
const users = [],
  ownerIds = [],
  clientA = fresh(),
  clientB = fresh();
let sessionA, sessionB, childId, invoiceId, assetId;
const password = `Test!${randomUUID()}`;
const prefix = `validation-${Date.now()}`;
const pass = (name) => console.log(`PASS ${name}`);
async function cleanup() {
  if (!ownerIds.length) return;
  const owners = ownerIds.map((id) => `'${id}'::uuid`).join(",");
  const media = await result(
    admin
      .from("lms_media_assets")
      .select("object_path")
      .in("owner_id", ownerIds),
  );
  if (media.length)
    await result(
      admin.storage
        .from("lms_media")
        .remove(media.map((row) => row.object_path)),
    );
  await query(`begin;
    delete from public.lms_comments where owner_id in (${owners});
    delete from private.lms_report_links where owner_id in (${owners});
    update public.lms_children set avatar_id=null where owner_id in (${owners});
    update public.lms_profiles set avatar_id=null where owner_id in (${owners});
    delete from public.lms_media_assets where owner_id in (${owners});
    delete from public.lms_payment_transactions where owner_id in (${owners});
    delete from public.lms_invoices where owner_id in (${owners});
    delete from public.lms_attendance where owner_id in (${owners});
    delete from public.lms_lesson_reports where owner_id in (${owners});
    delete from public.lms_schedules where owner_id in (${owners});
    delete from public.lms_children where owner_id in (${owners});
    delete from public.lms_parents where owner_id in (${owners});
    delete from public.lms_report_templates where owner_id in (${owners});
    delete from public.lms_subjects where owner_id in (${owners});
    delete from public.lms_profiles where owner_id in (${owners});
    delete from private.lms_audit_logs where owner_id in (${owners});commit;`);
  for (const id of ownerIds) await result(admin.auth.admin.deleteUser(id));
  pass("temporary validation data cleaned");
}
if (process.argv.includes("--cleanup")) {
  if (!existsSync(".env.validation"))
    throw new Error("No validation accounts to clean");
  const saved = parseEnv(readFileSync(".env.validation", "utf8"));
  ownerIds.push(saved.VALIDATION_A_ID, saved.VALIDATION_B_ID);
  await cleanup();
  process.exit(0);
}
try {
  const schema = await query(
    "select tablename,rowsecurity from pg_tables where schemaname='public' and tablename in ('lms_profiles','lms_parents','lms_children','lms_subjects','lms_report_templates','lms_schedules','lms_attendance','lms_lesson_reports','lms_comments','lms_invoices','lms_payment_transactions','lms_media_assets') order by tablename",
  );
  assert.equal(schema.length, 12);
  assert.ok(schema.every((row) => row.rowsecurity));
  pass("12 exposed tables have RLS");
  const indexes = await query(
    "select count(*)::integer count from pg_indexes where schemaname='public' and tablename in ('lms_children','lms_schedules','lms_attendance','lms_lesson_reports','lms_invoices','lms_comments','lms_media_assets')",
  );
  assert.ok(indexes[0].count >= 25);
  pass("required ownership/history indexes exist");
  const bucket = await result(admin.storage.getBucket("lms_media"));
  assert.equal(bucket.public, false);
  pass("Storage bucket is private");
  for (const label of ["a", "b"]) {
    const email = `${prefix}-${label}@example.com`;
    const { user } = await result(
      admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    ownerIds.push(user.id);
    users.push({ id: user.id, email });
  }
  sessionA = (
    await result(
      clientA.auth.signInWithPassword({ email: users[0].email, password }),
    )
  ).session;
  sessionB = (
    await result(
      clientB.auth.signInWithPassword({ email: users[1].email, password }),
    )
  ).session;
  assert.equal((await result(clientA.auth.getUser())).user.id, ownerIds[0]);
  pass("real Auth login and verified session");
  const restored = fresh();
  await result(
    restored.auth.setSession({
      access_token: sessionA.access_token,
      refresh_token: sessionA.refresh_token,
    }),
  );
  assert.equal((await result(restored.auth.getUser())).user.id, ownerIds[0]);
  pass("session restoration");
  for (let i = 0; i < 2; i++)
    await rpc(i === 0 ? clientA : clientB, "lms_save_record", {
      p_table: "lms_profiles",
      p_data: { id: ownerIds[i], name: `Validation teacher ${i}` },
    });
  const parentId = randomUUID();
  childId = randomUUID();
  const subjectId = randomUUID();
  const templateId = randomUUID();
  const scheduleId = randomUUID();
  const reportId = randomUUID();
  invoiceId = randomUUID();
  await rpc(clientA, "lms_create_child", {
    p_parent: {
      id: parentId,
      full_name: "Validation guardian",
      whatsapp_number: "6281234567890",
    },
    p_child: {
      id: childId,
      parent_id: parentId,
      relationship: "Wali",
      full_name: "Validation pupil",
      nickname: "Pupil",
      birth_date: "2018-01-01",
      gender: "P",
      grade_level: "SD",
      start_date: "2026-10-14",
      is_active: true,
    },
  });
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_subjects",
    p_data: { id: subjectId, name: "Validation subject" },
  });
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_report_templates",
    p_data: {
      id: templateId,
      name: "Validation template",
      subject_id: subjectId,
      topic: "Topic",
      what_learned: "Material",
    },
  });
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_schedules",
    p_data: {
      id: scheduleId,
      child_id: childId,
      subject_id: subjectId,
      day_of_week: 3,
      start_time: "09:00",
      end_time: "10:00",
      location: "Validation",
    },
  });
  const att = {
    id: randomUUID(),
    child_id: childId,
    schedule_id: scheduleId,
    date: "2026-10-14",
    status: "hadir",
    start_time: "09:00",
    end_time: "10:00",
  };
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_attendance",
    p_data: att,
  });
  const duplicate = await clientA.rpc("lms_save_record", {
    p_table: "lms_attendance",
    p_data: { ...att, id: randomUUID() },
  });
  assert.equal(duplicate.error?.code, "23505");
  pass("duplicate attendance rejected");
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_lesson_reports",
    p_data: {
      id: reportId,
      child_id: childId,
      schedule_id: scheduleId,
      subject_id: subjectId,
      date: "2026-10-14",
      duration_minutes: 60,
      topic: "Validation topic",
      what_learned: "Material",
      learning_outcome: "Observed learning",
      score: 80,
    },
  });
  await rpc(clientA, "lms_comment_teacher", {
    p_child: childId,
    p_report: reportId,
    p_message: "Validation teacher comment",
    p_id: randomUUID(),
  });
  // Exercise the existing save/update/delete boundary for every editable entity.
  for (const [table, id, patch] of [
    ["lms_profiles", ownerIds[0], { name: "Validated teacher" }],
    ["lms_parents", parentId, { full_name: "Validated guardian" }],
    ["lms_subjects", subjectId, { name: "Validated subject" }],
    ["lms_report_templates", templateId, { topic: "Validated topic" }],
    ["lms_schedules", scheduleId, { location: "Validated location" }],
    ["lms_attendance", att.id, { notes: "Validated attendance" }],
    [
      "lms_lesson_reports",
      reportId,
      { teacher_notes: "Validated observation" },
    ],
  ]) {
    const row = await result(
      clientA.from(table).select("id,version").eq("id", id).single(),
    );
    const updated = await rpc(clientA, "lms_save_record", {
      p_table: table,
      p_data: { id, ...patch },
      p_version: row.version,
    });
    assert.equal(updated.version, row.version + 1);
  }
  await rpc(clientA, "lms_delete_record", {
    p_table: "lms_report_templates",
    p_id: templateId,
    p_version: 2,
  });
  assert.equal(
    (
      await result(
        clientA.from("lms_report_templates").select("id").eq("id", templateId),
      )
    ).length,
    0,
  );
  pass("CRUD updates and versioned deletion");
  const scheduleRaces = await Promise.all(
    [
      { start_time: "10:00", end_time: "11:00" },
      { start_time: "10:30", end_time: "11:30" },
    ].map((slot) =>
      clientA.rpc("lms_save_record", {
        p_table: "lms_schedules",
        p_data: {
          id: randomUUID(),
          child_id: childId,
          subject_id: subjectId,
          day_of_week: 4,
          location: "Conflict validation",
          ...slot,
        },
      }),
    ),
  );
  assert.equal(scheduleRaces.filter((item) => !item.error).length, 1);
  assert.equal(
    scheduleRaces.filter((item) => item.error?.code === "23505").length,
    1,
  );
  pass("concurrent schedule conflict protection");
  await rpc(clientA, "lms_mark_report_shared", {
    p_id: reportId,
    p_version: 2,
  });
  const shared = await result(
    clientA
      .from("lms_lesson_reports")
      .select("shared_at,version")
      .eq("id", reportId)
      .single(),
  );
  assert.ok(shared.shared_at);
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_lesson_reports",
    p_data: { id: reportId, teacher_notes: "Updated after sharing" },
    p_version: shared.version,
  });
  assert.equal(
    (
      await result(
        clientA
          .from("lms_lesson_reports")
          .select("shared_at")
          .eq("id", reportId)
          .single(),
      )
    ).shared_at,
    shared.shared_at,
  );
  pass("sharing state preserved through edits");
  const joined = await result(
    clientA
      .from("lms_children")
      .select("*,parent:lms_parents!lms_children_owner_id_parent_id_fkey(*)")
      .eq("id", childId),
  );
  assert.equal(joined[0].parent.id, parentId);
  pass("CRUD entities and ownership join");
  assert.equal(
    (await result(clientB.from("lms_children").select("*"))).length,
    0,
  );
  const bypass = await clientB.rpc("lms_save_record", {
    p_table: "lms_children",
    p_data: { id: childId, nickname: "Forbidden" },
    p_version: 1,
  });
  assert.ok(bypass.error);
  const forged = await clientB
    .from("lms_subjects")
    .insert({ owner_id: ownerIds[0], name: "Forbidden" });
  assert.ok(forged.error);
  pass("two-user RLS read/write isolation");
  const anonymous = fresh();
  const anon = await anonymous.from("lms_children").select("*");
  assert.ok(anon.error);
  pass("anonymous data access denied");
  const updates = await Promise.all(
    ["First", "Second"].map((nickname) =>
      clientA.rpc("lms_save_record", {
        p_table: "lms_children",
        p_data: { id: childId, nickname },
        p_version: 1,
      }),
    ),
  );
  console.log(
    "Concurrent edit outcomes:",
    updates.map((update) => ({
      code: update.error?.code || "OK",
      message: update.error?.message || "saved",
    })),
  );
  assert.equal(updates.filter((update) => !update.error).length, 1);
  assert.equal(
    updates.filter((update) => update.error?.code === "PT409").length,
    1,
  );
  pass("concurrent edit has one winner");
  await rpc(clientA, "lms_save_record", {
    p_table: "lms_invoices",
    p_data: {
      id: invoiceId,
      child_id: childId,
      invoice_number: "VALIDATION-1",
      period: "2026-10-01",
      package_type: "bulanan",
      amount: 100000,
      due_date: "2026-10-20",
    },
  });
  const payment = {
    p_invoice: invoiceId,
    p_amount: 40000,
    p_date: "2026-10-14",
    p_method: "Tunai",
    p_key: randomUUID(),
  };
  const retries = await Promise.all([
    clientA.rpc("lms_record_payment", payment),
    clientA.rpc("lms_record_payment", payment),
  ]);
  assert.ok(retries.every((item) => !item.error));
  assert.equal(
    (
      await result(
        clientA
          .from("lms_payment_transactions")
          .select("*")
          .eq("invoice_id", invoiceId),
      )
    ).length,
    1,
  );
  assert.ok(
    (
      await clientA.rpc("lms_record_payment", {
        ...payment,
        p_amount: 70000,
        p_key: randomUUID(),
      })
    ).error,
  );
  pass("concurrent payment retry and overpayment protection");
  const photo = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4xQAAAAASUVORK5CYII=",
    "base64",
  );
  const asset = await rpc(clientA, "lms_begin_upload", {
    p_kind: "photo",
    p_child: childId,
    p_report: reportId,
    p_mime: "image/png",
    p_size: photo.length,
  });
  assert.ok(
    asset.object_path.startsWith(
      `reports/${ownerIds[0]}/${childId}/${reportId}/`,
    ),
  );
  assetId = asset.id;
  await result(
    clientA.storage
      .from("lms_media")
      .upload(asset.object_path, photo, { contentType: "image/png" }),
  );
  assert.ok(
    (await clientB.storage.from("lms_media").download(asset.object_path)).error,
  );
  pass("private Storage denies foreign user");
  const finished = await edge(
    { action: "finish-upload", assetId, version: 1 },
    sessionA,
  );
  assert.equal(finished.status, 200);
  assert.ok(
    (
      await result(
        clientA.storage
          .from("lms_media")
          .createSignedUrl(asset.object_path, 60),
      )
    ).signedUrl,
  );
  pass("server-validated upload and authorized signed URL");
  for (const kind of ["profile", "avatar"]) {
    const table = kind === "profile" ? "lms_profiles" : "lms_children";
    const targetId = kind === "profile" ? ownerIds[0] : childId;
    const target = await result(
      clientA.from(table).select("version").eq("id", targetId).single(),
    );
    const avatar = await rpc(clientA, "lms_begin_upload", {
      p_kind: kind,
      p_child: kind === "profile" ? null : childId,
      p_report: null,
      p_mime: "image/png",
      p_size: photo.length,
    });
    assert.ok(
      avatar.object_path.startsWith(
        `${kind === "profile" ? "avatars" : "children"}/${ownerIds[0]}/`,
      ),
    );
    await result(
      clientA.storage
        .from("lms_media")
        .upload(avatar.object_path, photo, { contentType: "image/png" }),
    );
    assert.equal(
      (
        await edge(
          {
            action: "finish-upload",
            assetId: avatar.id,
            version: target.version,
          },
          sessionA,
        )
      ).status,
      200,
    );
    const attached = await result(
      clientA
        .from(table)
        .select("version,avatar_id")
        .eq("id", targetId)
        .single(),
    );
    assert.equal(attached.avatar_id, avatar.id);
    assert.ok(
      (await clientB.storage.from("lms_media").download(avatar.object_path))
        .error,
    );
    assert.equal(
      (
        await edge(
          {
            action: "delete-media",
            assetId: avatar.id,
            version: attached.version,
          },
          sessionA,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await result(
          clientA.from(table).select("avatar_id").eq("id", targetId).single(),
        )
      ).avatar_id,
      null,
    );
  }
  pass(
    "profile/child avatar upload, attachment, cross-account denial and deletion",
  );
  const issued = await edge(
    { action: "issue-link", childId, reportId, days: 1 },
    sessionA,
  );
  assert.equal(issued.status, 200);
  const opened = await edge({
    action: "parent",
    token: issued.data.token,
    operation: "open",
    section: "reports",
  });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.items.length, 1);
  assert.ok(opened.data.media[0].url);
  assert.ok(!opened.data.media[0].object_path);
  const wrongSection = await edge({
    action: "parent",
    token: issued.data.token,
    section: "invoices",
  });
  assert.equal(wrongSection.status, 403);
  pass("parent report scope and private photos");
  const parentComment = {
    action: "parent",
    token: issued.data.token,
    operation: "comment",
    section: "comments",
    reportId,
    id: randomUUID(),
    message: "Validated parent comment",
  };
  assert.equal((await edge(parentComment)).status, 200);
  assert.equal((await edge(parentComment)).status, 200);
  assert.equal(
    (await edge({ ...parentComment, message: "Different retry payload" }))
      .status,
    409,
  );
  assert.equal(
    (
      await result(
        clientA.from("lms_comments").select("id").eq("id", parentComment.id),
      )
    ).length,
    1,
  );
  pass("parent comment identity and retry protection");
  const info = await rpc(clientA, "lms_report_link_info", { p_child: childId });
  assert.equal(Number(info.access_count), 1);
  const hashes = await query(
    `select token_hash from private.lms_report_links where owner_id='${ownerIds[0]}'::uuid`,
  );
  assert.ok(
    hashes[0].token_hash !== issued.data.token &&
      /^[a-f0-9]{64}$/.test(hashes[0].token_hash),
  );
  pass("raw tokens absent from database");
  await rpc(clientA, "lms_revoke_report_link", { p_child: childId });
  assert.equal(
    (await edge({ action: "parent", token: issued.data.token })).status,
    403,
  );
  pass("parent token revoke");
  const expiry = await edge(
    { action: "issue-link", childId, days: 1 },
    sessionA,
  );
  assert.equal(expiry.status, 200);
  await query(
    `update private.lms_report_links set expires_at=now()-interval '1 second' where owner_id='${ownerIds[0]}'::uuid and revoked_at is null`,
  );
  assert.equal(
    (await edge({ action: "parent", token: expiry.data.token })).status,
    403,
  );
  pass("parent token expiry");
  const deleted = await edge({ action: "delete-media", assetId }, sessionA);
  assert.equal(deleted.status, 200);
  assert.ok(
    (await admin.storage.from("lms_media").download(asset.object_path)).error,
  );
  pass("photo metadata/object deletion");
  await result(clientB.auth.signOut());
  assert.equal((await clientB.auth.getSession()).data.session, null);
  pass("real logout");
  if (process.argv.includes("--keep-for-ui")) {
    writeFileSync(
      ".env.validation",
      `VALIDATION_A_EMAIL=${users[0].email}\nVALIDATION_B_EMAIL=${users[1].email}\nVALIDATION_PASSWORD=${password}\nVALIDATION_A_ID=${ownerIds[0]}\nVALIDATION_B_ID=${ownerIds[1]}\nVALIDATION_CHILD_ID=${childId}\n`,
    );
    pass("temporary accounts retained for manual UI verification");
  }
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? `FAIL validation assertion: ${error.message}`
      : `FAIL ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  if (!process.argv.includes("--keep-for-ui") || process.exitCode)
    await cleanup();
}
