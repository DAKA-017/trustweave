import { Button } from "@/components/ui";

export function LoadingState({ label = "Loading from the simulation host" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-line bg-panel p-5"
    >
      <div className="flex items-center gap-3">
        <div className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal [animation-delay:240ms]" />
        </div>
        <span className="text-sm text-muted">{label}…</span>
      </div>
      <div className="mt-4 space-y-2" aria-hidden="true">
        <div className="h-2 w-2/3 animate-pulse rounded bg-raised" />
        <div className="h-2 w-1/2 animate-pulse rounded bg-raised" />
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/5 p-4"
    >
      <p className="text-sm font-medium text-danger">
        {error?.message ?? "Something went wrong while loading this view."}
      </p>
      {error?.code && (
        <p className="mt-1 font-mono text-[11px] text-muted">
          code {error.code}
          {error.status ? ` · HTTP ${error.status}` : ""}
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Retry request
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && (
        <div className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-muted">
          {children}
        </div>
      )}
    </div>
  );
}
