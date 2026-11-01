"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { worldSearch } from "@/lib/session";
import { formatPercent, formatRate, humanize, plural } from "@/lib/format";
import { Button, PageHeader, Panel, Stat } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

const SIZES = [20, 25, 30, 35, 40, 45, 50];
const CAMPAIGN_SIZES = [10, 11, 12, 13, 14, 15];
const SCENARIOS = [
  { value: "obvious", label: "Obvious campaign" },
  { value: "stealth", label: "Stealth campaign" },
];

const scenarioLabel = (scenario) =>
  SCENARIOS.find((item) => item.value === scenario)?.label ??
  humanize(scenario ?? "obvious");

export function SimulatorView({ version, meta, onSimulated }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [multi, setMulti] = useState(null);
  const [multiBusy, setMultiBusy] = useState(false);
  const [multiError, setMultiError] = useState(null);

  const form = {
    seed: meta?.seed ?? 42,
    size: meta?.size ?? 30,
    campaignSize: meta?.campaignSize ?? 12,
    scenario: meta?.scenario ?? "obvious",
    ...overrides,
  };

  const metrics = useApiResource(
    (signal) => api.getMetrics(signal),
    `metrics:${version}`,
    version === 0 ? snapshot.metrics : null,
  );

  async function rerun(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.simulate({
        seed: Number(form.seed),
        size: Number(form.size),
        campaignSize: Number(form.campaignSize),
        scenario: form.scenario,
      });
      setSuccess(response);
      setMulti(null);
      router.replace(
        `/simulator?${worldSearch(response.simulation)}`,
        { scroll: false },
      );
      onSimulated?.(response.simulation);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function runMulti() {
    setMultiBusy(true);
    setMultiError(null);
    try {
      setMulti(await api.getMultiMetrics());
    } catch (requestError) {
      setMultiError(requestError);
    } finally {
      setMultiBusy(false);
    }
  }

  const current = metrics.data?.metrics;
  const scenarioBlocks = multi?.scenarios
    ? Object.entries(multi.scenarios)
    : multi?.multiSeed
      ? [[multi.multiSeed.scenario ?? "obvious", multi.multiSeed]]
      : [];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Simulator"
        description="Rebuild a repeatable demo world from a number (the seed), then compare the app's guesses with the simulator's known answers. Nothing is fetched from or written to a real repository."
      >
        {meta && (
          <span className="rounded border border-line bg-panel px-2 py-1 font-mono text-[10px] text-muted">
            current: seed {meta.seed} · {meta.size} projects · campaign{" "}
            {meta.campaignSize} · {meta.scenario ?? "obvious"}
          </span>
        )}
      </PageHeader>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel
          title="Run configuration"
          description="Rebuilding starts a fresh demo world from the seed and discards the current records."
        >
          <form onSubmit={rerun} className="space-y-4">
            <div>
              <label
                htmlFor="seed-input"
                className="block text-[10px] uppercase tracking-wide text-muted"
              >
                Seed
              </label>
              <input
                id="seed-input"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                value={form.seed}
                onChange={(event) =>
                  setOverrides((previous) => ({
                    ...previous,
                    seed: event.target.value,
                  }))
                }
                className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-sm text-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="size-input"
                  className="block text-[10px] uppercase tracking-wide text-muted"
                >
                  Projects
                </label>
                <select
                  id="size-input"
                  value={form.size}
                  onChange={(event) =>
                    setOverrides((previous) => ({
                      ...previous,
                      size: Number(event.target.value),
                    }))
                  }
                  className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-sm text-ink"
                >
                  {SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="campaign-size-input"
                  className="block text-[10px] uppercase tracking-wide text-muted"
                >
                  Campaign accounts
                </label>
                <select
                  id="campaign-size-input"
                  value={form.campaignSize}
                  onChange={(event) =>
                    setOverrides((previous) => ({
                      ...previous,
                      campaignSize: Number(event.target.value),
                    }))
                  }
                  className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-sm text-ink"
                >
                  {CAMPAIGN_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="scenario-input"
                className="block text-[10px] uppercase tracking-wide text-muted"
              >
                Campaign scenario
              </label>
              <select
                id="scenario-input"
                value={form.scenario}
                onChange={(event) =>
                  setOverrides((previous) => ({
                    ...previous,
                    scenario: event.target.value,
                  }))
                }
                className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-sm text-ink"
              >
                {SCENARIOS.map((scenario) => (
                  <option key={scenario.value} value={scenario.value}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                Stealth spreads the same ring over days, rewords content near the
                similarity threshold, merges a few PRs and keeps some accounts
                quiet. Thresholds do not change.
              </p>
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? "Rebuilding simulation…" : "Rebuild simulation"}
            </Button>

            {success && (
              <div
                role="status"
                className="rounded-md border border-teal/40 bg-teal/5 px-3 py-2"
              >
                <p className="text-xs text-teal">
                  Rebuilt seed {success.simulation.seed} with{" "}
                  {plural(success.simulation.counts.projects, "project")} and{" "}
                  {plural(success.campaignsDetected, "campaign")} detected in the{" "}
                  {scenarioLabel(success.simulation.scenario)}.
                </p>
                <p className="mt-1 text-[10px] text-muted">
                  {success.note}
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs text-danger">
                {error.message}
                {error.code ? ` (${error.code})` : ""}
              </p>
            )}
          </form>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Multi-seed evaluation
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Rebuilds five independent simulations and reports mean, range, and
              variance for the provided seeds.
            </p>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={runMulti}
              disabled={multiBusy}
            >
              {multiBusy ? "Measuring…" : "Measure across seeds"}
            </Button>
            {multiError && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {multiError.message}
              </p>
            )}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel
            title="Metrics for this seed"
            description="These numbers compare the app's guesses with the simulator's known answers. A real deployment would not have answer labels."
          >
            {metrics.loading && !metrics.data ? (
              <LoadingState label="Computing metrics" />
            ) : metrics.error && !current ? (
              <ErrorState error={metrics.error} onRetry={metrics.refetch} />
            ) : current ? (
              <>
                <div className="grid grid-cols-2 divide-x divide-y divide-line rounded-md border border-line sm:grid-cols-4 sm:divide-y-0">
                  <Stat
                    label="Campaign precision"
                    value={formatRate(current.campaign.precision)}
                    hint={`${current.campaign.matchedMembers}/${current.campaign.predictedMembers} predicted`}
                  />
                  <Stat
                    label="Campaign recall"
                    value={formatRate(current.campaign.recall)}
                    hint={`${current.campaign.matchedMembers}/${current.campaign.truthMembers} incl. ${plural(current.campaign.sleeperMembers, "sleeper")}`}
                  />
                  <Stat
                    label="Newcomer false flags"
                    value={formatRate(current.newcomerFalseFlag.rate)}
                    hint={`${current.newcomerFalseFlag.flagged} of ${current.newcomerFalseFlag.total}`}
                  />
                  <Stat
                    label="Explanation completeness"
                    value={formatRate(current.explanationCompleteness.rate)}
                    hint={`${current.explanationCompleteness.complete}/${current.explanationCompleteness.nonNeutral}`}
                  />
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  Predicted {plural(current.campaign.predictedMembers, "campaign member")}{" "}
                  across {plural(current.campaign.predictedCampaigns, "campaign")}; truth is{" "}
                  {plural(current.campaign.truthMembers, "member")}, including{" "}
                  {plural(current.campaign.sleeperMembers, "sleeper account")} that never
                  posted or signed and{" "}
                  {plural(current.campaign.quietMembers?.length ?? 0, "quiet account")}{" "}
                  with activity but no signal. Behavior-only detection cannot observe
                  sleepers, so recall is measured against the full ring while
                  observable-member recall is{" "}
                  {formatRate(current.campaign.observableRecall)}. Newcomer checks
                  run across {plural(current.newcomerFalseFlag.projectsEvaluated, "project")}.
                </p>

                {current.campaign.missedMembers?.length > 0 && (
                  <div className="mt-4 rounded-md border border-amber/40 bg-amber/5 px-3 py-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber">
                      Missed ground-truth accounts (
                      {current.campaign.missedMembers.length})
                    </h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">
                      These accounts belong to the ring in the simulator&apos;s
                      ground truth but were not grouped. Real deployments do not
                      have this answer label.
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {current.campaign.missedMembers.map((missed) => (
                        <li
                          key={missed.contributorId}
                          className="break-words text-[10px] leading-relaxed text-muted"
                        >
                          <span className="font-mono text-ink">
                            {missed.handle}
                          </span>{" "}
                          <span className="font-mono">
                            ({missed.contributorId}, {missed.category})
                          </span>{" "}
                          — {missed.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Hard cases ({current.hardCasesPassed}/{current.hardCasesTotal})
                </h3>
                <ul className="mt-2 space-y-2">
                  {current.hardCases.map((hardCase) => (
                    <li
                      key={hardCase.id}
                      className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-line pb-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-ink">{hardCase.label}</p>
                        <p className="mt-0.5 break-words text-[10px] text-muted">
                          expected {hardCase.expected} · actual {hardCase.actual}
                        </p>
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          hardCase.passed
                            ? "border-teal/40 bg-teal/10 text-teal"
                            : "border-danger/45 bg-danger/10 text-danger"
                        }`}
                      >
                        {hardCase.passed ? "pass" : "fail"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Panel>

          {scenarioBlocks.length > 0 && (
            <Panel
              title="Across seeds"
              description="Both scenarios use the same detector thresholds and the same five provided seeds. Missed accounts are listed per seed; precision and recall are measured against simulator ground truth, which real deployments do not have."
              contentClassName="p-0"
            >
              <div className="divide-y divide-line">
                {scenarioBlocks.map(([scenario, block]) => (
                  <section key={scenario} className="min-w-0 px-4 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-xs font-medium text-ink">
                        {scenarioLabel(scenario)}
                      </h3>
                      <span className="font-mono text-[10px] text-muted">
                        {plural(block.seeds.length, "seed")} ·{" "}
                        {plural(
                          block.aggregate.missedMembersTotal ?? 0,
                          "missed account",
                        )}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 divide-x divide-y divide-line rounded-md border border-line sm:grid-cols-4 sm:divide-y-0">
                      <Stat
                        label="Precision mean"
                        value={formatRate(
                          block.aggregate.campaignPrecisionMean,
                        )}
                      />
                      <Stat
                        label="Recall mean"
                        value={formatRate(block.aggregate.campaignRecallMean)}
                        hint={`observable ${formatRate(
                          block.aggregate.observableRecallMean,
                        )}`}
                      />
                      <Stat
                        label="Max newcomer false flags"
                        value={formatRate(
                          block.aggregate.newcomerFalseFlagRateMax,
                        )}
                      />
                      <Stat
                        label="Min explanation"
                        value={formatRate(
                          block.aggregate.explanationCompletenessMin,
                        )}
                      />
                    </div>

                    <ul className="mt-2 divide-y divide-line">
                      {block.seeds.map((seed) => (
                        <li key={seed.seed} className="min-w-0 py-2">
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-ink">
                              seed {seed.seed}
                            </span>
                            <span className="break-words font-mono text-[10px] text-muted">
                              precision{" "}
                              {formatRate(seed.campaignPrecision)} · recall{" "}
                              {formatRate(seed.campaignRecall)} (observable{" "}
                              {formatRate(seed.observableRecall)}) · newcomer
                              false flags{" "}
                              {formatPercent(seed.newcomerFalseFlagRate)} · hard
                              cases {seed.hardCasesPassed}/{seed.hardCasesTotal}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-[10px] leading-relaxed text-muted">
                            {seed.missedMembers?.length
                              ? `Missed: ${seed.missedMembers
                                  .map(
                                    (missed) =>
                                      `${missed.handle} (${missed.category})`,
                                  )
                                  .join(", ")}`
                              : "No missed ground-truth members."}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <ul className="mt-2 space-y-1 border-t border-line pt-3">
                      {Object.entries(block.variance).map(([name, stats]) => (
                        <li
                          key={name}
                          className="flex flex-wrap items-center justify-between gap-2 text-[10px]"
                        >
                          <span className="text-muted">{humanize(name)}</span>
                          <span className="font-mono text-muted">
                            mean {formatRate(stats.mean)} · range{" "}
                            {formatRate(stats.range)} · min{" "}
                            {formatRate(stats.min)} · max{" "}
                            {formatRate(stats.max)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
