// Presentation layer ("format v4"): turns a legacy item into what new tests show.
// Pure: no DOM. Imported by engine.js.
//
// The item generators are frozen (old share links rebuild from them), so nothing here
// changes generator output. In format 'v4' the engine takes the legacy item and
//   1. keeps the correct answer plus exactly 3 of its distractors (seeded, deterministic),
//   2. reorders the 4 options so the answer is uniform over the 4 slots,
//   3. swaps in a clear prompt written for the template,
//   4. shows number analogies as stacked fractions (top over bottom),
//   5. rewords explanations that talk about the removed options or the old "a : b :: c : ?" notation.
// Format 'legacy' (or no format) means the item is returned untouched.
import { rng, placeOptions } from './rng.js';

export const FORMAT_LEGACY = 'legacy';
export const FORMAT_V4 = 'v4';
export const V4_OPTIONS = 4;

export function normalizeFormat(format) {
  return format === FORMAT_V4 || format === 4 || format === '4' ? FORMAT_V4 : FORMAT_LEGACY;
}
export const isV4 = (format) => normalizeFormat(format) === FORMAT_V4;
// Result payloads, saved tests and CAT state carry `f: 4` for v4. Absent = legacy.
export const formatFromField = (f) => (f === 4 ? FORMAT_V4 : FORMAT_LEGACY);
export const fieldFromFormat = (format) => (isV4(format) ? 4 : undefined);

// ---------------------------------------------------------------- prompts
const LOOK = 'Look at how the tiles change across each row and down each column.';
const MATRIX = `Which tile replaces the question mark? ${LOOK}`;
const matrixWith = (extra) => `Which tile replaces the question mark? ${extra} ${LOOK}`;
const SERIES_NUM = 'Which number comes next in the sequence?';
const SERIES_LETTER = 'Which letter comes next in the sequence? Use the alphabet A to Z in order.';
const TERM_LN = 'Each term is a letter followed by a number. Which term comes next in the sequence?';
const FOLD = 'Which picture shows the sheet unfolded? The paper is folded in the order shown, then holes are punched through every layer.';
const FOLD_DIAG = `${FOLD} Some folds run corner to corner.`;
const CODE = 'The first word has been changed into a code. Use the same code on the second word. What replaces the question mark?';
const ROTATED = 'Which option shows the same shape turned round, not flipped over? Mirror images do not count.';
const NET = 'Which cube can be made by folding this net? The symbols end up on the outside.';
const NET_TURNED = 'Which cube can be made by folding this net? The symbols end up on the outside, and the way each one is turned matters.';
const STACK = 'How many cubes are in the stack? Every cube rests on the floor or on another cube, so some are hidden from view.';
const PAIR = 'Which pair of pieces fits together to make the shape? The pieces may be turned but not flipped over, and they must not overlap.';
const HIDDEN = 'Which figure has the shape on the left hidden inside it? The shape is the same size and the same way round, with extra lines around it.';
const OBJECT = 'Which option shows the same object as the one on the left, turned to a new position? Mirror images and different objects are wrong.';
const ODD = 'Which figure does not belong? Three of the four share something that the odd one does not have.';
const ANALOGY = 'Which figure does the same rule turn the third figure into? The rule changes the first figure into the second.';
const DOMINO =
  'Which domino comes next? Each domino follows the same rules as the ones before it. Pips go from 0 to 6, and 6 is followed by 0. Dominoes always stay the same way up.';
const SYMBOLS = 'Each shape stands for a positive whole number, the same number every time it appears. Which number replaces the question mark?';
const GRID_RULE = 'Which number replaces the question mark? The grid follows one rule: look along its rows and columns.';
const FRACTION = 'Each pair is a top number and a bottom number. The same rule turns each top number into the bottom number; it is not division. What number replaces the question mark?';

const oppositeLetter = (p) =>
  p.replace(/^When folded into a cube, which letter is opposite (\w)\?$/, 'Fold the net into a cube. Which letter is on the face opposite $1?');
const gears = (p) => p.replace(/Which gears turn (clockwise|anticlockwise)\?/, 'Which option lists every gear that turns $1, and no others?');

