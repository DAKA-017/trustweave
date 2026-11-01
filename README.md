# TrustWeave

A decentralized trust network for open source contributions, built as a deterministic simulation for a hackathon.

TrustWeave has **no central authority and no global contributor score**. Every answer is computed *as a specific project*, from the signed records that project chooses to read, weighted by that project's own trust list. A contributor can be `caution` for one project and `normal_review` for another at the same moment.

> **Simulation notice:** all projects, contributors, pull requests, keys, records and ground-truth labels are simulated in memory. The application is read-only with respect to the outside world. It does not contact, read from, or post to any real repository. No AI-text detector is used anywhere.

## At a glance

| Item | Value |
| --- | --- |
| Live dashboard | https://trustweave-taupe.vercel.app/ |
| Live explainer page | https://trustweave-taupe.vercel.app/explainer |
| Live API base | https://trustweave-api-live.onrender.com/api |
| Source | https://github.com/DAKA-017/trustweave |
| Local dashboard | `http://localhost:3000/` |
| Local explainer page | `http://localhost:3000/explainer` |
| Local API base | `http://localhost:5050/api` |
| Local health check | `http://localhost:5050/api/health` |
| Backend | Node.js, Express 4 (ESM), Zod, Node `crypto` |
| Frontend | Next.js 16 App Router, React 19, Tailwind CSS 4, lucide-react |
| Storage | In-memory per visitor session; the default world is stateless and read-only. Restarting the backend clears sandboxes |
| Credentials | No AI or GitHub credentials; no login; no database |
| Verification | 12 backend-only checks: `npm run verify` (CLI), the verifier agent, and read-only `/api/verify/*` routes |
| Reports | `backend/reports/verification-latest.json` and `.md` (git-ignored) |
| Installable app | PWA (manifest + app-shell service worker) and an Electron wrapper (`npm run app`) |
| Deployment | Backend on Render, frontend on Vercel (see §15) |

## 1. Prerequisites

- **Node.js 20.12 or newer** (tested with Node 26.13 and npm 11.20). Node includes npm.
- **Git 2.54** (tested; only needed if you want version control).
- The Playwright test run downloads Chromium once.
- No database, Docker, login provider, or payment provider is required for local use. A free Render + Vercel deployment path is documented in §15.

Check your tools:

```bash
node -v
npm -v
git --version
```

If Node is missing, install the current LTS release from `https://nodejs.org/` (or `brew install node` on macOS). If Git is missing on macOS, run `xcode-select --install`, or install it with Homebrew.

## 2. Setup and run

### Backend

```bash
cd backend
npm install
npm test
npm start
```

The server reads `backend/.env` (exactly one env file; there is no `.env.example`). Create it with these non-secret values:

```dotenv
NODE_ENV=development
PORT=5050
FRONTEND_ORIGIN=http://localhost:3000
SIM_SEED=42
VERIFY_ON_START=true
VERIFY_INTERVAL_MINUTES=30
VERIFY_TOKEN=
```

The backend exposes `http://localhost:5050/api/health`. Port 5000 is occupied by macOS ControlCenter (AirPlay Receiver) on the machine this was built on, so the demo uses **5050**. If port 5000 is free for you, you may switch `PORT` to 5000, but you must then also change the frontend API URL below and restart both processes. `FRONTEND_ORIGIN` must remain the exact origin of the dashboard because CORS is restricted to it.

`VERIFY_ON_START` runs the 12 checks once when the server boots and prints the table. `VERIFY_INTERVAL_MINUTES` controls the background verifier agent (`0` disables it). `VERIFY_TOKEN` is empty by default, which keeps `POST /api/verify/run` closed with `403`; setting a non-empty value allows tooling to trigger a run by sending it in the `X-Verify-Token` header. The token is backend-only and must never appear in the frontend.

### Verification (backend only, no page)

There is no verification page and no verification code in the frontend. Every check runs on the server inside its own disposable sandbox — a private `SimulationHost` session created from the same seed — so tampering, revocation and rebuild checks can never change what a visitor sees.

```bash
cd backend
npm run verify     # runs the 12 checks, prints the table, exits non-zero on any failure
```

The table lists each check id, name, PASS/FAIL and duration, and prints details/errors for failures. The same table appears in the backend console on startup (configurable) and whenever the agent flips a check. Reports are written to `backend/reports/verification-latest.json` and `backend/reports/verification-latest.md`; the folder is git-ignored.

The verifier agent runs in a worker thread on a timer, keeps the last 20 runs in memory, logs only status changes (a pass→fail flip is logged with `console.error`), and never blocks request handling. Read-only routes for tooling:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/verify/latest` | Latest run (JSON), or `503` if none has completed yet |
| GET | `/api/verify/history` | In-memory run history (max 20, newest first) |
| POST | `/api/verify/run` | Trigger a run; requires `X-Verify-Token` matching `VERIFY_TOKEN` |

Without a configured token the POST route answers `403 VERIFY_TOKEN_REQUIRED`; with a configured token but a missing or wrong header it answers `403 FORBIDDEN`. A guard test fails the backend suite if any frontend file mentions these routes, the token, or any of the 12 check names.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npx playwright install chromium
npm run dev
```

Create `frontend/.env` with exactly:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5050/api
```

Open `http://localhost:3000/`. The frontend refuses to silently talk to a different port: if the API is unreachable it shows a retryable connection error.

In a production build (`npm run build && npm start`), the dashboard is an installable PWA: `/manifest.webmanifest` declares standalone display and original maskable icons, `/sw.js` caches only the app shell (never `/api/` responses, assessments or records), and `/offline` is the fallback for navigations that are not cached. Chromium/Edge show an **Install app** button via `beforeinstallprompt`; iPadOS/iOS Safari shows an “Add to Home Screen” hint. Service worker registration is disabled in `next dev` to avoid stale development caches.

