"use client";

import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button, PageHeader, Panel, Stat } from "@/components/ui";
import { OutcomeBadge } from "@/components/OutcomeBadge";
import { ReasonList } from "@/components/ReasonList";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

export function ProjectView({
  asProject,
  version,
  onSelectProject,
  onOpenContributor,
}) {
  const projects = useApiResource(
    (signal) => api.getProjects(signal),
    `project-list:${version}`,
    version === 0 ? snapshot.projects : null,
  );
  const view = useApiResource(
    (signal) => api.getProjectView(asProject, signal),
    `project-view:${asProject}:${version}`,
    version === 0 && asProject === "p10" ? snapshot.projectView : null,
  );

  if (view.loading && !view.data) {
    return <LoadingState label={`Assessing as ${asProject}`} />;
  }
  if (view.error && !view.data) {
    return <ErrorState error={view.error} onRetry={view.refetch} />;
  }
  if (!view.data) {
    return <EmptyState title="No project data" />;
  }

  const { project, incoming, summary, effectiveTrust } = view.data;

  return (
    <div className="min-w-0">
      <PageHeader
        title={`Assessing as ${project.name}`}
        description="This view answers one question only: what does this project conclude from the signed records it chooses to read? Another project may reach a different outcome for the same contributor."
      >
        <label
          htmlFor="project-selector"
          className="text-[11px] uppercase tracking-wide text-muted"
        >
          Evaluate as
        </label>
        <select
          id="project-selector"
          value={asProject}
          onChange={(event) => onSelectProject(event.target.value)}
          className="min-h-9 max-w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
        >
          {(projects.data?.projects ?? [project]).map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {item.name}
            </option>
          ))}
        </select>
      </PageHeader>

      <div className="mb-4 rounded-lg border border-line bg-panel px-4 py-3">
        <p className="text-xs leading-relaxed text-muted">
          Reads records from{" "}
          <span className="font-mono text-ink">{effectiveTrust.length}</span>{" "}
          project(s) with nonzero effective trust. Unknown contributors are
          neutral; no history is never treated as negative evidence.
        </p>
      </div>

      <Panel contentClassName="p-0">
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
          <Stat label="Contributors" value={summary.contributors} />
          <Stat label="Pull requests" value={summary.pullRequests} />
          <Stat
            label="Normal review"
            value={summary.byOutcome.normal_review}
          />
          <Stat
            label="Caution / flagged"
            value={`${summary.byOutcome.caution} / ${summary.byOutcome.flagged}`}
          />
        </div>

        {incoming.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No incoming pull requests for this project">
              There is nothing to assess in this simulation. Unknown stays
              neutral.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {incoming.map((item) => {
              const assessment = item.assessment;
              const validRecords = assessment.contributingRecords.filter(
                (record) => record.verification?.integrity === "valid",
              ).length;
              const latestPr = item.pullRequests[0];
              return (
                <li key={item.contributor.id} className="min-w-0 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">
                          {item.contributor.handle}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {item.contributor.id}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">
                        {item.pullRequests.length} PR(s) to this project · latest{" "}
                        {formatDate(latestPr?.createdAt)} ·{" "}
                        {validRecords} contributing record(s)
                      </p>
                    </div>
                    <OutcomeBadge outcome={assessment.outcome} />
                  </div>

                  <div className="mt-3">
                    <ReasonList reasons={assessment.reasons} />
                  </div>

                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onOpenContributor(asProject, item.contributor.id)
                      }
                      aria-label={`Explain ${item.contributor.handle}`}
                    >
                      Explain contributor
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