// One prompt per template. A string, or a function of the legacy prompt for the templates whose
// prompt carries variant values (days, angles, letters, routes, gear directions). Those only have
// their static wording rewritten; the values stay. A function that matches nothing returns the
// legacy prompt unchanged.
export const PROMPTS = {
  // ---- pattern reasoning: grids
  M1: MATRIX,
  M2: MATRIX,
  M3: matrixWith('Each tile shows an arrow.'),
  M4: MATRIX,
  M5: matrixWith('Each tile is made of lines.'),
  M6: MATRIX,
  M7: MATRIX,
  M8: matrixWith('Each tile is made of lines.'),
  M9: MATRIX,
  M10: MATRIX,
  M11: matrixWith('Each tile is made of lines.'),
  M12: MATRIX,
  R1: MATRIX,
  R2: MATRIX,
  R3: MATRIX,
  R4: MATRIX,
  R5: matrixWith('Each tile has one shape inside another.'),
  R6: matrixWith('Each tile has a left shape and a right shape.'),
  R7: MATRIX,
  R8: MATRIX,
  R9: MATRIX,
  R10: MATRIX,
  // ---- pattern reasoning: series, odd one out, analogies
  F1: 'Which figure comes next in the series? The arrow turns step by step.',
  F2: 'Which figure comes next in the series? Look at what is added at each step.',
  F3: 'Which figure comes next in the series? Follow the dot as it moves round the frame.',
  F4: 'Which figure comes next in the series? Two patterns take turns, so compare every other figure.',
  F5: 'Which figure comes next in the series? The turning and the number of dots both change step by step.',
  O1: ODD,
  O2: ODD,
  O3: ODD,
  O4: ODD,
  A1: ANALOGY,
  A2: ANALOGY,
  A3: ANALOGY,
  A4: ANALOGY,
  A5: `${ANALOGY} The rule has two changes.`,
  // ---- spatial
  S1: 'Which option shows this figure in a vertical mirror (flipped left to right)? Top and bottom stay where they are.',
  S2: ROTATED,
  S3: ROTATED,
  S4: 'Which shape is different? Three of the four are the same shape, only turned round.',
  S5: ROTATED,
  S6: 'Which of these flat shapes folds up into a cube? Each one is made of six squares.',
  S7: 'Which of these flat shapes can NOT be folded into a cube? Three of them can. Each one is made of six squares.',
  S8: oppositeLetter,
  S9: oppositeLetter,
  S10: 'Fold the net into a cube. Which pair of letters ends up on opposite faces?',
  P1: FOLD,
  P2: FOLD,
  P3: FOLD,
  P4: FOLD_DIAG,
  P5: FOLD_DIAG,
  C1: NET,
  C2: NET,
  C3: NET_TURNED,
  C4: NET_TURNED,
  K1: STACK,
  K2: STACK,
  K3: 'How many more cubes are needed to make a solid block 3 × 3 cubes wide and as tall as the tallest column? Every cube rests on the floor or on another cube.',
  H1: PAIR,
  H2: PAIR,
  H3: PAIR,
  E1: HIDDEN,
  E2: HIDDEN,
  E3: HIDDEN,
  Y1: OBJECT,
  Y2: OBJECT,
  Y3: OBJECT,
  Y4: OBJECT,
  W1: gears,
  W2: gears,
  W3: (p) =>
    p.replace(
      /Where are you now, compared with your starting point\?$/,
      'Left and right are from your own point of view. Which option shows where you are now, compared with where you started?',
    ),
  // ---- numerical and sequence reasoning
  N1: SERIES_NUM,
  N2: SERIES_NUM,
  N3: SERIES_NUM,
  N4: SERIES_LETTER,
  N5: SERIES_NUM,
  N6: SERIES_NUM,
  N7: SERIES_LETTER,
  N8: SERIES_NUM,
  X1: SERIES_NUM,
  X2: SERIES_NUM,
  X3: SERIES_NUM,
  X4: SERIES_NUM,
  X5: SERIES_NUM,
  X6: SERIES_NUM,
  L1: TERM_LN,
  L2: 'Each term is a pair of letters. Which pair comes next in the sequence?',
  L3: 'Numbers and letters take turns in this sequence. Which term comes next?',
  L4: TERM_LN,
  L5: TERM_LN,
  G1: GRID_RULE,
  G2: GRID_RULE,
  G3: 'Each diagram has four corner numbers and a centre number, and all three follow the same rule. Which number replaces the question mark?',
  G4: GRID_RULE,
  D1: CODE,
  D2: CODE,
  D3: CODE,
  Q1: FRACTION,
  Q2: FRACTION,
  Q3: FRACTION,
  T1: SYMBOLS,
  T2: SYMBOLS,
  T3: SYMBOLS,
  Z1: DOMINO,
  Z2: DOMINO,
  Z3: DOMINO,
  J1: 'Which clock comes next? The clocks follow one rule, and both hands matter.',
  J2: (p) => p, // the legacy wording is already a plain question about a day of the week
  J3: 'Which clock comes next? The gap between one clock and the next changes by the same amount each step.',
  J4: (p) =>
    p.replace(
      /^What is the smaller angle between the hour hand and the minute hand when the clock shows (\d+:\d+)\?$/,
      'The clock shows $1. What is the smaller angle between the hour hand and the minute hand?',
    ),
};