### Installable app and desktop wrapper

The root package is a thin orchestrator over the existing backend and frontend:

```bash
npm install --prefix desktop     # once: Electron + electron-builder
npm run app                      # builds the frontend, then opens the Electron window
npm run app:smoke                # same, but loads the window, screenshots it and quits
npm run package:app              # installer for the current OS (dmg / nsis / AppImage)
npm run package:app:dir          # unpacked app for the current OS (faster, for testing)
```

The Electron wrapper in `desktop/main.js` picks two free loopback ports, starts the backend and `next start` on them, waits for `/api/health` and the dashboard to answer, then opens the window. It stops both child processes on quit and refuses to start if the frontend build is missing. Because the backend port is chosen at runtime, the wrapper injects the actual API base URL through a preload bridge (`desktop/preload.cjs`); the browser build still uses `NEXT_PUBLIC_API_BASE_URL` from `frontend/.env` only. Packaged builds place the backend and frontend under `Resources/` and reuse the locally installed Electron binary via `electronDist`. Installers are unsigned by default: `CSC_IDENTITY_AUTO_DISCOVERY` is turned off, so macOS may ask you to confirm the first launch.

### End-to-end tests

```bash
cd frontend
npm run test:e2e    # dashboard flows (backend + next dev)
npm run test:pwa    # production-build PWA checks on http://127.0.0.1:3100
```

The Playwright config reuses already-running servers or starts the backend and frontend itself. Before each test it pins a per-tab session id in `sessionStorage` and resets that visitor's sandbox to seed 42, 30 projects and 12 campaign accounts; the suite also restores that sandbox when it finishes. Tests run sequentially inside that one session, but no other visitor's world is touched. The PWA suite is skipped under the default config because it needs a production server; `playwright.pwa.config.js` builds and serves one on port 3100.

## 3. Exact URLs

- Dashboard: `http://localhost:3000/`
- Direct views: `/network`, `/project`, `/contributor`, `/campaigns`, `/newcomers`, `/records`, `/simulator`
- PWA shell: `/manifest.webmanifest`, `/sw.js`, `/offline`, `/icons/*`
- Backend verification: `/api/verify/latest`, `/api/verify/history` (and token-guarded `POST /api/verify/run`)
- Deep links: `/project?as=p06`, `/contributor?as=p02&id=c_disputed`, `/records?project=p03`, `/records?project=p07&tamper=signature`
- Simulator world URL: `/simulator?seed=99&size=20&campaignSize=10&scenario=stealth`
- Why-not-AI-text explainer: `http://localhost:3000/explainer`
- API health: `http://localhost:5050/api/health`
- Deterministic read-only world: `http://localhost:5050/api/health?seed=99&size=20&campaignSize=10&scenario=stealth`
- Example assessment as p06: `http://localhost:5050/api/contributors/c_disputed/assessment?asProject=p06`
- Example signed log: `http://localhost:5050/api/records?projectId=p07`
- Example tamper demo: `http://localhost:5050/api/records?projectId=p07&tamper=signature`

## 4. Demo walkthrough

Every view is pre-rendered from an embedded seed-42 snapshot in `frontend/lib/snapshot.json`, so the first paint shows real projects, records and campaign evidence even while the API host is cold or unreachable. When the API answers, the view refreshes in the background; a failed refresh keeps the snapshot instead of replacing the page with a spinner and retries the health check automatically.

Every view has a real URL, and every selection is stored in it. Clicking a graph node changes the address to `/project?as=p06`, so the back button, refresh, and shared links all keep the same view. Records accepts `?project=` and `?tamper=`, and Contributor accepts `?as=` and `?id=`.

