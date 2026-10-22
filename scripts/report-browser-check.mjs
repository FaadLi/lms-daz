// Called by validate-live --browser; credentials/tokens stay in memory.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

export async function validateReportUi({ email, password, childId, token }) {
  // Use an existing allowed development origin; never weaken Edge CORS for tests.
  const candidate = process.env.LMS_MIGRATION_CANDIDATE_DIR;
  const origin = candidate || process.env.LMS_PRODUCTION_SMOKE === "1" ? "https://lms.daztore.web.id" : "http://127.0.0.1:3000";
  const mountCandidate = async (context) => {
    if (!candidate) return;
    const targetHost = new URL(process.env.VITE_SUPABASE_URL).hostname;
    await context.route(/https:\/\/[^/]+\.supabase\.co\//, route => {
      if (new URL(route.request().url()).hostname !== targetHost) return route.abort();
      return route.continue();
    });
    await context.route(origin + "/**", async route => {
      const requested = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.resolve(candidate, "." + (requested === "/" ? "/index.html" : requested));
      if (!file.startsWith(path.resolve(candidate) + path.sep)) return route.abort();
      const type = {".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json"}[path.extname(file)] || "application/octet-stream";
      try { return await route.fulfill({status:200,contentType:type,body:readFileSync(file)}); }
      catch { return route.fulfill({status:404,body:"Not found"}); }
    });
  };
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...(candidate ? {serviceWorkers:"block"} : {}),
  });
  await mountCandidate(context);
  const errors = [];
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  const output = "supabase/.temp";
  mkdirSync(output, { recursive: true });
  try {
    await page.goto(origin);
    await page.getByPlaceholder("nama@email.com").fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.getByPlaceholder("nama@email.com").waitFor({ state: "hidden" });
    await page.goto(`${origin}/#/children/${childId}`);
    const edit = () =>
      page
        .locator("article")
        .filter({ hasText: "Validation topic" })
        .getByRole("button", { name: "Edit", exact: true });
    await edit().click();
    let dialog = page.getByRole("dialog");
    let inputs = dialog.getByRole("spinbutton", { name: /^Nilai / });
    await inputs.first().waitFor();
    assert.equal(await inputs.count(), 2);
    await inputs.nth(0).fill("91");
    await inputs.nth(1).fill("80");
    assert.equal(
      await dialog.getByLabel("Nilai Akumulasi").textContent(),
      "85.5",
    );
    await dialog.screenshot({ path: `${output}/report-form-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await dialog.screenshot({ path: `${output}/report-form-mobile.png` });
    // A failed server save must keep both scores and the same draft for reopening.
    await page.route("**/rest/v1/rpc/lms_save_lesson_report", (route) =>
      route.abort("failed"),
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 900 });
    await edit().evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await edit().click();
    dialog = page.getByRole("dialog");
    inputs = dialog.getByRole("spinbutton", { name: /^Nilai / });
    await inputs.first().waitFor();
    assert.deepEqual(
      await inputs.evaluateAll((elements) =>
        elements.map((element) => element.value),
      ),
      ["91", "80"],
    );
    await page.unroute("**/rest/v1/rpc/lms_save_lesson_report");
    const response = page.waitForResponse((res) =>
      res.url().endsWith("/rpc/lms_save_lesson_report"),
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    assert.equal((await response).status(), 200);
    await dialog.waitFor({ state: "hidden" });
    const article = page
      .locator("article")
      .filter({ hasText: "Validation topic" });
    await article.getByText("85.5", { exact: true }).first().waitFor();
    const drafts = await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) =>
          key.startsWith("lms_draft:") &&
          decodeURIComponent(key).includes("lesson_reports"),
      ),
    );
    assert.equal(drafts.length, 0);

    if (candidate || process.env.LMS_PRODUCTION_SMOKE === "1") {
      const camera = Buffer.from(await page.evaluate(() => {
        const canvas=document.createElement("canvas");canvas.width=2400;canvas.height=1600;
        const context=canvas.getContext("2d"),image=context.createImageData(2400,1600);let seed=7;
        for(let i=0;i<image.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;image.data[i]=seed>>>24;image.data[i+1]=(seed>>>16)&255;image.data[i+2]=(seed>>>8)&255;image.data[i+3]=255;}
        context.putImageData(image,0,0);return canvas.toDataURL("image/jpeg",0.85).split(",")[1];
      }),"base64");
      assert.ok(camera.length < 5*1024*1024);
      const begin=page.waitForResponse(response=>response.url().endsWith("/rpc/lms_begin_upload"));
      const finished=page.waitForResponse(response=>response.url().includes("/functions/v1/lesreport")&&response.request().postDataJSON()?.action==="finish-upload");
      await page.locator('input[type="file"]').first().setInputFiles({name:"camera.jpg",mimeType:"image/jpeg",buffer:camera});
      const prepared=await begin,asset=await prepared.json(),body=prepared.request().postDataJSON();
      assert.equal(body.p_mime,"image/webp");assert.ok(body.p_size<camera.length);
      assert.equal((await finished).status(),200);
      await page.getByText("Foto berhasil diunggah!",{exact:true}).waitFor();
      const metrics=await page.evaluate(async({url,key,path,ref})=>{
        const session=JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`));
        const response=await fetch(`${url}/storage/v1/object/authenticated/lms_media/${path}`,{headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});
        const blob=await response.blob(),bitmap=await createImageBitmap(blob);const result={status:response.status,width:bitmap.width,height:bitmap.height,bytes:blob.size,mime:blob.type};bitmap.close();return result;
      },{url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,path:asset.object_path,ref:new URL(process.env.VITE_SUPABASE_URL).hostname.split(".")[0]});
      assert.equal(metrics.status,200);assert.equal(metrics.mime,"image/webp");assert.ok(metrics.width<=320&&metrics.height<=320);assert.equal(metrics.bytes,body.p_size);
      const avatar=page.locator('img[alt="Foto Validation pupil"]').first();await avatar.waitFor();
      await page.waitForFunction(()=>[...document.images].filter(image=>image.alt==="Foto Validation pupil").every(image=>image.src.includes(".lms-v1-avatar.webp")&&image.complete&&image.naturalWidth>0&&image.naturalWidth<=160&&image.naturalHeight<=160));
      assert.ok((await avatar.getAttribute("src")).includes(".lms-v1-avatar.webp"));
      console.log("PASS browser camera upload compresses to WebP before RPC and renders a bounded private stored avatar");
    }

    const parentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ...(candidate ? {serviceWorkers:"block"} : {}),
    });
    await mountCandidate(parentContext);
    const parent = await parentContext.newPage();
    parent.on("pageerror", (error) => errors.push(error.message));
    const parentResponse = parent.waitForResponse((response) =>
      response.url().includes("/functions/v1/lesreport"),
    );
    await parent.goto(`${origin}/#/report/${token}`);
    assert.equal(
      (await parentResponse).status(),
      200,
      "Parent Edge request must succeed",
    );
    await parent.getByText("Rincian Nilai", { exact: true }).waitFor();
    await parent.getByText("85.5", { exact: true }).first().waitFor();
    if (candidate) {
      await parent.locator('img[src*=".lms-v1-"]').first().waitFor();
      for (const image of await parent.locator('img[src*="supabase.co"]').all()) await image.scrollIntoViewIfNeeded();
      await parent.waitForFunction(() => [...document.querySelectorAll('img[src*="supabase.co"]')].every(image => image.complete && image.naturalWidth > 0));
    }
    assert.equal(await parent.locator("article dl dd").count(), 3);
    assert.ok(
      await parent.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await parent.screenshot({
      path: `${output}/report-parent-mobile.png`,
      fullPage: true,
    });
    await parent.setViewportSize({ width: 1280, height: 900 });
    await parent.screenshot({
      path: `${output}/report-parent-desktop.png`,
      fullPage: true,
    });
    await parentContext.close();
    assert.equal(
      errors.length,
      0,
      "Browser must have no uncaught application errors",
    );
    const checks = [
      "real authenticated edit hydration",
      "live decimal average",
      "desktop/mobile layout without overflow",
      "failed save draft recovery",
      "successful atomic RPC clears draft",
      "unauthenticated token-scoped parent scores",
      "zero browser application errors",
    ];
    writeFileSync(
      `${output}/report-browser-results.json`,
      JSON.stringify({ checks, browserErrors: errors.length }, null, 2),
    );
    console.log(`PASS report browser: ${checks.join(", ")}`);
  } catch (error) {
    let message =
      error instanceof Error ? error.message : "Browser check failed";
    for (const secret of [password, token, email])
      message = message.replaceAll(secret, "[REDACTED]");
    throw new Error(message);
  } finally {
    await browser.close();
  }
}
