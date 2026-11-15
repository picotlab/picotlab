# Picotlab architecture: mockup → production (H-10)

Status: draft plan, 2026-11-14, CTO desk. Maintainer decisions are marked **[maintainer]**. Numbers marked
*(verify)* come from the desk's own knowledge and must be checked against live docs before money or
quotas depend on them.

## 1. Where we are

- One page (`index.html`, 184 KB) assembled by `build.sh` from `src/{shell.html, core.js, app.js,
  photo.js, calib.js, walk.js}`. three.js r128 and OrbitControls load from CDNs.
- `core.js` (CORE-START…CORE-END, ~890 lines) is pure logic: yarn/gauge tables, prompt parser,
  hat round planner + GA, flat layouts, pattern format/parse, estimates, calibration, photo masks,
  walkthrough steps. `test/core.test.js` runs it headlessly (137 checks as of v9).
- **No AI calls today.** The parser, photo→pattern (outline tracing) and optimizer are all
  deterministic and run in the browser. This is the most important fact for cost: the free product
  already works with zero server spend.
- `blender/` is a local headless render bridge (CPU-safe, G6 limits). `vendor/` holds two MIT
  third-party clones (with their own `.git`), not our code.

## 2. Principles

1. **Deterministic core first, AI second.** Every feature must work without an AI call. AI adds
   understanding (free text the parser can't read, photos of real pieces, a tech-edit critique), never
   the only path. This keeps the free tier free and the maths testable.
2. **Local-first.** Designs, swatch profiles and row progress live in the browser (IndexedDB) and work
   offline as a PWA. Accounts only add sync and sharing later.
3. **One package, many shells.** The pattern engine is an npm package that the web app, a CLI, tests,
   a future mobile app and third-party tools all import.
4. **Honest numbers.** Every claim (fit, yardage, patterns/sec) has a test or a measurement behind it;
   real swatches (H-06) calibrate the model.
5. **Cheap to run, cheap to contribute to.** Static hosting, small serverless edge, boring tools that
   open-source contributors already know.

## 3. Target shape (monorepo, pnpm workspaces)

```
picotlab/
  packages/
    core/        @picotlab/core  — TypeScript, zero runtime deps, pure functions
                 (yarn+gauge, parser, planners/GA, flat layouts, pattern text format+parser,
                  estimates, calibration, colourwork, walkthrough steps, photo-mask maths)
    sim/         @picotlab/sim   — spring-network fabric sim + mesh builders; depends on core;
                 renderer-agnostic (returns positions), with a three.js adapter
    format/      @picotlab/format — the open pattern file format (JSON schema + text form,
                 versioned), so patterns are portable between tools
  apps/
    web/         Vite + TypeScript + React; three.js (current npm release, not r128);
                 PWA (offline, installable); IndexedDB storage
    api/         Cloudflare Worker (Hono): AI proxy, rate limits, later accounts + sync
  tools/
    blender/     today's render bridge (CPU-safe local) + a cloud render job spec
    cli/         `picotlab design "beanie 56 cm worsted"` → pattern text / JSON / OBJ
  docs/          user guide, pattern-format spec, contributor guide
```

Why React: the largest contributor pool and component ecosystem; the UI is form-heavy and
stateful (spec editor, walkthrough scrubber, row counter). The 3D view stays imperative three.js
behind one component so the sim is not tied to React. Vitest for unit tests, Playwright for a
handful of browser checks (phone width, dark mode, WebGL fallback).

### 3.1 Core package (first lane job)

- Port `core.js` to TypeScript module by module; keep the existing 137 node checks as the oracle
  (run the old and new side by side until they agree), then convert them to Vitest.
- Public API is a small set of pure functions: `parsePrompt`, `normalizeSpec`, `design(spec)` →
  `{pattern, counts, dims, estimate}`, `formatPattern`/`parsePattern`, `calibrate(swatch)`,
  `walkSteps(pattern)`. Everything else is internal.
- Determinism: the GA takes a seed; same spec + seed → same pattern (needed for sharing links
  and for tests).
- Property tests (fast-check): every generated pattern re-parses to identical counts; growth ≤ 2×;
  rib counts even; dimensions within tolerance for all size × weight × stitch combinations.
- Size budget: < 60 KB min+gz; runs in a Web Worker so the GA never blocks the UI.

### 3.2 Web app

- Screens: Design (prompt + spec editor + 3D), Pattern (sheet, print/PDF), Learn (hook walkthrough),
  Make (row counter that follows the pattern, works offline, big tap targets), Swatch (calibration),
  My designs.
- Performance budget: first load < 300 KB JS gz before three.js; three.js lazy-loaded on the 3D tab;
  sim capped at a node budget per device class (mobile GPUs: H-07 decides the numbers).
- Accessibility: keyboard and screen reader on all non-3D flows; the pattern itself is text, so the
  walkthrough must have a text-only mode. Left-handed mirror for the walkthrough.
- Units: cm/in and US/UK terms everywhere, from day one (core already has the tables).

### 3.3 AI services (Claude API, via `apps/api`)

The browser never holds an API key. The Worker calls the Claude API with the official
`@anthropic-ai/sdk`, structured outputs (`output_config.format`) so replies are typed JSON that the
deterministic core then validates and designs from. Stable system prompts + schemas sit first and
are cached.

Prices used (Claude API first-party, cached skill table 2026-11-03; per million tokens):
Haiku 5.5 $0.10 in / $0.50 out · Sonnet 5.5 $2 in / $10 out (cache read $0.10) ·
Opus 5.5 $4 / $20 (cache read $0.20). Batch API is 50% off for non-urgent work. Images cost about
⌈w/28⌉ × ⌈h/28⌉ tokens, capped at 1,568 (standard tier), so a 1092 × 1092 photo ≈ 1.5k tokens. Haiku 5.5's price holds for prompts up to 100k tokens ($0.50/$2.50 above that), which every route here stays well under. (Verified against the Claude docs 2026-11-14.)

| service | when it runs | model | typical tokens (in / out) | est. cost per request |
|---|---|---|---|---|
| Free-text → spec fallback | only when the local parser leaves words it couldn't use | Haiku 5.5, effort low | 1.6k (mostly cached) / 0.3k | ≈ $0.0003 |
| "Explain this step" / pattern Q&A | user asks in Learn/Make | Haiku 5.5 | 3k / 0.5k | ≈ $0.0006 |
| Photo of a real piece → spec | user uploads a photo (today's local tracer stays the default) | Sonnet 5.5 | 2.6k incl. image / 0.8k | ≈ $0.013 |
| Tech-edit critique of a user's own pattern | user pastes a pattern | Sonnet 5.5 | 4k / 1.5k | ≈ $0.023 |
| Example-library generation, test prompts | offline, by us | Sonnet 5.5 via Batch | — | half of the above |

Opus 5.5 is not used in the request path; it is reserved for offline evaluation of AI outputs.
Every AI reply passes the same core checks as a hand-made pattern (re-parse, growth, dimensions);
failures are retried once, then shown as "couldn't do this one" rather than shown wrong.

**Cost envelope** (illustrative, not a forecast): 10,000 monthly active users, each making
20 Haiku calls and 2 Sonnet calls a month ≈ 200k × $0.0004 + 20k × $0.018 ≈ **$440/month**.
The Haiku tier alone would be ≈ $80. So:

- Free quota per user per day (e.g. 30 Haiku-class, 3 Sonnet-class), enforced in the Worker by an
  anonymous device token + IP rate limit (Cloudflare KV / Durable Object counters).
- "Bring your own key" option for power users and self-hosters (key stays in their browser, calls go
  direct), so the open-source build needs no Picotlab server at all.
- Hard monthly spend cap set in the Anthropic Console; the Worker turns AI features off (deterministic
  paths still work) when the cap is near. **[maintainer]** sets the cap and who pays.
- Measure real token use per route from `response.usage` before raising any quota.

Safety and privacy: photos are sent only on explicit tap, never stored server-side; no prompts are
logged with identifiers.

**AI is opt-in and off by default** (research cycle 1: Etsy bans AI-generated crochet patterns,
Ribblr prohibits them, r/crochet bans AI text, Ravelry removes obvious ones). Consequences:
- Patterns designed by the deterministic engine carry no AI label and are the default output.
- Any pattern an AI route touched is stamped "AI-assisted, maths-checked" in the file format and on
  the printed sheet, and the stamp cannot be removed by editing in-app. Users who sell on Etsy or Ribblr
  must be able to see which of their patterns are AI-free.
- AI routes favour *explaining and checking* (Q&A, tech-edit of the user's own pattern) over
  *generating* patterns.

### 3.4 Hosting (free tiers first): limits verified against official docs 2026-11-14 (H-13); Pages bandwidth is not stated in the docs

| need | choice | free-tier headroom (from memory) |
|---|---|---|
| static web app | Cloudflare Pages | unlimited static bandwidth; build minutes capped per month |
| AI proxy, rate limits | Cloudflare Workers | ~100k requests/day on free; low CPU ms per request (AI calls are I/O, fine) |
| counters, quotas | Workers KV or Durable Objects | KV free writes ~1k/day (verified): use DO or a paid plan once AI traffic is real |
| accounts, shared patterns (later) | D1 (SQLite) | 5 GB per account, 500 MB per database, 10 databases; 5M rows *scanned*/day; **100k rows written/day** (the tighter cap) |
| images, PDFs, renders (later) | R2 | 10 GB-month Standard storage, 1M Class A + 10M Class B ops/month; no egress fee when read from R2 directly |
| heavy Blender renders | Modal (already in the estate via cloud-gateway) | pay per GPU-second: **[maintainer]** yes before any spend |
| repo, CI | GitHub + Actions | free for public repos |

The maintainer already runs Cloudflare, so no new vendor is needed. Self-hosting stays
possible: the web app is static files; the API is one Worker with a documented env.

### 3.5 Accounts (later, phase 3)

Not before v1.0 needs them. When added: passwordless email links or passkeys, via a small auth
library on the Worker (no auth vendor lock-in); D1 tables `users`, `designs`, `profiles` (swatch),
`shares`. Local-first stays: an account only syncs what is already in IndexedDB.

## 4. Roadmap

Each phase ends on evidence (tests, a browser look on phone + desktop, and for wearables a real
hooked piece measured by a tester).

| phase | goal | main work | exit evidence |
|---|---|---|---|
| **0. Foundation** (now) | the repo exists | H-08 git + Apache 2.0 + README; CI running today's node tests; H-07 phone/dark pass; a tester hooks a swatch + beanie | public repo **[maintainer]**; CI green; measured beanie vs prediction |
| **1. Core package** | engine is a real library | `@picotlab/core` in TS, seeded GA, property tests, pattern-format v0 spec, CLI | old 137 checks + property tests pass; npm package publishable (not yet published) |
| **2. Web app alpha** | the app, not the mockup | Vite/TS/React shell, lazy three.js (current), **PWA offline + downloadable PDF first** (cycle 1's best-evidenced competitor gap), row counter, US/UK terms, left-handed walkthrough | Lighthouse ≥ 90 on phone; works offline; 5 crocheters try it (research lane recruits only via public posts **[maintainer]**) |
| **3. AI services beta** | AI where it helps | Worker proxy, quotas, BYO key, free-text fallback, photo→spec, critique; evals for each route | per-route cost measured; AI output passes core checks ≥ 95% on an eval set |
| **4. v1.0 open source** | something crocheters love | docs site, contributor guide, pattern library (CC-licensed examples), translations scaffold, accessibility pass | **[maintainer]** release call; changelog lists shipped changes only |
| **5. Community layer** (after research says there is pull: H-11; cycle 1 found crochet Skool groups of only 16–31 members, so test a free club/class first) | clubs, teachers, students | accounts + sync, shared patterns, classes (teacher shares a pattern + walkthrough to a group), CAL (crochet-along) progress | first club running on it |
| **6. Memberships + designer shop** (research cycle 2: a crochet club at $6/mo nets roughly $70–770/mo at 15–150 payers, so this is side income, not a business; plan the project to survive on volunteers, sponsors and grants) | sustainable money | paid tiers for clubs/teachers; designers sell patterns (Stripe Connect or a marketplace partner); core stays free + open | **[maintainer]** pricing, terms, legal review |

Open-core rule: the engine, app, pattern format and self-hosting stay Apache 2.0 forever. Paid
things are hosted services (sync, groups, storage, AI quota above free, the shop), never features
withheld from the open code. Brand name and logo are kept separate from the code licence
(trademark, not Apache) **[maintainer]**.

## 5. Lanes this plan feeds (per OPERATING.md)

- **release:** H-08 now; CI; changelog.
- **core:** phase 1 (biggest job; one lane owns `packages/core` + tests).
- **app:** H-07 now on `index.html`; phase 2 later in `apps/web`.
- **sim-3d:** sim extraction + mobile budget (after core's API is fixed).
- **ai-services:** phase 3 design doc + evals; starts once research cycle 1 lands.
- **render:** keep local CPU-safe; write the Modal job spec, no spend.

## 6. Risks

| risk | mitigation |
|---|---|
| Crocheters distrust AI-made patterns | deterministic maths first; "maths-checked" proof shown (counts, re-parse, dims); real tester swatches; clear labels |
| AI cost runs away on a free app | quotas, BYO key, spend cap, AI optional by design |
| Fit is wrong in real yarn | H-06 swatch loop; calibration profiles; publish measured error |
| Mobile GPU crashes / battery | node budget per device; 2D fallback view; no GPU heavy work on the laptop either (G6) |
| Scope creep into community before the tool is loved | phase gates; H-11 research first |
| Licence confusion with vendored MIT code | `vendor/` stays out of the repo; referenced by URL in README |
| GPL code copied in by accident | CrochetCharts (the main open-source prior art) is GPL-3.0: read for ideas, never copy into Apache code |
| Marketplace AI bans hit our users' shops | AI-free by default; a visible "AI-assisted" stamp only on patterns an AI route touched |