1. **Network.** Open `http://localhost:3000/`. The map shows the 24 strongest trust links by default so it stays readable; turn on **Show every link** for all 88 connections. **Find a project** by name, id or maintainer handle, and tick **Only links touching** to narrow the map to one project's relationships. Click the `spruce` circle (`p06`) or use the project list. The badge changes to “looking through p06”, and the Project view opens. Switch “Evaluate as” between `p06`, `p08` and `p10`; the contributor totals and outcomes change because each project reads a different slice of the network. A **Words made simple** panel defines trust link, vouch, denounce, newcomer and the other labels.
2. **Project view.** As `p10 · Jade Workers`, 21 contributors are assessed from p10's own trust list. The twelve `nova-build-*` accounts are flagged, while `kai-ai-assisted` is under normal review. The reasons are ordered and linked to signed records or PR evidence.
3. **Contributor explanation.** Open **Contributor**. `marco-disputed` is normal review as `p10` because p10 has no applicable signed record. Select `p06`: the outcome becomes **Caution** from a single evidence-backed denouncement issued by p07 (effective trust 0.9). Select `p08`: it returns to **Normal review** because p08 gives p07's record zero weight. Then enter `c_human_spam` and assess as `p10`: **Flagged** with near-duplicate content, burst timing, high volume/low merge and an evidence-backed denouncement.
4. **Coordinated campaign.** Open **Campaigns**. `campaign_01` links 12 accounts across 24 projects with five independent signal types and high confidence. Each signal lists its member count, weight and PR/record references; each member lists the signals it triggered; the **Evidence and provenance** panel shows the detector inputs, exact thresholds and a 156-reference breakdown; and the timeline shows the burst. No campaign is reported without at least two signal types and two linked accounts. Then open **Simulator**, choose **Stealth campaign** and rebuild: the same ring spreads over days, rewords content near the 0.82 similarity threshold and merges some PRs, so the detector finds 9 of 12 active accounts and honestly lists the 3 quiet accounts and 3 sleepers it misses.
5. **Newcomer lane.** Open **Newcomers**. Twelve accounts are neutral. Accounts with submissions but no signed records say “No signed records yet. Treated as neutral.”; accounts with neither say “No history. Treated as neutral.” They receive starter-task suggestions, not blocks. Click a **Simulated sponsor vouch** button. The returned record is Ed25519-signed and verified; the success line shows its record id and active status.
6. **Records and tamper demo.** Open **Records**. The page starts on `p07 · Teak Serialization`, whose log contains both a vouch and a denouncement; the type strip above the log shows the total vouches, denouncements and revocations across all projects, and each row shows `signature ok`, `hash intact` and `chain intact`. Use **Add a signed note** to append a signed `vouch`, `denounce` or `revoke`; the success line shows the record id, signature validity and active state, and the log switches to the signer. A revocation must reference a record issued by the same project, and the revoked entry then shows `valid · revoked`. Choose **Tamper signature**: the log becomes rejected and the modified entry is shown with `invalid_signature`. Choose **Break chain**: the middle entry is shown with `broken_chain`. The banner states that only a copy was modified; the stored log is unchanged. **Verified** restores the real log. Open `/records?project=p03` for a log of twelve vouches, or `/records?project=p02` for one of twenty-eight denouncements.
7. **Simulator.** Open **Simulator**. Set seed `99`, projects `20`, campaign accounts `10`, and choose **Obvious campaign** or **Stealth campaign**, then click **Rebuild simulation**. The world is rebuilt deterministically inside your own sandbox; nobody else's view changes. **Measure across seeds** runs seeds 42, 7, 99, 123 and 2026 for both scenarios and reports precision, recall, newcomer false flags, variance and the exact ground-truth accounts each seed missed, with reasons.
8. **Why not AI-text.** Open **Why not AI-text** in the sidebar or `http://localhost:3000/explainer`. The AI-assisted contributor and the human-written spammer are judged by the same behavioral rules; the AI-assisted contributor is under normal review and the spammer is flagged. The page states the simulation caveat and the false-positive risks of text-origin detection.
9. **Live verification.** Open **Verify**. Twelve checks run in the browser against the live API and show PASS/FAIL with the actual evidence: data load, graph URL, bounded trust cycle, reproducible rebuild, campaign detection and provenance, newcomer neutrality, vouch/denounce verification, revocation/expiry, both tamper modes and record signing. The page signs one p08 vouch, rebuilds seed 7 twice, restores seed 42 and reloads once. All of this happens inside the visitor's own sandbox; the shared read-only default world is never modified. This is the fastest audit path.

After a simulator change, rebuild seed `42`, size `30`, campaign `12` with the **Obvious campaign** scenario to return to the documented demo state.

## 5. Architecture

```
backend/
  app.js                 Express app factory (CORS, 64 kb JSON limit, routes, errors)
  server.js              process entry point
  config/                env loading and defaults
  routes/api.js          API route table
  controllers/           HTTP parsing and response shaping
  services/
    records.js           append-only per-project hash chains, signing, verification
    trust-engine.js      effective trust, independence, outcomes, reasons
    campaign-detector.js six behavioral signals and campaign clustering
    simulator.js         deterministic seeded world and hard cases
    simulation-host.js   in-memory host used by requests
    metrics.js           precision/recall/newcomer/explanation metrics
  models/schemas.js      Zod data-model and request validation
  middleware/            not-found and error formatting
  utils/                 canonical JSON, Ed25519, SHA-256, PRNG, similarity
  test/                  Node test runner + Supertest
frontend/
  app/                   App Router; dashboard, verify and explainer pages
  components/            ten views and shared UI/state components
  hooks/useApiResource.js abortable data loading with stale-key protection
  lib/api.js             typed-ish API client and error mapping
  lib/format.js          date, rate, hash and outcome formatting
  tests/                 Playwright end-to-end flows
  playwright.config.js   starts/reuses both servers
```

Requests flow **route → controller → service → validation/simulation state → response**. There is no database. One process hosts every simulated project, but it is explicitly *not* an authority: each project has its own key and log, and each assessment uses only that project's trust configuration. Gossip is simulated by having a requester pull and independently verify a peer's log.

### Visitor worlds and isolation

The shared default world is **read-only and identical for everyone**. Reads without a session rebuild a deterministic world from the `seed`, `size`, `campaignSize` and `scenario` query parameters (or the `X-TrustWeave-World` JSON header) and cache it; nothing a visitor does can mutate it.

Anything that writes — rebuilding the simulator, appending a record, or a verifier sandbox action — requires an `X-TrustWeave-Session` header with 6–64 characters from `[A-Za-z0-9_-]`. The frontend creates one id per browser tab in `sessionStorage` and sends both headers on every call, including the world parameters, so a serverless instance can rebuild the same base world. That session gets its own in-memory sandbox (at most 200 per process, oldest evicted), and its rebuilds and records are invisible to every other session and to the default world. A write without a session is rejected with `403 READ_ONLY_WORLD`; a malformed session id is rejected with `400 BAD_REQUEST`.

`backend/test/isolation.test.js` proves this with two simulated visitors: each one rebuilds a different seed, one appends a record, and neither can observe or alter the other's world or the default. Because sandboxes live in process memory, they do not follow a visitor across server instances and are cleared on restart; the deterministic base world is always reconstructable from the URL.

## 6. Record format and verification

A record is a signed, append-only JSON object:

```json
{
  "id": "r_p07_3",
  "type": "denounce",
  "issuerProjectId": "p07",
  "subjectContributorId": "c_disputed",
  "createdAt": "2026-10-30T12:00:00.000Z",
  "reasonCode": "repeated_low_quality_patch",
  "evidence": [
    { "kind": "pull_request", "ref": "pr_0091" }
  ],
  "previousRecordHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "signature": "base64 Ed25519 signature"
}
```

