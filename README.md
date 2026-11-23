# Unlocked IQ

**The IQ test with nothing locked.** A free reasoning test that gives you the full result at the end: estimated IQ with a 90% range, percentile, strengths, category breakdown and an explanation for every question. No email, no paywall, no drip emails.

Live at **https://unlocked-iq.shubhammathur.in**

It started as a gift. A friend took a "free" online IQ test that hid the result behind a payment and then sent emails like *"Question #14 is among the hardest… your pattern is rare…"*. This is the version where you just get the answer.

## What's inside

- **110 question types** across three areas, each generated from a seed, so every template can produce thousands of variants:
  - **Pattern reasoning**: rule-based 3×3 matrices (RAVEN/I-RAVEN style attributes and rules, balanced distractors), figure series, odd one out, figural analogies.
  - **Spatial reasoning**: mirror and rotation, cube nets and cube views, paper folding and hole punching, block counting, shape assembly, hidden figures, 3D mental rotation, gears and directions.
  - **Numerical & sequence reasoning**: number and letter–number series, number grids, codes, number analogies, symbol equations, dominoes, clocks and calendars.
- **Two formats**
  - *Standard*: 30 questions in 25 minutes (12 pattern / 10 spatial / 8 numeric), spread from easy to hard, with flagging and a review screen.
  - *Quick*: a 15-question adaptive test (computerized adaptive testing with maximum Fisher information, category balancing and randomesque selection).
- **Fair timing**: the clock pauses while the test is off screen. When time runs out you choose between seeing your results or finishing the remaining questions untimed (marked on the result).
- **No repeats**: retakes in the same browser steer away from question types you've already seen.
- **Scoring**: 3PL item response theory with an EAP ability estimate, shown as IQ (mean 100, SD 15) with a 90% range and percentile.
- **Results**: animated reveal, bell curve, category bars, strengths-based insights, explanations for every question, short share links (`/r/:id`) with link previews, and downloadable share cards (1200×630 and 1080×1920 PNG).
- **Practice mode**: untimed, endless, with instant feedback.
- **Calibration**: with consent, anonymous answers (no name, no IP) are stored so item difficulties can be re-estimated from real data (`npm run calibrate`).

The score is an estimate for fun, not a clinical assessment. Item difficulties start as estimates until calibration has enough data.

## Stack

- **Frontend**: vanilla HTML, CSS and ES modules in `public/`, with no build step and no framework. Figures are inline SVG generated in code.
- **Backend**: a Cloudflare Worker (`src/`, [Hono](https://hono.dev)) with static assets.
  - **Storage**: D1 (SQLite) for results and consented responses.
  - **Share cards**: [`@cf-wasm/og`](https://github.com/fineshopdesign/cf-wasm) (satori + resvg) renders the PNGs.
  - **Abuse protection**: the Workers rate limiting binding.
- **Tests**: `node:test`. Every question type is verified over 200+ seeds by independent checking code: exactly one correct option, distinct options, and correct explanations.

```
public/
  index.html, about/science/faq/privacy.html   marketing & content pages
  test.html, results.html, practice.html       the app
  css/                                         design system (base.css) + app styles
  js/engine.js                                 template registry, buildItem / buildForm
  js/items-*.js                                question families (generators)
  js/cat.js, js/scoring.js                     adaptive testing and IRT scoring
  js/test-app.js, results-app.js, …            UI
src/                                           Worker: API, /r/:id meta injection, OG images
migrations/                                    D1 schema
scripts/calibrate.mjs                          re-estimate item difficulty from responses
test/                                          node:test suites, oracles and fixtures
docs/                                          build specs
```

## Run locally

```sh
npm install
npm run migrate:local      # create the local D1 tables
npm run dev                # wrangler dev on http://localhost:8787
npm test                   # full test suite
```

## Deploy

Requires a Cloudflare account and `npx wrangler login`.

```sh
npx wrangler d1 create iq-test   # once; put the id in wrangler.jsonc
npm run migrate:remote
npm run deploy
```

To send anonymous usage events, enable Analytics Engine on the account and add the `EVENTS` binding back to `wrangler.jsonc` (the Worker works without it).

### Compatibility rule

Share links store the form seed and template ids, and questions are rebuilt from them. **Do not change existing generators** once links exist; add new templates instead. `test/fixtures/v1-items.json` and `v2-items.json` guard this. If you ever have to change option order or generators, bump `ITEMS_VERSION`.

## Research and credits

Every question is produced by this project's own code from published rules and formats; no items or code were copied from other tests.

- Carpenter, Just & Shell (1990), *What one intelligence test measures* (Raven rule taxonomy)
- Zhang et al. (2019), RAVEN; Hu et al. (2021), I-RAVEN (attribute rules, balanced distractors)
- Koch et al. (2022), Open Matrices Item Bank; Matzen et al. (2010), Sandia Matrices
- Chierchia et al. (2019), Matrix Reasoning Item Bank (MaRs-IB)
- Condon & Revelle (2014), International Cognitive Ability Resource (ICAR)
- Blum & Holling (2018), IMak, automatic generation of figural analogies; Yang et al. (2021), AIG review
- Ekstrom et al. (1976), ETS Paper Folding Test (VZ-2); SpatialViz-Bench (2025)
- Shepard & Metzler (1971); Vandenberg & Kuse (1978); Ganis & Kievit (2015), mental rotation
- Witkin, Embedded Figures Test format; Thurstone, letter series

## Privacy

Results are stored only when you finish, including the optional name you typed. Anonymous answers are stored only if you tick the consent box, and never include a name or IP. There are no cookies, ads or tracking pixels. See [`/privacy`](https://unlocked-iq.shubhammathur.in/privacy).
