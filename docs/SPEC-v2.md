# Unlocked IQ — v2 spec (phases 1–3)

Read `docs/SPEC.md` too: v1 contracts (item object, SVG rules, scoring, figure fill classes) still hold unless overridden here.

Live at https://iq-test.shubhammathur.in (Cloudflare Workers + static assets). Stack stays **vanilla ES modules, no frontend build step, no frameworks** in `public/`. The Worker (`src/`) may use npm packages (wrangler bundles it). Do **not** commit; the integrator commits. Only edit files you own (table below). If you need a change in someone else's file, write it in your final report.

## Brand

- Name: **Unlocked IQ**. Tagline: "The IQ test with nothing locked." Message: free, complete results, no email, no paywall, no drip emails. Honest: an estimate, not a diagnosis.
- Logo mark: a 3×3 grid of rounded squares where the bottom-right square is an open outline (the "missing piece"), plus the wordmark. Inline SVG, `currentColor` + accent.
- Fonts (Google Fonts, `display=swap`): **Space Grotesk** (display: headings, big numbers) and **Inter** (body/UI). Variables `--font-display`, `--font-body`.
- Feel: calm, confident, a little playful. Generous whitespace, soft shadows, 14–20px radii, subtle motion (150–300ms, ease-out; respect `prefers-reduced-motion`).

## Design tokens (owned by D in `public/css/base.css`; everyone uses them)

Define on `:root` (light default), override under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and `:root[data-theme="dark"] {…}`.