- `previousRecordHash` points at the previous signed record's SHA-256 hash, or 64 zeros for the first entry.
- The signature covers the **canonical JSON of the record without its `signature` field** (recursively sorted keys). The canonical form is signed with the issuer project's Ed25519 private key.
- The log entry stores `hash = SHA-256(canonical record including its signature)`. Verification recomputes the signature, the entry hash, and the link from the previous record.
- A `revoke` record must reference `subjectRecordId` and may only revoke a record issued by the same project. `expiresAt` makes a record expired. Both expired and revoked records remain visible in verification output but are ignored by the evaluator with an explicit reason.
- Invalid records are shown as rejected with their failed checks: `invalid_signature`, `hash_mismatch`, or `broken_chain`. They are never silently dropped.
- Keys are deterministic for reproducibility (derived from a namespace with SHA-256). This is **not** real identity management; real deployments would generate keys on maintainers' devices.

## 7. Per-project trust and transitive decay

Effective trust from project X to project Y is the **strongest simple path** from X to Y:

```
trust(X, Y) = max over simple paths P from X to Y of  product(edge weights along P)
```

- `trust(X, X) = 1`.
- At most 3 edges by default (`maxDepth: 3`); depth counts edges.
- Cycles are tracked and terminated; the strongest path wins, not the first path found.
- Edges with weight 0 are ignored.
- Example: `a → b (0.8)`, `b → c (0.8)`, `c → d (0.8)` gives `trust(a, b)=0.8`, `trust(a, c)=0.64`, `trust(a, d)=0.512`. A depth limit of 2 stops at `c`.
- A project with no path to an issuer has effective trust 0; that issuer's records are **ignored with a visible reason**, not counted as negative.

Independence is also project-relative. Two denouncing projects count as **one source** if they share a maintainer or are in the same mutual-trust cluster (both directions have weight at least 0.5). This prevents a group of allied projects from manufacturing “two independent” denouncements.

## 8. Outcomes and safeguards

Every assessment returns one graded outcome plus ordered, human-readable reasons with references. Weights are signal weights, **not a spam probability**.

| Outcome | Condition |
| --- | --- |
| `normal_review` | No threshold reached. Contributors with no signed records land here: activity without records gets “No signed records yet. Treated as neutral.”, and no activity at all gets “No history. Treated as neutral.” |
| `caution` | Exactly one independent, evidence-backed denouncement with total weight ≥ 0.5, **or** exactly one behavioral signal type. |
| `flagged` | At least two independent, evidence-backed denouncement sources with total weight ≥ the flag threshold (default 1), **or** at least two independent behavioral signal types. |
| `coordinated_campaign` | Campaign-level only: at least two linked accounts and at least two distinct signal types. |

Safeguards:

- **No global score.** There is no endpoint that returns a universal reputation number. Assessments require `asProject`.
- **Evidence is required for denouncements.** A denouncement with an empty evidence list is ignored with `no_evidence`, even from a trusted project.
- **Zero trust contributes zero.** Records from untrusted issuers are explained and discarded.
- **Mass denouncers are down-weighted.** If one issuer denounces at least 5 contributors and more than 50% of active contributors, its factor is `max(0.15, 0.5 / share)`.
- **One weak signal cannot punish.** A single signal type is capped at `caution`; flagging by signals requires at least two independent types.
- **Correlated denouncers are one source.** Shared maintainers or mutual-trust clusters collapse into one source before the two-source test.
- **Duplicate evidence is one source.** If two otherwise independent projects cite the identical evidence set, the second is recorded as corroboration with a `duplicate_evidence_denouncement` reason instead of adding a second source. Different evidence still counts independently.
- **Vouches are capped.** At most 0.5 support per single source and 1.0 total; a vouch without evidence counts half. Vouches are recorded as support and **never erase** evidence-backed denouncements.
- **Appeals by expiry/revocation.** Expired or revoked records are ignored with reasons, and the outcome can return to normal review.
- **Newcomers are never auto-blocked.** No signed records and no signals means normal review, a note that matches the evidence (activity without records versus no history at all), starter-task suggestions and an optional sponsor vouch.
- **All verification failures are visible.** Rejected records and ignored records are listed rather than hidden.

## 9. Campaign detection

The detector is network-wide (it looks across projects) and uses six independent behavioral signals. There is no text-origin classifier; the `contentSample` field is used only to measure near-duplicate word shingles.

| Signal | Weight | Rule |
| --- | --- | --- |
| `near_duplicate_content` | 0.80 | Word 4-gram Jaccard ≥ 0.82 across at least 3 projects |
| `burst_timing` | 0.70 | ≥ 5 PRs across ≥ 4 projects inside 48 hours |
| `new_accounts_in_sync` | 0.75 | Accounts ≤ 21 days old submit ≥ 6 PRs across ≥ 6 projects inside a 6-hour window |
| `vouch_ring` | 0.70 | Vouch-graph strongly connected component with at most one outside vouch; ≥ 3 accounts (or 2 very new accounts) |
| `high_volume_low_merge` | 0.65 | ≥ 10 submissions with a merge rate below 15% |
| `denouncement_burst` | 0.80 | ≥ 3 evidence-backed denouncements from ≥ 2 independent sources within 30 days |

Accounts are clustered when they share near-duplicate content, synchronized new-account activity, or a vouch ring. A cluster is reported only if it has **at least two accounts and at least two distinct signal types**. Confidence is `high` with ≥ 4 signal types and ≥ 8 members, `medium` with ≥ 3 types, otherwise `low`. Every signal includes evidence references, its member count and its weight, and the campaign includes its member list, affected projects, confidence reasons and a PR timeline (the API keeps up to 400 events; the UI displays 120 and says so).

