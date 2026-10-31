"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatDate, humanize, signalLabel } from "@/lib/format";
import { Button, PageHeader, Panel, Stat } from "@/components/ui";
import { OutcomeBadge } from "@/components/OutcomeBadge";
import { ReasonList } from "@/components/ReasonList";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

function verificationLabel(verification) {
  if (!verification) return { text: "unverified", tone: "text-amber" };
  if (verification.integrity !== "valid") {
    return { text: "rejected", tone: "text-danger" };
  }
  if (verification.revoked) return { text: "revoked", tone: "text-amber" };
  if (verification.expired) return { text: "expired", tone: "text-amber" };
  if (!verification.signatureValid) {
    return { text: "bad signature", tone: "text-danger" };
  }
  return { text: "signature valid · active", tone: "text-teal" };
}

export function ContributorView({
  contributorId,
  asProject,
  version,
  onOpenContributor,
  onSelectProject,
}) {
  const projects = useApiResource(
    (signal) => api.getProjects(signal),
    `contributor-projects:${version}`,
    version === 0 ? snapshot.projects : null,
  );
  const result = useApiResource(
    (signal) => api.getAssessment(contributorId, asProject, signal),
    `assessment:${contributorId}:${asProject}:${version}`,
    version === 0 && contributorId === "c_disputed" && asProject === "p10"
      ? snapshot.assessment
      : null,
  );

  const [draft, setDraft] = useState({
    for: contributorId,
    value: contributorId,
  });
  const [formError, setFormError] = useState("");
  const input = draft.for === contributorId ? draft.value : contributorId;

  if (result.loading && !result.data) {
    return <LoadingState label={`Assessing ${contributorId} as ${asProject}`} />;
  }
  if (result.error && !result.data) {
    return <ErrorState error={result.error} onRetry={result.refetch} />;
  }
  if (!result.data) return <EmptyState title="No assessment returned" />;

  const { assessment, contributor, evaluatingProject, recentPullRequests } =
    result.data;
  const note = assessment.note;

  return (
    <div className="min-w-0">
      <PageHeader
        title={contributor.handle}
        description={`This is how ${evaluatingProject.name} (${evaluatingProject.id}) sees this person. Another project can judge them differently.`}
      >
        <OutcomeBadge outcome={assessment.outcome} />
      </PageHeader>

      <div className="mb-4 rounded-lg border border-line bg-panel p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = input.trim();
            if (!next) {
              setFormError("Enter a contributor id from this simulation.");
              return;
            }
            setFormError("");
            onOpenContributor(asProject, next);
          }}
        >
          <div className="min-w-0">
            <label
              htmlFor="assessment-project"
              className="block text-[11px] uppercase tracking-wide text-muted"
            >
              Evaluate as project
            </label>
            <select
              id="assessment-project"
              value={asProject}
              onChange={(event) => {
                onSelectProject(event.target.value);
                onOpenContributor(event.target.value, contributorId);
              }}
              className="mt-1 min-h-9 max-w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            >
              {(projects.data?.projects ?? [evaluatingProject]).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} · {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label
              htmlFor="contributor-id"
              className="block text-[11px] uppercase tracking-wide text-muted"
            >
              Contributor id
            </label>
            <input
              id="contributor-id"
              value={input}
              onChange={(event) =>
                setDraft({ for: contributorId, value: event.target.value })
              }
              spellCheck="false"
              autoComplete="off"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
              placeholder="e.g. c_new_good"
            />
          </div>
          <Button type="submit">Assess</Button>
        </form>
        {formError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {formError}
          </p>
        )}
        <p className="mt-3 font-mono text-[10px] text-muted">
          {contributor.id} · account created {formatDate(contributor.accountCreatedAt)} ·{" "}
          {recentPullRequests.length} recent pull request(s)
        </p>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel
            title="Outcome summary"
            description="The result for this person, with the evidence totals this project used. A score is not a spam probability."
          >
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge outcome={assessment.outcome} />
              <span className="font-mono text-[10px] text-muted">
                evaluated {formatDate(assessment.evaluatedAt)}
              </span>
            </div>
            {note && (
              <p className="mt-3 border-l-2 border-teal/50 pl-3 text-sm leading-relaxed text-ink">
                {note}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-0 divide-x divide-y divide-line rounded-md border border-line sm:grid-cols-4 sm:divide-y-0">
              <Stat
                label="Denounce sources"
                value={assessment.summary.evidenceBackedDenounceSources}
                hint="independent"
              />
              <Stat
                label="Denounce weight"
                value={assessment.summary.denounceScore.toFixed(3)}
              />
              <Stat
                label="Vouch support"
                value={assessment.summary.vouchSupport.toFixed(3)}
                hint="capped"
              />
              <Stat
                label="Signal types"
                value={assessment.summary.signalTypes.length}
                hint={assessment.summary.signalTypes.length ? undefined : "none"}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Thresholds: caution at {assessment.summary.thresholds.caution},
              flagged at {assessment.summary.thresholds.flagged}, at least{" "}
              {assessment.summary.thresholds.minIndependentSources} independent
              denouncement sources. {assessment.summary.ignoredRecords} record(s)
              were ignored.
            </p>
          </Panel>

          <Panel
            title="Ordered reasons"
            description="Every counted or ignored record is explained. References point to signed records, PRs, or signals."
          >
            <ReasonList reasons={assessment.reasons} />
          </Panel>

          <Panel
            title="Signed records used"
            description="Each note is checked again: who signed it, whether it was changed, and whether it is still active."
          >
            {assessment.contributingRecords.length === 0 ? (
              <EmptyState title="No signed records from this project's trusted network">
                A contributor can still be flagged by behavioral signals, or they
                may be a neutral newcomer.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {assessment.contributingRecords.map((record) => {
                  const status = verificationLabel(record.verification);
                  return (
                    <li key={record.id} className="min-w-0 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink">
                            {record.type}
                          </span>
                          <span className="font-mono text-[11px] text-ink">
                            {record.id}
                          </span>
                          <span className="font-mono text-[10px] text-muted">
                            issuer {record.issuerProjectId}
                          </span>
                        </div>
                        <span className={`font-mono text-[10px] ${status.tone}`}>
                          {status.text}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted">
                        {record.reasonCode} · subject {record.subjectContributorId}{" "}
                        · {formatDate(record.createdAt)}
                        {record.expiresAt ? ` · expires ${formatDate(record.expiresAt)}` : ""}
                      </p>
                      {record.verification?.issues?.length > 0 && (
                        <p className="mt-1 break-words font-mono text-[10px] text-danger">
                          {record.verification.issues.join(", ")}
                        </p>
                      )}
                      <p className="mt-1 break-all font-mono text-[10px] text-muted/80">
                        signature {record.signature.slice(0, 24)}…
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="What would change this">
            <p className="text-sm leading-relaxed text-ink/90">
              {assessment.whatWouldChangeThis}
            </p>
          </Panel>

          <Panel
            title="Behavioral signals"
            description="Patterns in what the person did, not in how they wrote it."
          >
            {assessment.signals.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted">
                No behavioral signals apply to this contributor. Absence of
                signals is neutral, not positive evidence.
              </p>
            ) : (
              <ul className="space-y-3">
                {assessment.signals.map((signal) => (
                  <li key={signal.type} className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-ink">
                        {signalLabel(signal.type)}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        strength {Number(signal.weight ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-xs leading-relaxed text-muted">
                      {signal.description}
                    </p>
                    {(signal.evidence ?? []).length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {signal.evidence.slice(0, 8).map((reference, index) => (
                          <li
                            key={`${reference.kind}-${reference.id}-${index}`}
                            className="break-all rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted"
                          >
                            {reference.kind}:{reference.id}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={`Recent pull requests (${recentPullRequests.length})`}
            contentClassName="p-0"
          >
            {recentPullRequests.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No pull requests in this simulation" />
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto scroll-pane">
                {recentPullRequests.map((pr) => (
                  <li key={pr.id} className="min-w-0 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-ink">
                        {pr.id} · {pr.projectId}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {humanize(pr.outcome)}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-[11px] text-muted">
                      {formatDate(pr.createdAt)} · size {pr.size} ·{" "}
                      {pr.changedPathsSummary}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
