import { chromium } from "@playwright/test";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:4173";
const pass = (message) => console.log(`PASS ${message}`);
const result = { checks: [], browserErrors: [] };
const record = (message) => {
  result.checks.push(message);
  pass(message);
};
const profileRoot = resolve("supabase/.temp");
mkdirSync(profileRoot, { recursive: true });
const profile = mkdtempSync(join(profileRoot, "pwa-browser-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (error) => result.browserErrors.push(error.message));
page.setDefaultTimeout(20000);
const workerSource = readFileSync("dist/sw.js", "utf8");
let appInstalled = false;
let pwaSession;
mkdirSync("supabase/.temp", { recursive: true });
try {
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (
    await context.request.get(`${origin}/manifest.webmanifest`)
  ).json();
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  for (const icon of manifest.icons) {
    const response = await context.request.get(origin + icon.src);
    assert.equal(response.status(), 200);
    const png = await response.body();
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual(installability.installabilityErrors, []);
  record(
    "valid manifest/icons, registered controlling SW and Chrome installability checks",
  );
  pwaSession = await context.browser().newBrowserCDPSession();
  await pwaSession.send("PWA.install", {
    manifestId: origin + "/",
    installUrlOrBundleUrl: origin + "/",
  });
  appInstalled = true;
  await pwaSession.send("PWA.launch", { manifestId: origin + "/" });
  await page.reload();
  await page.getByPlaceholder("nama@email.com").waitFor();
  record(
    "PWA installed/launched in isolated Chrome profile and reload after install works",
  );

  // Only the static index is returned: private query/hash URLs are not cache keys.
  await page.goto(`${origin}/?token=not-a-real-private-token`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheUrls = () =>
    page.evaluate(async () => {
      const names = await caches.keys();
      return (
        await Promise.all(
          names.map(async (name) =>
            (await (await caches.open(name)).keys()).map(
              (request) => request.url,
            ),
          ),
        )
      ).flat();
    });
  const cached = await cacheUrls();
  assert.ok(cached.length >= 6);
  assert.ok(
    cached.every((url) => url.startsWith(origin) && !url.includes("token=")),
  );
  assert.ok(
    cached.every((url) =>
      /\/(assets\/|icons\/|icon\.svg|image-placeholder\.svg|index\.html|manifest\.webmanifest)/.test(
        url,
      ),
    ),
  );
  await context.setOffline(true);
  await page.goto(origin);
  await page.getByPlaceholder("nama@email.com").waitFor();
  record(
    "offline app-shell reload and static assets work; private/API URLs absent from caches",
  );
  await context.setOffline(false);

  if (process.argv.includes("--authenticated")) {
    assert.ok(
      process.env.VALIDATION_A_EMAIL || existsSync(".env.validation"),
      "Run validate-live.mjs --keep-for-ui first",
    );
    const credentials = process.env.VALIDATION_A_EMAIL ? process.env : parseEnv(readFileSync(".env.validation", "utf8"));
    const login = async (email) => {
      await page.goto(origin);
      await page.getByPlaceholder("nama@email.com").fill(email);
      await page
        .locator('input[type="password"]')
        .fill(credentials.VALIDATION_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page
        .getByRole("button", { name: "Keluar", exact: false })
        .first()
        .waitFor({ state: "attached" });
    };
    await login(credentials.VALIDATION_A_EMAIL);
    await page.goto(`${origin}/#/subjects`);
    await page
      .getByRole("button", { name: "Tambah Mata Pelajaran", exact: true })
      .click();
    const subjectInput = () =>
      page.getByPlaceholder("Masukkan mata pelajaran…");
    await subjectInput().fill("Browser draft subject");
    await page.reload();
    await page
      .getByRole("button", { name: "Tambah Mata Pelajaran", exact: true })
      .click();
    assert.equal(await subjectInput().inputValue(), "Browser draft subject");
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    await page
      .getByRole("button", { name: "Tambah Mata Pelajaran", exact: true })
      .click();
    assert.equal(await subjectInput().inputValue(), "Browser draft subject");
    record(
      "real Supabase Auth login; form refresh and close/open restore unsaved input",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "supabase/.temp/pwa-mobile.png",
      fullPage: true,
    });
    await context.setOffline(true);
    await subjectInput().fill("Offline last character");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.getByText(/Sedang offline/).waitFor();
    await context.setOffline(false);
    // Reconnect only: do not submit/replay automatically.
    await page.getByRole("button", { name: "Simpan", exact: true }).waitFor();
    assert.equal(await subjectInput().inputValue(), "Offline last character");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page
      .getByRole("heading", { name: "Offline last character", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        (id) => localStorage.getItem(`lms_draft:v1:${id}:subjects:new`),
        credentials.VALIDATION_A_ID,
      ),
      null,
    );
    record(
      "mobile form fits; offline submit fails visibly; explicit successful Supabase save clears draft",
    );

    await page
      .getByRole("button", { name: "Tambah Mata Pelajaran", exact: true })
      .click();
    await subjectInput().fill("Keep through PWA update");
    writeFileSync("dist/sw.js", `${workerSource}\n// browser-update-fixture\n`);
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration()).update(),
    );
    await page
      .getByRole("button", { name: "Perbarui aplikasi", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Perbarui aplikasi", exact: true })
      .click();
    await page.waitForLoadState("load");
    await page
      .getByRole("button", { name: "Tambah Mata Pelajaran", exact: true })
      .click();
    assert.equal(await subjectInput().inputValue(), "Keep through PWA update");
    record(
      "real waiting service-worker update prompts, flushes drafts and reloads safely",
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: "supabase/.temp/pwa-desktop.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const draftData = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("lms_draft:"))
        .map((key) => localStorage.getItem(key))
        .join("\n"),
    );
    assert.ok(!draftData.includes(credentials.VALIDATION_PASSWORD));
    assert.ok(!/access_token|refresh_token|sb_secret_|Bearer /.test(draftData));
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    await page
      .getByRole("button", { name: "Keluar", exact: false })
      .first()
      .click();
    // Logout now also clears the device push binding/subscription. Wait for the
    // completed Auth transition before navigating to the next account's login.
    await page.getByPlaceholder('nama@email.com').waitFor();
    await login(credentials.VALIDATION_B_EMAIL);
    await page.goto(`${origin}/#/subjects`);
    await page
      .getByRole("button", { name: "Tambah Mata Pelajaran", exact: true })
      .click();
    assert.equal(await subjectInput().inputValue(), "");
    record(
      "desktop form fits; logout/login isolates drafts; draft storage contains no Auth credentials",
    );
    const finalCaches = await cacheUrls();
    assert.ok(
      finalCaches.every(
        (url) => url.startsWith(origin) && !url.includes("token="),
      ),
    );
  }
  assert.deepEqual(result.browserErrors, []);
  record("no uncaught browser errors");
} finally {
  if (appInstalled)
    await pwaSession
      .send("PWA.uninstall", { manifestId: origin + "/" })
      .catch(() => {
        console.error(
          "Test PWA uninstall needs review in its isolated profile.",
        );
      });
  writeFileSync("dist/sw.js", workerSource);
  writeFileSync(
    "supabase/.temp/pwa-browser-results.json",
    JSON.stringify(result, null, 2),
  );
  await context.close();
  const target = resolve(profile);
  assert.ok(
    target.startsWith(profileRoot + "\\") &&
      target.slice(profileRoot.length + 1).startsWith("pwa-browser-"),
  );
  rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
