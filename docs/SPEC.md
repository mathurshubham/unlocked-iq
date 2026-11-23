# IQ test — build spec (shared contract)

A free, single-page, no-backend IQ-style test. Static files in `public/`, deployed on Cloudflare Workers Static Assets (`wrangler.jsonc` already set). No build step, no frameworks, no npm runtime deps. Browser loads native ES modules from `public/js/`.

30 questions: 12 matrix, 10 spatial, 8 series. 25-minute timer. Results page shows everything for free.

## Files and ownership

| File | Owner | Notes |
|---|---|---|
| `public/js/rng.js` | done | `rng(seed)`, `hashSeed(str)`, `placeOptions(id, answer, distractors)` → `{options, answer}` |
| `public/js/items.js` | done | merges banks, sorts by `b`, exports `ITEMS`, `CATEGORIES`, `ITEMS_VERSION` |
| `public/js/svg.js` | Agent A | shared SVG primitives (see below) |
| `public/js/items-matrix.js` | Agent A | `export const matrixItems` |
| `test/matrix.test.mjs` | Agent A | node:test |
| `public/js/cube.js` | Agent B | net folding |
| `public/js/items-spatial.js` | Agent B | `export const spatialItems` |
| `public/js/items-series.js` | Agent B | `export const seriesItems` |
| `test/spatial.test.mjs`, `test/series.test.mjs` | Agent B | node:test |
| `public/index.html`, `public/styles.css`, `public/js/app.js`, `public/js/scoring.js`, `public/js/profile.js`, `public/js/share.js` | Agent C | UI, scoring, results |
| `test/scoring.test.mjs`, `test/share.test.mjs` | Agent C | node:test |

Do not edit files you don't own. Run tests with `node --test test/`.

## Item object (the contract)

Every item module exports an array of plain objects:

```js
{
  id: 'M4',                 // unique: M1..M12, S1..S10, N1..N8
  category: 'matrix',       // 'matrix' | 'spatial' | 'series'
  b: -0.9,                  // estimated difficulty (logit, roughly -2.5..2)
  prompt: 'Which option completes the pattern?',  // plain text
  stem: '<svg ...>…</svg>', // HTML string for the question figure (SVG or HTML)
  options: ['<svg…>', …],   // HTML strings, already in display order
  answer: 3,                // index into options
  optionCols: 3,            // layout hint for UI: options per row on desktop
}
```

Option order comes from `placeOptions(id, answerMarkup, distractorMarkups)` so it is deterministic. Share links store option indices, so order must never depend on `Math.random`.

Item modules must be **pure**: no DOM, no `window`, no `document`. They build markup strings, so node tests can import them.

## SVG rules (all figures)

- No `id` attributes, no `<defs>`, no `url(#…)` references: many SVGs share one document.
- Draw in ink with `stroke="currentColor"`. Stroke width 3 in a 100×100 cell viewBox (scale accordingly).
- Fills use **classes only**: `class="f-none"` (empty), `class="f-grey"` (mid tone), `class="f-solid"` (ink). Agent C defines these in CSS:
  `.f-none{fill:transparent} .f-grey{fill:var(--mid)} .f-solid{fill:currentColor}`.
- Text in figures: `fill="currentColor"`, `font-family="inherit"`, `text-anchor="middle"`, `dominant-baseline="central"`.
- Every option SVG uses the same viewBox within an item, so options render at the same scale.
- Add `role="img"` and an `aria-label` describing the figure in words where cheap (e.g. "3 empty diamonds"). Not required for matrix cells.
- Use `width="100%"` and let CSS size it; no fixed pixel sizes.

## Matrix items (Agent A)

Stem: a 3×3 grid as one SVG (viewBox `0 0 320 320`, cells 100×100 with 10px gaps, thin cell borders in `currentColor` at low opacity via `stroke-opacity="0.25"`). Bottom-right cell shows a large "?".
Options: 6 per item (answer + 5 distractors), each a single 100×100 cell SVG. `optionCols: 3`.
Cell model: an array of elements. Write a canonical `key(cell)` (sorted JSON) and use it in tests to prove all 6 options are distinct and the answer equals the rule's output for (2,2).