`--bg` page, `--surface` cards, `--surface-2` inset/hover, `--ink` text, `--muted` secondary text, `--line` borders, `--accent` (indigo, ~#4F46E5 light / ~#8B8CF8 dark), `--accent-ink` text on accent, `--accent-soft` tinted bg, `--highlight` (warm amber for celebratory moments), `--mid` figure grey (distinct from empty and solid in both themes), `--good`, `--warn`, `--danger`, `--radius` 14px, `--radius-lg` 20px, `--shadow-sm`, `--shadow`, `--font-display`, `--font-body`, spacing `--s1`…`--s8` (4, 8, 12, 16, 24, 32, 48, 64px), `--maxw` 1120px, `--maxw-text` 720px.

Shared component classes (D defines in base.css; G and others use, never redefine): `.container`, `.container-text`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-lg`, `.btn-sm`, `.card`, `.eyebrow`, `.h1`, `.h2`, `.h3`, `.lede`, `.muted`, `.small`, `.badge`, `.stack` (vertical gap), `.cluster` (wrapping row), `.visually-hidden`, `.f-none`, `.f-grey`, `.f-solid` (figure fills, see SPEC.md), `.fade-in`.

Site chrome: every page has `<div id="site-header"></div>` at top of body and `<div id="site-footer"></div>` at bottom, and loads `<script type="module" src="/js/site.js"></script>`. `site.js` (D) renders header (logo, nav: Take the test, Practice, How it works→/science, FAQ; theme toggle light/dark/system stored in localStorage with try/catch) and footer (About, Science, FAQ, Privacy, "No paywall. Ever." line). Pages that need focus mode add `class="focus"` on `<body>`; site.js then renders a minimal header (logo only) and no footer.

## Pages and routes

| Route | File | Owner |
|---|---|---|
| `/` | `public/index.html` landing | D |
| `/about`, `/science`, `/faq`, `/privacy` | `public/about.html` etc. (assets serve `/about` → about.html automatically) | D |
| `/test` | `public/test.html` test app (mode select → section intros → runner → review → finish) | G |
| `/results` | `public/results.html` results page | G |
| `/practice` | `public/practice.html` practice mode | G |
| `/r/:id` | Worker serves `results.html` with OG meta injected | F |
| `/og/:id.png` | Worker renders share-card PNG | F |
| `/api/*` | Worker | F |
| 404 | `public/404.html` | D |

`wrangler.jsonc` (F) sets `assets.not_found_handling: "404-page"` and `run_worker_first: ["/api/*", "/r/*", "/og/*"]`.

## Item engine (E) — pure modules in `public/js/`

Existing: `items-matrix.js`, `items-spatial.js`, `items-series.js`, `svg.js`, `cube.js`, `rng.js`, `items.js`, `scoring.js`. E owns all of these plus new `engine.js`, `cat.js`, `explain.js`, `calibration.js`.

Concept: each of the 30 v1 items becomes a **template** that can produce **isomorphic variants** from a seed: same rule structure and difficulty, different surface (shape vocabulary, fills permutation, rotation offsets, segment sets under a symmetry of the square, different asymmetric polyominoes/valid nets/letter orders, different series start/step values). Seed `0` must reproduce the exact v1 item (so old share links keep working).

`engine.js` exports:
- `TEMPLATES`: `[{ id, category, b, a }]` (b/a after applying `CALIBRATION` overrides; a defaults 1.3).
- `buildItem(templateId, formSeed)` → Item (v1 contract) plus `templateId`, `seed`, `explanation` (string, see below). Deterministic. Item `id` = `${templateId}` (keep), seed recorded separately.
- `buildForm(formSeed)` → 30 Items ordered by b (formSeed 0 ≡ v1 `ITEMS`).
- `itemSeed(formSeed, templateId)` → uint32 used internally (hash of both).
- `practiceItem(seed, { category, level })` → Item; `level` ∈ `easy|medium|hard` maps to b ranges.
- `CATEGORY_LABELS` (same as `CATEGORIES`).

`cat.js` (computerized adaptive test, "Quick test"): `createCat({ formSeed, length = 15 })` → `{ next(): Item|null, answer(optionIndex), done, items, answers, toJSON() }`, `catFromJSON(json)`. Start θ=0, pick the unused template with max Fisher information at current EAP θ, with category balancing (keep each category within ±1 of its target share 40/33/27%), never repeat a template. Uses `scoring.js` EAP. Answer is final (no going back).

`explain.js`: `explanation` text per template, generated from the variant's actual parameters (e.g. "Each row contains one circle, one square and one diamond, and the shading is the same along each row, so the missing piece is a solid diamond."). 1–3 sentences, plain language.

`calibration.js`: `export const CALIBRATION = { /* templateId: { b, a, n } */ }`; initially `{}`. F's calibration script overwrites this file.

`scoring.js`: unchanged API, but use per-item `a` if present.

Tests (E): for every template, ≥200 seeds: options distinct, exactly one correct (re-verify the rule independently, as v1 tests do), markup rules (no ids/defs/url(#)); seed 0 equals v1 output exactly; CAT picks no repeats, respects balancing, terminates at `length`; explanations non-empty and mention the correct answer's features. Keep existing tests green (update them if APIs move, but keep their assertions).

## Result payload (shared by G and F)

```js
{
  v: 2,
  mode: 'standard' | 'quick',
  seed: 12345,            // formSeed (uint32)
  tids: ['M1','N1',…],    // template ids in the order shown (required for quick; for standard = buildForm order)
  a: [2, -1, 0, …],       // option index per shown item, -1 unanswered
  secs: 1080,             // time taken
  n: 'Richa'              // optional display name, ≤40 chars
}
```
Items are rebuilt as `tids.map(id => buildItem(id, seed))`. v1 hash links (`#r=` with `v:1`) must still render (treat as standard, seed 0).

## Worker / backend (F)

Files: `src/worker.js` (Hono router), `src/og.js`, `src/headers.js`, `migrations/0001_init.sql`, `scripts/calibrate.mjs`, `wrangler.jsonc`, `package.json` (deps/scripts), `public/_headers`.

Bindings (wrangler.jsonc): D1 `DB` → database_name `iq-test`, database_id `23555869-21e5-4c0e-a431-9321e714d0e2`, migrations_dir `migrations`. Analytics Engine dataset binding `EVENTS` (dataset `iq_test_events`). Keep the custom domain route `iq-test.shubhammathur.in`. `compatibility_date` 2025-06-01 (+ `nodejs_compat` flag only if a dep needs it).

