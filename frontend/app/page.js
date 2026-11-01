import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Fingerprint,
  Network,
  Radar,
  Scale,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { HeroCanvas } from "@/components/HeroCanvas";
import { InstallButton } from "@/components/InstallButton";
import { LandingExplorer } from "@/components/LandingExplorer";
import { LandingStatus } from "@/components/LandingStatus";
import { Reveal } from "@/components/Reveal";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SpotlightLink } from "@/components/SpotlightLink";
import { outcomeLabel, signalLabel } from "@/lib/format";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";
import snapshot from "@/lib/snapshot.json";

export const metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const SITE_LINKS = [
  ["Demo", "/network"],
  ["Campaigns", "/campaigns"],
  ["Records", "/records"],
  ["Simulator", "/simulator"],
  ["Why not AI-text", "/explainer"],
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description: SITE_DESCRIPTION,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const disputed = snapshot.assessment;
const disputedAssessment = disputed.assessment;
const disputedRecord = disputedAssessment.contributingRecords[0];

const newcomer =
  snapshot.newcomers.newcomers.find(
    (entry) => entry.contributor.id === "c_new_good",
  ) ?? snapshot.newcomers.newcomers[0];
const newcomerRate = snapshot.metrics.metrics.newcomerFalseFlag;

const campaign = snapshot.campaigns.campaigns[0];
const campaignMetrics = snapshot.metrics.metrics.campaign;
const sleepers = campaignMetrics.unobservedSleepers?.length ?? 0;
const projectCount = snapshot.projects.projects.length;

const examples = [
  {
    id: "disputed",
    tab: "A disputed contributor",
    context: `Assessed by ${disputed.evaluatingProject.name}`,
    subject: disputed.contributor.handle,
    outcome: outcomeLabel(disputedAssessment.outcome),
    tone: "neutral",
    note: disputedAssessment.note,
    caveat:
      "The same evidence can produce a different answer in a project that trusts the issuer. That disagreement is the design, not a bug.",
    facts: [
      {
        label: "Countable denouncements",
        value: disputedAssessment.summary.evidenceBackedDenounceSources,
      },
      {
        label: "Records ignored",
        value: disputedAssessment.summary.ignoredRecords,
      },
      {
        label: "Signal types",
        value: disputedAssessment.summary.signalTypes.length,
      },
      {
        label: "Account since",
        value: monthYear(disputed.contributor.accountCreatedAt),
      },
    ],
    bullets: disputedAssessment.reasons.map((reason) => reason.message),
    whatWouldChange: disputedAssessment.whatWouldChangeThis,
    link: {
      href: `/contributor?as=${disputed.evaluatingProject.id}&id=${disputed.contributor.id}`,
      label: "Open this contributor in the demo",
    },
  },
  {
    id: "newcomer",
    tab: "A newcomer with no history",
    context: "First weeks in the network",
    subject: newcomer.contributor.handle,
    outcome: outcomeLabel(newcomer.assessment.outcome),
    tone: "neutral",
    note: newcomer.assessment.note,
    caveat: null,
    facts: [
      { label: "Account age", value: `${newcomer.accountAgeDays} days` },
      { label: "Submissions", value: newcomer.behavior.submissions },
      { label: "Projects", value: newcomer.behavior.projects },
      {
        label: "Merge rate",
        value: `${Math.round(newcomer.behavior.mergeRate * 100)}%`,
      },
    ],
    bullets: [
      `${Math.round(newcomerRate.rate * 100)}% of ${newcomerRate.total} newcomers were flagged across ${newcomerRate.projectsEvaluated} projects in this world.`,
      "Starter tasks point to small, real-shaped work instead of guessing what to do first.",
    ],
    whatWouldChange: newcomer.assessment.whatWouldChangeThis,
    link: { href: "/newcomers", label: "Open the newcomer lane" },
  },
  {
    id: "campaign",
    tab: "A coordinated campaign",
    context: `${campaign.members.length} linked accounts across ${campaign.affectedProjects.length} projects`,
    subject: campaign.members[0].handle,
    outcome: `Campaign detected · confidence ${campaign.confidence.label}`,
    tone: "teal",
    note: campaign.confidence.reasons.slice(0, 2).join(" · "),
    caveat:
      sleepers > 0
        ? `${sleepers} quiet sleeper accounts in the same world leave no usable signal. The metrics report them as misses, not as perfect recall.`
        : null,
    facts: [
      { label: "Members", value: campaign.members.length },
      { label: "Affected projects", value: campaign.affectedProjects.length },
      {
        label: "Evidence references",
        value: campaign.provenance.evidence.total,
      },
      { label: "Confidence", value: campaign.confidence.label },
    ],
    bullets: campaign.signalsFired.map(
      (signal) =>
        `${signalLabel(signal.type)} — ${signal.memberCount} members showed this signal.`,
    ),
    whatWouldChange: null,
    link: { href: "/campaigns", label: "Inspect the campaign evidence" },
  },
];

const exploreCards = [
  {
    href: "/network",
    icon: Network,
    title: "Network map",
    body: `${projectCount} simulated projects with weighted trust links. Pick any project and see the same contributor through its eyes.`,
  },
  {
    href: "/campaigns",
    icon: Radar,
    title: "Campaign evidence",
    body: `A coordinated ring with ${campaign.signalsFired.length} independent signals, ${campaign.provenance.evidence.total} evidence references and a confidence breakdown.`,
  },
  {
    href: "/records",
    icon: ScrollText,
    title: "Signed log",
    body: "Read a hash-chained log, watch a tampered signature get rejected, then revoke a record and see the assessment change.",
  },
  {
    href: "/simulator",
    icon: SlidersHorizontal,
    title: "Simulator",
    body: "Rebuild the world from a seed, switch to the stealth scenario, and compare results across seeds.",
  },
];

const steps = [
  {
    icon: Fingerprint,
    title: "Sign the evidence",
    body: "Vouches and denouncements are Ed25519-signed records in a hash-chained log. A project verifies the signature and the chain before it uses anything.",
  },
  {
    icon: Scale,
    title: "Weigh it by trust",
    body: "Evidence from a project you barely trust counts for little. Escalation needs independent, evidence-backed sources above the project's own thresholds.",
  },
  {
    icon: ShieldCheck,
    title: "Judge, and show the reasoning",
    body: "Every assessment lists the records and behaviour it used, what it ignored, and what would change the answer. Neutral is the default.",
  },
];

const singleScore = [
  "One number is easy to game once the formula leaks.",
  "A newcomer with no history inherits suspicion.",
  "One disputed claim can follow you across every community.",
  "Communities cannot disagree, even when they have different standards.",
];

const perProject = [
  "Each project sets its own trust links and thresholds.",
  "Newcomers start neutral, with starter tasks instead of a penalty.",
  "A denouncement from an untrusted issuer is ignored — visibly.",
  "The reasoning ships with the decision, so it can be argued with.",
];

function Eyebrow({ children }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">
      {children}
    </p>
  );
}