Each campaign also carries a `provenance` block: detector id (`behavioral-signals-v1`), input counts (projects, contributors, PRs and active records), the exact thresholds used, an evidence breakdown by reference kind, the number of members that carry a signal, and the generation timestamp. Each member lists the signal types it triggered and its PR count. The Campaigns page renders this block beside the findings, so a report can be traced to concrete PRs, records and thresholds. The same seed reproduces the same campaign byte-for-byte.

The **stealth** simulator scenario uses these same thresholds and does not tune them. It spreads the ring over about twelve days (avoiding `burst_timing`), ages the accounts (avoiding `new_accounts_in_sync`), rewords some content so many pairs sit just below 0.82 while one group stays just above it (`near_duplicate_content` fires partially), merges a few PRs, and keeps three members quiet enough to produce no signal at all. The result is an intentionally partial detection: 9 of 12 active accounts caught and 3 quiet accounts plus 3 sleepers missed, reported per seed with a reason for each miss. The obvious scenario is unchanged.

Simulated PR content is used for duplicate detection only. It is never inspected for AI authorship.

## 10. Seeded simulator

- Deterministic PRNG (`mulberry32`) and a fixed simulation clock: `2026-11-01T12:00:00.000Z`.
- Default world: 30 projects, 52 contributors, 417 pull requests, 126 signed records. Configurable to 20–50 projects and 10–15 campaign accounts.
- The injected campaign has 12 accounts, 24 target projects, 3 ground-truth sleeper accounts that never post or sign, and a selectable scenario.
- **Obvious** (default): 12 new accounts submit identical content to 24 projects within 16 hours, firing all five observable signal types (the denouncement-burst signal belongs to the separate mass-denouncer hard case).
- **Stealth**: the same 12 accounts are 48–81 days old and spread submissions over about twelve days; group 0 reuses identical wording (pairs just above 0.82), groups 1 and 2 add a per-PR note (pairs just below 0.82), some PRs are merged, and the last 3 accounts stay quiet with four ordinary PRs each. Only `near_duplicate_content`, `vouch_ring` and `high_volume_low_merge` fire, and not on every member. Thresholds are unchanged.
- Twelve neutral newcomers, including honest newcomers, a non-native English writer and an AI-assisted contributor.
- Hard cases exercised by tests and the Simulator view: honest multi-project newcomer, legitimate AI assistance, human-written spam, non-native phrasing, no-evidence malicious denouncement, per-project divergence, campaign member, sybil project with zero weight, and a low-credibility mass denouncer.
- Same seed ⇒ same keys, logs, PRs, signals and metrics. Different seeds produce independent worlds.

## 11. Measured results (and their limits)

Current default world (seed 42, 30 projects, 12 campaign accounts):

- Campaign precision **1.000** (12 of 12 predicted members are in the ring), recall **0.800** (12 of 15 ground-truth members; 1 campaign over 24 affected projects, 5 signal types).
- Observable-member recall **1.000** (12 of 12 members who left a trace). The 3 remaining ground-truth accounts are sleepers that never posted or signed, so behavior-only detection cannot see them.
- Newcomer false flags **0 of 14** across 30 evaluating projects.
- Explanation completeness **29 / 29** non-neutral assessments with at least one reference.
- Hard cases **9 / 9**.
- Counts: 30 projects, 52 contributors, 417 PRs, 126 signed records.

Multi-seed run (seeds 42, 7, 99, 123, 2026; 30 projects, 12 campaign accounts):

| Scenario | Precision mean | Recall mean | Observable recall mean | Newcomer false flags max | Hard cases | Detector misses |
| --- | --- | --- | --- | --- | --- | --- |
| Obvious | **1.000** | **0.800** | **1.000** | **0.000** | **45 / 45** | 0 active accounts; 5 × 3 sleepers |
| Stealth | **1.000** | **0.600** | **0.750** | **0.000** | **45 / 45** | 5 × 3 quiet accounts `c_campaign_10..12`; 5 × 3 sleepers |

Every one of the five stealth seeds produces the same result: 9 predicted members out of 12 active accounts (observable recall 0.750) and 9 of 15 including sleepers (recall 0.600), with zero false positives and zero newcomer false flags. The three quiet accounts each submitted four ordinary PRs, produced no behavioral signal and were not linked to the ring; the API and Simulator list each miss by handle, category and reason. No threshold was lowered to improve these numbers. The obvious scenario is byte-for-byte unchanged and still fires all five observable signal types.

- Explanation completeness minimum **1.000** for both scenarios; measured variance **0** for all reported rates.

**Honest caveat:** these are synthetic, idealized results. The generator is constructed to contain a detectable campaign and its labels are known to the simulator. A recall below 1.000 comes from the deliberate sleeper and quiet-account limits, not from field measurement; the remaining 1.000 values describe this controlled simulator only. The detector has not been calibrated against real repository data. The metrics demonstrate that the implemented safeguards behave as specified inside this simulation, nothing more.

## 12. API

