import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:5050/api";
const SESSION = "playwright-dashboard";
const SESSION_HEADER = { "X-TrustWeave-Session": SESSION };
const BASE_WORLD = {
  seed: 42,
  size: 30,
  campaignSize: 12,
  scenario: "obvious",
};

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page, context }) => {
  await context.addInitScript((sessionId) => {
    window.sessionStorage.setItem("trustweave-session", sessionId);
  }, SESSION);
  const reset = await request.post(`${API_BASE}/simulate`, {
    headers: SESSION_HEADER,
    data: BASE_WORLD,
  });
  expect(reset.ok()).toBeTruthy();
  await page.goto("/network");
  await expect(page.getByTestId("client-ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Network", exact: true })).toBeVisible();
});

test.afterAll(async () => {
  await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SESSION_HEADER },
    body: JSON.stringify(BASE_WORLD),
  });
});

test("views the network as different projects", async ({ page }) => {
  await expect(
    page.getByRole("heading", { level: 1, name: "Network" }),
  ).toBeVisible();

  await page.getByTestId("node-p06").click();
  await expect(page).toHaveURL(/\/project\?as=p06$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Assessing as Spruce Validation",
    }),
  ).toBeVisible();
  await expect(page.locator("#project-selector")).toHaveValue("p06");

  await page.reload();
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
  await page.getByRole("link", { name: "Contributor", exact: true }).click();
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
  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
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
  await expect(page.getByTestId("campaign-provenance")).toBeVisible();
  await expect(page.getByTestId("campaign-evidence-total")).toContainText(
    "refs",
  );
  await expect(
    page.getByTestId("campaign-member-signals").first(),
  ).toBeVisible();

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

test("shows semantic clusters and an honest disabled state", async ({ page }) => {
  const route = "**/api/semantic-clusters*";

  await page.route(route, (fulfillRoute) =>
    fulfillRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        simulation: { seed: 42 },
        readOnly: true,
        enabled: false,
        status: "disabled",
        reason:
          "Semantic clustering is disabled because OPENAI_API_KEY is not set in the backend environment.",
        model: "text-embedding-3-small",
        threshold: 0.86,
        lexicalThreshold: 0.82,
        provider: null,
        generatedAt: "2026-11-01T12:05:00.000Z",
        totals: null,
        clusters: [],
        notes: [],
      }),
    }),
  );

  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Semantic similarity clusters" }),
  ).toBeVisible();
  const disabled = page.getByTestId("semantic-clusters-disabled");
  await expect(disabled).toContainText("OPENAI_API_KEY");
  await expect(disabled).toContainText("no PR text was sent anywhere");

  await page.unroute(route);
  await page.route(route, (fulfillRoute) =>
    fulfillRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        simulation: { seed: 42 },
        readOnly: true,
        enabled: true,
        status: "ok",
        model: "text-embedding-3-small",
        threshold: 0.86,
        lexicalThreshold: 0.82,
        provider: {
          name: "openai",
          model: "text-embedding-3-small",
          batches: 9,
        },
        generatedAt: "2026-11-01T12:05:00.000Z",
        totals: {
          pullRequests: 417,
          embeddedPullRequests: 417,
          uniqueTexts: 52,
          dimensions: 1536,
          crossProjectPairs: 84000,
          semanticPairs: 1200,
          lexicalPairs: 1900,
          bothPairs: 1163,
          semanticOnlyPairs: 37,
          lexicalOnlyPairs: 800,
          exactDuplicatePairs: 12,
          clusters: 2,
          returnedClusters: 1,
          omittedClusters: 1,
        },
        clusters: [
          {
            id: "semantic_01",
            members: 4,
            projectCount: 4,
            contributorCount: 2,
            pairCount: 6,
            meanSimilarity: 0.941,
            minSimilarity: 0.902,
            maxSimilarity: 0.988,
            meanLexicalSimilarity: 0.512,
            minLexicalSimilarity: 0.31,
            maxLexicalSimilarity: 0.72,
            semanticOnlyPairs: 2,
            exactDuplicatePairs: 0,
            campaignIds: ["campaign_01"],
            campaignMembers: 2,
            projects: [
              { id: "p01", name: "Aurora UI" },
              { id: "p02", name: "Basalt DB" },
              { id: "p03", name: "Cobalt CLI" },
              { id: "p04", name: "Drift Cache" },
            ],
            representatives: [
              {
                prId: "pr_0100",
                projectId: "p02",
                projectName: "Basalt DB",
                contributorId: "c_campaign_01",
                contributorHandle: "nova-build-01",
                snippet:
                  "This pull request improves performance and updates documentation.",
              },
              {
                prId: "pr_0101",
                projectId: "p03",
                projectName: "Cobalt CLI",
                contributorId: "c_campaign_01",
                contributorHandle: "nova-build-01",
                snippet:
                  "This change improves performance and refreshes the docs.",
              },
            ],
            commonPaths: [{ value: "src/core/perf.js", count: 4 }],
            firstPrId: "pr_0100",
          },
        ],
        notes: [
          "Pairs are compared only when the two PRs target different projects.",
          "Semantic pairs use cosine similarity.",
          "Content similarity is investigative evidence. It does not prove authorship, intent, coordination or AI generation.",
          "Ordinary PRs that share a project template can cluster too; campaign overlap is reported separately.",
        ],
      }),
    }),
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Semantic similarity clusters" }),
  ).toBeVisible();
  const panel = page.getByTestId("semantic-clusters");
  await expect(page.getByText("text-embedding-3-small").first()).toBeVisible();
  await expect(page.getByText("cosine ≥ 0.86")).toBeVisible();
  await expect(panel.getByText("Meaning-only pairs")).toBeVisible();

  const cluster = page.getByTestId("semantic-cluster").first();
  await expect(cluster).toContainText("4 PRs across 4 projects");
  await expect(cluster).toContainText("overlaps campaign_01");
  await expect(cluster).toContainText(
    "2 pairs matched by meaning without exact wording.",
  );
  await expect(cluster).toContainText("pr_0100");
  await expect(cluster).toContainText("nova-build-01");
  await expect(cluster).toContainText("Basalt DB");
  await expect(cluster).toContainText("src/core/perf.js (4)");
  await expect(panel).toContainText("1 smaller cluster omitted");
  await expect(panel).toContainText("does not prove authorship");
});

