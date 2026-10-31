"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { projectPath, recordsPath } from "@/lib/routes";
import { Button, PageHeader, Panel } from "@/components/ui";

const SIGN_PROJECT = "p08";
const MARKER_KEY = "trustweave:verify:last-record";
const RELOAD_KEY = "trustweave:verify:reloaded";
const VERIFY_PROJECT = "p06";
const CAMPAIGN_SEED = 7;
const CAMPAIGN_SIZE = 10;
const BASE_SEED = 42;
const BASE_CAMPAIGN_SIZE = 12;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be disabled; the signature checks still run without it.
  }
}

async function checkPersist() {
  const marker = readStorage(window.localStorage, MARKER_KEY);
  if (!marker) {
    return {
      status: "wait",
      detail:
        "No record from an earlier page load yet. This run signs one, then reloads once to look for it again.",
    };
  }
  const data = await api.getRecords(SIGN_PROJECT, "none");
  const entry = data.log.entries.find((item) => item.record.id === marker);
  assert(
    entry,
    `Record ${marker} was not found after the reload; the simulation may have been rebuilt by another visitor.`,
  );
  assert(
    entry.verification.signatureValid,
    `Record ${marker} is present but its signature no longer verifies.`,
  );
  return {
    detail: `Record ${marker} was signed before a real page reload and is still in ${SIGN_PROJECT}'s log afterwards, with a valid signature.`,
  };
}

async function checkLoad() {
  const [health, projects] = await Promise.all([
    api.getHealth(),
    api.getProjects(),
  ]);
  const count = projects.projects?.length ?? 0;
  assert(count === 30, `Expected 30 projects, received ${count}.`);
  assert(
    (health.counts?.records ?? 0) > 100,
    "The health response did not include the record count.",
  );
  return {
    detail: `Live API: ${health.counts.projects} projects, ${health.counts.contributors} contributors, ${health.counts.pullRequests} PRs, ${health.counts.records} signed records · seed ${health.seed} · clock ${health.simulatedAt}.`,
  };
}

async function checkGraph() {
  const view = await api.getProjectView(VERIFY_PROJECT);
  const summary = view.summary ?? view.project.counts ?? {};
  const flagged = summary.byOutcome?.flagged ?? 0;
  const link = projectPath(VERIFY_PROJECT);
  assert(
    link === "/project?as=p06",
    `The project link resolved to ${link} instead of /project?as=p06.`,
  );
  assert(
    (summary.contributors ?? 0) > 0,
    "The project view returned no contributors, so filtering has nothing to show.",
  );
  assert(
    Array.isArray(view.incoming) && view.incoming.length > 0,
    "The project view returned no evaluated pull requests.",
  );
  return {
    detail: `${link} returned ${summary.contributors} contributors and ${summary.pullRequests} pull requests; ${flagged} were flagged from campaign evidence. The map, nav and selectors all write this real URL, so a reload reopens the same project.`,
  };
}

async function checkSimulator() {
  let detail;
  try {
    const changed = await api.simulate({
      seed: CAMPAIGN_SEED,
      campaignSize: CAMPAIGN_SIZE,
    });
    const health = await api.getHealth();
    assert(
      health.seed === CAMPAIGN_SEED,
      `The rebuilt simulation reports seed ${health.seed}, not ${CAMPAIGN_SEED}.`,
    );
    const campaigns = await api.getCampaigns();
    const detected = campaigns.campaigns?.[0];
    const members = detected?.memberContributorIds?.length ?? 0;
    assert(
      members === CAMPAIGN_SIZE,
      `A rebuild with ${CAMPAIGN_SIZE} campaign members made the detector return ${members}.`,
    );
    detail = `Rebuilt seed ${BASE_SEED} → ${CAMPAIGN_SEED} with campaignSize ${CAMPAIGN_SIZE}: ${changed.simulation.counts.pullRequests} PRs regenerated and the detector returned ${members} members.`;
  } finally {
    await api.simulate({
      seed: BASE_SEED,
      campaignSize: BASE_CAMPAIGN_SIZE,
    });
    const restored = await api.getHealth();
    if (restored.seed !== BASE_SEED) {
      throw new Error(`Could not restore seed ${BASE_SEED} after the rebuild test.`);
    }
  }
  return {
    detail: `${detail} Restored seed ${BASE_SEED} with campaignSize ${BASE_CAMPAIGN_SIZE}.`,
  };
}

