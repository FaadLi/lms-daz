// Read-only capability audit; benchmark uses validate-live's temporary fixtures.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const env = { ...parseEnv(readFileSync(".env.local", "utf8")), ...process.env };
export async function imageCapabilities() {
  const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/config/storage`,
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } },
  );
  if (!response.ok)
    throw new Error(`Storage capability audit failed (${response.status})`);
  const data = await response.json();
  const result = {
    imageTransformation: data.imageTransformation,
    image_transformation: data.image_transformation,
    features: data.features
      ? Object.fromEntries(
          Object.entries(data.features).filter(([key]) =>
            /image|transform/i.test(key),
          ),
        )
      : undefined,
  };
  console.log("IMAGE_CAPABILITIES", JSON.stringify(result));
  mkdirSync("supabase/.temp", { recursive: true });
  writeFileSync(
    "supabase/.temp/image-capabilities.json",
    JSON.stringify(result, null, 2),
  );
  return result;
}
if (process.argv.includes("--capabilities")) await imageCapabilities();

export async function benchmarkCacheImages({
  email,
  emailB,
  password,
  childId,
  setup,
  checkUpload,
  mode,
}) {
  await imageCapabilities();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const fixture = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      const pixels = ctx.createImageData(2400, 1600);
      let seed = 7;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const n = seed >>> 24;
        pixels.data[i] = n;
        pixels.data[i + 1] = (n + ((i / 4) % 2400) / 12) % 256;
        pixels.data[i + 2] = n / 2;
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
    }),
    "base64",
  );
  assert.ok(fixture.length < 5 * 1024 * 1024);
  const { reportId, transform } = await setup(fixture);
  const samples = [];
  let current;
  const pending = new Set();
  let lastActivity = Date.now();
  page.on("request", (request) => {
    if (request.url().includes(".supabase.co/")) {
      pending.add(request);
      lastActivity = Date.now();
    }
  });
  const done = (request) => {
    if (pending.delete(request)) lastActivity = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  const quiet = async () => {
    const start = Date.now();
    while (pending.size || Date.now() - lastActivity < 500) {
      if (Date.now() - start > 30000) throw new Error("Network did not settle");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const imageRequests = new Map();
  const requestStarts = new Map();
  cdp.on("Network.requestWillBeSent", ({ requestId, timestamp }) =>
    requestStarts.set(requestId, timestamp),
  );
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    if (
      current &&
      response.url.includes("/storage/v1/") &&
      response.mimeType.startsWith("image/")
    )
      imageRequests.set(requestId, current);
  });
  cdp.on(
    "Network.loadingFinished",
    ({ requestId, encodedDataLength, timestamp }) => {
      const sample = imageRequests.get(requestId);
      if (sample) {
        sample.imageTransferBytes += encodedDataLength;
        const start = requestStarts.get(requestId);
        if (start)
          sample.imageLoadMs.push(Math.round((timestamp - start) * 1000));
        imageRequests.delete(requestId);
      }
      requestStarts.delete(requestId);
    },
  );
  page.on("request", (request) => {
    if (!current) return;
    const url = new URL(request.url());
    if (!url.hostname.endsWith(".supabase.co")) return;
    current.requests++;
    if (url.pathname.includes("/rest/v1/")) current.dataRequests++;
    if (
      request.method() === "POST" &&
      /\/object\/sign|\/functions\/v1\/lesreport/.test(url.pathname)
    )
      current.signingOrEdgeRequests++;
  });
  page.on("response", async (response) => {
    const sample = current;
    if (!sample || !response.url().includes("/storage/v1/")) return;
    if ((response.headers()["content-type"] || "").startsWith("image/")) {
      try {
        sample.imageBytes += (await response.body()).length;
        sample.imageResponses++;
      } catch {
        /* Context may close after measurement. */
      }
    }
  });
  const measure = async (name, action, ready) => {
    current = {
      name,
      requests: 0,
      dataRequests: 0,
      signingOrEdgeRequests: 0,
      imageBytes: 0,
      imageTransferBytes: 0,
      imageResponses: 0,
      imageLoadMs: [],
    };
    lastActivity = Date.now();
    const start = performance.now();
    await action();
    await ready();
    await quiet();
    current.readyMs = Math.round(performance.now() - start);
    samples.push(current);
    current = undefined;
  };
  const childReady = async () => {
    await page.getByRole("button", { name: "Tambah Laporan" }).waitFor();
    await page.locator('img[alt="Foto Validation pupil"]').waitFor();
    await page.waitForFunction(() =>
      [...document.images]
        .filter((image) => image.alt === "Foto Validation pupil")
        .every((image) => image.complete && image.naturalWidth > 0),
    );
  };
  try {
    await measure(
      "dashboard-cold",
      async () => {
        await page.goto("http://127.0.0.1:3000");
        await page.getByPlaceholder("nama@email.com").fill(email);
        await page.locator("input[type=password]").fill(password);
        await page.locator("button[type=submit]").click();
        await page
          .getByPlaceholder("nama@email.com")
          .waitFor({ state: "hidden" });
      },
      () =>
        page
          .getByRole("heading", { name: "Aksi Cepat Guru", exact: true })
          .waitFor(),
    );
    await measure(
      "child-first",
      () => page.goto(`http://127.0.0.1:3000/#/children/${childId}`),
      childReady,
    );
    await measure(
      "dashboard-return",
      () =>
        page.evaluate(() => {
          location.hash = "/dashboard";
        }),
      () =>
        page
          .getByRole("heading", { name: "Aksi Cepat Guru", exact: true })
          .waitFor(),
    );
    await measure(
      "child-return",
      () =>
        page.evaluate((id) => {
          location.hash = `/children/${id}`;
        }, childId),
      childReady,
    );
    await measure(
      "gallery-first",
      async () => {
        await page
          .getByRole("navigation", { name: "Tab Navigasi Murid (Desktop)" })
          .getByRole("button", { name: "Foto", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Pilih Laporan untuk Unggah Foto" })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .locator("select")
          .filter({ has: page.locator(`option[value="${reportId}"]`) })
          .selectOption(reportId);
        await dialog
          .getByRole("button", { name: "Simpan", exact: true })
          .click();
        await dialog.waitFor({ state: "hidden" });
      },
      async () => {
        const image = page.locator('img[alt="Benchmark photo"]');
        await image.scrollIntoViewIfNeeded();
        await image.waitFor();
        await page.waitForFunction(() =>
          [...document.images].some(
            (image) =>
              image.alt === "Benchmark photo" &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        );
      },
    );
    const dimensions = await page.locator("img").evaluateAll((images) =>
      images
        .filter((image) => image.naturalWidth)
        .map((image) => ({
          width: image.naturalWidth,
          height: image.naturalHeight,
          displayWidth: Math.round(image.getBoundingClientRect().width),
          kind: image.alt === "Benchmark photo" ? "photo" : "avatar",
        })),
    );
    let upload, photoUpload, signedUrlRenewed=false;
    if (mode === "after") {
      const before = await page
        .locator('img[alt="Foto Validation pupil"]')
        .getAttribute("src");
      await page.locator("input[type=file]").first().setInputFiles({
        name: "camera.jpg",
        mimeType: "image/jpeg",
        buffer: fixture,
      });
      await page
        .getByText("Foto berhasil diunggah!", { exact: true })
        .waitFor();
      await quiet();
      upload = await checkUpload();
      assert.ok(upload.size < fixture.length);
      assert.equal(upload.state, "ready");
      assert.notEqual(
        await page
          .locator('img[alt="Foto Validation pupil"]')
          .getAttribute("src"),
        before,
      );
      const gallery = page
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            name: "Foto Dokumentasi Belajar",
            exact: true,
          }),
        })
        .last();
      await gallery.getByLabel("Caption foto").fill("Optimized photo");
      await gallery
        .locator("input[type=file]")
        .setInputFiles({
          name: "camera.jpg",
          mimeType: "image/jpeg",
          buffer: fixture,
        });
      await gallery
        .getByText("Foto berhasil diunggah!", { exact: true })
        .waitFor();
      await quiet();
      photoUpload = await checkUpload("photo");
      assert.ok(photoUpload.size < fixture.length);
      assert.equal(photoUpload.state, "ready");
      const previousUrl=await page.locator('img[alt="Foto Validation pupil"]').getAttribute('src');
      await page.waitForFunction((previous)=>document.querySelector('img[alt="Foto Validation pupil"]')?.getAttribute('src')!==previous,previousUrl,{timeout:60000});
      await quiet();signedUrlRenewed=true;
      const uploadedPhoto=gallery.locator('article').filter({hasText:'Optimized photo'});
      await uploadedPhoto.getByTitle('Hapus foto').click();await uploadedPhoto.waitFor({state:'hidden'});await quiet();
      assert.equal((await checkUpload('photo')).mime,'image/jpeg');
      const stored = await page.evaluate(async () =>
        Object.keys(localStorage)
          .filter((key) => !key.startsWith("sb-"))
          .map((key) => localStorage.getItem(key))
          .join("\n"),
      );
      assert.ok(!stored.includes("/storage/v1/"));
      assert.ok(!stored.includes("Benchmark photo"));
      const cacheUrls = await page.evaluate(async () =>
        (
          await Promise.all(
            (await caches.keys()).map(async (name) =>
              (await (await caches.open(name)).keys()).map(
                (request) => request.url,
              ),
            ),
          )
        ).flat(),
      );
      assert.ok(
        cacheUrls.every(
          (url) =>
            url.startsWith("http://127.0.0.1:3000/") && !url.includes("token="),
        ),
      );
      await page
        .getByRole("button", { name: "Keluar", exact: false })
        .first()
        .click();
      await page.getByPlaceholder("nama@email.com").waitFor();
      await page.getByPlaceholder("nama@email.com").fill(emailB);
      await page.locator("input[type=password]").fill(password);
      await page.locator("button[type=submit]").click();
      await page
        .getByPlaceholder("nama@email.com")
        .waitFor({ state: "hidden" });
      await quiet();
      assert.equal(
        await page.getByText("Validation pupil", { exact: true }).count(),
        0,
      );
    }
    const data = {
      mode,
      fixtureBytes: fixture.length,
      transform,
      samples,
      dimensions,
      upload,
      photoUpload,
      signedUrlRenewed,
      browserErrors: browserErrors.length,
      checks:
        mode === "after"
          ? [
              "private cache stays in memory",
              "replacement updates avatar",
              "real compression/finalize",
              "account switch isolation",
              "no private SW cache",
            ]
          : [],
    };
    assert.equal(browserErrors.length, 0, "Browser application errors");
    writeFileSync(
      `supabase/.temp/cache-image-${mode}.json`,
      JSON.stringify(data, null, 2),
    );
    console.log("BENCHMARK", JSON.stringify(data));
  } finally {
    await browser.close();
  }
}