Element kinds:
- `shape`: shape ∈ circle, square, triangle, diamond, pentagon, hexagon, star; fill ∈ none, grey, solid; size ∈ xs, s, m, l; positioned by a layout for n copies (n = 1..6, dice-style positions, smaller size as n grows).
- `arrow`: an asymmetric arrow pointing up at rot 0, rotated by `rot` degrees clockwise.
- `seg`: line segment id ∈ h, v, d1 (TL→BR), d2 (TR→BL), t, b, l, r (frame edges at 15/85).
- `dot`: small filled circle on a ring of 8 positions, k = 0 at top, clockwise by 45°, radius 32 from center.

Items (r = row, c = col, 0-indexed; answer = cell(2,2)). Hand-designed; implement exactly and verify in tests.

| id | b | rule | answer | distractors |
|---|---|---|---|---|
| M1 | -2.2 | shape by row [circle, square, diamond]; count = c+1; fill none | 3 diamonds | 2 diamonds; 4 diamonds; 3 squares; 3 circles; 3 solid diamonds |
| M2 | -1.6 | shape = [circle, triangle, square][(r+c)%3]; fill by row [none, grey, solid] | solid triangle | empty triangle; grey triangle; solid circle; solid square; solid hexagon |
| M3 | -1.2 | single arrow, rot = 90r + 45c | arrow 270° | 225; 315; 90; 180; 0 |
| M4 | -0.9 | size by col [s, m, l]; shape = [pentagon, circle, square][(c+2r)%3]; fill none | large empty pentagon | medium pentagon; small pentagon; large circle; large square; large solid pentagon |
| M5 | -0.6 | segments, col3 = col1 ∪ col2 (disjoint): row0 {h}+{v}; row1 {d1}+{t,b}; row2 {l,d2}+{r,h} | {l,d2,r,h} | {l,d2,r}; {l,r,h,d1}; {d2,r,h}; {l,d2,r,h,v}; {l,d2,r,h,b} |
| M6 | -0.2 | count = r+c+1; shape = [circle, square, triangle][(r+c)%3]; fill grey | 5 grey squares | 4 grey squares; 6 grey squares; 5 grey circles; 5 grey triangles; 5 solid squares |
| M7 | 0.2 | dot ring k = 2r + c (mod 8); center shape = [square, circle, hexagon][(r+2c)%3], size m, fill none | empty square + dot k=6 | dot k=5; dot k=7; dot k=2; circle + k=6; hexagon + k=6 |
| M8 | 0.6 | segments, col3 = col1 XOR col2: row0 {h,v}^{v,d1}; row1 {t,b,l}^{l,r}; row2 {d1,d2,h}^{d2,v,h} | {d1,v} | {d1,d2,h,v} (OR); {d2,h} (AND); {d1}; {v}; {d1,v,d2} |
| M9 | 0.4 | outer shape [circle, square, hexagon][(r+c)%3] size l fill none; inner shape [triangle, star, diamond][(2r+c)%3] size xs fill solid, both centered | square ⊃ triangle | square ⊃ star; square ⊃ diamond; circle ⊃ triangle; hexagon ⊃ triangle; square ⊃ grey triangle |
| M10 | 1.0 | shape [triangle, circle, square][(r+c)%3]; count [1,2,3][(r+2c)%3]; fill [none, grey, solid][(2r+c)%3] | 1 empty circle | 2 empty circles; 3 empty circles; 1 grey circle; 1 solid circle; 1 empty square |
| M11 | 1.3 | segments, col3 = col1 ∩ col2: row0 {h,v,d1}∩{v,d1,t}; row1 {l,r,h}∩{h,b,l}; row2 {t,b,d2,v}∩{d2,b,r,h} | {b,d2} | {t,v,r,h} (XOR); {t,b,d2,v,r,h} (OR); {b}; {d2}; {b,d2,v} |
| M12 | 1.5 | count: col3 = col1 + col2, rows (2,1,3), (1,3,4), (3,2,5); shape [square, triangle, circle][(r+c)%3]; fill [none, grey, solid][(r+2c)%3] | 5 empty triangles | 6 empty triangles; 4 empty triangles; 5 grey triangles; 5 empty squares; 5 empty circles |

Tests must assert, per item: 6 options; options pairwise distinct by key; the answer option is the rule's (2,2) cell; no distractor equals the answer. For M5/M8/M11 also assert that rows 0–1 rule out the other set operations (OR vs XOR vs AND give different col3 in at least one of rows 0–1) — this proves the puzzle is unambiguous.

## Spatial items (Agent B)

