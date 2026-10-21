// Focused real-form audit, invoked by validate-live --audit-report-create.
// Uses temporary fixtures; credentials, raw tokens and report bodies stay in memory.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

export async function auditReportContract(readQuery) {
  const database = (
    await readQuery(`select
    (select max(version) from supabase_migrations.schema_migrations) migration,
    (select proargnames from pg_proc where oid='public.lms_save_lesson_report(jsonb,integer)'::regprocedure) arguments,
    (select position('p_version is not null and (prior.id is null or prior.version<>p_version)' in prosrc)>0 from pg_proc where oid='public.lms_save_lesson_report(jsonb,integer)'::regprocedure) requires_existing_version,
    (select rowsecurity from pg_tables where schemaname='public' and tablename='lms_lesson_report_subjects') relation_rls
  `)
  )[0];
  const localHtml = readFileSync("dist/index.html", "utf8");
  const localAsset = localHtml.match(/src="([^"]+\.js)"/)[1];
  const localCode = readFileSync(`dist${localAsset}`, "utf8");
  let deployed;
  try {
    const response = await fetch("https://lms.daztore.web.id/", {
      cache: "no-store",
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    const asset = html.match(/src="([^"]+\.js)"/)[1];
    const jsResponse = await fetch(new URL(asset, response.url), {
      cache: "no-store",
    });
    assert.equal(jsResponse.status, 200);
    const code = await jsResponse.text();
    const worker = await (
      await fetch("https://lms.daztore.web.id/sw.js", { cache: "no-store" })
    ).text();
    const ref = localCode.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
    deployed = {
      reachable: true,
      asset,
      same_as_local: code === localCode,
      same_supabase_project: !!ref && code.includes(`${ref}.supabase.co`),
      multi_subject_rpc: code.includes("lms_save_lesson_report"),
      multi_subject_relation: code.includes("report_subjects"),
      local_zero_marker: /version:0,child_id:/.test(code),
      worker_references_asset: worker.includes(asset.split("/").at(-1)),
      sha256: createHash("sha256").update(code).digest("hex"),
    };
  } catch {
    deployed = { reachable: false };
  }
  const result = { database, localAsset, deployed };
  console.log("CONTRACT", JSON.stringify(result));
  return result;
}

