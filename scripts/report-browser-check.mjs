// Called by validate-live --browser; credentials/tokens stay in memory.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

export async function validateReportUi({ email, password, childId, token }) {
  // Use an existing allowed development origin; never weaken Edge CORS for tests.
  const origin = "http://127.0.0.1:3000";
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
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

    const parentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
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
