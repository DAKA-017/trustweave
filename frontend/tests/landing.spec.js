import { test, expect } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name === "pwa",
    "Landing checks run against the dev server in the chromium project.",
  );
});

test("presents the public page and a working path into the demo", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Trust the work, not one global score.",
    }),
  ).toBeVisible();

  const status = page.getByTestId("landing-status");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("data-state", "live", {
    timeout: 20_000,
  });
  await expect(status).toContainText("live demo API connected");
  await expect(status).toContainText("417");
  await expect(status).toContainText("126");

  await page
    .getByRole("link", { name: "Open the interactive demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/network$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Network" }),
  ).toBeVisible();
  await expect(page.getByTestId("client-ready")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("switches between real example assessments", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "How a project makes a decision" }),
  ).toBeVisible();

  await expect(
    page.getByRole("tab", { name: "A disputed contributor" }),
  ).toHaveAttribute("aria-selected", "true");
  const disputedPanel = page.getByRole("tabpanel", {
    name: "A disputed contributor",
  });
  await expect(disputedPanel.getByText("marco-disputed")).toBeVisible();
  await expect(disputedPanel.getByText("Normal review")).toBeVisible();
  await expect(
    disputedPanel.getByText(
      "Record from p07 ignored: this project gives that issuer zero effective trust.",
    ),
  ).toBeVisible();

  await page
    .getByRole("tab", { name: "A newcomer with no history" })
    .click();
  const newcomerPanel = page.getByRole("tabpanel", {
    name: "A newcomer with no history",
  });
  await expect(newcomerPanel.getByText("ana-newcomer")).toBeVisible();
  await expect(
    newcomerPanel.getByText("No history. Treated as neutral."),
  ).toBeVisible();
  await expect(
    newcomerPanel.getByText(
      "0% of 14 newcomers were flagged across 30 projects",
    ),
  ).toBeVisible();

  await page.getByRole("tab", { name: "A coordinated campaign" }).click();
  const campaignPanel = page.getByRole("tabpanel", {
    name: "A coordinated campaign",
  });
  await expect(campaignPanel.getByText("nova-build-01")).toBeVisible();
  await expect(
    campaignPanel.getByText("Campaign detected · confidence high"),
  ).toBeVisible();
  await expect(
    campaignPanel.getByText(
      "Near Duplicate Content — 12 members showed this signal.",
    ),
  ).toBeVisible();
  await expect(
    campaignPanel.getByText(/3 quiet sleeper accounts in the same world/),
  ).toBeVisible();
  await expect(
    campaignPanel.getByRole("link", { name: "Inspect the campaign evidence" }),
  ).toHaveAttribute("href", "/campaigns");
});

test("falls back to the snapshot and offers a retry when the API is down", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");

  const status = page.getByTestId("landing-status");
  await expect(status).toHaveAttribute("data-state", "offline");
  await expect(status).toContainText("seed-42 snapshot");
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Trust the work, not one global score.",
    }),
  ).toBeVisible();
});

test("serves social metadata, a sitemap and a branded 404", async ({
  page,
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toContain('property="og:image"');
  expect(html).toContain('rel="canonical"');
  expect(html).toContain("application/ld+json");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(
    "https://trustweave-taupe.vercel.app/network",
  );

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(
    "Sitemap: https://trustweave-taupe.vercel.app/sitemap.xml",
  );

  const image = await request.get("/opengraph-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");

  await page.goto("/this-path-is-not-woven-in");
  await expect(
    page.getByRole("heading", { name: "This path has no signed record." }),
  ).toBeVisible();
  await expect(page.getByText("404 · not in the log")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to the overview" }),
  ).toHaveAttribute("href", "/");
});

test("has no horizontal overflow on a phone viewport", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toBeVisible();

  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

  expect(await overflow()).toBeLessThanOrEqual(1);

  for (const tab of [
    "A newcomer with no history",
    "A coordinated campaign",
    "A disputed contributor",
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    expect(await overflow(), `${tab} overflows horizontally`).toBeLessThanOrEqual(
      1,
    );
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await overflow()).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