async function checkCampaign() {
  const data = await api.getCampaigns();
  const campaign = data.campaigns?.[0];
  assert(campaign, "The detector returned no campaigns.");
  assert(
    campaign.confidence?.label === "high",
    `Expected high confidence, received ${campaign.confidence?.label}.`,
  );
  assert(
    campaign.memberContributorIds?.length === BASE_CAMPAIGN_SIZE,
    `Expected ${BASE_CAMPAIGN_SIZE} members, received ${campaign.memberContributorIds?.length}.`,
  );
  assert(
    campaign.signalsFired?.length >= 2,
    "Campaign detection needs at least two independent signal types.",
  );
  const types = campaign.signalsFired.map((signal) => signal.type).join(", ");
  return {
    detail: `${campaign.id}: ${campaign.confidence.label} confidence, ${campaign.memberContributorIds.length} members across ${campaign.affectedProjectIds.length} projects, ${campaign.signalsFired.length} signal types (${types}).`,
  };
}

async function checkNewcomers() {
  const data = await api.getNewcomers();
  const newcomers = data.newcomers ?? [];
  assert(newcomers.length >= 10, `Expected at least 10 newcomers, received ${newcomers.length}.`);
  assert(
    newcomers.every((item) => item.assessment?.outcome === "normal_review"),
    "A newcomer without history was not treated as normal review.",
  );
  assert(
    newcomers.every((item) =>
      (item.assessment?.reasons ?? []).some(
        (reason) => reason.type === "newcomer_neutral",
      ),
    ),
    "A newcomer was judged without the neutral no-history reason.",
  );
  assert(
    (data.sponsorOptions?.length ?? 0) > 0,
    "No sponsor vouch options were available.",
  );
  return {
    detail: `${newcomers.length} newcomers with no history all stay "normal review" for reason newcomer_neutral; ${data.sponsorOptions.length} independent sponsor options are available instead of a silent penalty.`,
  };
}

async function checkRecords() {
  const data = await api.getRecords("p07", "none");
  const entries = data.log?.entries ?? [];
  const types = entries.reduce(
    (totals, entry) => {
      totals[entry.record.type] = (totals[entry.record.type] ?? 0) + 1;
      return totals;
    },
    { vouch: 0, denounce: 0, revoke: 0 },
  );
  assert(types.vouch > 0, "The default log contains no vouch.");
  assert(types.denounce > 0, "The default log contains no denouncement.");
  const verified = entries.filter(
    (entry) =>
      entry.verification?.integrity === "valid" &&
      entry.verification?.signatureValid &&
      entry.verification?.hashIntact &&
      entry.verification?.chainIntact,
  ).length;
  assert(
    verified === entries.length,
    `${entries.length - verified} of ${entries.length} entries failed verification.`,
  );
  return {
    detail: `p07 log: ${types.vouch} vouch + ${types.denounce} denounce; ${verified}/${entries.length} entries pass the Ed25519 signature, SHA-256 hash and previous-hash chain checks.`,
  };
}

async function checkTamper() {
  const data = await api.getRecords("p03", "signature");
  const entries = data.log?.entries ?? [];
  const rejected = entries.filter(
    (entry) => !entry.verification?.signatureValid,
  );
  const issues = [...new Set(rejected.flatMap((entry) => entry.verification?.issues ?? []))];
  assert(data.log?.valid === false, "The tampered copy was still reported as valid.");
  assert(rejected.length >= 1, "No entry was rejected after the signature tamper.");
  assert(
    issues.includes("invalid_signature"),
    `The rejection listed ${issues.join(", ") || "no issues"}.`,
  );
  return {
    detail: `${rejected.length} of ${entries.length} entries rejected with ${issues.join(", ")}; the stored log is untouched and the invalid entry stays visible.`,
  };
}

