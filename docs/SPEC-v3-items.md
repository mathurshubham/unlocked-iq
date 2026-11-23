# v3: more question types (item families)

Goal: a much larger template pool so repeat test-takers see different kinds of questions, not just re-skinned versions of the same 30. Read `docs/SPEC.md` (item object + SVG rules) and `docs/SPEC-v2.md` (engine) first.

## Hard constraints

- **Do not edit** existing engine files (`engine.js`, `items-matrix.js`, `items-spatial.js`, `items-series.js`, `svg.js`, `cube.js`, `rng.js`, `explain.js`, `scoring.js`, `cat.js`, `items.js`). Old share links rebuild from them; `test/fixtures/v2-items.json` guards this. You may **import** from `rng.js`, `svg.js`, `cube.js` (read-only).
- Each agent writes **one new module** + **one test file** (names below). The integrator wires modules into `engine.js`.
- Pure ES modules: no DOM, no `window`, deterministic from the seed (use `rng(seed)` / `placeOptions`).
- **Write our own generators.** Use published research for rules and ideas (cited below), never copy code or items from GPL/academic-only sources.
- Category stays one of `matrix` (shown as "Pattern reasoning"), `spatial`, `series` (shown as "Numerical & sequence reasoning"). No new categories.

## Module contract

```js
// public/js/items-<family>.js
export const TEMPLATES = [
  { id: 'R1', category: 'matrix', b: -1.2, family: 'raven', title: 'Grid with one rule' },
  …
];
// Build one variant. seed: uint32 (0 is a normal seed here). Deterministic.
export function variant(id, seed) { return { item, meta }; }
// Explanation from the variant's actual parameters (1–3 plain sentences, no option numbers).
export function explain(id, meta) { return '…'; }
```

`item` follows the v1 item contract exactly: `{ id, category, b, prompt, stem, options, answer, optionCols }` (`id` = template id). Options: 4–6, pairwise distinct (by a canonical key, not just markup), exactly one correct. Option order via `placeOptions(\`${id}#${seed}\`, answer, distractors)` from `rng.js`.

Template id prefixes (globally unique; never reuse M, S, N):

| Agent | Module | Test file | Prefixes |
|---|---|---|---|
| P (pattern) | `public/js/items-figural.js` | `test/figural.test.mjs` | `R` raven-style matrices, `F` figure series, `O` odd one out, `A` figural analogies |
| Q (spatial) | `public/js/items-spatial2.js` | `test/spatial2.test.mjs` | `P` paper folding, `C` cube views, `K` block counting, `H` shape assembly |
| N (numeric) | `public/js/items-numeric.js` | `test/numeric.test.mjs` | `L` letter–number series, `G` number grids, `D` coding, `Q` number analogies, `T` symbol equations, `X` extra number series |

Ids are `<prefix><n>` (e.g. `R1`…`R10`). `b` is an estimated IRT difficulty in roughly −2.2…+2.0 (more rules/steps/transformations ⇒ higher b). Give each family a spread of difficulties.

## Quality bar (tests must prove, ≥200 seeds per template)

