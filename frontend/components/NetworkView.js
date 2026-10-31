"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { PageHeader, Panel, Stat } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

const WIDTH = 840;
const HEIGHT = 560;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS_X = 330;
const RADIUS_Y = 215;

function layout(projects) {
  const positions = new Map();
  projects.forEach((project, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / projects.length;
    positions.set(project.id, {
      x: Number((CENTER_X + RADIUS_X * Math.cos(angle)).toFixed(2)),
      y: Number((CENTER_Y + RADIUS_Y * Math.sin(angle)).toFixed(2)),
    });
  });
  return positions;
}

function edgeList(projects) {
  const edges = [];
  for (const project of projects) {
    for (const edge of project.trustConfig) {
      if (edge.weight <= 0) continue;
      edges.push({
        from: project.id,
        fromName: project.name,
        to: edge.projectId,
        toName: edge.name,
        weight: edge.weight,
      });
    }
  }
  return edges;
}

export function NetworkView({
  version,
  asProject,
  onOpenProject,
}) {
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const { data, error, loading, refetch } = useApiResource(
    (signal) => api.getProjects(signal),
    `projects:${version}`,
    version === 0 ? snapshot.projects : null,
  );

  if (loading && !data) return <LoadingState label="Loading the trust network" />;
  if (error && !data) return <ErrorState error={error} onRetry={refetch} />;
  if (!data?.projects?.length) {
    return <EmptyState title="No projects in this simulation" />;
  }

  const projects = data.projects;
  const selected = projects.find((project) => project.id === asProject);
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (project) =>
    !normalizedQuery ||
    project.id.toLowerCase().includes(normalizedQuery) ||
    project.name.toLowerCase().includes(normalizedQuery) ||
    (project.maintainers ?? []).some((maintainer) =>
      (maintainer.handle ?? "").toLowerCase().includes(normalizedQuery),
    );

  const matchingProjects = projects.filter(matchesQuery);
  const matchingIds = new Set(matchingProjects.map((project) => project.id));
  const positions = layout(projects);
  const declaredEdges = edgeList(projects).filter(
    (edge) => positions.has(edge.from) && positions.has(edge.to),
  );
  const edges = declaredEdges.filter((edge) => {
    if (!matchingIds.has(edge.from) || !matchingIds.has(edge.to)) return false;
    if (
      onlySelected &&
      asProject &&
      edge.from !== asProject &&
      edge.to !== asProject
    ) {
      return false;
    }
    return true;
  });
  const topEdges = [...edges]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Network"
        description="Every edge is a direct trust weight declared by one project. Click a node to evaluate contributions as that project. There is no global score to inspect."
      >
        {selected && (
          <span className="rounded border border-teal/40 bg-teal/10 px-2 py-1 font-mono text-[11px] text-teal">
            evaluating as {selected.id} · {selected.name}
          </span>
        )}
      </PageHeader>

      <Panel
        title="Project trust graph"
        description="Node size is the number of contributors with pull requests. Edge width and opacity are the declared trust weight. Search and edge filtering only change what this view displays; the simulation is untouched."
        contentClassName="p-3 sm:p-4"
      >
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-line bg-panel/60 px-3 py-2.5">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label
              htmlFor="network-search"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Search projects
            </label>
            <input
              id="network-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="id, name, or maintainer"
              data-testid="network-search"
              className="mt-1 min-h-9 w-full rounded-md border border-line-strong bg-panel px-2 py-1.5 font-mono text-xs text-ink"
            />
          </div>

          <label className="flex min-h-9 items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={(event) => setOnlySelected(event.target.checked)}
              data-testid="network-only-selected"
              style={{ accentColor: "var(--color-teal)" }}
              className="h-4 w-4"
            />
            Only edges touching {selected?.id ?? "the selection"}
          </label>

          <span
            role="status"
            data-testid="network-count"
            className="font-mono text-[10px] text-muted"
          >
            {matchingProjects.length} of {projects.length} projects ·{" "}
            {edges.length} of {declaredEdges.length} edges
          </span>

          {(query || onlySelected) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOnlySelected(false);
              }}
              className="min-h-9 rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              Clear filters
            </button>
          )}
        </div>

        {matchingProjects.length === 0 ? (
          <div className="rounded-md border border-line bg-charcoal/60 px-4 py-10 text-center">
            <p className="text-sm text-ink">No projects match “{query.trim()}”.</p>
            <p className="mt-1 text-xs text-muted">
              Search by project id, project name, or maintainer handle.
            </p>
          </div>
        ) : (
        <div className="rounded-md bg-charcoal/60 p-1">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Weighted trust graph of simulated projects. Each project is a labelled node, and arrows show declared trust weights."
          >
            <defs>
              <marker
                id="trust-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L8 4 L0 8 z" fill="#5c686d" />
              </marker>
            </defs>

            <g>
              {edges.map((edge) => {
                const from = positions.get(edge.from);
                const to = positions.get(edge.to);
                const touchesSelection =
                  edge.from === asProject || edge.to === asProject;
                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={
                      touchesSelection
                        ? "var(--color-teal)"
                        : "var(--color-ink)"
                    }
                    strokeWidth={0.6 + edge.weight * 1.8}
                    strokeOpacity={
                      touchesSelection ? 0.42 + edge.weight * 0.4 : 0.1 + edge.weight * 0.28
                    }
                    markerEnd="url(#trust-arrow)"
                  />
                );
              })}
            </g>

            <g>
              {matchingProjects.map((project) => {
                const point = positions.get(project.id);
                const radius = 7 + Math.min(6, project.counts.contributors);
                const isSelected = project.id === asProject;
                const label = project.name.length > 16
                  ? `${project.name.slice(0, 15)}…`
                  : project.name;
                return (
                  <g
                    key={project.id}
                    className="node cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`View as ${project.name}`}
                    data-testid={`node-${project.id}`}
                    onClick={() => onOpenProject(project.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenProject(project.id);
                      }
                    }}
                  >
                    <title>
                      {`${project.name} (${project.id}) · click to evaluate as this project`}
                    </title>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill={isSelected ? "var(--color-teal)" : "var(--color-panel)"}
                      stroke={
                        isSelected
                          ? "var(--color-teal)"
                          : "var(--color-line-strong)"
                      }
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    <text
                      x={point.x}
                      y={point.y + radius + 11}
                      textAnchor="middle"
                      className="node-label"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span>Arrows: declared trust direction</span>
          <span>Line width: trust weight</span>
          <span>Nodes are keyboard focusable</span>
          <span>Click or press Enter to open the project view</span>
          <span className="md:hidden">
            Labels are hidden on small screens; use the project list below.
          </span>
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel
          title={`Projects (${matchingProjects.length}${normalizedQuery ? ` of ${projects.length}` : ""})`}
          description="Each project evaluates from its own trust list. Opening one does not change any data."
          contentClassName="p-0"
        >
          <ul className="max-h-80 divide-y divide-line overflow-y-auto scroll-pane">
            {matchingProjects.length === 0 && (
              <li className="px-4 py-6 text-xs text-muted">
                No projects match the current search.
              </li>
            )}
            {matchingProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  data-testid={`project-row-${project.id}`}
                  className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-raised ${
                    project.id === asProject ? "bg-teal/5" : ""
                  }`}
                  aria-label={`View as ${project.name}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {project.name}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {project.id} · {project.maintainers.length} maintainer(s)
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {project.counts.contributors} contributors ·{" "}
                    {project.trustConfig.length} edges
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Strongest declared edges"
          description="Direct weights only. Transitive trust is computed per evaluating project at request time."
          contentClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {topEdges.map((edge) => (
              <li
                key={`${edge.from}-${edge.to}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="min-w-0 break-words font-mono text-[11px] text-ink">
                  {edge.from} <span className="text-muted">→</span> {edge.to}
                </span>
                <span className="font-mono text-[11px] text-teal">
                  {edge.weight.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3">
            <div className="grid grid-cols-2 divide-x divide-line">
              <Stat
                label="Projects"
                value={data.simulation?.counts.projects ?? projects.length}
              />
              <Stat label="Seed" value={data.simulation?.seed ?? "—"} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
