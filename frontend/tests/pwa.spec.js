import { test, expect } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "pwa",
    "PWA checks require a production build; run `npm run test:pwa`.",
  );
});

test("serves an installable manifest with valid icons", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/manifest.webmanifest`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest");

  const manifest = await response.json();
  expect(manifest.name).toContain("TrustWeave");
  expect(manifest.short_name).toBe("TrustWeave");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBeTruthy();
  expect(manifest.icons.some((icon) => icon.purpose === "any")).toBeTruthy();

  for (const icon of manifest.icons) {
    const asset = await request.get(`${baseURL}${icon.src}`);
    expect(asset.status(), icon.src).toBe(200);
    expect(asset.headers()["content-type"], icon.src).toContain("image/png");
  }
});

test("registers the service worker and caches only the app shell", async ({ page }) => {
  await page.goto("/");
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope.endsWith("/")).toBeTruthy();

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return { names, urls };
  });

  expect(cached.names.some((name) => name.startsWith("trustweave-shell"))).toBeTruthy();
  expect(cached.urls.some((url) => url.endsWith("/offline"))).toBeTruthy();
  expect(cached.urls.some((url) => url.includes("/api/"))).toBeFalsy();
});

test("shows the offline fallback for uncached navigation", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  try {
    await page.goto("/newcomers", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "You are offline" }),
    ).toBeVisible();
    await expect(page.getByText("Assessments, campaigns and signed records are never cached")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