All responses are JSON. Request validation uses Zod. The JSON body limit is 64 kb. CORS only accepts `FRONTEND_ORIGIN` and allows the `X-TrustWeave-Session`, `X-TrustWeave-World` and `X-Verify-Token` headers.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service/simulation status and counts |
| POST | `/api/simulate` | Rebuild **your sandbox** from `{ seed?, size?, campaignSize?, scenario? }`; requires a session header |
| GET | `/api/projects` | Projects, declared trust edges, public keys, counts |
| GET | `/api/projects/:id/view` | Assessments as one project |
| GET | `/api/contributors/:id/assessment?asProject=...` | One explainable assessment |
| GET | `/api/newcomers` | Neutral newcomer lane and sponsor options |
| GET | `/api/campaigns` | Detected campaigns, signals, members, evidence and provenance |
| GET | `/api/records` | Record project summaries |
| GET | `/api/records?projectId=...&tamper=none\|signature\|chain` | Full log and verification/tamper demo |
| POST | `/api/records` | Append a signed vouch, denounce or revoke to your sandbox; requires a session header |
| GET | `/api/metrics` | Current-seed precision/recall, newcomer, explanation, hard cases, missed accounts |
| GET | `/api/metrics?multi=1` | Independent multi-seed metrics for both scenarios, plus variance and aggregate |
| GET | `/api/demo/explainer` | AI-assisted vs human-written side-by-side evidence |
| GET | `/api/verify/latest` | Latest backend verification run (read-only; `503` until the first run completes) |
| GET | `/api/verify/history` | Last 20 in-memory verification runs, newest first |
| POST | `/api/verify/run` | Run the checks now; requires `X-Verify-Token` = `VERIFY_TOKEN`, otherwise `403` |

Reads accept `?seed=&size=&campaignSize=&scenario=` or the same JSON in `X-TrustWeave-World`; without a session they resolve the shared **read-only** world. Writes also need `X-TrustWeave-Session: <id>`. A missing session fails with `403 READ_ONLY_WORLD`, and a malformed one with `400 BAD_REQUEST`.

Example record creation:

```http
POST /api/records
Content-Type: application/json
X-TrustWeave-Session: demo-visitor

{
  "issuerProjectId": "p01",
  "subjectContributorId": "c_new_good",
  "type": "vouch",
  "reasonCode": "newcomer_sponsor_vouch",
  "evidence": [{ "kind": "note", "ref": "simulated sponsor vouch from dashboard" }]
}
```

Errors consistently use:

```json
{ "error": { "code": "SOME_CODE", "message": "Human-readable explanation" } }
```

## 13. Tests

```bash
cd backend && npm test && npm run verify
cd frontend && npx eslint . && npm run build && npm run test:e2e && npm run test:pwa
```

Verified in this build:

- **68 backend tests pass** (Node test runner + Supertest): the original model, simulation, trust and campaign suites, plus backend verification coverage — all 12 checks pass in isolated sandboxes, identical seeds produce identical results, a broken signature and a broken hash chain each make the records check fail, verification routes stay read-only and the POST route stays closed without a token, two visitors' sandboxes never share writes, and a guard test fails if any frontend file imports/calls verification routes or names a check.
- **12 Playwright Chromium flows pass** against the dashboard, unchanged from the prior build except that the old Verify-page flow was removed: view-as-project switching, contributor explanations, campaign evidence, newcomer vouching, tamper demos, graph interactions, revocation, persistence across reload, retryable API errors, phone-width overflow, deep links, and multi-seed rebuilds.
- **3 production-build PWA checks pass** via `npm run test:pwa`: the manifest and every icon resolve with the right content type, the service worker registers and caches the app shell (with zero `/api/` entries), and an uncached navigation offline shows the `/offline` fallback.
- **`npm run verify` reports 12/12** and exits 0; the startup run prints the same table. The CLI, the startup run, the agent and the token-guarded route all write `backend/reports/verification-latest.json` and `.md`.
- **Electron wrapper verified twice**: once from the source tree and once from the unpacked packaged app, both on free ports, both reaching the dashboard with live API data, printing 12/12, and releasing their ports on quit.
- Frontend ESLint passes; the production build generates all static routes including `/manifest.webmanifest` and `/offline`. Screenshots at 1440×1000 and 390×844 show no page-level horizontal overflow or uncaught errors on the Network view; the phone-width Playwright test covers all views.

### Checklist-to-evidence map

| Priority | Item | Where it is proven |
| --- | --- | --- |
| P0 | Verification suite completes reliably | `npm run verify`, the startup run, the verifier agent and `/api/verify/latest`; `backend/test/verification.test.js` asserts 12/12 and determinism. |
| P0 | Record signing and tamper detection | `backend/test/records.test.js` (signature, hash-chain, expiry/revocation), API tests, the Records Playwright flow, and the `sign`/`tamper`/`revocation` checks. |
| P0 | Campaign detection, legitimate and suspicious | `backend/test/campaign-detector.test.js` proves a legitimate merged release wave fires only `burst_timing` and no campaign, while the seeded campaign fires 5 signal types; the `campaign` check asserts the live 12-member result. |
| P0 | Newcomer fairness | `backend/test/api.test.js`, the Newcomers Playwright flow, and the `newcomer` check assert `normal_review` + `newcomer_neutral` and zero false flags. |
| P1 | Circular trust, duplicate evidence and revocation | `trust-engine.test.js` checks bounded cycle values and identical evidence counting once; `records.test.js` and the `trust`/`revocation` checks read a revoked p13 record and an expired p12 record as valid-but-inactive. |
| P1 | Campaign evidence and provenance | Every campaign exposes `provenance` (inputs, thresholds, evidence breakdown, member signal types); the Campaigns page renders it and the `provenance` check validates it. |
| P1 | Reproducible simulator | `simulation.test.js` compares two builds; the API test rebuilds seed 7 twice and compares counts, members, signals and record hashes; the `simulator` check repeats that in a sandbox. |
| P1 | Installable app | `npm run test:pwa` (manifest, service worker scope, shell-only cache, offline fallback) and the Electron smoke run against both the dev tree and the packaged app. |
| P2 | Dashboard polish and demo | Real URLs, snapshot-first paint, responsive Playwright checks, campaign provenance panel, and the §4 walkthrough. |

## 14. Why AI-text detection alone is insufficient

