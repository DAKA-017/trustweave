"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

const TONE = {
  neutral: "border-line-strong bg-raised text-ink",
  teal: "border-teal/40 bg-teal/10 text-teal",
  amber: "border-amber/40 bg-amber/10 text-amber",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

export function LandingExplorer({ examples }) {
  const [activeId, setActiveId] = useState(examples[0].id);
  const active = examples.find((example) => example.id === activeId) ?? examples[0];

  function onKeyDown(event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = examples.findIndex((example) => example.id === active.id);
    const step = event.key === "ArrowRight" ? 1 : examples.length - 1;
    const next = examples[(index + step) % examples.length];
    setActiveId(next.id);
    document.getElementById(`landing-tab-${next.id}`)?.focus();
  }

  return (
    <div className="rounded-lg border border-line bg-panel/60">
      <div
        role="tablist"
        aria-label="Example assessments"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-1.5 border-b border-line p-2 sm:p-3"
      >
        {examples.map((example) => {
          const selected = example.id === active.id;
          return (
            <button
              key={example.id}
              type="button"
              role="tab"
              id={`landing-tab-${example.id}`}
              aria-selected={selected}
              aria-controls={`landing-panel-${example.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(example.id)}
              className={`group min-h-9 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-all ${
                selected
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-transparent text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full transition-all ${
                    selected
                      ? "bg-teal shadow-[0_0_10px_var(--color-teal)]"
                      : "bg-line-strong group-hover:bg-muted"
                  }`}
                  aria-hidden="true"
                />
                {example.tab}
              </span>
            </button>
          );
        })}
        <span
          aria-hidden="true"
          className="ml-auto hidden items-center gap-1 self-center px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted sm:flex"
        >
          <kbd className="rounded border border-line bg-raised px-1 py-0.5">←</kbd>
          <kbd className="rounded border border-line bg-raised px-1 py-0.5">→</kbd>
          switch
        </span>
      </div>

      {examples.map((example) => (
        <div
          key={example.id}
          role="tabpanel"
          id={`landing-panel-${example.id}`}
          aria-labelledby={`landing-tab-${example.id}`}
          hidden={example.id !== active.id}
        >
          {example.id === active.id && (
            <div
              key={active.id}
              className="panel-in grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {example.context}
                </p>
                <h3 className="mt-1 break-words text-xl font-semibold tracking-tight text-ink">
                  {example.subject}
                </h3>
                <p
                  className={`mt-2 inline-flex rounded border px-2 py-1 text-xs font-medium ${TONE[example.tone] ?? TONE.neutral}`}
                >
                  {example.outcome}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {example.note}
                </p>
                {example.caveat && (
                  <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber">
                    <TriangleAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{example.caveat}</span>
                  </p>
                )}
                <Link
                  href={example.link.href}
                  className="group/link mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:underline"
                >
                  {example.link.label}
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </div>

              <div className="min-w-0">
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
                  {example.facts.map((fact) => (
                    <div key={fact.label} className="min-w-0 bg-panel px-3 py-2">
                      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                        {fact.label}
                      </dt>
                      <dd className="mt-0.5 break-words text-sm font-medium text-ink">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-3 space-y-1.5">
                  {example.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-[12px] leading-relaxed text-muted"
                    >
                      <span
                        className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">{bullet}</span>
                    </li>
                  ))}
                </ul>

                {example.whatWouldChange && (
                  <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">
                      What would change this:{" "}
                    </span>
                    {example.whatWouldChange}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
