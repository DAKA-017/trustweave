"use client";

import Link from "next/link";
import {
  FlaskConical,
  FolderKanban,
  Network,
  Radar,
  ScrollText,
  SlidersHorizontal,
  Sprout,
  UserSearch,
} from "lucide-react";
import { pathForView } from "@/lib/routes";
import { InstallButton } from "./InstallButton";

const NAV_ITEMS = [
  { id: "network", label: "Network", icon: Network },
  { id: "project", label: "Project view", icon: FolderKanban },
  { id: "contributor", label: "Contributor", icon: UserSearch },
  { id: "campaigns", label: "Campaigns", icon: Radar },
  { id: "newcomers", label: "Newcomers", icon: Sprout },
  { id: "records", label: "Records", icon: ScrollText },
  { id: "simulator", label: "Simulator", icon: SlidersHorizontal },
];

function BrandMark() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-teal/40 bg-teal/10">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path
          d="M3.5 7.5c4.2 0 4.2 9 8.5 9s4.3-9 8.5-9"
          stroke="var(--color-teal)"
        />
        <path
          d="M3.5 16.5c4.2 0 4.2-9 8.5-9s4.3 9 8.5 9"
          stroke="var(--color-line-strong)"
        />
      </svg>
    </span>
  );
}

function Meta({ meta, hydrated }) {
  if (!meta) {
    return (
      <span
        role="status"
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
      >
        connecting to the demo…
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted">
      {hydrated && (
        <span
          data-testid="client-ready"
          className="rounded border border-teal/40 bg-teal/10 px-1.5 py-0.5 text-teal"
        >
          interactive
        </span>
      )}
      <span className="rounded border border-line bg-panel px-1.5 py-0.5">
        seed {meta.seed}
      </span>
      <span className="rounded border border-line bg-panel px-1.5 py-0.5">
        {meta.counts?.projects ?? "?"} projects
      </span>
      <span className="rounded border border-line bg-panel px-1.5 py-0.5">
        {meta.counts?.pullRequests ?? "?"} PRs
      </span>
      <span className="rounded border border-line bg-panel px-1.5 py-0.5">
        {meta.counts?.records ?? "?"} records
      </span>
      <span className="rounded border border-amber/40 px-1.5 py-0.5 text-amber">
        no central authority
      </span>
    </div>
  );
}

export function AppShell({
  view,
  meta,
  asProject,
  contributorId,
  hydrated,
  onNavigate,
  children,
}) {
  const active = NAV_ITEMS.find((item) => item.id === view);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <aside className="min-w-0 border-b border-line bg-panel/70 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <BrandMark />
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight">
                TrustWeave
              </span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                trust, without one score
              </span>
            </span>
          </Link>
          <span className="rounded border border-amber/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber">
            sim
          </span>
        </div>

        <nav
          aria-label="Primary"
          className="flex flex-wrap gap-1 px-2 pb-3 md:flex-col md:flex-nowrap md:px-3"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <Link
                key={item.id}
                href={pathForView(item.id, {
                  projectId: asProject,
                  contributorId,
                })}
                onClick={() => onNavigate?.(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                  isActive
                    ? "border-teal/40 bg-teal/10 text-teal"
                    : "border-transparent text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
          <Link
            href="/explainer"
            className="flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Why not AI-text</span>
          </Link>
        </nav>

        <div className="px-3 pb-3 md:px-3">
          <InstallButton />
        </div>

        <div className="hidden border-t border-line px-4 py-4 md:block">
          <p className="text-[11px] leading-relaxed text-muted">
            Every project runs inside this one demo. There is no single score:
            each project decides whom to trust and judges people from what it
            can verify.
          </p>
          <p className="mt-3 text-[10px] leading-relaxed text-muted/80">
            Demo only · no real repositories are contacted.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-line bg-charcoal/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              TrustWeave / {active?.label ?? "Explainer"}
            </span>
            <Meta meta={meta} hydrated={hydrated} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
