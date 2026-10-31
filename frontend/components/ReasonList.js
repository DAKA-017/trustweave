import { humanize } from "@/lib/format";

function referencesOf(reason) {
  return (reason.references ?? []).filter(Boolean);
}

export function ReasonList({ reasons, emptyLabel }) {
  if (!reasons || reasons.length === 0) {
    return (
      <p className="text-xs text-muted">
        {emptyLabel ?? "No reasons were returned for this outcome."}
      </p>
    );
  }

  return (
    <div>
      <ol className="space-y-3">
        {reasons.map((reason, index) => {
          const references = referencesOf(reason);
          return (
            <li key={`${reason.type}-${index}`} className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-teal">
                  {index + 1}. {humanize(reason.type)}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {reason.weight > 0
                    ? `signal weight ${reason.weight.toFixed(3)}`
                    : "weight 0 · no effect"}
                </span>
              </div>
              <p className="mt-1 break-words text-sm leading-relaxed text-ink/90">
                {reason.message}
              </p>
              {references.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {references.map((reference, referenceIndex) => (
                    <li
                      key={`${reference.kind}-${reference.id}-${referenceIndex}`}
                      className="max-w-full break-all rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {reference.kind}:{reference.id}
                      {reference.projectId ? ` · ${reference.projectId}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Reasons are ordered by signal weight. Weights are explainable signals,
        not a numeric probability of spam.
      </p>
    </div>
  );
}
