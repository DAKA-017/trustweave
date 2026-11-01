"use client";

import { useState } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { PageHeader, Panel, Stat } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import snapshot from "@/lib/snapshot.json";

const WIDTH = 840;
const HEIGHT = 560;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS_X = 330;
const RADIUS_Y = 215;
const STRONG_LINK_LIMIT = 24;

const GLOSSARY = [
  {
    term: "Project",
    plain: "A team or codebase in the simulation.",
  },
  {
    term: "Trust link",
    plain:
      "One project saying another project's judgment is worth listening to.",
  },
  {
    term: "Contributor",
    plain: "A person who sends pull requests.",
  },
  {
    term: "Vouch",
    plain: "A signed note that supports a person.",
  },
  {
    term: "Denounce",
    plain: "A signed note that raises a concern about a person's work.",
  },
  {
    term: "Neutral newcomer",
    plain: "Someone with no history yet. They get normal review, not a block.",
  },
  {
    term: "Signed record",
    plain:
      "A note a project signs and links to its previous note, so edits are easy to spot.",
  },
  {
    term: "Campaign",
    plain: "Several accounts acting together in a coordinated way.",
  },
  {
    term: "Trust that travels",
    plain:
      "If A trusts B and B trusts C, A gives C some weight too — up to three steps.",
  },
];

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
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
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
  const strongestEdges = [...edges]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, STRONG_LINK_LIMIT);
  const visibleEdges = showAllLinks ? edges : strongestEdges;
  const topEdges = [...edges]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const hoveredProject =
    projects.find((project) => project.id === hoveredId) ?? null;
  const traceId = hoveredId ?? asProject;
  const isTraced = (edge) =>
    Boolean(traceId) && (edge.from === traceId || edge.to === traceId);
  const connectedIds = new Set();
  if (hoveredId) {
    connectedIds.add(hoveredId);
    for (const edge of declaredEdges) {
      if (edge.from === hoveredId) connectedIds.add(edge.to);
      if (edge.to === hoveredId) connectedIds.add(edge.from);
    }
  }
  const hoveredPoint = hoveredProject ? positions.get(hoveredProject.id) : null;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Network"
        description="A map of who trusts whom. Each arrow points from a project to a project it trusts. Hover a circle to trace its links, then click it to see how that project judges people."
      >
        {selected && (
          <span className="rounded border border-teal/40 bg-teal/10 px-2 py-1 font-mono text-[11px] text-teal">
            looking through {selected.id} · {selected.name}
          </span>
        )}
      </PageHeader>

      <Panel
        title="Who trusts whom"
        description="The strongest links are shown first so the map stays readable. Turn on every link to see the full network."
        contentClassName="p-3 sm:p-4"
      >
        <div className="mb-3 grid gap-2 rounded-md border border-line bg-charcoal/50 px-3 py-2.5 text-xs text-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-ink">Circles</span> are projects.
          </p>
          <p>
            <span className="font-medium text-ink">Arrows</span> point to a
            project that is trusted.
          </p>
          <p>
            <span className="font-medium text-ink">Thick lines</span> mean
            stronger trust.
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-line bg-panel/60 px-3 py-2.5">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label
              htmlFor="network-search"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Find a project
            </label>
            <input
              id="network-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="name, id, or maintainer"
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
            Only links touching {selected?.id ?? "the selection"}
          </label>

          <label className="flex min-h-9 items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showAllLinks}
              onChange={(event) => setShowAllLinks(event.target.checked)}
              data-testid="network-show-all"
              style={{ accentColor: "var(--color-teal)" }}
              className="h-4 w-4"
            />
            Show every link
          </label>

          <span
            role="status"
            data-testid="network-count"
            className="font-mono text-[10px] text-muted"
          >
            {matchingProjects.length} of {projects.length} projects ·{" "}
            {visibleEdges.length} of {plural(edges.length, "link")} shown
          </span>

          {(query || onlySelected || showAllLinks) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOnlySelected(false);
                setShowAllLinks(false);
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
              Try a project name, project id, or maintainer handle.
            </p>
          </div>
        ) : (
        <div className="relative rounded-md bg-charcoal/60 p-1">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Map of projects and who trusts whom. Each arrow points to a trusted project."
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
              {visibleEdges.map((edge) => {
                const from = positions.get(edge.from);
                const to = positions.get(edge.to);
                const traced = isTraced(edge);
                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={traced ? "var(--color-teal)" : "var(--color-ink)"}
                    strokeWidth={0.6 + edge.weight * 1.8}
                    style={{
                      strokeOpacity: traced
                        ? 0.42 + edge.weight * 0.4
                        : hoveredId
                          ? 0.04
                          : 0.1 + edge.weight * 0.28,
                      transition: "stroke-opacity 0.2s ease, stroke 0.2s ease",
                    }}
                    markerEnd="url(#trust-arrow)"
                  />
                );
              })}
            </g>

            <g aria-hidden="true">
              {visibleEdges.map((edge) => {
                if (!isTraced(edge)) return null;
                const from = positions.get(edge.from);
                const to = positions.get(edge.to);
                return (
                  <line
                    key={`flow-${edge.from}-${edge.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="var(--color-teal)"
                    strokeWidth={0.9}
                    strokeDasharray="2 10"
                    strokeOpacity={0.6}
                    className="trust-flow"
                    pointerEvents="none"
                  />
                );
              })}
            </g>

            <g>
              {matchingProjects.map((project) => {
                const point = positions.get(project.id);
                const radius = 7 + Math.min(6, project.counts.contributors);
                const isSelected = project.id === asProject;
                const isHovered = project.id === hoveredId;
                const dimmed =
                  Boolean(hoveredId) && !connectedIds.has(project.id);
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
                    style={{
                      opacity: dimmed ? 0.28 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                    onMouseEnter={() => setHoveredId(project.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(project.id)}
                    onBlur={() => setHoveredId(null)}
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
                    {isSelected && (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={radius + 4}
                        fill="none"
                        stroke="var(--color-teal)"
                        strokeWidth={1}
                        className="node-pulse"
                        pointerEvents="none"
                      />
                    )}
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius + 12}
                      fill="none"
                      pointerEvents="all"
                    />
                    <circle
                      className="node-dot"
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill={
                        isSelected || isHovered
                          ? "var(--color-teal)"
                          : "var(--color-panel)"
                      }
                      stroke={
                        isSelected || isHovered
                          ? "var(--color-teal)"
                          : "var(--color-line-strong)"
                      }
                      strokeWidth={isSelected ? 2 : 1.2}
                      style={{
                        transition: "fill 0.2s ease, stroke 0.2s ease",
                      }}
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

          {hoveredProject && hoveredPoint && (
            <div
              className="pointer-events-none absolute z-10 hidden sm:block"
              style={{
                left: `${(hoveredPoint.x / WIDTH) * 100}%`,
                top: `${(hoveredPoint.y / HEIGHT) * 100}%`,
                transform: "translate(-50%, calc(-100% - 12px))",
                transition: "left 0.18s ease, top 0.18s ease",
              }}
            >
              <div
                data-testid="node-tooltip"
                className="tooltip-in w-max max-w-[240px] rounded-md border border-teal/40 bg-charcoal/95 px-3 py-2 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)]"
              >
                <p className="text-xs font-semibold text-ink">
                  {hoveredProject.name}
                </p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  {hoveredProject.id} ·{" "}
                  {plural(
                    hoveredProject.counts.contributors,
                    "person",
                    "people",
                  )}
                </p>
                <p className="mt-1 text-[10px] text-muted">
                  {plural(hoveredProject.trustConfig.length, "outgoing link")} ·{" "}
                  {plural(
                    Math.max(0, connectedIds.size - 1),
                    "connected project",
                  )}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-teal">
                  click to assess as this project
                </p>
              </div>
            </div>
          )}
        </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-line-strong bg-panel" />
            <span className="h-4 w-4 rounded-full border border-line-strong bg-panel" />
            bigger circle = more people
          </span>
          <span>arrow = “trusts”</span>
          <span>thicker line = stronger trust</span>
          <span className="text-teal">
            teal = touches {hoveredId ?? selected?.id ?? "the selection"}
          </span>
          <span>hover a circle to trace its links</span>
          <span>click a circle to open that project</span>
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel
          title={`Projects (${matchingProjects.length}${normalizedQuery ? ` of ${projects.length}` : ""})`}
          description="Each project has its own list of who it trusts. Opening one does not change any data."
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
                      {project.id} ·{" "}
                      {plural(project.maintainers.length, "maintainer")}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {project.counts.contributors} people ·{" "}
                    {plural(project.trustConfig.length, "link")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Strongest trust links"
          description="A → B means A trusts B. The number is how much trust A gives B."
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

      <Panel
        className="mt-4"
        title="Words made simple"
        description="Short definitions for the labels you will see across this demo."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="min-w-0">
              <dt className="text-xs font-medium text-ink">{item.term}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-muted">
                {item.plain}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