Polyominoes: arrays of `[x, y]` grid cells (y down). Helpers: normalize (translate to min 0, sort), rot90, mirror (flip x). Orientation matters: two options are "the same" only if their normalized cell sets are equal *without* rotating. Render: cells as squares, `class="f-grey"`, `stroke="currentColor"`. All options of an item share one cell size (fit the largest bounding box into a 100×100 viewBox with padding).

Cube nets: 6 cells. Fold by rolling a cube across the net (BFS from cell 0). State = which original face is at each of U, D, N, S, E, W. Rolling east: D←E, E←U, U←W, W←D (N, S unchanged); west/north/south analogous. Each net cell gets the face that is on D when the cube rests on it. Valid net ⇔ 6 distinct faces. Opposite pairs: (U,D), (N,S), (E,W). Export `foldNet(cells)` → `{ valid, faceOf: [...] }` and `oppositeOf(cells, i)` → index of the net cell opposite cell i.

Net rendering: cells with a letter in each (for S8–S10), or blank (S6–S7).

| id | b | type | spec |
|---|---|---|---|
| S1 | -1.5 | mirror | "Which option is the figure reflected in a vertical mirror (left↔right)?" Shape: a 7-cell polyomino with no symmetry. Options (5): mirror (answer), original, rot90, rot180, top↔bottom flip. |
| S2 | -0.8 | rotation | "Which option is the same shape, only rotated?" F pentomino `[[1,0],[2,0],[0,1],[1,1],[1,2]]`. Options (5): rot90 (answer), mirror, mirror∘rot90, mirror∘rot180, mirror∘rot270. |
| S3 | -0.2 | rotation | Same as S2 with a 6-cell asymmetric shape; answer rot270. |
| S4 | 0.3 | odd one out | "Three of these are the same shape rotated. Which one is different?" 6-cell asymmetric shape. Options (4): rot0, rot90, rot180 and mirror∘rot270 (answer). Do not show a separate stem; the stem is the prompt only (use empty string). |
| S5 | 0.7 | rotation | Same as S2 with an 8-cell asymmetric shape; answer rot180. |
| S6 | -0.4 | valid net | "Which of these can be folded into a cube?" Options (4): one valid net, three invalid hexominoes (e.g. 2×3 block, 5-in-a-row + 1, one containing a 2×2 block). |
| S7 | 0.4 | invalid net | "Which of these can NOT be folded into a cube?" Options (5): four valid nets (1-4-1 cross, 2-2-2 staircase, 3-3, 1-3-2) and the invalid `[[0,0],[1,0],[2,0],[3,0],[0,1],[3,1]]`. |
| S8 | 0.8 | opposite face | Net = 2-2-2 staircase `[[0,0],[1,0],[1,1],[2,1],[2,2],[3,2]]` lettered A–F. "When folded into a cube, which letter is opposite A?" Options: the 5 other letters (as large text in a small square SVG). |
| S9 | 1.1 | opposite face | Net = 1-3-2 `[[0,0],[0,1],[1,1],[2,1],[2,2],[3,2]]`, letters in a seeded-shuffled order. Ask about a letter whose opposite is not in a straight line with it. |
| S10 | 1.4 | opposite pair | Net = 3-3 `[[0,0],[1,0],[2,0],[2,1],[3,1],[4,1]]` lettered. "Which two letters end up on opposite faces?" Options (4): one opposite pair, three adjacent pairs, rendered as "B & E". |

Answers for S6–S10 must be **computed** by `foldNet`, not hard-coded. Tests must assert: every 6-cell net is connected; S6 has exactly one valid option; S7 exactly one invalid; foldNet agrees with known facts (cross net valid, 2×3 invalid, the four S7 nets valid); polyomino shapes in S1–S5 are connected and have all 8 orientations distinct; options are pairwise distinct; exactly one option satisfies the item's question.

## Series items (Agent B)

Stem: the sequence as large text, e.g. `3, 7, 11, 15, ?` in an HTML `<div class="series">` (no SVG needed). Options are plain text strings. `optionCols: 5`.