test("keeps neutral newcomers unblocked and signs a sponsor vouch", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Newcomers", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Newcomer lane" }),
  ).toBeVisible();
  await expect(page.getByText("12 neutral newcomers")).toBeVisible();
  await expect(
    page.getByText("No signed records yet. Treated as neutral.").first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Simulated sponsor vouch" })
    .first()
    .click();
  await expect(
    page.getByText(/Vouch signed · r_.+ · signature valid · active/),
  ).toBeVisible();
  await expect(
    page.getByText("No signed records yet. Treated as neutral.").first(),
  ).toBeVisible();
});

test("demonstrates signature and hash-chain rejection", async ({ page }) => {
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Records" }),
  ).toBeVisible();
  await expect(page.locator("#records-project")).toHaveValue("p07");
  await expect(page.getByText("log valid")).toBeVisible();
  await expect(page.getByTestId("records-summary")).toContainText("vouch");
  await expect(page.getByTestId("records-summary")).toContainText("denounce");
  await expect(page.getByText("vouch", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("denounce", { exact: true }).first()).toBeVisible();

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

test("searches, filters and navigates the trust graph", async ({ page }) => {
  const count = page.getByTestId("network-count");
  await expect(count).toContainText("30 of 30 projects");
  await expect(count).toContainText("24 of 88 links");
  const allEdges = await count.innerText();

  await page.getByTestId("network-show-all").check();
  await expect(count).toContainText("88 of 88 links");
  await page.getByTestId("network-show-all").uncheck();
  await expect(count).toHaveText(allEdges);

  await page.getByTestId("network-search").fill("Kelp");
  await expect(page.getByTestId("project-row-p08")).toBeVisible();
  await expect(page.getByTestId("project-row-p10")).toHaveCount(0);
  await expect(page.getByTestId("node-p08")).toBeVisible();
  await expect(page.getByTestId("node-p10")).toHaveCount(0);

  await page.getByTestId("network-search").fill("nora-api");
  await expect(page.getByTestId("node-p10")).toBeVisible();
  await expect(page.getByTestId("project-row-p10")).toBeVisible();

  await page.getByTestId("network-search").fill("no-such-project");
  await expect(
    page.getByText("No projects match", { exact: false }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(count).toHaveText(allEdges);

  await page.getByTestId("network-only-selected").check();
  await expect(count).not.toHaveText(allEdges);
  await expect(count).toContainText("of");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByTestId("node-p06").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Assessing as Spruce Validation" }),
  ).toBeVisible();
});

test("traces a project's links when hovering the map", async ({ page }) => {
  await page.getByTestId("node-p06").hover();

  const tooltip = page.getByTestId("node-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Spruce Validation");
  await expect(tooltip).toContainText("p06");
  await expect(tooltip).toContainText("click to assess as this project");

  await page.mouse.move(4, 4);
  await expect(tooltip).toHaveCount(0);
  await expect(page.getByTestId("network-count")).toContainText(
    "30 of 30 projects",
  );
});

test("jumps to a project from the quick jump palette", async ({ page }) => {
  await page.getByTestId("quick-jump").click();

  const dialog = page.getByTestId("quick-jump-dialog");
  await expect(dialog).toBeVisible();
  const input = page.getByTestId("quick-jump-input");
  await expect(input).toBeFocused();

  await input.fill("kelp");
  await expect(dialog.getByText("p08 · 16 people")).toBeVisible();

  await input.press("Enter");
  await expect(page).toHaveURL(/\/project\?as=p08$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Assessing as Kelp Analytics",
    }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test("signs a denouncement and then revokes it", async ({ page }) => {
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByTestId("record-issuer").selectOption("p10");
  await page.getByTestId("record-type").selectOption("denounce");
  await page.getByTestId("record-subject").fill("c_new_good");
  await page.getByTestId("record-reason").fill("demo_denouncement");
  await page.getByTestId("record-evidence").fill("demo evidence note");
  await page.getByTestId("record-submit").click();

  const result = page.getByTestId("record-result");
  await expect(result).toContainText("signature valid");
  await expect(result).toContainText("active");
  const denounceId = (await result.innerText()).match(/r_p10_\d+/)?.[0];
  expect(denounceId).toBeTruthy();

  await page.getByTestId("record-type").selectOption("revoke");
  await page.getByTestId("record-subject-record").fill(denounceId);
  await page.getByTestId("record-evidence").fill("revocation demo");
  await page.getByTestId("record-submit").click();
  await expect(result).toContainText("Signed revoke");
  await expect(result).toContainText("signature valid");

  await expect(page.locator("#records-project")).toHaveValue("p10");
  await expect(page.getByText("valid · revoked").first()).toBeVisible();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
});

test("keeps a signed record after a page reload", async ({ page, request }) => {
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByTestId("record-subject").fill("c_new_good");
  await page.getByTestId("record-submit").click();

  const result = page.getByTestId("record-result");
  await expect(result).toContainText("signature valid");
  const recordId = (await result.innerText()).match(/r_p07_\d+/)?.[0];
  expect(recordId).toBeTruthy();

  await page.reload();
  await expect(page).toHaveURL(/\/records/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Records" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Network", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await expect(page.locator("#records-project")).toHaveValue("p07");
  await expect(page.getByText(recordId, { exact: true })).toBeVisible();

  const log = await request.get(`${API_BASE}/records?projectId=p07`, {
    headers: SESSION_HEADER,
  });
  const body = await log.json();
  const ids = body.log.entries.map((entry) => entry.record.id);
  expect(ids).toContain(recordId);
});

test("shows a retryable error when the API is unreachable", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("alert").first()).toContainText(
    "Cannot reach the TrustWeave API",
  );
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
});

test("has no horizontal overflow on a phone viewport", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [name, url] of [
    ["Network", /\/network$/],
    ["Project view", /\/project\?as=/],
    ["Contributor", /\/contributor\?as=/],
    ["Campaigns", /\/campaigns$/],
    ["Newcomers", /\/newcomers$/],
    ["Records", /\/records$/],
    ["Simulator", /\/simulator$/],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${name} overflows horizontally`).toBeLessThanOrEqual(1);
  }

  await page.goto("/explainer");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("opens every view from a direct URL and keeps deep-linked state", async ({
  page,
}) => {
  await page.goto("/network");
  await expect(
    page.getByRole("heading", { level: 1, name: "Network" }),
  ).toBeVisible();

  for (const [path, heading] of [
    ["/campaigns", "Campaigns"],
    ["/newcomers", "Newcomer lane"],
    ["/records", "Records"],
    ["/simulator", "Simulator"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }

  await page.goto("/project?as=p06");
  await expect(page.locator("#project-selector")).toHaveValue("p06");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Assessing as Spruce Validation",
    }),
  ).toBeVisible();

  await page.goto("/contributor?as=p02&id=c_disputed");
  await expect(page.locator("#assessment-project")).toHaveValue("p02");
  await expect(page.locator("#contributor-id")).toHaveValue("c_disputed");

  await page.goto("/records?project=p03&tamper=signature");
  await expect(page.locator("#records-project")).toHaveValue("p03");
  await expect(page.getByText("log rejected")).toBeVisible();
  await expect(
    page.getByText("Tamper demo:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("vouch", { exact: true }).first()).toBeVisible();
});

test("rebuilds the simulation from a new seed and measures across seeds", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Simulator", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Simulator" }),
  ).toBeVisible();

  await page.locator("#seed-input").fill("99");
  await page.locator("#size-input").selectOption("20");
  await page.locator("#campaign-size-input").selectOption("10");
  await page.getByRole("button", { name: "Rebuild simulation" }).click();

  await expect(
    page.getByText(
      "Rebuilt seed 99 with 20 projects and 1 campaign detected in the Obvious campaign.",
    ),
  ).toBeVisible();
  await expect(page.getByText("seed 99", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Measure across seeds" }).click();
  await expect(
    page.getByRole("heading", { name: "Across seeds" }),
  ).toBeVisible();
  await expect(page.getByText("Precision mean").first()).toBeVisible();
  await expect(
    page.getByText("Max newcomer false flags").first(),
  ).toBeVisible();
  await expect(page.getByText("seed 2026").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Stealth campaign" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Missed:.*nova-build-10.*quiet/).first(),
  ).toBeVisible();

  await page.locator("#scenario-input").selectOption("stealth");
  await page.locator("#seed-input").fill("42");
  await page.locator("#size-input").selectOption("30");
  await page.locator("#campaign-size-input").selectOption("12");
  await page.getByRole("button", { name: "Rebuild simulation" }).click();
  await expect(
    page.getByText(/detected in the Stealth campaign\./),
  ).toBeVisible();
  await expect(
    page.getByText("Missed ground-truth accounts (3)"),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/c_campaign_10/).first()).toBeVisible();
});
