"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatPercent, formatRate, humanize } from "@/lib/format";
import { Button, PageHeader, Panel, Stat } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

const SIZES = [20, 25, 30, 35, 40, 45, 50];
const CAMPAIGN_SIZES = [10, 11, 12, 13, 14, 15];

export function SimulatorView({ version, meta, onSimulated }) {
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
      });
      setSuccess(response);
      setMulti(null);
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

  return (
    <div className="min-w-0">
      <PageHeader
        title="Simulator"
        description="Rebuild the deterministic in-memory simulation from a seed, then measure the detector against simulator ground truth. Nothing is fetched from or written to a real repository."
      >
        {meta && (
          <span className="rounded border border-line bg-panel px-2 py-1 font-mono text-[10px] text-muted">
            current: seed {meta.seed} · {meta.size} projects · campaign{" "}
            {meta.campaignSize}
          </span>
        )}
      </PageHeader>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel
          title="Run configuration"
          description="Rerunning discards in-memory records and rebuilds every log, PR, and signal from the seed."
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
                  {success.simulation.counts.projects} projects and{" "}
                  {success.campaignsDetected} campaign(s) detected.
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
            description="Measured against simulator ground truth. A real deployment would not have these labels."
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
                  />
                  <Stat
                    label="Campaign recall"
                    value={formatRate(current.campaign.recall)}
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
                  Predicted {current.campaign.predictedMembers} campaign member(s)
                  across {current.campaign.predictedCampaigns} campaign(s); truth is{" "}
                  {current.campaign.truthMembers} member(s). Newcomer checks run
                  across {current.newcomerFalseFlag.projectsEvaluated} projects.
                </p>

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

          {multi?.multiSeed && (
            <Panel
              title="Across seeds"
              description={multi.multiSeed.note}
              contentClassName="p-0"
            >
              <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line sm:grid-cols-4 sm:divide-y-0">
                <Stat
                  label="Precision mean"
                  value={formatRate(multi.multiSeed.aggregate.campaignPrecisionMean)}
                />
                <Stat
                  label="Recall mean"
                  value={formatRate(multi.multiSeed.aggregate.campaignRecallMean)}
                />
                <Stat
                  label="Max newcomer false flags"
                  value={formatRate(
                    multi.multiSeed.aggregate.newcomerFalseFlagRateMax,
                  )}
                />
                <Stat
                  label="Min explanation"
                  value={formatRate(
                    multi.multiSeed.aggregate.explanationCompletenessMin,
                  )}
                />
              </div>

              <ul className="divide-y divide-line">
                {multi.multiSeed.seeds.map((seed) => (
                  <li
                    key={seed.seed}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="font-mono text-[11px] text-ink">
                      seed {seed.seed}
                    </span>
                    <span className="break-words font-mono text-[10px] text-muted">
                      precision {formatRate(seed.campaignPrecision)} · recall{" "}
                      {formatRate(seed.campaignRecall)} · newcomer false flags{" "}
                      {formatPercent(seed.newcomerFalseFlagRate)} · hard cases{" "}
                      {seed.hardCasesPassed}/{seed.hardCasesTotal}
                    </span>
                  </li>
                ))}
              </ul>

              <ul className="space-y-1 border-t border-line px-4 py-3">
                {Object.entries(multi.multiSeed.variance).map(([name, stats]) => (
                  <li
                    key={name}
                    className="flex flex-wrap items-center justify-between gap-2 text-[10px]"
                  >
                    <span className="text-muted">{humanize(name)}</span>
                    <span className="font-mono text-muted">
                      mean {formatRate(stats.mean)} · range{" "}
                      {formatRate(stats.range)} · min {formatRate(stats.min)} ·
                      max {formatRate(stats.max)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
