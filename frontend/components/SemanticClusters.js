"use client";

import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { formatDate, plural } from "@/lib/format";
import { Panel, Stat } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";

function SimilarityBar({ label, value, tone }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-[10px] text-ink">
        {value.toFixed(3)}
      </span>
    </div>
  );
}

function ClusterCard({ cluster }) {
  const shownProjects = cluster.projects.slice(0, 6);
  const remainingProjects = cluster.projects.length - shownProjects.length;
  return (
    <article
      data-testid="semantic-cluster"
      className="min-w-0 rounded-md border border-line bg-raised/30 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium text-ink">
            {plural(cluster.members, "PR")} across{" "}
            {plural(cluster.projectCount, "project")}
          </h3>
          <p className="mt-0.5 break-words font-mono text-[10px] text-muted">
            {cluster.id} · {plural(cluster.contributorCount, "contributor")} ·{" "}
            {plural(cluster.pairCount, "linked pair")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {cluster.campaignIds.length > 0 ? (
            cluster.campaignIds.map((campaignId) => (
              <span
                key={campaignId}
                className="rounded border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[10px] text-amber"
              >
                overlaps {campaignId}
              </span>
            ))
          ) : (
            <span className="rounded border border-line bg-panel px-2 py-0.5 text-[10px] text-muted">
              no campaign overlap
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <SimilarityBar
          label="semantic"
          value={cluster.meanSimilarity}
          tone="bg-teal"
        />
        <SimilarityBar
          label="exact words"
          value={cluster.meanLexicalSimilarity}
          tone="bg-muted/60"
        />
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted">
        Mean cosine {cluster.meanSimilarity.toFixed(3)} (range{" "}
        {cluster.minSimilarity.toFixed(3)}–{cluster.maxSimilarity.toFixed(3)}). Mean
        four-word overlap for the same pairs is{" "}
        {cluster.meanLexicalSimilarity.toFixed(3)}.
        {cluster.semanticOnlyPairs > 0
          ? ` ${plural(cluster.semanticOnlyPairs, "pair")} matched by meaning without exact wording.`
          : ""}
        {cluster.exactDuplicatePairs > 0
          ? ` ${plural(cluster.exactDuplicatePairs, "pair")} are byte-identical.`
          : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        {shownProjects.map((project) => (
          <span
            key={project.id}
            className="max-w-full break-words rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-muted"
          >
            {project.name} <span className="font-mono">{project.id}</span>
          </span>
        ))}
        {remainingProjects > 0 && (
          <span
            className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-muted"
            title={cluster.projects.map((project) => project.name).join(", ")}
          >
            +{remainingProjects} more
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {cluster.representatives.map((item) => (
          <li
            key={item.prId}
            className="min-w-0 border-l-2 border-teal/40 pl-2.5"
          >
            <p className="break-words font-mono text-[10px] text-muted">
              {item.prId} · {item.contributorHandle} → {item.projectName}
            </p>
            <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">
              “{item.snippet}”
            </p>
          </li>
        ))}
      </ul>

      {cluster.commonPaths.length > 0 && (
        <p className="mt-3 break-words text-[10px] leading-relaxed text-muted">
          Most common changed paths:{" "}
          {cluster.commonPaths
            .map((path) => `${path.value} (${path.count})`)
            .join(" · ")}
        </p>
      )}
    </article>
  );
}

export function SemanticClusters({ version }) {
  const { data, error, loading, refetch } = useApiResource(
    (signal) => api.getSemanticClusters(signal),
    `semantic-clusters:${version}`,
  );

  const campaignLinked =
    data?.clusters?.filter((cluster) => cluster.campaignIds.length > 0).length ??
    0;

  return (
    <Panel
      title="Semantic similarity clusters"
      description="Embeddings compare PR text by meaning instead of exact wording. Only pairs from different projects are linked, so every cluster spans projects."
      actions={
        data?.enabled ? (
          <>
            <span className="rounded border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-muted">
              {data.model}
            </span>
            <span className="rounded border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-muted">
              cosine ≥ {data.threshold}
            </span>
          </>
        ) : null
      }
    >
      <div data-testid="semantic-clusters">
        {loading && !data && (
          <LoadingState label="Embedding PR text on the backend" />
        )}

        {error && !data && (
          <div className="space-y-2">
            <ErrorState error={error} onRetry={refetch} />
            <p className="text-[11px] leading-relaxed text-muted">
              Semantic clusters are optional. Campaign detection, records and
              metrics stay available without embeddings.
            </p>
          </div>
        )}

        {data && !data.enabled && (
          <div
            data-testid="semantic-clusters-disabled"
            className="rounded-md border border-amber/30 bg-amber/5 px-3 py-3"
          >
            <p className="text-xs font-medium text-ink">
              Embeddings are not configured in this deployment.
            </p>
            <p className="mt-1 break-words text-xs leading-relaxed text-muted">
              {data.reason} Set it in the backend environment (for example
              Render → Environment). The browser never receives the key, and the
              rest of this page does not depend on it.
            </p>
            <p className="mt-2 font-mono text-[10px] text-muted">
              model {data.model} · threshold {data.threshold} · no PR text was
              sent anywhere
            </p>
          </div>
        )}

        {data?.enabled && (
          <div className="min-w-0">
            <div className="grid grid-cols-2 divide-x divide-line rounded-md border border-line sm:grid-cols-4">
              <Stat
                label="Clusters"
                value={data.totals.clusters}
                hint={`${data.totals.returnedClusters} shown`}
              />
              <Stat
                label="PRs embedded"
                value={data.totals.embeddedPullRequests}
                hint={`${data.totals.uniqueTexts} unique texts`}
              />
              <Stat
                label="Meaning-only pairs"
                value={data.totals.semanticOnlyPairs}
                hint={`of ${data.totals.semanticPairs} semantic pairs`}
              />
              <Stat
                label="Campaign-linked"
                value={campaignLinked}
                hint="clusters overlapping a campaign"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="break-words font-mono text-[10px] text-muted">
                {plural(data.totals.crossProjectPairs, "cross-project pair")}{" "}
                compared · {plural(data.totals.lexicalPairs, "pair")} also match
                exact wording · {plural(data.totals.exactDuplicatePairs, "byte-identical pair")}
              </p>
              <p className="font-mono text-[10px] text-muted">
                seed {data.simulation?.seed ?? "?"} · generated{" "}
                {formatDate(data.generatedAt)}
              </p>
            </div>

            {data.clusters.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No cross-project cluster passed the filters">
                  Lower SEMANTIC_SIMILARITY_THRESHOLD in the backend environment,
                  or try a world with more repeated wording. Nothing is invented
                  to fill this panel.
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {data.clusters.map((cluster) => (
                  <ClusterCard key={cluster.id} cluster={cluster} />
                ))}
              </div>
            )}

            {data.totals.omittedClusters > 0 && (
              <p className="mt-3 text-[11px] text-muted">
                {plural(data.totals.omittedClusters, "smaller cluster")} omitted
                from this view; the counts above still include them.
              </p>
            )}

            <div className="mt-4 min-w-0 rounded-md border border-line bg-raised/40 px-3 py-2.5">
              <p className="break-words text-[11px] leading-relaxed text-muted">
                {data.notes.slice(2).join(" ")}{" "}
                {plural(data.provider?.batches ?? 0, "server-side batch", "server-side batches")}{" "}
                · {data.totals.dimensions} dimensions · only simulated PR text
                was embedded.
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
