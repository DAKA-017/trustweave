export function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatPercent(value) {
  if (typeof value !== "number") return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRate(value) {
  if (typeof value !== "number") return "—";
  return value.toFixed(3);
}

export function shortHash(value, length = 12) {
  if (!value) return "—";
  return value.slice(0, length);
}

export function humanize(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  const value = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export function signalLabel(type) {
  return humanize(type);
}

export function outcomeLabel(outcome) {
  return (
    {
      normal_review: "Normal review",
      caution: "Caution",
      flagged: "Flagged",
      coordinated_campaign: "Coordinated campaign",
    }[outcome] ?? humanize(outcome)
  );
}
