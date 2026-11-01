"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatPercent, plural } from "@/lib/format";
import { Button, PageHeader, Panel } from "@/components/ui";
import { OutcomeBadge } from "@/components/OutcomeBadge";
import { ReasonList } from "@/components/ReasonList";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

function SponsorForm({ newcomer, options, signed, onSigned }) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const projectId = options.some((option) => option.id === selectedProjectId)
    ? selectedProjectId
    : options[0]?.id ?? "";

  async function sponsor(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.postRecord({
        issuerProjectId: projectId,
        subjectContributorId: newcomer.contributor.id,
        type: "vouch",
        reasonCode: "newcomer_sponsor_vouch",
        evidence: [
          {
            kind: "note",
            ref: "simulated sponsor vouch from dashboard",
          },
        ],
      });
      onSigned?.(response);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={sponsor} className="mt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`sponsor-project-${newcomer.contributor.id}`}
            className="block text-[10px] uppercase tracking-wide text-muted"
          >
            Sponsor project
          </label>
          <select
            id={`sponsor-project-${newcomer.contributor.id}`}
            value={projectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id} · {option.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy || !projectId}>
          {busy ? "Signing…" : "Simulated sponsor vouch"}
        </Button>
      </div>
      {signed && (
        <p role="status" className="mt-2 break-words font-mono text-[10px] text-teal">
          Vouch signed · {signed.record.id} · signature valid ·{" "}
          {signed.verification?.active ? "active" : "inactive"}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error.message}
          {error.code ? ` (${error.code})` : ""}
        </p>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Simulated action: the backend signs with a simulated project key. Nothing
        is posted to a real repository.
      </p>
    </form>
  );
}

export function NewcomerView({ version, onSigned }) {
  const [signedByContributor, setSignedByContributor] = useState({});
  const { data, error, loading, refetch } = useApiResource(
    (signal) => api.getNewcomers(signal),
    `newcomers:${version}`,
    version === 0 ? snapshot.newcomers : null,
  );

  if (loading && !data) return <LoadingState label="Loading the newcomer lane" />;
  if (error && !data) return <ErrorState error={error} onRetry={refetch} />;

  const newcomers = data?.newcomers ?? [];
  const sponsorOptions = data?.sponsorOptions ?? [];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Newcomer lane"
        description="No signed records yet means normal review. Missing positive evidence is never treated as negative evidence, and newcomers are never auto-blocked."
      >
        <span className="rounded border border-teal/40 bg-teal/10 px-2 py-1 font-mono text-[10px] text-teal">
          {plural(newcomers.length, "neutral newcomer")}
        </span>
      </PageHeader>

      {newcomers.length === 0 ? (
        <EmptyState title="No neutral newcomers in this simulation">
          Contributors with signals or non-neutral outcomes are not shown here.
        </EmptyState>
      ) : (
        <Panel
          title="Neutral newcomers"
          description="Each row shows how p10 sees the person, what they have done so far, starter tasks, and a demo vouch action."
          contentClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {newcomers.map((newcomer) => (
              <li
                key={newcomer.contributor.id}
                className="min-w-0 px-4 py-5 sm:px-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {newcomer.contributor.handle}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {newcomer.contributor.id}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      account age {plural(newcomer.accountAgeDays, "day")} ·{" "}
                      {plural(newcomer.behavior.submissions, "submission")} ·{" "}
                      {plural(newcomer.behavior.projects, "project")} · merge rate{" "}
                      {formatPercent(newcomer.behavior.mergeRate)}
                    </p>
                  </div>
                  <OutcomeBadge outcome={newcomer.assessment.outcome} />
                </div>

                {newcomer.assessment.note && (
                  <p className="mt-2 border-l-2 border-teal/50 pl-3 text-xs text-ink">
                    {newcomer.assessment.note}
                  </p>
                )}

                <div className="mt-3">
                  <ReasonList reasons={newcomer.assessment.reasons} />
                </div>

                <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
                  <div className="min-w-0">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Suggested starter tasks
                    </h3>
                    <ul className="mt-1.5 space-y-1.5">
                      {newcomer.starterTasks.map((task) => (
                        <li key={`${task.projectId}-${task.title}`} className="text-xs">
                          <span className="text-ink">{task.title}</span>
                          <span className="block text-[10px] text-muted">
                            {task.note}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Vouch for this person
                    </h3>
                    <SponsorForm
                      newcomer={newcomer}
                      options={sponsorOptions}
                      signed={signedByContributor[newcomer.contributor.id]}
                      onSigned={(response) => {
                        setSignedByContributor((previous) => ({
                          ...previous,
                          [newcomer.contributor.id]: response,
                        }));
                        onSigned?.();
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
