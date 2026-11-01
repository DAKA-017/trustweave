"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

function number(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

function AnimatedCount({ value, animate }) {
  const target = typeof value === "number" ? value : null;
  const [display, setDisplay] = useState(
    !animate && target !== null ? target : 0,
  );

  useEffect(() => {
    if (target === null || !animate) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const idle = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(idle);
    }

    let frame = 0;
    const started = performance.now();
    const duration = 900;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else frame = 0;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [animate, target]);

  return (
    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
      {target === null ? "—" : number(display)}
    </dd>
  );
}

export function LandingStatus({ initialHealth }) {
  const initial = useRef(initialHealth);
  const [phase, setPhase] = useState("snapshot");
  const [health, setHealth] = useState(initialHealth);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    api
      .getHealth(controller.signal)
      .then((next) => {
        if (!active) return;
        setHealth(next);
        setPhase("live");
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setHealth(initial.current);
        setPhase("offline");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const counts = health?.counts ?? {};
  const label = {
    snapshot: "checking the demo API…",
    live: "live demo API connected",
    offline: "demo API unreachable — showing the seed-42 snapshot",
  }[phase];
  const dot = {
    snapshot: "bg-amber",
    live: "bg-teal",
    offline: "bg-danger",
  }[phase];

  return (
    <section
      aria-label="Demo status"
      data-testid="landing-status"
      data-state={phase}
      className="relative w-full overflow-hidden rounded-lg border border-line bg-panel/80 p-3 sm:p-4"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/60 to-transparent"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            {phase === "live" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${dot}`}
            />
          </span>
          <span>{label}</span>
        </p>
        <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">
          seed {health?.seed ?? 42}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {[
          ["projects", "projects"],
          ["contributors", "contributors"],
          ["pull requests", "pullRequests"],
          ["signed records", "records"],
        ].map(([labelText, key]) => (
          <div key={key} className="bg-panel px-3 py-2">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              {labelText}
            </dt>
            <AnimatedCount
              key={`${key}-${phase}`}
              value={counts[key]}
              animate={phase === "live"}
            />
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          {phase === "live"
            ? "Read straight from the running simulator. This page only reads; nothing is written until you open the demo."
            : "These counts come from the build-time snapshot of the seed-42 world."}
        </p>
        {phase === "offline" && (
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="min-h-8 rounded-md border border-line bg-raised px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-line-strong"
          >
            Retry connection
          </button>
        )}
      </div>
    </section>
  );
}