function SectionHeading({ eyebrow, title, body }) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>
      {body && (
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-[15px]">
          {body}
        </p>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-teal focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-charcoal"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-charcoal/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex min-w-0 items-center gap-2.5">
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

          <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
            {SITE_LINKS.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="relative rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition-colors after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-teal/70 after:transition-transform after:duration-300 hover:bg-raised hover:text-ink hover:after:scale-x-100"
              >
                {label}
              </Link>
            ))}
          </nav>

          <Link
            href="/network"
            className="cta-sheen group inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:bg-teal/90"
          >
            Open demo
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
        <ScrollProgress />
        <div className="border-t border-line/70 md:hidden">
          <nav
            aria-label="Site sections"
            className="scroll-pane mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-3 py-1.5"
          >
            {SITE_LINKS.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden border-b border-line">
          <div
            aria-hidden="true"
            className="hero-aurora pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,212,187,0.17),_transparent_60%)]"
          />
          <div
            aria-hidden="true"
            className="hero-grid pointer-events-none absolute inset-0"
          />
          <HeroCanvas />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
              <div className="min-w-0">
                <Eyebrow>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="relative flex h-1.5 w-1.5 shrink-0"
                      aria-hidden="true"
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
                    </span>
                    decentralized contribution trust · simulated
                  </span>
                </Eyebrow>
                <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
                  Trust the work,{" "}
                  <span className="text-shimmer">not one global score.</span>
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                  TrustWeave is a working simulation of a trust network for open
                  source. Each project signs the evidence it produces, decides
                  which peers to trust, and judges contributors from what it can
                  verify — behaviour and provenance, not an AI-text score.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <Link
                    href="/network"
                    className="cta-sheen group inline-flex min-h-11 items-center gap-2 rounded-md bg-teal px-4 py-2.5 text-sm font-semibold text-charcoal transition-colors hover:bg-teal/90"
                  >
                    Open the interactive demo
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                  <Link
                    href="/explainer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:border-teal/40 hover:text-teal"
                  >
                    Why AI-text detection isn&apos;t enough
                  </Link>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  No login. Read-only toward real repositories. The simulator is
                  in memory, so its world resets when the API restarts.
                </p>

                <a
                  href="#examples"
                  className="group mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-teal"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line transition-colors group-hover:border-teal/50 group-hover:bg-teal/5">
                    <ArrowDown
                      className="h-3 w-3 motion-safe:animate-bounce"
                      aria-hidden="true"
                    />
                  </span>
                  see a real decision
                </a>
              </div>

              <div className="min-w-0">
                <LandingStatus initialHealth={snapshot.health} />

                {disputedRecord && (
                  <div className="mt-3 rounded-lg border border-line bg-panel/60 p-3 transition-colors hover:border-line-strong">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        <Fingerprint className="h-3 w-3 text-teal" aria-hidden="true" />
                        one record from the log
                      </p>
                      <span className="rounded border border-amber/40 px-1.5 py-0.5 font-mono text-[10px] text-amber">
                        {disputedRecord.type}
                      </span>
                    </div>
                    <p className="mt-1.5 break-all font-mono text-xs text-ink">
                      {disputedRecord.id} · issued by {disputedRecord.issuerProjectId}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        ["signature", disputedRecord.verification.signatureValid],
                        ["hash", disputedRecord.verification.hashIntact],
                        ["chain", disputedRecord.verification.chainIntact],
                      ].map(([label, ok]) => (
                        <span
                          key={label}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                            ok
                              ? "border-teal/30 bg-teal/5 text-teal"
                              : "border-danger/40 bg-danger/5 text-danger"
                          }`}
                        >
                          <Check className="h-2.5 w-2.5" aria-hidden="true" />
                          {label} {ok ? "valid" : "broken"}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      {disputed.evaluatingProject.name} still ignores it, because
                      that project gives the issuer zero effective trust. The
                      examples below show why.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          id="examples"
          className="scroll-mt-24 border-b border-line sm:scroll-mt-20"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <SectionHeading
              eyebrow="try it"
              title="How a project makes a decision"
              body="Three real examples from the seed-42 world. Switch tabs to see what one project concludes — and why another project might reach a different answer."
            />
            <div className="mt-5">
              <LandingExplorer examples={examples} />
            </div>
            <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-muted">
              These examples are read from the same snapshot the page ships with.
              The dashboard recomputes them against the running API.
            </p>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <Reveal>
              <SectionHeading
                eyebrow="explore"
                title="Four ways into the demo"
                body="Everything below runs in the browser against the simulated API. Nothing touches a real repository."
              />
            </Reveal>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {exploreCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <Reveal
                    key={card.href}
                    className="min-w-0"
                    delay={index * 70}
                  >
                    <SpotlightLink
                      href={card.href}
                      className="group flex h-full min-w-0 flex-col rounded-lg border border-line bg-panel/60 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-teal/40 hover:bg-panel hover:shadow-[0_24px_48px_-32px_rgba(56,212,187,0.5)]"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-teal/20 bg-teal/5 transition-colors group-hover:border-teal/40 group-hover:bg-teal/10">
                        <Icon
                          className="h-5 w-5 text-teal transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
                          aria-hidden="true"
                        />
                      </span>
                      <h3 className="mt-3 text-sm font-semibold text-ink">
                        {card.title}
                      </h3>
                      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted">
                        {card.body}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-teal">
                        Open
                        <ArrowRight
                          className="h-3 w-3 transition-transform group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </span>
                    </SpotlightLink>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <Reveal>
              <SectionHeading
                eyebrow="the model"
                title="Sign, weigh, then judge"
                body="The trust model is deliberately small enough to inspect. Each step leaves evidence you can open in the demo."
              />
            </Reveal>
            <ol className="mt-5 grid gap-3 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Reveal
                    as="li"
                    key={step.title}
                    delay={index * 80}
                    className="min-w-0 rounded-lg border border-line bg-panel/60 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-teal/30 hover:bg-panel"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-teal/20 bg-teal/5">
                        <Icon className="h-5 w-5 text-teal" aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        step {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-ink">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      {step.body}
                    </p>
                  </Reveal>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <Reveal>
              <SectionHeading
                eyebrow="the argument"
                title="Why not one global score?"
                body="A single reputation number centralises judgement. TrustWeave keeps judgement local and makes the disagreement visible."
              />
            </Reveal>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <Reveal className="min-w-0">
                <div className="h-full min-w-0 rounded-lg border border-line bg-panel/60 p-4 transition-colors hover:border-line-strong">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">
                      A single global score
                    </h3>
                    <span className="font-mono text-2xl font-semibold text-muted">
                      1
                    </span>
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {singleScore.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-xs leading-relaxed text-muted"
                      >
                        <span
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal className="min-w-0" delay={90}>
                <div className="h-full min-w-0 rounded-lg border border-teal/30 bg-teal/[0.04] p-4 transition-colors hover:border-teal/50">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">
                      Per-project judgement
                    </h3>
                    <span className="font-mono text-2xl font-semibold text-teal">
                      {projectCount}
                    </span>
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {perProject.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-xs leading-relaxed text-muted"
                      >
                        <span
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div
                    className="mt-3 flex flex-wrap gap-1 border-t border-teal/15 pt-3"
                    aria-hidden="true"
                  >
                    {Array.from({ length: projectCount }, (_, index) => (
                      <span
                        key={index}
                        className="h-1.5 w-1.5 rounded-full bg-teal/35 transition-all duration-300 hover:scale-150 hover:bg-teal"
                      />
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
            <Link
              href="/explainer"
              className="group mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:underline"
            >
              See an AI-assisted contribution and human spam judged side by side
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>

        <section
          id="limits"
          className="scroll-mt-24 border-b border-line sm:scroll-mt-20"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
            <Reveal>
              <div className="flex items-start gap-3 rounded-lg border border-amber/30 bg-amber/[0.05] p-4">
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink">
                    What this demo is not
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Every project, contribution, account age and label is
                    synthetic. The detector uses fixed thresholds that a patient
                    attacker can evade, and the stealth scenario shows it missing
                    three quiet accounts. This is a working model of the trust
                    argument, not a production reputation system.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <Reveal>
              <div className="relative overflow-hidden rounded-lg border border-line bg-panel/60 p-5 sm:p-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-teal/10 blur-3xl"
                />
                <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight text-ink">
                      Open the world and pull it apart.
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                      Start at the network, follow one contributor, then tamper
                      with the log and watch a project refuse to use it.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
                    <Link
                      href="/network"
                      className="cta-sheen group inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal px-4 py-2.5 text-sm font-semibold text-charcoal transition-colors hover:bg-teal/90"
                    >
                      Open the demo
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                    <InstallButton />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">TrustWeave</p>
              <p className="text-[11px] leading-relaxed text-muted">
                A simulated decentralized trust network. Demo only — no real
                repositories are contacted.
              </p>
            </div>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted"
          >
            <Link href="/network" className="hover:text-ink">
              Demo
            </Link>
            <Link href="/campaigns" className="hover:text-ink">
              Campaigns
            </Link>
            <Link href="/records" className="hover:text-ink">
              Records
            </Link>
            <Link href="/simulator" className="hover:text-ink">
              Simulator
            </Link>
            <Link href="/explainer" className="hover:text-ink">
              Explainer
            </Link>
          </nav>
        </div>
        <div className="border-t border-line/70">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted/80">
              seed-42 snapshot · live read-only API · 12 backend checks
            </p>
            <div className="flex items-center gap-4 text-[11px] text-muted">
              <Link href="#limits" className="transition-colors hover:text-ink">
                What this is not
              </Link>
              <Link
                href="#main"
                className="inline-flex items-center gap-1 transition-colors hover:text-teal"
              >
                Back to top
                <ArrowDown
                  className="h-3 w-3 rotate-180"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
