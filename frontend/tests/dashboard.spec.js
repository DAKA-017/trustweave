import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:5050/api";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  const reset = await request.post(`${API_BASE}/simulate`, {
    data: { seed: 42, size: 30, campaignSize: 12 },
  });
  expect(reset.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Network", exact: true })).toBeVisible();
});

test.afterAll(async () => {
  await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed: 42, size: 30, campaignSize: 12 }),
  });
});

test("views the network as different projects", async ({ page }) => {
  await expect(
    page.getByRole("heading", { level: 1, name: "Network" }),
  ).toBeVisible();

  await page.getByTestId("node-p06").click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Assessing as Spruce Validation",
    }),
  ).toBeVisible();
  await expect(page.locator("#project-selector")).toHaveValue("p06");

  await page.locator("#project-selector").selectOption("p10");
  await expect(
    page.getByRole("heading", { level: 1, name: "Assessing as Jade Workers" }),
  ).toBeVisible();
  const contributors = page
    .getByText("Contributors", { exact: true })
    .locator("..");
  await expect(contributors).toContainText("21");
  await expect(page.getByText("nova-build-01")).toBeVisible();

  await page.locator("#project-selector").selectOption("p08");
  await expect(
    page.getByRole("heading", { level: 1, name: "Assessing as Kelp Analytics" }),
  ).toBeVisible();
  await expect(contributors).toContainText("16");
});

test("explains a contributor from signed records and behavioral signals", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Contributor", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "marco-disputed",
  );

  await page.locator("#assessment-project").selectOption("p06");
  await expect(page.getByText("Caution", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(
      "Evidence-backed denouncement from p07 (reason: repeated_low_quality_patch); scaled by effective trust 0.9.",
    ),
  ).toBeVisible();

  await page.locator("#assessment-project").selectOption("p08");
  await expect(
    page.getByText("Normal review", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("No countable negative evidence. Neutral by default."),
  ).toBeVisible();

  await page.locator("#assessment-project").selectOption("p10");
  await page.locator("#contributor-id").fill("c_human_spam");
  await page.getByRole("button", { name: "Assess", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "sam-human-spam",
  );
  await expect(page.getByText("Flagged", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByText(
        "14 near-duplicate PRs across 8 projects (similarity threshold 0.82).",
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Near Duplicate Content", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Burst Timing", { exact: true })).toBeVisible();
});

test("shows the coordinated campaign with multiple independent signals", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Campaigns" }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Coordinated campaign · campaign_01" }),
  ).toBeVisible();
  await expect(
    page.getByText("confidence high", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Members (12)")).toBeVisible();
  await expect(page.getByText("Affected projects (24)")).toBeVisible();

  for (const signal of [
    "Near Duplicate Content",
    "Burst Timing",
    "New Accounts In Sync",
    "Vouch Ring",
    "High Volume Low Merge",
  ]) {
    await expect(page.getByText(signal, { exact: true })).toBeVisible();
  }

  await expect(page.getByText("PR burst timeline")).toBeVisible();
  await expect(
    page
      .getByText("nova-build-01", { exact: true })
      .first(),
  ).toBeVisible();
});

test("keeps neutral newcomers unblocked and signs a sponsor vouch", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Newcomers", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Newcomer lane" }),
  ).toBeVisible();
  await expect(page.getByText("12 neutral newcomer(s)")).toBeVisible();
  await expect(
    page.getByText("No history. Treated as neutral.").first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Simulated sponsor vouch" })
    .first()
    .click();
  await expect(
    page.getByText(/Vouch signed · r_.+ · signature valid · active/),
  ).toBeVisible();
  await expect(page.getByText("No history. Treated as neutral.").first()).toBeVisible();
});

test("demonstrates signature and hash-chain rejection", async ({ page }) => {
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Records" }),
  ).toBeVisible();
  await expect(page.locator("#records-project")).toHaveValue("p02");
  await expect(page.getByText("log valid")).toBeVisible();

  await page.getByRole("button", { name: "Tamper signature" }).click();
  await expect(page.getByText("Tamper demo:", { exact: false })).toBeVisible();
  await expect(page.getByText("log rejected")).toBeVisible();
  await expect(page.getByText("signature invalid").first()).toBeVisible();
  await expect(page.getByText(/^rejected:/).first()).toBeVisible();
  await expect(
    page.getByText("The stored log is unchanged.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Break chain" }).click();
  await expect(page.getByText("chain broken").first()).toBeVisible();
  await expect(page.getByText(/^rejected: .*chain/).first()).toBeVisible();

  await page.getByRole("button", { name: "Verified" }).click();
  await expect(page.getByText("log valid")).toBeVisible();
  await expect(page.getByText("signature invalid")).toHaveCount(0);
});

test("rebuilds the simulation from a new seed and measures across seeds", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Simulator", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Simulator" }),
  ).toBeVisible();

  await page.locator("#seed-input").fill("99");
  await page.locator("#size-input").selectOption("20");
  await page.locator("#campaign-size-input").selectOption("10");
  await page.getByRole("button", { name: "Rebuild simulation" }).click();

  await expect(
    page.getByText(
      "Rebuilt seed 99 with 20 projects and 1 campaign(s) detected.",
    ),
  ).toBeVisible();
  await expect(page.getByText("seed 99", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Measure across seeds" }).click();
  await expect(
    page.getByRole("heading", { name: "Across seeds" }),
  ).toBeVisible();
  await expect(page.getByText("Precision mean")).toBeVisible();
  await expect(page.getByText("Max newcomer false flags")).toBeVisible();
  await expect(page.getByText("seed 2026")).toBeVisible();
});