| id | b | sequence | answer | distractors |
|---|---|---|---|---|
| N1 | -2.0 | 3, 7, 11, 15, ? | 19 | 17, 18, 20, 21 |
| N2 | -1.3 | 2, 6, 18, 54, ? | 162 | 108, 72, 158, 216 |
| N3 | -0.8 | 1, 4, 9, 16, 25, ? | 36 | 30, 34, 35, 49 |
| N4 | -0.4 | B, E, H, K, ? | N | L, M, O, P |
| N5 | 0.1 | 2, 5, 11, 23, 47, ? | 95 | 71, 93, 94, 96 |
| N6 | 0.5 | 4, 9, 7, 12, 10, 15, ? | 13 | 12, 17, 18, 20 |
| N7 | 0.9 | A, C, F, J, O, ? | U | S, T, V, W |
| N8 | 1.3 | 2, 3, 5, 9, 17, 33, ? | 65 | 49, 57, 64, 66 |

Tests: recompute each answer from its rule in code and assert it matches; options distinct.

## Scoring (Agent C, `scoring.js`, pure)

3PL IRT with EAP estimation.
- `P(θ) = c + (1 − c) / (1 + exp(−a(θ − b)))`, a = 1.3 for all items, c = 1 / options.length.
- Unanswered = wrong.
- Grid θ ∈ [−4, 4], step 0.02. Prior N(0, 1). Posterior mean = θ̂, posterior SD = se.
- IQ = round(100 + 15θ̂), clamped to [55, 145]. 90% range = IQ ± round(1.645 × 15 × se).
- Percentile = Φ(θ̂) × 100.
- Per category: correct / total.
- "Hard ones you got": correct items sorted by b descending, top 3, each with `pAvg = P(0)` (chance an average person gets it right).
- Export `score(items, answers)` → `{ theta, se, iq, low, high, percentile, correct, total, byCategory: {matrix:{correct,total}, …}, hardest: [{id, index, pAvg}] }` where `index` is the 1-based question number.

## Share link (Agent C, `share.js`, pure)

`#r=<base64url(JSON)>` where JSON = `{ v: ITEMS_VERSION, n: name, a: [optionIndex or -1, …in ITEMS order], t: secondsTaken }`. Decode validates shape and version; bad input → null. Name max 40 chars. Unicode-safe (use TextEncoder/TextDecoder).

## UI (Agent C)

Screens: intro → test → results. Single `index.html`, `app.js` drives it.

Intro: title, one-line pitch ("30 puzzles, 25 minutes, full results free. No email, no paywall."), name field (optional, used on results), what to expect (3 categories), Start button.

Test: progress bar + "Question 7 of 30", countdown timer (turns warning colour under 2 min, auto-finishes at 0), prompt, stem figure, option grid (buttons, keyboard 1–6 selects, ←/→ navigate), Prev / Next, a question palette (30 small squares, answered ones filled) to jump, Finish button (confirm inline, not `window.confirm`). Progress saved in localStorage (try/catch); offer "Resume" on intro if saved.

Results (v2):
- Heading "{Name}'s results" (or "Your results").
- Hero: estimated IQ, 90% range, percentile, correct/total, time taken.
- Bell curve SVG (mean 100, SD 15) with shaded range and a marker at the IQ.
- Bars per category (percent correct), single accent colour, value labels, hover tooltip with "x of y".
- Profile (`profile.js`, pure): a short paragraph per category by band (≥75% high, 40–74% mid, <40% developing) plus an overall paragraph by IQ band. Warm, specific, not flattering nonsense.
- "Hard ones you cracked": list of hardest correct items with "about N% of people get this right".
- "Your complete analysis — free": a playful nod to the paid tests' drip emails (e.g. "No 'Question #14 reveals something rare about you' emails. Here's everything."). Keep it light; no brand names.
- Review: every question with her answer vs the correct one (collapsible).
- Share button: copies the `#r=` link (navigator.clipboard, fallback select text). Opening a `#r=` link renders results read-only with a "Take the test yourself" button.
- "About this test" footnote: questions are original, built from published construction rules (matrix rules as in the Open Matrices Item Bank and Sandia Matrices research; cube-net and mental-rotation tasks); difficulty is estimated, not normed on a population; the score is an estimate for fun, not a clinical assessment.

Design: clean, calm, generous whitespace, system font stack, max width ~760px, works at 360px wide (16px side gutter, no horizontal scroll), light + dark via `prefers-color-scheme` with CSS tokens on `:root` (`--bg`, `--surface`, `--ink`, `--muted`, `--mid`, `--accent`, `--line`, `--warn`, `--good`). Option buttons: figure centered, clear selected state (accent ring), large tap targets. Figures inherit `color: var(--ink)`.
