"use client";

import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatDate, humanize, plural, signalLabel } from "@/lib/format";
import { PageHeader, Panel, Stat } from "@/components/ui";
import { OutcomeBadge } from "@/components/OutcomeBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

const TIMELINE_LIMIT = 120;

function EvidenceList({ evidence, limit = 6 }) {
  if (!evidence?.length) {
    return <p className="text-[11px] text-muted">No evidence references.</p>;
  }
  const shown = evidence.slice(0, limit);
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1">
      {shown.map((reference, index) => (
        <li
          key={`${reference.kind}-${reference.id}-${index}`}
          className="max-w-full break-all rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted"
        >
          {reference.kind}:{reference.id}
          {reference.projectId ? ` · ${reference.projectId}` : ""}
        </li>
      ))}
      {evidence.length > limit && (
        <li className="px-1.5 py-0.5 font-mono text-[10px] text-muted">
          +{evidence.length - limit} more
        </li>
      )}
    </ul>
  );
}

export function CampaignView({ version }) {
  const { data, error, loading, refetch } = useApiResource(
    (signal) => api.getCampaigns(signal),
    `campaigns:${version}`,
    version === 0 ? snapshot.campaigns : null,
  );

  if (loading && !data) return <LoadingState label="Detecting coordinated behavior" />;
  if (error && !data) return <ErrorState error={error} onRetry={refetch} />;

  const campaigns = data?.campaigns ?? [];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Campaigns"
        description="A campaign is reported only when at least two different warning signs connect at least two accounts. The signs are worked out across projects; no central authority declares them."
      />

      {campaigns.length === 0 ? (
        <EmptyState title="No campaign met the two-signal bar in this simulation">
          Rerun the simulator with another seed to see the injected coordinated
          campaign.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {campaigns.map((campaign) => {
            const timeline = campaign.timeline ?? [];
            const shownTimeline = timeline.slice(0, TIMELINE_LIMIT);
            return (
              <Panel
                key={campaign.id}
                title={`Coordinated campaign · ${campaign.id}`}
                description={`Window ${formatDate(campaign.window.start)} → ${formatDate(
                  campaign.window.end,
                )}`}
                actions={
                  <>
                    <OutcomeBadge outcome="coordinated_campaign" />
                    <span className="rounded border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber">
                      confidence {campaign.confidence.label}
                    </span>
                  </>
                }
              >
                <div className="grid grid-cols-2 divide-x divide-line rounded-md border border-line sm:grid-cols-4">
                  <Stat label="Members" value={campaign.members.length} />
                  <Stat
                    label="Affected projects"
                    value={campaign.affectedProjects.length}
                  />
                  <Stat label="Signal types" value={campaign.signalsFired.length} />
                  <Stat label="PR events" value={timeline.length} />
                </div>

                {campaign.provenance && (
                  <section
                    className="mt-4 min-w-0 rounded-md border border-line bg-raised/40 px-3 py-3"
                    data-testid="campaign-provenance"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Evidence and provenance
                      </h3>
                      <span className="font-mono text-[10px] text-muted">
                        {campaign.provenance.detector}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-3 text-xs leading-relaxed text-muted sm:grid-cols-2 lg:grid-cols-4">
                      <div className="min-w-0">
                        <p className="text-ink">Inputs</p>
                        <p className="break-words">
                          {campaign.provenance.inputs.projects} projects ·{" "}
                          {campaign.provenance.inputs.contributors} contributors ·{" "}
                          {campaign.provenance.inputs.pullRequests} PRs ·{" "}
                          {campaign.provenance.inputs.activeRecords} active records
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-ink">Evidence</p>
                        <p className="break-words" data-testid="campaign-evidence-total">
                          {campaign.provenance.evidence.total} refs (
                          {Object.entries(campaign.provenance.evidence.byKind)
                            .map(([kind, count]) => `${count} ${kind}`)
                            .join(", ")}
                          )
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-ink">Signals</p>
                        <p className="break-words">
                          {campaign.provenance.signalTypes.count} independent types ·{" "}
                          {campaign.provenance.membersWithSignals} of{" "}
                          {campaign.members.length} members carry a signal
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-ink">Reproducible</p>
                        <p className="break-words">
                          seed {data?.simulation?.seed ?? "?"} · generated{" "}
                          {formatDate(campaign.provenance.generatedAt)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 break-words text-[11px] leading-relaxed text-muted">
                      {campaign.provenance.method} Thresholds: duplicate ≥{" "}
                      {campaign.provenance.thresholds.similarityThreshold} across ≥{" "}
                      {campaign.provenance.thresholds.minDuplicateProjects} projects;
                      burst ≥ {campaign.provenance.thresholds.burstMinPrs} PRs across ≥{" "}
                      {campaign.provenance.thresholds.burstMinProjects} projects in{" "}
                      {campaign.provenance.thresholds.burstWindowHours}h; new accounts ≤{" "}
                      {campaign.provenance.thresholds.syncNewAccountDays} days old and in
                      sync within {campaign.provenance.thresholds.syncWindowHours}h; low
                      merge below{" "}
                      {Math.round(campaign.provenance.thresholds.lowMergeRate * 100)}%.
                    </p>
                  </section>
                )}

                <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-2">
                  <section className="min-w-0">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Signals found
                    </h3>
                    <ul className="mt-2 space-y-3">
                      {campaign.signalsFired.map((signal) => (
                        <li
                          key={signal.type}
                          className="border-l-2 border-amber/50 pl-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-ink">
                              {signalLabel(signal.type)}
                            </span>
                            <span className="font-mono text-[10px] text-muted">
                              {signal.memberCount
                                ? `${plural(signal.memberCount, "member")} · `
                                : ""}
                              strength {Number(signal.weight).toFixed(2)}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-xs leading-relaxed text-muted">
                            {signal.description}
                          </p>
                          <EvidenceList evidence={signal.evidence} />
                        </li>
                      ))}
                    </ul>

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Why this confidence level
                    </h3>
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
                      {campaign.confidence.reasons.map((reason) => (
                        <li key={reason} className="break-words">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="min-w-0">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Members ({campaign.members.length})
                    </h3>
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto scroll-pane pr-1">
                      {campaign.members.map((member) => (
                        <li key={member.id} className="py-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-xs text-ink">{member.handle}</span>
                            <span className="font-mono text-[10px] text-muted">
                              {member.id}
                              {typeof member.pullRequests === "number"
                                ? ` · ${member.pullRequests} PRs`
                                : ""}
                            </span>
                          </div>
                          {member.signalTypes?.length > 0 && (
                            <p
                              className="mt-0.5 break-words font-mono text-[10px] text-muted"
                              data-testid="campaign-member-signals"
                            >
                              {member.signalTypes.map(signalLabel).join(" · ")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Affected projects ({campaign.affectedProjects.length})
                    </h3>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto scroll-pane pr-1">
                      {campaign.affectedProjects.map((project) => (
                        <li
                          key={project.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 py-1"
                        >
                          <span className="text-xs text-ink">{project.name}</span>
                          <span className="font-mono text-[10px] text-muted">
                            {project.id}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <section className="mt-6 min-w-0 border-t border-line pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      PR burst timeline
                    </h3>
                    <span className="font-mono text-[10px] text-muted">
                      showing {shownTimeline.length} of {timeline.length} events
                    </span>
                  </div>
                  <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto scroll-pane">
                    {shownTimeline.map((event, index) => (
                      <li
                        key={`${event.prId}-${index}`}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-1.5"
                      >
                        <span className="min-w-0 break-words text-xs text-ink">
                          <span className="font-mono text-[10px] text-muted">
                            {formatDate(event.createdAt)}
                          </span>{" "}
                          {event.contributorHandle}{" "}
                          <span className="text-muted">→</span>{" "}
                          {event.projectName}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {event.prId} · {humanize(event.outcome)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {timeline.length > TIMELINE_LIMIT && (
                    <p className="mt-2 text-[11px] text-muted">
                      The remaining events are omitted for performance; no values
                      are summarized or invented.
                    </p>
                  )}
                </section>
              </Panel>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Honest newcomers who submit distinct work across several projects, with
        normal timing and real merges, do not accumulate these signals. Metrics
        compare predictions with simulator ground truth.
      </p>
    </div>
  );
}