export function promptFor(tid, legacyPrompt) {
  const p = PROMPTS[tid];
  if (typeof p === 'function') return p(legacyPrompt);
  return p ?? legacyPrompt;
}

// ---------------------------------------------------------------- number analogies as fractions
const fracCell = (top, bottom) =>
  `<span class="frac"><span class="frac-top">${top}</span><span class="frac-bot">${bottom}</span></span>`;

// xs/ys: the two worked pairs; x3: the top number of the last pair (its bottom is the question).
export function fractionStem(xs, ys, x3) {
  const label =
    `Number pairs, each with a top number over a bottom number: ${xs[0]} over ${ys[0]}, ${xs[1]} over ${ys[1]}, ` +
    `${x3} over question mark. The same rule turns each top number into its bottom number.`;
  return (
    `<div class="series series-frac" role="img" aria-label="${label}">` +
    fracCell(xs[0], ys[0]) +
    fracCell(xs[1], ys[1]) +
    fracCell(x3, '<span class="q">?</span>') +
    '</div>'
  );
}

// ---------------------------------------------------------------- explanations
function explainQ(tid, m) {
  const [a, , c] = m.xs;
  const ans = m.ys[2];
  const sg = m.c > 0 ? '+' : '-';
  switch (tid) {
    case 'Q1':
      return `The rule goes from top to bottom: the bottom number is the top number squared (${a} → ${m.ys[0]}, ${m.xs[1]} → ${m.ys[1]}). So ${c} → ${c} × ${c} = ${ans}.`;
    case 'Q2':
      return `The rule goes from top to bottom: cube the top number and ${m.c > 0 ? 'add' : 'subtract'} 1 (${a}³ ${sg} 1 = ${m.ys[0]}). So ${c} → ${c}³ ${sg} 1 = ${c ** 3} ${sg} 1 = ${ans}.`;
    default: {
      const k = Math.abs(m.c);
      return `The rule goes from top to bottom: square the top number, multiply by ${m.m}, then ${m.c > 0 ? 'add' : 'subtract'} ${k} (${m.m} × ${a ** 2} ${sg} ${k} = ${m.ys[0]}). So ${c} → ${m.m} × ${c ** 2} ${sg} ${k} = ${ans}.`;
    }
  }
}

const OTHER_PAIRS_FAIL = /The other pairs fail:.*$/;
const MIRROR_TAIL = [/One option is its mirror image.*$/, 'The other options are mirror images (which no rotation can match) or objects with the arms or single cubes arranged differently.'];
// Explanations that count or describe the other options are reworded to stay true with 3 distractors.
const EXPLAIN_FIX = {
  O1: [[/^Four of the figures/, 'Three of the figures'], [/\s*\(\d+(?:, \d+)* and \d+\)/, '']],
  O2: [[/^Four figures/, 'Three figures']],
  O3: [[/^Four of the figures/, 'Three of the figures']],
  O4: [[/^Four of the figures/, 'Three of the figures']],
  S6: [[/The other options contain [^.]*?, which would pile/, 'The other options are not cube nets: they would pile']],
  S7: [[/The other four are genuine cube nets \([^)]*\)\./, 'The other three are genuine cube nets.']],
  H1: [[OTHER_PAIRS_FAIL, 'The other pairs fail: they have the wrong number of squares, or they leave a gap or overlap wherever they are turned.']],
  H2: [[OTHER_PAIRS_FAIL, 'The other pairs fail: they have the wrong number of squares, need a piece flipped over (not allowed), or leave a gap or overlap wherever they are turned.']],
  H3: [[OTHER_PAIRS_FAIL, 'The other pairs fail: they need a piece flipped over (not allowed), or leave a gap or overlap wherever they are turned.']],
  Y1: [MIRROR_TAIL],
  Y2: [MIRROR_TAIL],
  Y3: [MIRROR_TAIL],
  Y4: [MIRROR_TAIL],
};