- AI-text detectors produce false positives, including on non-native English writers with unusual phrasing.
- AI-assisted work can be correct and valuable. How a patch was drafted is not evidence about whether the patch is good.
- Spam is a **behavior pattern**: volume, timing, cross-project similarity, account age, network structure and maintainer outcomes.
- TrustWeave never inspects text origin. The same behavioral rules run on both explainer examples, and the outcomes, reasons and references are shown side by side.
- The “human-written spam” label comes from simulator ground truth. The engine itself sees only PR behavior, signed records and network signals.

## 15. Deployment (Vercel + Render)

The app is deployed and publicly reachable:

| Piece | Live URL | Host | Root directory | Build | Start |
| --- | --- | --- | --- | --- | --- |
| Frontend | https://trustweave-taupe.vercel.app/ | Vercel Next.js project | `frontend` | `next build` (Vercel default) | Vercel-managed |
| API | https://trustweave-api-live.onrender.com/api | Render Web Service (free, oregon) | `backend` | `npm ci --omit=dev` | `npm start` |
| Health | https://trustweave-api-live.onrender.com/api/health | | | | |
| Source | https://github.com/DAKA-017/trustweave | GitHub (public) | | | |

No database, Docker, login or credentials are needed. The included `render.yaml` documents the backend service.

The live deployment was verified: the dashboard loads `/api/projects` through CORS, every view renders, `POST /api/simulate` rebuilds the world (tested with seed 99 and then reset to seed 42), and `OPTIONS` preflight returns `Access-Control-Allow-Origin` for the exact Vercel origin only.

### 15.1 Repository setup used

`frontend/` shipped with a nested `.git` from `create-next-app`. It was moved aside so the root repository owns all files:

```bash
cd /path/to/94aa1ca4
mv frontend/.git ../trustweave-frontend-git-backup
git init -b main
git add .
git commit -m "TrustWeave: decentralized trust network simulation"
git remote add origin https://github.com/DAKA-017/trustweave.git
git push -u origin main
```

`mv` keeps the old repository next to the project instead of deleting it. The root `.gitignore` and `backend/.gitignore` keep `node_modules`, `.env`, `.next` and test output out of the commit. Neither `.env` is committed, and `frontend/.vercelignore` keeps local env files and build artifacts out of future Vercel uploads.

### 15.2 Backend on Render

The live service was created non-interactively from the same repository:

- Root directory `backend`, runtime Node, plan free, region `oregon`.
- Build `npm ci --omit=dev`, start `npm start`, health check `/api/health`.
- Environment: `NODE_ENV=production`, `SIM_SEED=42`, `FRONTEND_ORIGIN=https://trustweave-taupe.vercel.app`.

The equivalent Dashboard path is **New → Blueprint** with `render.yaml`, or **New → Web Service** with the settings above. `render.yaml` marks `FRONTEND_ORIGIN` as `sync: false`, so set it to the exact frontend origin after the frontend exists.

Platform environment variables take precedence over `backend/.env`, which is not deployed. Do not set `PORT`; Render injects it and `server.js` reads it. Changing only `FRONTEND_ORIGIN` requires a redeploy, because CORS is read at startup.

### 15.3 Frontend on Vercel

The live project is `dilli-police1/trustweave` with root directory `frontend` and production alias `https://trustweave-taupe.vercel.app`. Its Production environment contains:

```
NEXT_PUBLIC_API_BASE_URL=https://trustweave-api-live.onrender.com/api
```

`NEXT_PUBLIC_API_BASE_URL` is inlined at build time, so changing it requires a new build, not just an env edit. The value must end in `/api` exactly once. To recreate the project from scratch, import the repository, set the root directory to `frontend`, add the variable, and deploy.

### 15.4 CORS

Render's `FRONTEND_ORIGIN` is the exact Vercel production origin (`https://trustweave-taupe.vercel.app`, no trailing slash). Origins matching `https://trustweave-*.vercel.app` are also accepted so deployment-specific and preview URLs for this project can reach the API; every other origin is rejected. To test an unrelated preview host, temporarily change `FRONTEND_ORIGIN` and redeploy.

### 15.5 Verify a deployment

```bash
curl -s https://trustweave-api-live.onrender.com/api/health
curl -i -s -X OPTIONS https://trustweave-api-live.onrender.com/api/health \
  -H "Origin: https://trustweave-taupe.vercel.app" \
  -H "Access-Control-Request-Method: GET"
```

The second response includes `Access-Control-Allow-Origin: https://trustweave-taupe.vercel.app`. Then open the dashboard and click through Network, Project view, Contributor, Campaigns, Newcomers, Records, Simulator and the explainer page.

Backend verification is exposed read-only for tooling:

```bash
curl -s https://trustweave-api-live.onrender.com/api/verify/latest
curl -s https://trustweave-api-live.onrender.com/api/verify/history
```

If `VERIFY_TOKEN` is set on the service, triggering a new run requires the token in a header and is intentionally not exercised from the browser:

```bash
curl -s -X POST https://trustweave-api-live.onrender.com/api/verify/run \
  -H "X-Verify-Token: $VERIFY_TOKEN"
```

The public deployment currently running predates the verifier, PWA and desktop wrapper; these routes and assets appear only after the next authorized redeploy.

### 15.6 Deployment limitations

- **In-memory state.** Every restart or redeploy rebuilds the seed-42 world; `POST /api/simulate` also resets it. Visitors without a session share the read-only default world; each session (one browser tab) gets a private sandbox, so writes cannot leak between visitors. Verification reports are files on the service's ephemeral disk and disappear on restart.
- **Free-tier cold starts.** Render's free web service sleeps after inactivity; the first request can take 30–60 seconds. The static page already shows the seed-42 snapshot while that request runs, and a retryable connection notice appears if it fails.
- **Snapshot age.** The embedded snapshot is a real seed-42 capture, not a live mirror. It is refreshed by the API when reachable; after a simulator rebuild or new signed records, reload the page to refetch. Regenerate `frontend/lib/snapshot.json` from a reset seed-42 world when the default simulation changes.
- **HTTPS on both sides.** Serving one side over HTTP causes mixed-content or CORS failures.
- **Deployment origins.** Production and project preview URLs are different origins. Only the configured origin and `trustweave-*.vercel.app` hosts are accepted.
- **Still read-only.** The deployed app never contacts a real repository.

