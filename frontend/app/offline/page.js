import Link from "next/link";

export const metadata = {
  title: "Offline — TrustWeave",
  description:
    "The TrustWeave app shell is available offline, but assessments and records require the local simulator API.",
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-start justify-center gap-5 px-6 py-16">
      <span className="rounded border border-amber/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
        offline
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        You are offline
      </h1>
      <p className="text-sm leading-relaxed text-muted">
        The TrustWeave app shell loaded from its local cache, but the simulator
        API is unreachable. Assessments, campaigns and signed records are never
        cached, so nothing stale is shown in their place.
      </p>
      <Link
        href="/"
        className="rounded-md border border-teal/40 bg-teal/10 px-4 py-2 text-sm font-medium text-teal transition-colors hover:bg-teal/20"
      >
        Try again
      </Link>
      <p className="font-mono text-[10px] text-muted/80">
        Demo only · no real repositories are contacted.
      </p>
    </main>
  );
}
