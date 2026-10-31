"use client";

import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatPercent, signalLabel } from "@/lib/format";
import { PageHeader, Panel, Stat } from "@/components/ui";
import { OutcomeBadge } from "@/components/OutcomeBadge";
import { ReasonList } from "@/components/ReasonList";
import { ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

function Example({ example, tone }) {
  const behavior = example.behavior;
  return (
    <Panel
      title={example.label}
      description={`${example.contributor.handle} · ${example.contributor.id}`}
      actions={<OutcomeBadge outcome={example.assessment.outcome} />}
    >
      <div className={`rounded-md border-l-2 px-3 py-2 ${tone}`}>
        <p className="text-xs leading-relaxed text-ink/90">
          Judged only by submissions, timing, cross-project similarity, account
          age, network structure, and maintainer outcomes.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-0 divide-x divide-y divide-line rounded-md border border-line sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Submissions" value={behavior.submissions} />
        <Stat label="Projects" value={behavior.projects} />
        <Stat label="Merged" value={behavior.merged} />
        <Stat label="Merge rate" value={formatPercent(behavior.mergeRate)} />
      </div>

      <p className="mt-2 font-mono text-[10px] text-muted">
        account age {behavior.accountAgeDays} day(s) · signals{" "}
        {behavior.signalTypes.length === 0
          ? "none"
          : behavior.signalTypes.map(signalLabel).join(", ")}
      </p>

      <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        PR content sample
      </h3>
      <p className="mt-1 max-h-36 overflow-y-auto scroll-pane break-words rounded-md bg-charcoal/60 p-3 font-mono text-[11px] leading-relaxed text-muted">
        {example.pullRequest.contentSample}
      </p>

      <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Reasons for the outcome
      </h3>
      <div className="mt-2">
        <ReasonList reasons={example.assessment.reasons} />
      </div>
      {example.assessment.contributingRecords.length === 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Neutral because this project has no signed records about the account,
          not because the account lacks activity. It is{" "}
          {behavior.accountAgeDays} day(s) old with {behavior.merged} merged
          submission(s), and missing records are never treated as negative
          evidence.
        </p>
      )}
    </Panel>
  );
}

export function ExplainerView() {
  const { data, error, loading, refetch } = useApiResource(
    (signal) => api.getExplainer(signal),
    "explainer",
    snapshot.explainer,
  );

  return (
    <div className="min-h-screen w-full">
      <header className="border-b border-line bg-panel/60">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-2 rounded-md text-xs font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            simulated explainer · no AI-text detector
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <PageHeader
          title="Why AI-text detection alone is insufficient"
          description="Two simulated contributors, the same behavioral rules, and no text-origin classifier. The labels come from simulator ground truth; the engine only sees behavior and signed records."
        />

        {loading && !data ? (
          <LoadingState label="Loading the explainer examples" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data ? (
          <>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <Example example={data.aiAssisted} tone="border-teal/50" />
              <Example example={data.humanSpam} tone="border-amber/50" />
            </div>

            <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <Panel title="What breaks when text origin is the signal">
                <ul className="space-y-3">
                  {data.whyAiTextDetectionFails.map((reason) => (
                    <li
                      key={reason}
                      className="break-words border-l-2 border-teal/40 pl-3 text-sm leading-relaxed text-ink/90"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Honest limits">
                <p className="text-xs leading-relaxed text-muted">{data.caveat}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {data.note}
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  The human-written label is not visible to the detector. A
                  human-written spam submission is caught by volume, timing,
                  near-duplicate content, and a low merge rate. An AI-assisted
                  submission with real merges and distinct work is not flagged.
                </p>
              </Panel>
            </div>

            <p className="mt-5 font-mono text-[10px] text-muted">
              Same rules: {data.aiAssisted.behavior.submissions} vs{" "}
              {data.humanSpam.behavior.submissions} submissions · outcomes{" "}
              {data.aiAssisted.assessment.outcome} vs{" "}
              {data.humanSpam.assessment.outcome}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