Endpoints:
- `POST /api/results` body = result payload (validate shape, ≤8KB, answers length = tids length, indices in range by rebuilding items) → `{ id }` (8-char base62, collision-retry). Stores payload JSON + computed iq + created_at.
- `GET /api/results/:id` → payload JSON or 404.
- `GET /r/:id` → fetch `/results.html` from ASSETS, inject via HTMLRewriter: `<meta name="result-id" content=":id">`, `og:title` ("Richa scored 118 on Unlocked IQ" / "An Unlocked IQ result"), `og:description`, `og:image` (`/og/:id.png`), `twitter:card=summary_large_image`, canonical. 404 page if unknown.
- `GET /og/:id.png?format=og|story` → PNG (1200×630 og, 1080×1920 story) using `workers-og` (satori + resvg wasm) or equivalent that runs on Workers. Card: brand mark, name, big IQ, percentile, 3 category bars, "iq-test.shubhammathur.in". Fonts: fetch Inter/Space Grotesk TTF and cache (Cache API). Cache PNG responses (`Cache-Control: public, max-age=86400`).
- `POST /api/responses` (only sent when the user ticked consent) body `{ mode, seed, tids, a, secs, theta }` → inserts one row per item into `responses` (template_id, seed, correct, mode, theta, created_at). No name, no IP stored.
- `GET /api/stats` → `{ takers }` (count of results + consented sessions; cache 5 min).
- `POST /api/events` `{ name, props? }` → `EVENTS.writeDataPoint` (names: `test_start`, `test_finish`, `share_click`, `card_download`, `practice_answer`). No PII.
- All API responses JSON, CORS same-origin only, basic abuse guard: reject bodies > 8KB, per-IP rate limit via the Workers Rate Limiting binding if available, else skip.