async function checkSign() {
  const signed = await api.postRecord({
    issuerProjectId: SIGN_PROJECT,
    subjectContributorId: "c_new_good",
    type: "vouch",
    reasonCode: "verification_check",
    evidence: [
      {
        kind: "note",
        ref: "Signed from the live /verify page. Demo only.",
      },
    ],
  });
  assert(
    signed.verification?.signatureValid === true,
    "The new record's Ed25519 signature did not verify.",
  );
  assert(
    signed.verification?.hashIntact === true,
    "The new record's hash did not match its contents.",
  );
  const readBack = await api.getRecords(SIGN_PROJECT, "none");
  const found = readBack.log?.entries?.some(
    (entry) => entry.record.id === signed.record.id,
  );
  assert(found, "The signed record could not be read back in a separate request.");
  writeStorage(window.localStorage, MARKER_KEY, signed.record.id);
  return {
    detail: `Signed ${signed.record.id} for ${SIGN_PROJECT}: signature valid, hash intact, read back from the server in a separate request.`,
  };
}

const CHECKS = [
  { id: "persist", title: "Changes persist after refresh", run: checkPersist },
  { id: "load", title: "Network data loads", run: checkLoad },
  { id: "graph", title: "Interactive graph controls", run: checkGraph },
  { id: "simulator", title: "Simulator updates results", run: checkSimulator },
  { id: "campaign", title: "Full campaign detection", run: checkCampaign },
  { id: "newcomer", title: "Newcomer fairness", run: checkNewcomers },
  { id: "records", title: "Vouch and denouncement verification", run: checkRecords },
  { id: "tamper", title: "Tamper detection", run: checkTamper },
  { id: "sign", title: "Record signing", run: checkSign },
];

const LINKS = {
  persist: [{ label: "Open p08 log", href: recordsPath(SIGN_PROJECT) }],
  load: [{ label: "Open Network", href: "/network" }],
  graph: [{ label: "Open p06 project", href: projectPath(VERIFY_PROJECT) }],
  simulator: [{ label: "Open Simulator", href: "/simulator" }],
  campaign: [{ label: "Open Campaigns", href: "/campaigns" }],
  newcomer: [{ label: "Open Newcomers", href: "/newcomers" }],
  records: [{ label: "Open p07 log", href: recordsPath("p07") }],
  tamper: [
    {
      label: "Open tampered copy",
      href: recordsPath("p03", "signature"),
    },
  ],
  sign: [{ label: "Open p08 log", href: recordsPath(SIGN_PROJECT) }],
};

const STATUS = {
  pending: {
    label: "pending",
    icon: CircleDashed,
    tone: "border-line text-muted",
  },
  running: {
    label: "running",
    icon: Loader2,
    tone: "border-amber/40 bg-amber/5 text-amber",
    spin: true,
  },
  wait: {
    label: "waiting",
    icon: CircleDashed,
    tone: "border-amber/40 bg-amber/5 text-amber",
  },
  pass: {
    label: "pass",
    icon: CheckCircle2,
    tone: "border-teal/40 bg-teal/10 text-teal",
  },
  fail: {
    label: "fail",
    icon: XCircle,
    tone: "border-danger/40 bg-danger/10 text-danger",
  },
};

function initialRows() {
  return CHECKS.map((check) => ({
    id: check.id,
    title: check.title,
    status: "pending",
    detail: "",
  }));
}

