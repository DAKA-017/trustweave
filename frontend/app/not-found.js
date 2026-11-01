import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-5 px-6 py-16">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <p className="text-sm font-semibold tracking-tight">TrustWeave</p>
      </div>
      <span className="rounded border border-amber/40 bg-amber/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
        404 · not in the log
      </span>
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        This path has no signed record.
      </h1>
      <p className="max-w-lg text-sm leading-relaxed text-muted">
        The page you asked for is not part of this demo. Nothing was revoked or
        hidden — it was never woven in. Head back to the overview, or open the
        network and pick a project.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          href="/"
          className="cta-sheen group inline-flex min-h-10 items-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-semibold text-charcoal transition-colors hover:bg-teal/90"
        >
          <ArrowLeft
            className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          Back to the overview
        </Link>
        <Link
          href="/network"
          className="group inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-teal/40 hover:text-teal"
        >
          Open the demo
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
      <p className="font-mono text-[10px] text-muted/80">
        Demo only · no real repositories are contacted.
      </p>
    </main>
  );
}