export function explanationFor(tid, text, meta) {
  if (/^Q[123]$/.test(tid) && meta?.xs && meta?.ys) return explainQ(tid, meta);
  let out = String(text ?? '');
  for (const [re, rep] of EXPLAIN_FIX[tid] || []) out = out.replace(re, rep);
  return out;
}

// ---------------------------------------------------------------- option reduction
const NUM_RE = /^\s*-?\d+(?:\.\d+)?\s*°?\s*$/;
const isNumeric = (o) => typeof o === 'string' && NUM_RE.test(o);

// Odd-one-out items: cutting the four matching figures to three must not leave some other simple
// property singling out a second figure. Features are read from the option markup.
const polysOf = (svg) =>
  [...String(svg).matchAll(/points="([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/).map((p) => p.split(',').map(Number)));
const bboxOf = (pts) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const fillsOf = (svg) => [...String(svg).matchAll(/class="(f-[a-z]+)"/g)].map((m) => m[1]).sort().join(',');
const areaOf = (pts) =>
  Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2);

// Cell coordinates of tile figures (every polygon a square tile). `origin` is the top-left of the
// grid when the figure sits in a fixed grid (O4); otherwise cells are relative to the figure itself.
function cellsOf(polys, origin = null) {
  const first = bboxOf(polys[0]);
  const cs = first[2] - first[0];
  if (!(cs > 0)) return null;
  const tl = [];
  for (const p of polys) {
    const b = bboxOf(p);
    if (Math.abs(b[2] - b[0] - cs) > 0.1 || Math.abs(b[3] - b[1] - cs) > 0.1) return null;
    tl.push([b[0], b[1]]);
  }
  const ox = origin ?? Math.min(...tl.map((c) => c[0]));
  const oy = origin ?? Math.min(...tl.map((c) => c[1]));
  return tl.map(([x, y]) => [Math.round((x - ox) / cs), Math.round((y - oy) / cs)]);
}

// Simple properties other than the intended one, as one value per figure (index 0 = the answer).
function oddFeatures(tid, svgs) {
  const polys = svgs.map(polysOf);
  const feats = [svgs.map(fillsOf)];
  if (tid === 'O2') {
    feats.push(
      polys.map((ps) => {
        const p = ps[0];
        const L = p.map((q, i) => Math.hypot(q[0] - p[(i + 1) % p.length][0], q[1] - p[(i + 1) % p.length][1]));
        return Math.max(...L) - Math.min(...L) < 0.5;
      }),
      polys.map((ps) => {
        const b = bboxOf(ps[0]);
        const r = (b[2] - b[0]) / (b[3] - b[1]);
        return r > 1.15 ? 'wide' : r < 0.87 ? 'tall' : 'even';
      }),
      polys.map((ps) => Math.round(areaOf(ps[0]) / 100)),
    );
    return feats;
  }
  // O4 draws its 5x5 grid centred in the 100x100 frame (13-unit tiles); O3 figures float free.
  const cells = polys.map((ps) => cellsOf(ps, tid === 'O4' ? 17.5 : null));
  if (cells.some((c) => !c)) return feats;
  const ext = (c, k) => Math.max(...c.map((p) => p[k])) - Math.min(...c.map((p) => p[k])) + 1;
  feats.push(cells.map((c) => c.length));
  if (tid === 'O3') feats.push(cells.map((c) => ext(c, 0) > ext(c, 1)), cells.map((c) => ext(c, 0) < ext(c, 1)));
  if (tid === 'O4') {
    const sym = (c, f) => {
      const s = new Set(c.map((p) => p.join()));
      return c.every((p) => s.has(f(p).join()));
    };
    // the figure may be drawn transposed, so both axes are listed
    feats.push(
      cells.map((c) => ext(c, 0)),
      cells.map((c) => ext(c, 1)),
      cells.map((c) => sym(c, (p) => [4 - p[0], p[1]])),
      cells.map((c) => sym(c, (p) => [p[0], 4 - p[1]])),
      cells.map((c) => sym(c, (p) => [4 - p[0], 4 - p[1]])),
      cells.map((c) => sym(c, (p) => [p[1], p[0]])),
      cells.map((c) => c.filter((p) => p[0] < 2).length),
      cells.map((c) => c.filter((p) => p[1] < 2).length),
    );
  }
  return feats;
}

// index of the one value that differs while all others agree, else -1
function singled(vals) {
  for (let i = 0; i < vals.length; i++) {
    const rest = vals.filter((_, j) => j !== i);
    if (rest.every((v) => v === rest[0]) && vals[i] !== rest[0]) return i;
  }
  return -1;
}

const ODD_HAZARD = new Set(['O2', 'O3', 'O4']);
const ODD_HINT = {
  O2: 'Hint: count the sides of each shape.',
  O3: 'Hint: some figures are turned, one is flipped.',
  O4: 'Hint: look at each figure\'s left and right halves.',
};

function seededOrder(r, n) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// Choose 3 distractors out of a legacy item's. `r` is seeded from `${tid}#${variantSeed}#4`.
function chooseDistractors(tid, item, r) {
  const ans = item.options[item.answer];
  const dis = item.options.filter((_, i) => i !== item.answer);
  if (dis.length <= V4_OPTIONS - 1) return dis;
  // Numbers: keep the two closest values (plausible near misses) plus one more drawn at random,
  // so the answer is not simply the middle option.
  if (isNumeric(ans) && dis.every(isNumeric)) {
    const av = parseFloat(ans);
    const ranked = dis
      .map((d) => ({ d, gap: Math.abs(parseFloat(d) - av), k: r() }))
      .sort((x, y) => x.gap - y.gap || x.k - y.k);
    const rest = ranked.slice(2);
    return [ranked[0].d, ranked[1].d, rest[Math.floor(r() * rest.length)].d];
  }
  const order = seededOrder(r, dis.length);
  if (ODD_HAZARD.has(tid)) {
    // Drop the matching figure that leaves the fewest other properties singling a figure out
    // (usually none); ties go to the seeded order. Index 0 is the answer, the intended odd one.
    let best = null;
    for (const drop of order) {
      const kept = dis.filter((_, i) => i !== drop);
      const hazards = oddFeatures(tid, [ans, ...kept]).filter((v) => singled(v) >= 1).length;
      if (best === null || hazards < best.hazards) best = { kept, hazards };
      if (hazards === 0) break;
    }
    // Some figure sets leave a second property that also singles one out; then name the rule.
    if (best.hazards > 0) return Object.assign(best.kept, { hint: ODD_HINT[tid] });
    return best.kept;
  }
  return order.slice(0, V4_OPTIONS - 1).map((i) => dis[i]);
}

// Desktop columns: 4 across, or 2x2 for large figures and wide/long options. Phones always get 2x2 (ui.js).
const LARGE_RE = /^[YCPHE]\d/;
export function optionColsV4(tid, options) {
  const textual = options.every((o) => !String(o).trim().startsWith('<'));
  if (textual) return options.some((o) => String(o).length > 10) ? 2 : 4;
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(String(options[0]));
  const wide = !!vb && Number(vb[1]) / Number(vb[2]) >= 1.8;
  return LARGE_RE.test(tid) || wide ? 2 : 4;
}

// Input: the generator's { item, meta, explanation }. Returns the v4 { item, explanation }.
export function presentItem(tid, variantSeed, { item, meta, explanation }) {
  const key = `${tid}#${variantSeed}#4`;
  const kept = chooseDistractors(tid, item, rng(key));
  const placed = placeOptions(key, item.options[item.answer], kept);
  const out = {
    ...item,
    prompt: kept.hint ? `${promptFor(tid, item.prompt)} ${kept.hint}` : promptFor(tid, item.prompt),
    options: placed.options,
    answer: placed.answer,
    optionCols: optionColsV4(tid, placed.options),
  };
  if (/^Q[123]$/.test(tid) && meta?.xs && meta?.ys) {
    out.stem = fractionStem(meta.xs.slice(0, 2), meta.ys.slice(0, 2), meta.xs[2]);
  }
  return { item: out, explanation: explanationFor(tid, explanation, meta) };
}