## 16. Known limits and out of scope

### Fixed thresholds a patient attacker can evade

The detector uses fixed rules: 0.82 word-shingle similarity, 5 PRs across 4 projects in 48 hours, new accounts within 21 days acting inside 6 hours, ≥ 10 submissions with a merge rate below 15%, and at most one outside vouch for a ring. They are configurable in code but there is no calibration workflow against labeled real data. An attacker who stays just under every rule — spreading work over weeks, rephrasing content, merging enough PRs, and keeping accounts old — can remain invisible. The stealth scenario demonstrates a mild version of this on purpose: three quiet accounts leave no usable signal, and the metrics report them as misses rather than pretending recall is perfect.

### Simulator ground truth does not exist in real deployments

Precision, recall, observable recall and newcomer false-flag rates are measured against labels only the simulator knows. A real deployment cannot tell whether a missed account was a sleeper, a quiet campaign member or an ordinary contributor, and it cannot compute these rates without manual investigation. The near-perfect scores in §11 describe this controlled simulation; they are not a real-world accuracy claim, and the 0.600 stealth recall is a designed limit, not a field measurement.

### Slow sybil attacks are not solved

An attacker who ages accounts, varies timing and content, builds plausible outside support, and avoids rings can evade these thresholds. Detecting long-horizon collusion would require much more history, cross-repository data, and different analysis. TrustWeave does not claim to stop it.

### Other scope limits

- **Not a real P2P network.** One process hosts every simulated project. Gossip is simulated by pulling and verifying peer log copies; there is no libp2p, DHT, transport security or peer discovery.
- **Not real cryptographic identity.** Ed25519 keys are valid cryptography, but they are deterministically derived for reproducibility. There is no key rotation, revocation of keys, hardware key storage or identity proof.
- **No persistence.** Sandboxes and the read-only world cache are in process memory; restarting the backend clears them. A visitor's appended records do not follow them to another server instance, though the deterministic base world can always be rebuilt from the URL.
- **No GitHub integration.** The app never reads or posts to a real repository, and no AI or GitHub credentials are used.
- **No login, payments or persistent database.** These are intentionally out of scope. The app is deployed (see §15), but its state is in memory and resets on restart.
- **Simplified governance.** Revocation and expiry are implemented as record semantics, but there is no full appeal, dispute-resolution or maintainer UI beyond the records demo.
- **Limited visual scale.** The trust graph uses a fixed circular layout rather than a force-directed or virtualized graph, hides labels on very small screens, and the demo world is limited to 50 projects.
- **Browser coverage.** Playwright coverage is Chromium only; Safari and Firefox behavior was not part of this verification.

### Verifier limits

- The agent keeps only the last 20 runs, in memory. History does not survive a restart, and reports are overwritten on every run.
- Checks run in worker threads against isolated sandboxes. They exercise the same service functions as the API, not the HTTP layer end to end, and they use synthetic seed-42 data only.
- The schedule is fixed at boot (`VERIFY_INTERVAL_MINUTES`); changing it requires a restart. There is no dashboard or alerting integration — only console logs and the JSON files.

### PWA and desktop limits

- The service worker caches the app shell only. When the API is unreachable the shell still loads but assessments and records are deliberately unavailable; nothing stale is substituted.
- Install prompts depend on the browser. Chromium/Edge expose `beforeinstallprompt`; iOS Safari requires the manual Share → Add to Home Screen step. Headless test runs cannot display or accept the native install prompt, so installability was verified through the manifest, icons, service worker and offline tests rather than a click on the OS dialog.
- The Electron app is unsigned. macOS may warn on first launch; distribution would require signing and notarization. The unpacked build is large (about 1.1 GB) because it bundles the backend, Next.js and the full frontend `node_modules`.
- Packaging was run for macOS arm64 only. Windows (`nsis`) and Linux (`AppImage`) targets are configured but were not built or launched in this environment. There is no auto-update channel.

## 17. Honest final report

**What works and was run:** seeded simulation and hard cases; an obvious campaign scenario plus a stealth scenario with honest per-account misses and unchanged thresholds; read-only default and per-visitor sandboxes proven by a two-visitor test; signed, hash-chained records with visible rejection; per-project transitive trust and independence; all six campaign signals and two-signal clustering; newcomer neutrality with data-accurate notes, starter tasks and sponsor vouching; the documented API; the dark responsive dashboard; the explainer page; backend-only verification with 12/12 in the CLI, on startup, in the agent and through the read-only routes; the PWA shell with offline fallback; the Electron wrapper from source and from a packaged `.app`; all test suites and the production build listed above.

**What is simulated:** every project, contributor, PR, account age, content sample, key, trust edge, record, campaign and ground-truth label. The simulation host is a convenience process, not an authority. Sponsor vouches are signed with simulated project keys.

**What was not verified:** behavior against real repositories, real malicious actors, real key management, long-horizon sybil strategies, load at production scale, cross-browser rendering beyond Chromium, real-world detector precision/recall, the native install dialog on a physical desktop or phone, Windows/Linux packaging, and a signed/notarized installer. The public deployment on Render and Vercel was verified for structure, CORS and the write path, but not load-tested and not exercised from Safari or Firefox.

**What to say plainly in a demo:** this is a working, tested simulation of the trust model and its safeguards, with honest synthetic metrics — not a production reputation system.