export async function checkReportCreate({
  email,
  password,
  childId,
  scheduleId,
  client,
  parentReport,
  contract,
  expectConflict,
}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const attempts = [];
  const requests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/lms_save_lesson_report"))
      requests.push(request.postDataJSON());
  });
  const read = async () => {
    const { data, error } = await client
      .from("lms_lesson_reports")
      .select(
        "id,version,score,topic,report_subjects:lms_lesson_report_subjects!lms_report_subjects_report_fkey(subject_id,score)",
      )
      .eq("child_id", childId);
    if (error) throw new Error(`Report read failed (${error.code})`);
    return data;
  };
  const edit = (topic) =>
    page
      .locator("article")
      .filter({ hasText: topic })
      .getByRole("button", { name: "Edit", exact: true });
  const open = async () => {
    await page.getByRole("button", { name: "Tambah Laporan" }).click();
    return page.getByRole("dialog");
  };
  const fill = async (dialog, topic, date) => {
    await dialog
      .locator("select")
      .filter({ has: page.locator(`option[value="${scheduleId}"]`) })
      .selectOption(scheduleId);
    await dialog.getByLabel("Validation subject", { exact: true }).click();
    await dialog.getByLabel("Validation English", { exact: true }).click();
    await dialog
      .getByLabel("Nilai Validation subject", { exact: true })
      .fill("91");
    await dialog
      .getByLabel("Nilai Validation English", { exact: true })
      .fill("80");
    await dialog.locator("input[type=date]").fill(date);
    await dialog.getByPlaceholder("Masukkan durasi (menit)…").fill("60");
    await dialog.getByPlaceholder("Masukkan topik…").fill(topic);
    await dialog
      .getByPlaceholder("Masukkan materi yang dipelajari…")
      .fill("Materials");
    await dialog
      .getByPlaceholder("Masukkan hasil yang diamati…")
      .fill("Observed");
  };
  const submit = async (dialog, label) => {
    const response = page.waitForResponse((res) =>
      res.url().endsWith("/rpc/lms_save_lesson_report"),
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const res = await response;
    const body = await res.json();
    const request = res.request().postDataJSON();
    const result = {
      attempt: label,
      status: res.status(),
      code: body.code || null,
      message: body.code ? body.message : undefined,
      p_version: request.p_version,
    };
    attempts.push(result);
    console.log("FORM", JSON.stringify(result));
    return { result, body, request };
  };
  const draftEntries = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter(
          (key) =>
            key.startsWith("lms_draft:") &&
            decodeURIComponent(key).includes("lesson_reports"),
        )
        .map((key) => JSON.parse(localStorage.getItem(key))),
    );
  try {
    await page.goto("http://127.0.0.1:3000");
    await page.getByPlaceholder("nama@email.com").fill(email);
    await page.locator("input[type=password]").fill(password);
    await page.locator("button[type=submit]").click();
    await page.getByPlaceholder("nama@email.com").waitFor({ state: "hidden" });
    await page.goto(`http://127.0.0.1:3000/#/children/${childId}`);
    let dialog = await open();
    await fill(dialog, "Audit fresh create", "2026-10-21");
    const first = await submit(dialog, "fresh-create");
    if (expectConflict) {
      assert.equal(first.result.status, 409);
      assert.equal(first.result.code, "PT409");
      assert.equal(first.result.p_version, 0);
      await dialog.getByRole("alert").waitFor();
      assert.equal((await read()).length, 0);
      assert.equal((await draftEntries()).length, 1);
      await page.reload();
      dialog = await open();
      assert.equal(
        await dialog
          .getByLabel("Nilai Validation subject", { exact: true })
          .inputValue(),
        "91",
      );
      const restored = await submit(dialog, "restored-create");
      assert.equal(restored.result.status, 409);
      assert.equal(restored.result.code, "PT409");
      assert.equal(restored.result.p_version, 0);
      assert.equal(restored.request.p_data.id, first.request.p_data.id);
      assert.equal((await read()).length, 0);
      assert.equal((await draftEntries()).length, 1);
    } else {
      assert.equal(first.result.status, 200);
      assert.equal(first.result.p_version, null);
      await dialog.waitFor({ state: "hidden" });
      const rows = await read();
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].score), 85.5);
      assert.equal(rows[0].report_subjects.length, 2);
      assert.equal((await draftEntries()).length, 0);
      // Model a committed create whose response is lost. No automatic mutation retry.
      dialog = await open();
      await fill(dialog, "Audit restored create", "2026-10-22");
      const before = requests.length;
      let committedRequest;
      await page.route(
        "**/rest/v1/rpc/lms_save_lesson_report",
        async (route) => {
          committedRequest = route.request().postDataJSON();
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          await route.abort("failed");
        },
      );
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(requests.length, before + 1);
      assert.equal((await read()).length, 2);
      assert.equal((await draftEntries()).length, 1);
      await page.reload();
      await page.unroute("**/rest/v1/rpc/lms_save_lesson_report");
      dialog = await open();
      assert.equal(
        await dialog
          .getByLabel("Nilai Validation subject", { exact: true })
          .inputValue(),
        "91",
      );
      const restored = await submit(
        dialog,
        "restored-create-identical-resubmit",
      );
      assert.equal(restored.result.status, 200);
      assert.equal(restored.result.p_version, null);
      assert.equal(restored.request.p_data.id, committedRequest.p_data.id);
      assert.equal(restored.body.version, 1);
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await draftEntries()).length, 0);
      assert.equal((await read()).length, 2);
      // Real edit retains the persisted version. An actual stale edit stays 409.
      await edit("Audit fresh create").click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Nilai Validation subject", { exact: true })
        .fill("100");
      const updated = await submit(dialog, "edit");
      assert.equal(updated.result.status, 200);
      assert.equal(updated.result.p_version, 1);
      assert.equal(Number(updated.body.score), 90);
      await dialog.waitFor({ state: "hidden" });
      const stale = await client.rpc("lms_save_lesson_report", {
        p_data: { id: first.body.id, topic: "Stale" },
        p_version: 1,
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.error?.code, "PT409");
      const conflicting = await client.rpc("lms_save_lesson_report", {
        p_data: { ...first.request.p_data, topic: "Changed create retry" },
        p_version: null,
      });
      assert.equal(conflicting.status, 409);
      assert.equal(conflicting.error?.code, "PT409");
      assert.equal(conflicting.error.message, "Conflicting create request");
      const duplicate = await client.rpc("lms_save_lesson_report", {
        p_data: { ...first.request.p_data, id: crypto.randomUUID() },
        p_version: null,
      });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.error?.code, "23505");
      const concurrent = await Promise.all(
        ["Winner A", "Winner B"].map((teacher_notes) =>
          client.rpc("lms_save_lesson_report", {
            p_data: { id: first.body.id, teacher_notes },
            p_version: 2,
          }),
        ),
      );
      assert.equal(
        concurrent.filter((item) => !item.error && item.status === 200).length,
        1,
      );
      assert.equal(
        concurrent.filter(
          (item) => item.error?.code === "PT409" && item.status === 409,
        ).length,
        1,
      );
      attempts.push(
        {
          attempt: "stale-edit",
          status: stale.status,
          code: stale.error.code,
          message: stale.error.message,
        },
        {
          attempt: "changed-create-retry",
          status: conflicting.status,
          code: conflicting.error.code,
          message: conflicting.error.message,
        },
        {
          attempt: "duplicate-session",
          status: duplicate.status,
          code: duplicate.error.code,
        },
        ...concurrent.map((item) => ({
          attempt: "concurrent-edit",
          status: item.status,
          code: item.error?.code || null,
        })),
      );
      const parent = await parentReport(first.body.id);
      assert.equal(parent.items.length, 1);
      assert.equal(Number(parent.items[0].score), 90);
      assert.equal(parent.items[0].report_subjects.length, 2);
      const finalRows = await read();
      assert.equal(finalRows.length, 2);
      assert.equal(
        finalRows.find((row) => row.id === first.body.id).version,
        3,
      );
      assert.equal(errors.length, 0);
    }
    mkdirSync("supabase/.temp", { recursive: true });
    writeFileSync(
      `supabase/.temp/report-create-${expectConflict ? "before" : "after"}.json`,
      JSON.stringify(
        {
          contract,
          attempts,
          existingRows: (await read()).length,
          browserErrors: errors.length,
          draftIdPreserved: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS ${expectConflict ? "reproduced fresh/restored create conflict without inserting or clearing draft" : "fresh/restored create, explicit idempotent resubmit, edit, real stale/duplicate conflicts and parent consistency"}`,
    );
  } catch (error) {
    let message =
      error instanceof Error ? error.message : "Create audit failed";
    for (const secret of [email, password])
      message = message.replaceAll(secret, "[REDACTED]");
    throw new Error(message);
  } finally {
    await browser.close();
  }
}