`public/_headers`: security headers for all assets — CSP (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, long cache for `/fonts/*` if any. Worker responses set the same headers (`src/headers.js`).

`scripts/calibrate.mjs`: pulls `responses` via `wrangler d1 execute iq-test --remote --json --command …`, estimates per-template b (Rasch, conditioning on stored theta; only templates with n ≥ 50), writes `public/js/calibration.js`. Document usage in its header comment.

Migrations: `results(id TEXT PK, payload TEXT, iq INT, mode TEXT, created_at INT)`, `responses(id INTEGER PK, template_id TEXT, seed INT, correct INT, mode TEXT, theta REAL, created_at INT)`, indexes.

Local dev: `npx wrangler d1 migrations apply iq-test --local`, then `npx wrangler dev`. F verifies every endpoint with curl against local dev (port 8788 to avoid clashing with an existing dev server on 8787).

## Test app, results, practice (G)

Files: `public/test.html`, `public/results.html`, `public/practice.html`, `public/css/app.css`, `public/js/app.js` (rewrite into) `public/js/test-app.js`, `public/js/results-app.js`, `public/js/practice-app.js`, `public/js/charts.js`, `public/js/card.js`, `public/js/share.js`, `public/js/profile.js`, `public/js/state.js`, `public/js/api.js`. Delete `public/styles.css` and old `public/js/app.js` when done (old `index.html` is replaced by D's landing).

Imports engine only through `engine.js`, `cat.js`, `scoring.js` (E). Uses design tokens/components from `css/base.css` (D) — `app.css` only adds app-specific layout.

`/test`:
1. Mode select: **Standard** (30 questions, 25 min, review & flag) and **Quick** (adaptive, 15 questions, ~10 min, no going back). Name field (optional). Consent checkbox, unchecked by default: "Help improve the test: share my anonymous answers (no name)". Start.
2. Section intros (standard): before the first question of each category the first time it appears… simpler: show a **3-step intro carousel before starting** (one card per category) each with a worked practice puzzle (`practiceItem(seed,{category, level:'easy'})`) the user can try with instant feedback + explanation. Skippable.
3. Runner in **focus mode** (`body.focus`): progress bar, ring timer (SVG, warning colour < 2 min), category chip, prompt, stem, options grid. Smooth transition between questions (slide/fade, reduced-motion aware). Keyboard: 1–9 select, ←/→, F flag. Swipe left/right on touch (standard mode). Flag button. Question palette in a slide-up drawer (mobile) / side panel (desktop ≥1024px) showing answered/flagged/current.
4. Review screen (standard) before finish: counts of answered/unanswered/flagged, jump links, Finish button (inline confirm, no window.confirm).
5. Finish: compute score, POST `/api/results` → navigate to `/r/:id`; if API fails, fall back to `/results#r=<base64url payload>` (share.js encodes v2 payload; also decodes v1). If consent, POST `/api/responses`. Fire events.
State persisted in localStorage (`unlocked:state`, try/catch) for resume; resume prompt on `/test`.

`/results` (also served at `/r/:id`): reads `<meta name="result-id">` → GET `/api/results/:id`; else `#r=`; else local finished state. Renders:
- Animated reveal: count-up IQ number, bell curve draws in, bars grow (reduced-motion: no animation).
- Hero, percentile, correct, time, mode badge.
- Bell curve + category bars (keep v1 chart rules from SPEC.md: one accent, value labels in ink, hover tooltips).
- Strength cards + "What the numbers say" + range traits + category profiles (reuse v1 `profile.js`, keep its positivity test passing).
- "Hard ones you cracked".
- Review with **explanations** for every question (item.explanation), missed ones first-expanded.
- Share: short link copy (`/r/:id`), native `navigator.share` when available, "Download card" (PNG from `/og/:id.png?format=story`, fallback: client-side canvas render in `card.js` when there is no id), WhatsApp share link.
- "Take it again (new questions)" → `/test` with a fresh random seed; "Practice" link.
- Read-only banner when viewing someone else's result (no local state match).

`/practice`: untimed endless mode. Pick category (or mixed) and level. Show one item, answer → instant correct/incorrect with explanation and the correct option highlighted, Next. Streak counter and session accuracy (localStorage). Fires `practice_answer` events.

Mobile: works at 360px; option buttons ≥ 44px; no horizontal scroll. Accessibility: focus visible, aria-live for feedback/timer warnings, labels on all controls.

## Marketing/content pages (D)

Files: `public/index.html`, `about.html`, `science.html`, `faq.html`, `privacy.html`, `404.html`, `public/css/base.css`, `public/css/pages.css`, `public/js/site.js`, `public/js/landing.js`, `public/favicon.svg`, `public/manifest.webmanifest`, `public/sw.js` (offline cache of app shell; network-first for `/api`, never cache `/api` or `/og`), `public/robots.txt`, `public/sitemap.xml`, icons (`public/icons/icon-192.png`, `icon-512.png` — generate PNGs with a small node script using only built-in modules, or write SVG and convert with `sips` on macOS).

Landing (`/`): hero (headline, sub, primary CTA "Take the free test" → /test, secondary "Try a practice puzzle" → /practice; live takers count from `/api/stats` when available) with an **interactive sample puzzle** (use `buildItem('M2', 0)` from `/js/engine.js`; if engine.js not present yet, import `ITEMS` from `/js/items.js` and use the M2 item) with instant feedback; "How it works" (3 steps); three category cards with a mini figure each; "What you get" (results preview mock: IQ, bell curve, strengths, explanations, share card); "Nothing locked" comparison (us vs typical paid tests: results, emails, price, explanations); FAQ teaser; final CTA. Meta tags, OG image (static `/og-default.png` 1200×630 — draw with the brand), JSON-LD `WebSite`.

`/science`: how puzzles are built (rule-based matrices like the Open Matrices Item Bank and Sandia Matrices research; mental rotation; cube nets; number series), how scoring works (IRT 3PL, EAP, 90% range, why it's an estimate), adaptive testing, calibration with consented data, limitations. Cite sources with links: OMIB (https://pmc.ncbi.nlm.nih.gov/articles/PMC9326670/), Sandia Matrices (https://github.com/sandialabs/Matrices), ICAR paper (https://personality-project.org/revelle/publications/condon.icar.14.pdf), MaRs-IB (https://pmc.ncbi.nlm.nih.gov/articles/PMC6837216/).
`/faq`: 10–12 Q&As (is it free, how accurate, why range, retakes, adaptive vs standard, data, sharing, accessibility, kids).
`/privacy`: what is stored (results only when you finish — payload incl. optional name; anonymous answers only with consent; aggregate event counts with no personal data; no cookies, no tracking, no ads), retention, contact via site owner.
`/about`: the story (built because a paid test hid results behind a paywall and sent "Question #14…" emails), principles.

SEO: unique titles/descriptions, canonical URLs on `https://iq-test.shubhammathur.in`.

## Verification (each agent)

Run `npm test` (node --test test/*.mjs) — your tests plus everyone else's that already exist must stay green for files you touch. Static pages: `node --check` your JS. F: curl every endpoint on local dev. G/D: you may run `npx wrangler dev --port <unique port>` (D: 8790, G: 8791, F: 8788) and inspect pages with curl; a final browser check is done by the integrator.
