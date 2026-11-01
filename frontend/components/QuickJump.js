"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { api } from "@/lib/api";
import { pathForView, projectPath } from "@/lib/routes";
import snapshot from "@/lib/snapshot.json";

const VIEW_META = [
  { id: "network", label: "Network map", hint: "who trusts whom" },
  { id: "project", label: "Project view", hint: "assess as one project" },
  {
    id: "contributor",
    label: "Contributor",
    hint: "read one person's assessment",
  },
  { id: "campaigns", label: "Campaigns", hint: "coordinated accounts" },
  { id: "newcomers", label: "Newcomer lane", hint: "neutral by default" },
  { id: "records", label: "Records", hint: "signed log and tamper demo" },
  { id: "simulator", label: "Simulator", hint: "rebuild the world" },
  {
    id: "explainer",
    label: "Why not AI-text",
    hint: "side-by-side explainer",
    path: "/explainer",
  },
];

function projectItems(projects) {
  return [...projects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => ({
      key: `project:${project.id}`,
      kind: "Project",
      label: project.name,
      hint: `${project.id} · ${project.counts?.contributors ?? 0} people`,
      search: project.id,
      projectId: project.id,
      href: projectPath(project.id),
    }));
}

export function QuickJump({
  asProject,
  contributorId,
  onNavigate,
  onOpenProject,
}) {
  const router = useRouter();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [projects, setProjects] = useState(() =>
    projectItems(snapshot.projects.projects),
  );

  const itemList = [
    ...VIEW_META.map((meta) => ({
      key: `view:${meta.id}`,
      kind: "View",
      label: meta.label,
      hint: meta.hint,
      search: meta.id,
      viewId: meta.id,
      href:
        meta.path ??
        pathForView(meta.id, {
          projectId: asProject,
          contributorId,
        }),
    })),
    ...projects,
  ];

  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? itemList.filter((item) =>
        `${item.label} ${item.hint ?? ""} ${item.search ?? ""}`
          .toLowerCase()
          .includes(normalized),
      )
    : itemList;
  const shown = results.slice(0, 14);
  const active = Math.min(activeIndex, Math.max(0, shown.length - 1));

  function reset() {
    setQuery("");
    setActiveIndex(0);
  }

  function openDialog() {
    reset();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    reset();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function go(item) {
    if (!item) return;
    setOpen(false);
    reset();
    if (item.projectId && onOpenProject) {
      onOpenProject(item.projectId);
      return;
    }
    onNavigate?.(item.viewId);
    router.push(item.href);
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      setQuery("");
      setActiveIndex(0);
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api
      .getProjects(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setProjects(projectItems(data.projects ?? []));
      })
      .catch(() => {});
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      controller.abort();
      document.body.style.overflow = overflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`quick-jump-item-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Meta+K Control+K"
        title="Jump to a project or view (⌘K)"
        data-testid="quick-jump"
        className="group inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-teal/40 hover:text-ink"
      >
        <Search
          className="h-3.5 w-3.5 transition-colors group-hover:text-teal"
          aria-hidden="true"
        />
        <span className="hidden sm:inline">Jump to…</span>
        <kbd className="hidden rounded border border-line bg-raised px-1 text-[9px] sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-charcoal/80 px-4 pt-[10vh] backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quick jump"
            data-testid="quick-jump-dialog"
            className="view-enter w-full max-w-lg overflow-hidden rounded-xl border border-line bg-panel shadow-[0_40px_120px_-24px_rgba(0,0,0,0.9)]"
          >
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search
                className="h-4 w-4 shrink-0 text-teal"
                aria-hidden="true"
              />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls="quick-jump-results"
                aria-activedescendant={
                  shown.length > 0 ? `quick-jump-item-${active}` : undefined
                }
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) =>
                      Math.min(shown.length - 1, index + 1),
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(0, index - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    go(shown[active]);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  }
                }}
                placeholder="Jump to a view or project…"
                aria-label="Search views and projects"
                data-testid="quick-jump-input"
                className="min-h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
              <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[9px] text-muted">
                esc
              </kbd>
            </div>

            <ul
              id="quick-jump-results"
              role="listbox"
              aria-label="Quick jump results"
              className="scroll-pane max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
            >
              {shown.length === 0 && (
                <li className="px-3 py-8 text-center text-xs text-muted">
                  No matches. Try a project name, id, or view.
                </li>
              )}
              {shown.map((item, index) => {
                const isActive = index === active;
                return (
                  <li key={item.key} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      id={`quick-jump-item-${index}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        isActive
                          ? "bg-teal/10 text-ink"
                          : "text-muted hover:bg-raised hover:text-ink"
                      }`}
                    >
                      <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted">
                        {item.kind}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {item.label}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted">
                          {item.hint}
                        </span>
                      </span>
                      {isActive && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-teal"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              <span>↑ ↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
              <span className="ml-auto">
                {shown.length} of {itemList.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