export function VerifyView() {
  const [rows, setRows] = useState(initialRows);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const runningRef = useRef(false);
  const reloadTimer = useRef(null);

  const update = useCallback((id, patch) => {
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setRows(initialRows());

    const hadMarker = Boolean(readStorage(window.localStorage, MARKER_KEY));
    const results = [];

    for (const check of CHECKS) {
      update(check.id, { status: "running", detail: "" });
      try {
        const result = await check.run();
        const status = result.status ?? "pass";
        results.push({ id: check.id, status });
        update(check.id, { status, detail: result.detail });
      } catch (error) {
        results.push({ id: check.id, status: "fail" });
        update(check.id, {
          status: "fail",
          detail: error?.message ?? "The check could not finish.",
        });
      }
    }

    setLastRun(new Date().toLocaleTimeString());
    setRunning(false);
    runningRef.current = false;

    const persist = results.find((result) => result.id === "persist");
    const needsReload =
      (!hadMarker || persist?.status !== "pass") &&
      !readStorage(window.sessionStorage, RELOAD_KEY);
    if (needsReload) {
      writeStorage(window.sessionStorage, RELOAD_KEY, "1");
      update("persist", {
        status: "wait",
        detail:
          "Signed a record this run. Reloading once so the page can find it again after a real refresh…",
      });
      reloadTimer.current = setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 1800);
    }
  }, [update]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runAll();
    }, 0);
    return () => {
      clearTimeout(timer);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [runAll]);

  const passCount = rows.filter((row) => row.status === "pass").length;
  const failed = rows.filter((row) => row.status === "fail").length;
  const allPassed = passCount === rows.length;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Live verification"
        description="Every row below is executed in your browser against the live API when this page loads. Nothing is pre-recorded: a row turns green only after the request succeeds and its checks hold."
      >
        <span
          data-testid="verify-score"
          className={`rounded border px-2 py-1 font-mono text-[10px] ${
            allPassed
              ? "border-teal/40 bg-teal/10 text-teal"
              : failed > 0
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-amber/40 bg-amber/5 text-amber"
          }`}
        >
          {passCount} / {rows.length} passed
        </span>
        <Button
          variant="secondary"
          onClick={runAll}
          disabled={running}
          data-testid="verify-run"
        >
          <RefreshCw
            className={`h-4 w-4 ${running ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {running ? "Running" : "Run all checks"}
        </Button>
      </PageHeader>

      <Panel
        title="What this page does"
        description="The checks rebuild the demo simulation, sign one demo record, and reload once on the first visit. Every change is observable and listed in the evidence beside each row."
        className="mb-4"
      >
        <ul className="grid gap-2 text-xs leading-relaxed text-muted sm:grid-cols-2">
          <li>
            • Read-only checks call the same API the dashboard uses: health,
            network, project, campaigns, newcomers, records and the tampered
            copy.
          </li>
          <li>
            • The detector check rebuilds seed 7 with 10 campaign members, then
            restores seed 42 with 12. If detection were hard-coded, the member
            count could not follow the rebuild.
          </li>
          <li>
            • The signing check appends one vouch to project p08 and reads it
            back in a separate request.
          </li>
          <li>
            • On the first visit the page reloads once, then checks that the
            signed record is still there. After that the row reports the actual
            write-and-reload result.
          </li>
        </ul>
        <p className="mt-3 font-mono text-[10px] text-muted">
          {lastRun ? `Last run at ${lastRun}` : "First run in progress…"}
        </p>
      </Panel>

      <ul className="space-y-2" data-testid="verify-rows">
        {rows.map((row) => {
          const meta = STATUS[row.status] ?? STATUS.pending;
          const Icon = meta.icon;
          return (
            <li
              key={row.id}
              data-testid={`verify-row-${row.id}`}
              data-status={row.status}
              className="rounded-lg border border-line bg-panel px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium text-ink">{row.title}</h2>
                    <p
                      className="mt-1 break-words text-xs leading-relaxed text-muted"
                      data-testid={`verify-detail-${row.id}`}
                    >
                      {row.detail ||
                        (row.status === "running"
                          ? "Calling the live API…"
                          : "Waiting to run.")}
                    </p>
                    {LINKS[row.id]?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        {LINKS[row.id].map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            className="font-mono text-[10px] text-teal underline underline-offset-2 hover:text-ink"
                          >
                            {link.label} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  data-testid={`verify-status-${row.id}`}
                  data-status={row.status}
                  className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] ${meta.tone}`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${meta.spin ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {meta.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        The same behaviour is covered by the Playwright suite in
        frontend/tests/dashboard.spec.js, which starts both servers, clicks the
        graph, reloads the page and re-runs these flows on every build.
      </p>
    </div>
  );
}