1. Exactly one option satisfies the rule — verified by an **independent** re-computation in the test (parse the generated meta or markup, recompute the answer with separate code), not by trusting the generator.
2. Options pairwise distinct by canonical key; answer ≠ any distractor; no visually identical options (e.g. a circle rotated 90° equals itself — canonicalise).
3. Markup rules: no `id=`, `<defs`, `url(#`; fills only via `f-none`/`f-grey`/`f-solid` classes; `stroke="currentColor"`; one viewBox per item's options; text uses `fill="currentColor"`.
4. Distractors are plausible: built from common error patterns (one attribute wrong, wrong rule, off-by-one, mirror instead of rotation…). For matrix-like families, guard against the "answer by elimination" shortcut: the correct option must **not** be identifiable from the options alone by taking the most common value of each attribute (I-RAVEN's criticism of RAVEN). Test: this heuristic picks the answer in ≤ 45% of seeds.
5. Explanation non-empty, mentions the rule, consistent with the answer.
6. Determinism: `variant(id, s)` twice gives identical output.
7. Variety: ≥ 30 distinct stems over 200 seeds per template (unless the space is genuinely small; justify in report).

## Families

### Agent P — pattern reasoning (`matrix`)

- **R: RAVEN-style attribute matrices** (8–10 templates). 3×3 grid; panels contain entities with attributes *number, position, type (shape), size, colour (fill)*; each attribute governed per row by a rule from {constant, progression (±1/±2), arithmetic (col3 = col1 ± col2), distribute-three}. Configurations: single centred object, 2×2 grid of slots, 3×3 grid of slots, left–right pair, outer–inner. Difficulty from number of non-constant attributes and rule type (arithmetic/distribute harder). Distractors via **attribute bisection** (I-RAVEN): modify answer along a balanced tree of attribute changes so every option shares features evenly. Sources: RAVEN (Zhang et al., CVPR 2019), I-RAVEN (Hu et al., AAAI 2021), Carpenter, Just & Shell (1990) rule taxonomy, matRiks (MIT) for distractor error patterns.
- **F: figure series** (5 templates). A row of 4–5 panels then "?": rotation by fixed step, element added each step, dot moving around a frame, two interleaved sequences, combined rotation+count. 5 options.
- **O: odd one out** (4 templates). 5 figures; four share a property (same shape under rotation vs one mirrored; same count parity; same number of sides inside; symmetric vs not; same rotation relation between inner and outer). "Which one does not belong?" Make sure exactly one is odd under the intended rule **and** no other simple property singles out a different option (test with a list of alternative properties: shape, fill, count, size, orientation).
- **A: figural analogies** (5 templates). "A is to B as C is to ?". Transformations: rotation, reflection, scale, fill change, add/remove element, combine two. Source: Blum & Holling (2018) IMak (GPL — ideas only), Yang et al. (2021) review.

### Agent Q — spatial (`spatial`)

- **P: paper folding / hole punch** (5 templates). Square sheet shown folded in 1–3 steps (show each fold as a panel: dashed fold line + arrow, then the folded shape), then a punched hole(s). "Which shows the paper unfolded?" Compute the unfolded holes by reflecting across fold lines in reverse order (simulate on a grid, e.g. 4×4 or 6×6 sub-grid of hole positions). Folds: vertical, horizontal, diagonal (harder). Distractors: missing one reflection, reflected across wrong axis, extra/missing hole, shifted hole. Sources: ETS Paper Folding Test (VZ-2) format (Ekstrom et al. 1976), SpatialViz-Bench (2025) generator description.
- **C: cube views from a net** (4 templates). Net with 6 distinct face symbols (use simple asymmetric glyphs or colour+symbol so orientation is meaningful only where intended). "Which cube can be made from this net?" Render cubes in an isometric view showing 3 faces. Correct cube from folding (reuse `foldNet`/orientation logic from `cube.js`; you may need face orientation tracking — implement in your module). Distractors: two opposite faces shown together (easy), correct faces but wrong cyclic order (mirror — hard), wrong rotation of an asymmetric symbol (hardest).
- **K: block counting** (3 templates). Isometric stack of unit cubes from a height map where every column's top is visible (taller columns at the back), "How many cubes?" Options: answer, answer ±1, ±2, visible-only count. Rule stated in prompt: "Every cube rests on the floor or on another cube."
- **H: shape assembly** (3 templates). A target shape (polyomino) and 4–5 option pairs of pieces; "Which two pieces fit together to make the shape?" (pieces may be rotated, not flipped). Verify by exhaustive placement search.

### Agent N — numerical & sequence (`series`)

- **L: letter–number series** (5 templates): interleaved letter/number sequences (A1, C3, E5…), skip patterns, two alternating sub-series, pairs (AZ, BY, CX…). Thurstone/ICAR style — write your own items.
- **G: number grids** (4 templates): 3×3 grid of numbers with one missing; rules: row sum constant, col3 = col1 × col2, centre = sum of corners, each row is an arithmetic progression with row-specific step. Render as an SVG or HTML grid.
- **D: coding / decoding** (3 templates): "If CAT is written as DBU, how is DOG written?" (shift), reversal + shift, letter-to-position number code. Use a curated common-word list in the module (short English words).
- **Q: number analogies** (3 templates): 3 : 9 :: 5 : ? (square), 2 : 9 :: 3 : ? (n³+1), pairs with two-step rules.
- **T: symbol equations** (3 templates): small systems with shapes standing for numbers (▲ + ▲ = 10, ▲ + ● = 8, ● × ■ = 12 → ■ = ?). Render shapes inline SVG. Unique integer solution, verified by brute force in tests.
- **X: extra number series** (5 templates): rules not in N1–N8 — triangular numbers, primes, squares + 1, alternating ×2 / +3, Fibonacci-like with different seeds, differences that are squares.

Distractors: off-by-one step, wrong operation, applying the rule one step too far, arithmetic slip. All ≤ 4 digits.

### Agent V — extra spatial + sequence families (`public/js/items-extra.js`, `test/extra.test.mjs`)

Prefixes: `E` embedded figures, `Y` 3D mental rotation, `W` gears & directions (all `spatial`); `Z` domino sequences, `J` clock & calendar reasoning (both `series`).

- **E: embedded figures** (3 templates). A simple target shape (polyline figure) and 4–5 complex figures; "In which figure is the shape hidden?" (same size and orientation). Verify by exact segment-containment search. Source: Witkin's Embedded Figures Test format (ideas only).
- **Y: 3D mental rotation** (4 templates). Shepard & Metzler-style polycube objects (8–10 cubes in arms) rendered isometrically; "Which option is the same object, rotated?" Distractors are mirror images (rotated) and different objects. Verify with 3D orientation canonicalisation (24 rotations vs mirrored set). Sources: Shepard & Metzler (1971); Vandenberg & Kuse (1978); Ganis & Kievit (2015, CC BY) stimulus design — generate our own.
- **W: gears & directions** (3 templates). A chain of 3–6 meshing gears (some on shared axles for harder templates); "If the first gear turns clockwise, which way does the last turn?" (2 options would be too guessable — ask instead "which gears turn clockwise?" with 4–5 option sets, or the direction + relative speed). Also a compass/route template: "Walk 3 north, turn right, …; which direction are you facing / where are you relative to start?" rendered as text + small compass.
- **Z: domino sequences** (3 templates). Rows of dominoes (two halves with pips 0–6) following rules on each half (top +1, bottom −1, wrap 0–6, alternating). Render pips in SVG. "Which domino comes next?"
- **J: clock & calendar** (3 templates). Clock faces advancing by a fixed or growing interval ("which time comes next?", rendered as analog clocks), angle between hands, day-of-week arithmetic in text.

Same quality bar as above (independent verification ≥200 seeds, canonical distinctness, plausible distractors, explanations).
