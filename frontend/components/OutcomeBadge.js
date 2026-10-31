import { outcomeLabel } from "@/lib/format";

const STYLES = {
  normal_review: "border-line-strong bg-raised text-ink",
  caution: "border-amber/45 bg-amber/10 text-amber",
  flagged: "border-danger/45 bg-danger/10 text-danger",
  coordinated_campaign: "border-danger/45 bg-danger/10 text-danger",
};

export function OutcomeBadge({ outcome }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium ${
        STYLES[outcome] ?? STYLES.normal_review
      }`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {outcomeLabel(outcome)}
    </span>
  );
}
