// v3 items, Agent N: numerical & sequence reasoning (category 'series').
// Families: L letter-number series, G number grids, D coding/decoding,
// Q number analogies, T symbol equations, X extra number series.
//
// Pure ES module: no DOM. Every generator is deterministic from (id, seed).
//
// Research behind the item formats (ideas only; every generator here is
// written from scratch):
//  - Thurstone's letter series (Thurstone & Thurstone, Primary Mental Abilities)
//    and the ICAR letter-and-number series format (Condon & Revelle, 2014,
//    Intelligence 43) for letter/number interleaving and skip patterns.
//  - Rule-based number-series construction: Holling, Bertling & Zeuch (2009)
//    and related work on automatic generation of number series, where
//    difficulty follows the number and type of rules (constant step, recursive,
//    alternating, second-order differences).
//  - Standard coding-decoding, number-analogy ("a : b :: c : ?"), number-grid and
//    symbol-equation formats used in classic aptitude and reasoning tests.
//
// Contract: see docs/SPEC-v3-items.md. `variant(id, seed)` -> { item, meta },
// `explain(id, meta)` -> 1-3 plain sentences using the actual numbers.
import { placeOptions, rng } from './rng.js';

export const TEMPLATES = [
  { id: 'L1', category: 'series', b: -1.0, family: 'letter-number', title: 'Letter-number pairs, both stepping' },
  { id: 'L2', category: 'series', b: -0.3, family: 'letter-number', title: 'Mirror letter pairs' },
  { id: 'L3', category: 'series', b: 0.4, family: 'letter-number', title: 'Interleaved letters and numbers' },
  { id: 'L4', category: 'series', b: 1.0, family: 'letter-number', title: 'Growing letter jumps, multiplying numbers' },
  { id: 'L5', category: 'series', b: 1.5, family: 'letter-number', title: 'Letter steps with Fibonacci numbers' },
  { id: 'G1', category: 'series', b: -0.8, family: 'number-grid', title: 'Grid with constant line sums' },
  { id: 'G2', category: 'series', b: -0.1, family: 'number-grid', title: 'Grid: third = first times second' },
  { id: 'G3', category: 'series', b: 0.6, family: 'number-grid', title: 'Centre is the sum of the corners' },
  { id: 'G4', category: 'series', b: 1.1, family: 'number-grid', title: 'Lines are progressions with their own step' },
  { id: 'D1', category: 'series', b: -1.1, family: 'coding', title: 'Letter shift code' },
  { id: 'D2', category: 'series', b: 0.5, family: 'coding', title: 'Reverse then shift code' },
  { id: 'D3', category: 'series', b: -0.3, family: 'coding', title: 'Letter-to-position number code' },
  { id: 'Q1', category: 'series', b: -0.9, family: 'analogy', title: 'Number analogy: squares' },
  { id: 'Q2', category: 'series', b: 0.2, family: 'analogy', title: 'Number analogy: cubes plus or minus 1' },
  { id: 'Q3', category: 'series', b: 1.2, family: 'analogy', title: 'Number analogy: square, multiply, adjust' },
  { id: 'T1', category: 'series', b: -1.0, family: 'symbol-equation', title: 'Two shapes, repeated sum' },
  { id: 'T2', category: 'series', b: 0.3, family: 'symbol-equation', title: 'Three shapes, sum then product' },
  { id: 'T3', category: 'series', b: 1.4, family: 'symbol-equation', title: 'Three shapes, interlocked equations' },
  { id: 'X1', category: 'series', b: -0.5, family: 'series-extra', title: 'Triangular numbers' },
  { id: 'X2', category: 'series', b: -0.1, family: 'series-extra', title: 'Squares plus or minus a constant' },
  { id: 'X3', category: 'series', b: 0.8, family: 'series-extra', title: 'Alternating multiply and add' },
  { id: 'X4', category: 'series', b: 0.2, family: 'series-extra', title: 'Fibonacci-like with other seeds' },
  { id: 'X5', category: 'series', b: 1.3, family: 'series-extra', title: 'Differences are consecutive squares' },
  { id: 'X6', category: 'series', b: -0.6, family: 'series-extra', title: 'Consecutive primes' },
];
const B = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.b]));

// Short, common, inoffensive words for the coding items (3-5 letters, none a palindrome).
export const WORDS = (
  'CAT DOG PEN CUP HAT BAG BOX BED BUS CAR COW DAY EGG FAN FIG FOX GUM JAM JAR KEY LAP LEG MAP MUD NET NUT OWL PIG ' +
  'RAT RUG SUN TEA TOY VAN WEB ZIP PIE PAN PEA RED SKY TOP TIN TUB ICE INK JET LID LIP MAT OIL ' +
  'BALL BIRD BOOK CAKE COAT DESK DOOR DUCK FARM FISH FROG GAME GIFT GOAT HAND HILL HORN JUMP KITE LAMP LEAF LION ' +
  'MILK MOON NEST NOSE PARK RAIN RING ROAD ROSE SAND SHIP SNOW SOUP STAR TREE WIND WOLF YARD BELL BOAT CAMP COIN ' +
  'FORK HOME LAKE MOTH PLUM SEED SOCK TAIL WAVE ' +
  'APPLE BREAD BRUSH CHAIR CLOCK CLOUD DANCE DRESS EARTH FLAME FRUIT GRASS HOUSE LEMON LIGHT MOUSE OCEAN PAPER ' +
  'PLANT RIVER SHEEP SMILE TABLE TIGER TRAIN WATER WHEAT BEACH CANDY HORSE STONE PIANO ROBOT ' +
  'BOWL DRUM FLAG JELLY MANGO NURSE PEACH QUEEN SHELL SPOON TOAST BRICK CHEST DAISY EAGLE FIELD GRAPE HONEY MAPLE OLIVE PEARL SALAD SNAIL GLOVE'
).split(' ');

// ---------------------------------------------------------------- helpers
const L = (n) => String.fromCharCode(65 + n);
const code = (c) => c.charCodeAt(0) - 65;
const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const range = (n) => Array.from({ length: n }, (_, i) => i);
function shuffle(r, a) {
  const o = a.slice();
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}
const numOk = (v) => Number.isInteger(v) && v >= 1 && v <= 9999;
const lnOk = (v) => /^[A-Z][1-9]\d{0,3}$/.test(v);
const letterOk = (v) => /^[A-Z]$/.test(v);
const pairOk = (v) => /^[A-Z]{2}$/.test(v);

// Choose n distinct, valid distractors from error-pattern candidates (shuffled),
// topped up from a fallback list. Returns null if there are not enough.
function pickDis(r, ans, cands, ok, fallback, n = 4) {
  const seen = new Set([String(ans)]);
  const out = [];
  const take = (v) => {
    if (v === undefined) return;
    const k = String(v);
    if (out.length < n && !seen.has(k) && ok(v)) {
      seen.add(k);
      out.push(v);
    }
  };
  const sh = shuffle(r, cands);
  // every numeric item gets at least one near miss (off by one or two) when a candidate exists
  if (typeof ans === 'number') take(sh.find((v) => typeof v === 'number' && Math.abs(v - ans) <= 2 && v !== ans));
  sh.forEach(take);
  fallback.forEach(take);
  return out.length >= n ? out : null;
}
const numFallback = (a) => [a + 1, a - 1, a + 2, a - 2, a + 3, a - 3, a + 5, a - 5, a + 10, a - 10, a + 20, a * 2];

const seqStem = (terms) => `<div class="series">${terms.join(', ')}, <span class="q">?</span></div>`;
const P_TERM = 'Which term comes next in the sequence?';
const P_NUM = 'Which number comes next in the sequence?';

// ---------------------------------------------------------------- L: letter-number series
function genL1(r) {
  const s = ri(r, 1, 3);
  const t = ri(r, 1, 6);
  if (s === 1 && t === 1) return null;
  const shown = ri(r, 4, 5);
  const a = ri(r, 0, 25 - s * shown);
  const n0 = ri(r, 1, 9);
  const term = (i) => `${L(a + s * i)}${n0 + t * i}`;
  const terms = range(shown).map(term);
  const ans = term(shown);
  const aL = a + s * shown;
  const aN = n0 + t * shown;
  const cands = [
    `${L(aL)}${aN - 1}`,
    `${L(aL)}${aN + 1}`,
    `${L(aL - 1)}${aN}`,
    `${L(aL + 1)}${aN}`,
    `${L(aL + s)}${aN + t}`,
    `${L(aL)}${aN + t}`,
    `${L(aL - s)}${aN - t}`,
    `${L(aL + t)}${aN - t + s}`,
  ];
  const fb = [`${L(aL + 2)}${aN}`, `${L(aL - 2)}${aN}`, `${L(aL)}${aN + 2}`, `${L(aL)}${aN - 2}`, `${L(aL + 1)}${aN + 1}`];
  const dis = pickDis(r, ans, cands, lnOk, fb);
  if (!dis) return null;
  return { stem: seqStem(terms), answer: ans, distractors: dis, prompt: P_TERM, optionCols: 5, meta: { s, t, shown: terms } };
}

function genL2(r) {
  const s = pick(r, [1, 1, 2]);
  const p0 = ri(r, 0, 8);
  const q0 = ri(r, 14, 25);
  if (q0 - p0 < 8 * s + 2) return null;
  const term = (i) => `${L(p0 + s * i)}${L(q0 - s * i)}`;
  const shown = range(4).map(term);
  const ans = term(4);
  const aP = p0 + 4 * s;
  const aQ = q0 - 4 * s;
  const cands = [
    `${L(aP)}${L(aQ + s)}`,
    `${L(aP - s)}${L(aQ)}`,
    `${L(aP)}${L(q0 - 2 * s)}`,
    `${L(aP)}${L(aQ + 1)}`,
    `${L(aP)}${L(aQ - 1)}`,
    `${L(aP + 1)}${L(aQ)}`,
    `${L(aP - 1)}${L(aQ)}`,
    `${L(aQ)}${L(aP)}`,
  ];
  const fb = [`${L(aP + 1)}${L(aQ + 1)}`, `${L(aP - 1)}${L(aQ - 1)}`, `${L(aP + 2)}${L(aQ)}`];
  const dis = pickDis(r, ans, cands, pairOk, fb);
  if (!dis) return null;
  return { stem: seqStem(shown), answer: ans, distractors: dis, prompt: P_TERM, optionCols: 5, meta: { s, shown } };
}

function genL3(r) {
  const s = ri(r, 1, 4);
  const t = ri(r, 2, 7);
  const down = r() < 0.5;
  const n0 = down ? ri(r, 30, 60) : ri(r, 1, 9);
  const startLetter = r() < 0.5;
  const n = pick(r, [6, 7]);
  const a0 = ri(r, 0, 25 - 4 * s);
  const term = (i) => {
    const isLetter = startLetter ? i % 2 === 0 : i % 2 === 1;
    const idx = Math.floor(i / 2);
    return isLetter ? L(a0 + s * idx) : String(n0 + (down ? -t : t) * idx);
  };
  const shown = range(n).map(term);
  const ans = term(n);
  let cands;
  let ok;
  let fb;
  if (letterOk(ans)) {
    const x = code(ans);
    const prevL = [...shown].reverse().find(letterOk);
    cands = [L(x + 1), L(x - 1), L(x + 2), L(x - 2), prevL, L(code(prevL) + t)];
    ok = letterOk;
    fb = [L(x + 3), L(x - 3), L(x + 4)];
  } else {
    const v = Number(ans);
    const prevN = Number([...shown].reverse().find((z) => !letterOk(z)));
    const sg = down ? -1 : 1;
    cands = [v + 1, v - 1, v + 2, v - 2, prevN, prevN - sg * t, prevN + sg * 2 * t, v + sg * t];
    ok = numOk;
    fb = numFallback(v);
  }
  const dis = pickDis(r, ans, cands, ok, fb);
  if (!dis) return null;
  return { stem: seqStem(shown), answer: ans, distractors: dis.map(String), prompt: P_TERM, optionCols: 5, meta: { s, t, down, startLetter, shown } };
}

function genL4(r) {
  const g0 = ri(r, 1, 2);
  const m = pick(r, [2, 3]);
  const a = ri(r, 1, 5);
  const s = ri(r, 0, 19 - 4 * g0);
  const term = (i) => `${L(s + i * g0 + (i * (i - 1)) / 2)}${a * m ** i}`;
  const shown = range(4).map(term);
  const ans = term(4);
  const x = s + 4 * g0 + 6;
  const N = a * m ** 4;
  const lastN = a * m ** 3;
  const prevN = a * m ** 2;
  const cands = [
    `${L(x)}${lastN + (lastN - prevN)}`,
    `${L(x)}${N + 1}`,
    `${L(x)}${N - 1}`,
    `${L(x - 1)}${N}`,
    `${L(x + 1)}${N}`,
    `${L(x)}${N * m}`,
    `${L(x + g0 + 4)}${N * m}`,
  ];
  const fb = [`${L(x + 2)}${N}`, `${L(x - 2)}${N}`, `${L(x)}${N + m}`, `${L(x)}${N - m}`];
  const dis = pickDis(r, ans, cands, lnOk, fb);
  if (!dis) return null;
  return { stem: seqStem(shown), answer: ans, distractors: dis, prompt: P_TERM, optionCols: 5, meta: { g0, m, a, s, shown } };
}

function genL5(r) {
  const s = ri(r, 2, 4);
  const u = ri(r, 1, 4);
  const v = ri(r, 1, 4);
  const a = ri(r, 0, 25 - 5 * s);
  const f = [u, v];
  for (let i = 2; i <= 5; i++) f.push(f[i - 1] + f[i - 2]);
  const term = (i) => `${L(a + s * i)}${f[i]}`;
  const shown = range(5).map(term);
  const ans = term(5);
  const x = a + 5 * s;
  const cands = [
    `${L(x)}${f[5] - 1}`,
    `${L(x)}${f[5] + 1}`,
    `${L(x)}${2 * f[4] - f[3]}`,
    `${L(x)}${f[4] + f[3] + 1}`,
    `${L(x)}${2 * f[4]}`,
    `${L(x - 1)}${f[5]}`,
    `${L(x + 1)}${f[5]}`,
    `${L(x + s)}${f[5] + f[4]}`,
  ];
  const fb = [`${L(x)}${f[5] + 2}`, `${L(x)}${f[5] - 2}`, `${L(x + 2)}${f[5]}`, `${L(x - 2)}${f[5]}`];
  const dis = pickDis(r, ans, cands, lnOk, fb);
  if (!dis) return null;
  return { stem: seqStem(shown), answer: ans, distractors: dis, prompt: P_TERM, optionCols: 5, meta: { s, u, v, a, shown } };
}

// ---------------------------------------------------------------- G: number grids
// One SVG per grid. Text order = reading order, with "?" for the gap.
const SVG_OPEN = (w, h, label) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${label}">`;
const TXT = (x, y, size, s) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central">${s}</text>`;

function gridSvg(vals, q) {
  const cell = 82;
  const step = 88;
  let body = '';
  for (let i = 0; i < 9; i++) {
    const x = 3 + (i % 3) * step;
    const y = 3 + Math.floor(i / 3) * step;
    body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="8" class="${i === q ? 'f-grey' : 'f-none'}" stroke="currentColor" stroke-width="2.5"/>`;
    body += TXT(x + cell / 2, y + cell / 2, 34, i === q ? '?' : vals[i]);
  }
  const rows = [0, 1, 2].map((rw) => `Row ${rw + 1}: ${[0, 1, 2].map((c) => (rw * 3 + c === q ? 'question mark' : vals[rw * 3 + c])).join(', ')}`);
  return SVG_OPEN(264, 264, `Number grid. ${rows.join('. ')}`) + body + '</svg>';
}

// "Other simple rules" the generator guards against: if any of them is consistent with
// every complete line of the grid (rows or columns) and would put a different number in
// the gap, the grid is rejected.
const LINE_RULES = [
  (ls) => ls.every((l) => l[0] + l[1] + l[2] === ls[0][0] + ls[0][1] + ls[0][2]),
  (ls) => ls.every((l) => l[0] * l[1] * l[2] === ls[0][0] * ls[0][1] * ls[0][2]),
  (ls) => ls.every((l) => l[2] === l[0] + l[1]),
  (ls) => ls.every((l) => l[0] === l[1] + l[2]),
  (ls) => ls.every((l) => l[1] === l[0] + l[2]),
  (ls) => ls.every((l) => l[2] === l[0] * l[1]),
  (ls) => ls.every((l) => l[0] === l[1] * l[2]),
  (ls) => ls.every((l) => l[1] === l[0] * l[2]),
  (ls) => ls.every((l) => l[2] === l[0] - l[1]),
  (ls) => ls.every((l) => l[2] === l[1] - l[0]),
  (ls) => ls.every((l) => 2 * l[1] === l[0] + l[2]),
  (ls) => ls.every((l) => l[1] * l[1] === l[0] * l[2]),
  (ls) => ls.every((l) => l[0] + l[1] === 2 * l[2]),
  (ls) => ls.every((l) => l[0] === l[1] && l[1] === l[2]),
  (ls) => {
    const sm = ls.map((l) => l[0] + l[1] + l[2]);
    return sm[1] - sm[0] === sm[2] - sm[1];
  },
  (ls) => {
    const sm = ls.map((l) => l[0] * l[1] * l[2]);
    return sm[1] - sm[0] === sm[2] - sm[1];
  },
  (ls) => ls.every((l) => l[0] ** 2 + l[1] ** 2 + l[2] ** 2 === ls[0][0] ** 2 + ls[0][1] ** 2 + ls[0][2] ** 2),
  (ls) => ls.every((l) => l[2] === l[0] ** 2 + l[1]),
  (ls) => ls.every((l) => l[2] === l[0] + l[1] ** 2),
  (ls) => ls.every((l) => l[2] === 2 * l[0] + l[1]),
  (ls) => ls.every((l) => l[2] === l[0] + 2 * l[1]),
  (ls) => ls.every((l) => [[0, 1, 2], [1, 0, 2], [2, 0, 1]].some(([x, y, z]) => l[x] === l[y] + l[z])),
];
function gridAmbiguous(grid, q, ans) {
  for (let v = 1; v <= 2000; v++) {
    if (v === ans) continue;
    const g = grid.slice();
    g[q] = v;
    const rows = [0, 1, 2].map((rw) => [g[3 * rw], g[3 * rw + 1], g[3 * rw + 2]]);
    const cols = [0, 1, 2].map((c) => [g[c], g[3 + c], g[6 + c]]);
    for (const rule of LINE_RULES) if (rule(rows) || rule(cols)) return true;
  }
  return false;
}
const transposeIdx = (i) => (i % 3) * 3 + Math.floor(i / 3);
const transposeGrid = (g) => g.map((_, i) => g[transposeIdx(i)]);

// Build a grid item from a row-form grid and the gap index; may transpose
// (rule then runs down the columns). `dis(grid, qi, col)` returns the distractors.
function finishGrid(r, rowGrid, q, dis, extra) {
  const col = r() < 0.5;
  const grid = col ? transposeGrid(rowGrid) : rowGrid;
  const qi = col ? transposeIdx(q) : q;
  const ans = grid[qi];
  if (gridAmbiguous(grid, qi, ans)) return null;
  const d = dis(grid, qi, col, ans);
  if (!d) return null;
  return {
    stem: gridSvg(grid.map(String), qi),
    answer: String(ans),
    distractors: d.map(String),
    prompt: 'The grid follows one rule. Which number replaces the question mark?',
    optionCols: 5,
    meta: { orient: col ? 'col' : 'row', grid, missing: qi, ...extra },
  };
}
// Cells of the line (row, or column when col) that contains the gap, in order, plus the gap's position in it.
function gapLine(grid, qi, col) {
  const li = col ? qi % 3 : Math.floor(qi / 3);
  const pos = col ? Math.floor(qi / 3) : qi % 3;
  const cells = [0, 1, 2].map((k) => (col ? grid[3 * k + li] : grid[3 * li + k]));
  return { li, pos, cells };
}

function genG1(r) {
  const S = ri(r, 14, 30);
  const rowGrid = range(3).flatMap(() => {
    const x = ri(r, 2, Math.min(S - 4, 15));
    const y = ri(r, 2, Math.min(S - x - 2, 15));
    return [x, y, S - x - y];
  });
  return finishGrid(r, rowGrid, ri(r, 0, 8), (grid, qi, col, ans) => {
    const { li, pos, cells } = gapLine(grid, qi, col);
    const others = cells.filter((_, k) => k !== pos);
    // the number in the same place in another line (rule applied to the wrong neighbour)
    const neigh = [0, 1, 2].filter((k) => k !== li).map((k) => (col ? grid[3 * pos + k] : grid[3 * k + pos]));
    const cands = [others[0] + others[1], S - others[0], S - others[1], ans + 1, ans - 1, ...neigh, ans + 2];
    return pickDis(r, ans, cands, numOk, numFallback(ans));
  }, { rule: 'sum', S });
}

function genG2(r) {
  const rowGrid = range(3).flatMap(() => {
    const a = ri(r, 2, 9);
    const b = ri(r, 2, 9);
    return [a, b, a * b];
  });
  return finishGrid(r, rowGrid, ri(r, 0, 8), (grid, qi, col, ans) => {
    const { pos, cells } = gapLine(grid, qi, col);
    const [a, b, c] = cells;
    let cands;
    if (pos === 2) cands = [a + b, a * (b + 1), a * (b - 1), a * b + 1, a * b - 1, a * b + 10, a * b - 10];
    else {
      const g = pos === 0 ? b : a; // the known factor
      cands = [c - g, ans + 1, ans - 1, g, c / (g + 1), c / (g - 1), ans + 2, c + g];
    }
    return pickDis(r, ans, cands, numOk, numFallback(ans));
  }, { rule: 'product' });
}

function genG4(r) {
  const steps = shuffle(r, [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
  const rowGrid = steps.flatMap((d) => {
    const lo = d < 0 ? 1 - 2 * d : 1;
    const a = ri(r, lo, Math.max(lo, 20));
    return [a, a + d, a + 2 * d];
  });
  return finishGrid(r, rowGrid, ri(r, 0, 8), (grid, qi, col, ans) => {
    const { pos, cells } = gapLine(grid, qi, col);
    const d = (cells[2] - cells[0]) / 2;
    const known = cells.filter((_, k) => k !== pos);
    const [s1, s2] = steps.filter((x) => x !== d);
    const mid = cells[1];
    const cands = [ans + 1, ans - 1, ans + d, ans - d, mid + s1, mid - s1, mid + s2, known[0] + known[1]];
    return pickDis(r, ans, cands, numOk, numFallback(ans));
  }, { rule: 'progression', steps });
}

// G3: three small diagrams (four corners + centre). Cell order: TL, TR, BL, BR, centre.
const CENTRE_RULES = [
  (p) => p[0] + p[1] + p[2] + p[3],
  (p) => p[0] * p[3] + p[1] * p[2],
  (p) => Math.abs(p[0] * p[3] - p[1] * p[2]),
  (p) => (p[0] + p[3]) * (p[1] + p[2]),
  (p) => p[0] * p[1] + p[2] * p[3],
  (p) => p[0] * p[1] * p[2] * p[3],
  (p) => p[0] + p[3] + p[1] * p[2],
  (p) => p[0] * p[3] + p[1] + p[2],
  (p) => (p[0] + p[1]) * (p[2] + p[3]),
  (p) => p[0] + p[1] + p[2] + p[3] - 1,
  (p) => p[0] * 2 + p[1] + p[2] + p[3],
];
function g3Ambiguous(panels, qp, qk, ans) {
  for (let v = 1; v <= 2000; v++) {
    if (v === ans) continue;
    const ps = panels.map((p) => p.slice());
    ps[qp][qk] = v;
    for (const rule of CENTRE_RULES) if (ps.every((p) => rule(p) === p[4])) return true;
  }
  return false;
}
function g3Svg(panels, qp, qk) {
  let body = '';
  const label = [];
  const names = ['top left', 'top right', 'bottom left', 'bottom right', 'centre'];
  panels.forEach((p, i) => {
    const x = 2 + i * 106;
    const y = 2;
    const at = [[x + 20, y + 20], [x + 80, y + 20], [x + 20, y + 80], [x + 80, y + 80], [x + 50, y + 50]];
    body += `<rect x="${x}" y="${y}" width="100" height="100" rx="8" class="f-none" stroke="currentColor" stroke-width="2.5"/>`;
    body += `<circle cx="${x + 50}" cy="${y + 50}" r="21" class="${qp === i && qk === 4 ? 'f-none' : 'f-grey'}" stroke="currentColor" stroke-width="2.5"/>`;
    const parts = [];
    p.forEach((val, k) => {
      const isQ = qp === i && qk === k;
      body += TXT(at[k][0], at[k][1], 22, isQ ? '?' : val);
      parts.push(`${names[k]} ${isQ ? 'question mark' : val}`);
    });
    label.push(`Diagram ${i + 1}: ${parts.join(', ')}`);
  });
  return SVG_OPEN(322, 104, `Three diagrams, each with four corner numbers and a centre number. ${label.join('. ')}`) + body + '</svg>';
}
function genG3(r) {
  const panels = range(3).map(() => {
    const c = range(4).map(() => ri(r, 1, 12));
    return [...c, c[0] + c[1] + c[2] + c[3]];
  });
  const qp = ri(r, 0, 2);
  const qk = ri(r, 0, 4);
  const p = panels[qp];
  const ans = p[qk];
  if (g3Ambiguous(panels, qp, qk, ans)) return null;
  let cands;
  if (qk === 4) {
    const cs = p[0] + p[1] + p[2] + p[3];
    cands = [cs - Math.min(p[0], p[1], p[2], p[3]), cs + 1, cs - 1, p[0] + p[3], p[0] * p[3] + p[1] * p[2], cs + 10, cs - 10, p[0] + p[1] + p[2]];
  } else {
    const o = [0, 1, 2, 3].filter((k) => k !== qk).map((k) => p[k]);
    cands = [p[4] - o[0] - o[1], p[4] - o[0] - o[2], p[4] - o[1] - o[2], ans + 1, ans - 1, p[4] + o[0], ans + 2, ans - 2];
  }
  const dis = pickDis(r, ans, cands, numOk, numFallback(ans));
  if (!dis) return null;
  return {
    stem: g3Svg(panels, qp, qk),
    answer: String(ans),
    distractors: dis.map(String),
    prompt: 'All three diagrams follow the same rule. Which number replaces the question mark?',
    optionCols: 5,
    meta: { rule: 'corner-sum', panels, missingPanel: qp, missingCell: qk },
  };
}

// ---------------------------------------------------------------- D: coding / decoding
const shiftWord = (w, k) => {
  if (w === null || w === undefined) return null;
  let o = '';
  for (const ch of w) {
    const c = code(ch) + k;
    if (c < 0 || c > 25) return null;
    o += L(c);
  }
  return o;
};
const rev = (w) => [...w].reverse().join('');
const cat = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : a + b);
const posCode = (w) => [...w].map((c) => code(c) + 1).join('-');
const codeStem = (ex, exCode, tg) => `<div class="series">${ex} → ${exCode}<br>${tg} → <span class="q">?</span></div>`;
const P_CODE = 'Both lines use the same code. What replaces the question mark?';

// Other codes a solver might read into the worked example. An item is kept only if every
// candidate that reproduces the example also gives the same answer for the second word.
const asLetters = (arr) => (arr.every((n) => n >= 0 && n <= 25) ? arr.map(L).join('') : null);
const wordIdx = (w) => [...w].map(code);
function codeRivals() {
  const out = [];
  for (let k = -12; k <= 12; k++) {
    out.push((w) => asLetters(wordIdx(w).map((n) => n + k)));
    out.push((w) => wordIdx(w).map((n) => L((((n + k) % 26) + 26) % 26)).join(''));
    out.push((w) => asLetters(wordIdx(rev(w)).map((n) => n + k)));
    for (const d of [-2, -1, 1, 2]) out.push((w) => asLetters(wordIdx(w).map((n, i) => n + k + d * i)));
  }
  out.push((w) => asLetters(wordIdx(w).map((n) => 25 - n)));
  out.push((w) => asLetters(wordIdx(rev(w)).map((n) => 25 - n)));
  out.push((w) => rev(w));
  out.push((w) => w.slice(-1) + w.slice(1, -1) + w[0]);
  for (let k = -3; k <= 3; k++) {
    out.push((w) => wordIdx(w).map((n) => n + 1 + k).join('-'));
    out.push((w) => wordIdx(w).map((n) => 26 - n + k).join('-'));
    out.push((w) => wordIdx(rev(w)).map((n) => n + 1 + k).join('-'));
  }
  return out;
}
const CODE_RIVALS = codeRivals();
const codeUnambiguous = (ex, exCode, tg, ans) => CODE_RIVALS.every((f) => f(ex) !== exCode || f(tg) === ans);

function twoWords(r, lenEx = [3, 5], lenTg = [3, 5]) {
  const exs = WORDS.filter((w) => w.length >= lenEx[0] && w.length <= lenEx[1]);
  const tgs = WORDS.filter((w) => w.length >= lenTg[0] && w.length <= lenTg[1]);
  const ex = pick(r, exs);
  const tg = pick(r, tgs);
  return ex === tg ? null : [ex, tg];
}
const wordLike = (len) => (v) => typeof v === 'string' && v.length === len && /^[A-Z]+$/.test(v);

function genD1(r) {
  const k = pick(r, [1, 2, 3, -1, -2, -3]);
  const w = twoWords(r);
  if (!w) return null;
  const [ex, tg] = w;
  const exCode = shiftWord(ex, k);
  const ans = shiftWord(tg, k);
  if (!exCode || !ans || !codeUnambiguous(ex, exCode, tg, ans)) return null;
  const n = ans.length;
  const cands = [
    shiftWord(tg, k + 1),
    shiftWord(tg, k - 1),
    shiftWord(tg, -k),
    rev(ans),
    cat(shiftWord(tg.slice(0, -1), k), tg.slice(-1)),
    cat(shiftWord(tg[0], 0), shiftWord(tg.slice(1), k)),
    cat(ans.slice(0, -1), shiftWord(ans.slice(-1), 1)),
    cat(ans.slice(0, -1), shiftWord(ans.slice(-1), -1)),
  ];
  const fb = [cat(ans.slice(0, -1), shiftWord(ans.slice(-1), 2)), cat(shiftWord(ans[0], 1), ans.slice(1))];
  const dis = pickDis(r, ans, cands, wordLike(n), fb);
  if (!dis) return null;
  return { stem: codeStem(ex, exCode, tg), answer: ans, distractors: dis, prompt: P_CODE, optionCols: 3, meta: { k, ex, exCode, tg, shown: [ex, exCode, tg] } };
}

function genD2(r) {
  const k = pick(r, [1, 2, 3, -1, -2]);
  const w = twoWords(r);
  if (!w) return null;
  const [ex, tg] = w;
  const exCode = shiftWord(rev(ex), k);
  const ans = shiftWord(rev(tg), k);
  if (!exCode || !ans || !codeUnambiguous(ex, exCode, tg, ans)) return null;
  const rt = rev(tg);
  const cands = [
    shiftWord(tg, k),
    rt,
    shiftWord(rt, -k),
    shiftWord(rt, k + 1),
    shiftWord(rt, k - 1),
    shiftWord(tg, -k),
    cat(shiftWord(rt.slice(0, -1), k), rt.slice(-1)),
    cat(rt[0], shiftWord(rt.slice(1), k)),
  ];
  const fb = [cat(ans.slice(0, -1), shiftWord(ans.slice(-1), 1)), cat(ans.slice(0, -1), shiftWord(ans.slice(-1), -1))];
  const dis = pickDis(r, ans, cands, wordLike(ans.length), fb);
  if (!dis) return null;
  return { stem: codeStem(ex, exCode, tg), answer: ans, distractors: dis, prompt: P_CODE, optionCols: 3, meta: { k, ex, exCode, tg, shown: [ex, exCode, tg] } };
}

function genD3(r) {
  const w = twoWords(r, [3, 4], [3, 5]);
  if (!w) return null;
  const [ex, tg] = w;
  const exCode = posCode(ex);
  const ans = posCode(tg);
  if (!codeUnambiguous(ex, exCode, tg, ans)) return null;
  const nums = [...tg].map((c) => code(c) + 1);
  const joined = (a) => a.join('-');
  const bump = (i, d) => joined(nums.map((n, j) => (j === i ? n + d : n)));
  const cands = [
    joined(nums.slice().reverse()),
    joined(nums.map((n) => 27 - n)),
    joined(nums.map((n) => n - 1)),
    joined(nums.map((n) => n + 1)),
    bump(0, 1),
    bump(nums.length - 1, -1),
    bump(nums.length - 1, 1),
    bump(1, 1),
  ];
  const ok = (v) => v.split('-').length === nums.length && v.split('-').every((x) => Number(x) >= 1 && Number(x) <= 26);
  const dis = pickDis(r, ans, cands, ok, [bump(0, -1), bump(1, -1), bump(0, 2)]);
  if (!dis) return null;
  return { stem: codeStem(ex, exCode, tg), answer: ans, distractors: dis, prompt: P_CODE, optionCols: 3, meta: { ex, exCode, tg, shown: [ex, exCode, tg] } };
}

// ---------------------------------------------------------------- Q: number analogies
// Stem "a : f(a) :: b : f(b) :: c : ?". Two worked pairs, so a generated item is kept
// only if every "natural" competing rule base(x) + c (small constant) that fits both
// pairs predicts the same answer.
const qStem = (xs, ys, x3) => `<div class="series">${xs[0]} : ${ys[0]} :: ${xs[1]} : ${ys[1]} :: ${x3} : <span class="q">?</span></div>`;
const BASES = [
  (x) => x, (x) => 2 * x, (x) => 3 * x, (x) => 4 * x, (x) => 5 * x, (x) => 6 * x,
  (x) => x * x, (x) => 2 * x * x, (x) => 3 * x * x, (x) => 4 * x * x,
  (x) => x ** 3, (x) => 2 * x ** 3, (x) => 2 ** x, (x) => x * x + x, (x) => x * x - x,
  (x) => (x + 1) ** 2, (x) => (x - 1) ** 2, (x) => x * (x + 2),
];
function analogyUnique(xs, ys, x3, ans) {
  for (const base of BASES) {
    const c = ys[0] - base(xs[0]);
    if (Math.abs(c) <= 6 && base(xs[1]) + c === ys[1] && base(x3) + c !== ans) return false;
  }
  return true;
}
function genQ(f, lo, hi, cand, params) {
  return (r) => {
    const p = params(r);
    const xs = shuffle(r, range(hi - lo + 1).map((i) => i + lo)).slice(0, 3).sort((a, b) => a - b);
    const ys = xs.map((x) => f(x, p));
    const ans = ys[2];
    if (!analogyUnique(xs.slice(0, 2), ys.slice(0, 2), xs[2], ans)) return null;
    const dis = pickDis(r, ans, cand(xs[2], p, ans), numOk, numFallback(ans));
    if (!dis) return null;
    return {
      stem: qStem(xs.slice(0, 2), ys.slice(0, 2), xs[2]),
      answer: String(ans),
      distractors: dis.map(String),
      prompt: 'The pairs follow one rule. Which number replaces the question mark?',
      optionCols: 5,
      meta: { ...p, xs, ys },
    };
  };
}
const genQ1 = genQ((x) => x * x, 2, 10, (x) => [(x + 1) ** 2, (x - 1) ** 2, x * (x + 1), x * (x - 1), x * x - 1, x * x + 1, 2 * x * x], () => ({}));
const genQ2 = genQ(
  (x, p) => x ** 3 + p.c,
  2, 8,
  (x, p, ans) => [x ** 3, x ** 3 + 2 * p.c, x * x + p.c, (x + 1) ** 3 + p.c, (x - 1) ** 3 + p.c, ans + 1, ans - 1, 3 * x + p.c],
  (r) => ({ c: pick(r, [1, -1]) }),
);
const genQ3 = genQ(
  (x, p) => p.m * x * x + p.c,
  2, 7,
  (x, p, ans) => [p.m * x * x, p.m * x * x - p.c, x * x + p.c, p.m * p.m * x * x + p.c, (p.m * x) ** 2 - p.c, p.m * (x + 1) ** 2 + p.c, ans + 1, ans - 1],
  (r) => ({ m: pick(r, [2, 3]), c: pick(r, [-1, 1, 2]) }),
);

// ---------------------------------------------------------------- T: symbol equations
// Each shape has its own outline AND its own fill class (f-none / f-grey / f-solid), so it is
// distinguishable without colour. Operators: + - × (no mixing of × with + or -, so no
// precedence question). Rows evaluate left to right.
const FILL_NAME = { none: 'empty', grey: 'grey', solid: 'solid' };
const OPS = { '+': 'plus', '-': 'minus', '×': 'times' };
const evalRow = (vals, terms, ops) =>
  terms.slice(1).reduce((acc, t, i) => (ops[i] === '+' ? acc + vals[t] : ops[i] === '-' ? acc - vals[t] : acc * vals[t]), vals[terms[0]]);

function shapeEl(sym, cx, cy) {
  const cls = `class="f-${sym.fill}" stroke="currentColor" stroke-width="2.5"`;
  switch (sym.shape) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="15" ${cls}/>`;
    case 'square':
      return `<rect x="${cx - 14}" y="${cy - 14}" width="28" height="28" ${cls}/>`;
    case 'triangle':
      return `<polygon points="${cx},${cy - 16} ${cx + 17},${cy + 13} ${cx - 17},${cy + 13}" ${cls}/>`;
    default:
      return `<polygon points="${cx},${cy - 18} ${cx + 16},${cy} ${cx},${cy + 18} ${cx - 16},${cy}" ${cls}/>`;
  }
}
function tSvg(syms, rows, query) {
  const lines = [...rows, { terms: query.terms, ops: query.ops, rhs: '?' }];
  let body = '';
  const label = [];
  const nm = (t) => `${FILL_NAME[syms[t].fill]} ${syms[t].shape}`;
  lines.forEach((row, n) => {
    const toks = [];
    row.terms.forEach((t, i) => {
      if (i) toks.push({ k: 't', s: row.ops[i - 1] === '-' ? '−' : row.ops[i - 1], w: 30 });
      toks.push({ k: 's', sym: syms[t], w: 38 });
    });
    toks.push({ k: 't', s: '=', w: 32 });
    toks.push({ k: 't', s: String(row.rhs), w: 16 * String(row.rhs).length + 14 });
    const total = toks.reduce((a, t) => a + t.w, 0);
    let x = (320 - total) / 2;
    const y = 36 + n * 56;
    body += '<g>';
    for (const t of toks) {
      body += t.k === 's' ? shapeEl(t.sym, x + t.w / 2, y) : TXT(x + t.w / 2, y, 28, t.s);
      x += t.w;
    }
    body += '</g>';
    label.push(row.terms.map((t, i) => (i ? `${OPS[row.ops[i - 1]]} ${nm(t)}` : nm(t))).join(' ') + ` equals ${row.rhs === '?' ? 'question mark' : row.rhs}`);
  });
  const sepY = 36 + rows.length * 56 - 28;
  body += `<line x1="30" y1="${sepY}" x2="290" y2="${sepY}" stroke="currentColor" stroke-opacity="0.3" stroke-width="1.5"/>`;
  const h = 36 + lines.length * 56 - 14;
  return SVG_OPEN(320, h, `Shape equations. ${label.join('. ')}`) + body + '</svg>';
}
// All positive-integer solutions (each unknown 1..100) of the rows (stops after finding two).
function solveRows(n, rows) {
  const sols = [];
  const vals = new Array(n).fill(0);
  const check = rows.map((rw) => ({ rw, last: Math.max(...rw.terms) }));
  const go = (j) => {
    if (sols.length > 1) return;
    if (j === n) {
      sols.push(vals.slice());
      return;
    }
    for (let v = 1; v <= 100; v++) {
      vals[j] = v;
      if (check.every((c) => c.last !== j || evalRow(vals, c.rw.terms, c.rw.ops) === c.rw.rhs)) go(j + 1);
    }
  };
  go(0);
  return sols;
}
function makeT(build) {
  return (r) => {
    const sh = shuffle(r, ['circle', 'square', 'triangle', 'diamond']).slice(0, 3);
    const fl = shuffle(r, ['none', 'grey', 'solid']);
    const syms = sh.map((shape, i) => ({ shape, fill: fl[i] }));
    const spec = build(r);
    if (!spec) return null;
    const { vals, rows, query, n, extra } = spec;
    const sols = solveRows(n, rows);
    if (sols.length !== 1 || sols[0].some((v, i) => v !== vals[i])) return null;
    const ans = evalRow(vals, query.terms, query.ops);
    const cands = [...vals, ans + 1, ans - 1, ans + 2, ans - 2, vals[0] + vals[1], Math.abs(vals[0] - vals[1]), ans * 2, ans + 10];
    const dis = pickDis(r, ans, cands, numOk, numFallback(ans));
    if (!dis) return null;
    return {
      stem: tSvg(syms, rows, query),
      answer: String(ans),
      distractors: dis.map(String),
      prompt: 'Each shape stands for a positive whole number, the same number every time it appears. What number replaces the question mark?',
      optionCols: 5,
      meta: { syms, rows, query, values: vals, ...extra },
    };
  };
}
const eqRow = (vals, terms, ops) => ({ terms, ops, rhs: evalRow(vals, terms, ops) });
const genT1 = makeT((r) => {
  const A = ri(r, 2, 12);
  const Bv = ri(r, 2, 12);
  if (A === Bv) return null;
  const vals = [A, Bv];
  const k = ri(r, 2, 3);
  const rows = shuffle(r, [eqRow(vals, range(k).map(() => 0), range(k - 1).map(() => '+')), eqRow(vals, [0, 1], ['+'])]);
  const query = r() < 0.5 ? { terms: [1], ops: [] } : { terms: [1, 1], ops: ['+'] };
  return { vals, rows, query, n: 2, extra: { kind: 'T1', k } };
});
const genT2 = makeT((r) => {
  const vals = [ri(r, 2, 9), ri(r, 2, 9), ri(r, 2, 9)];
  if (new Set(vals).size < 3) return null;
  const rows = shuffle(r, [eqRow(vals, [0, 0], ['+']), eqRow(vals, [0, 1], ['+']), eqRow(vals, [1, 2], ['×'])]);
  const query = r() < 0.5 ? { terms: [2], ops: [] } : { terms: [2, 0], ops: ['+'] };
  return { vals, rows, query, n: 3, extra: { kind: 'T2' } };
});
const genT3 = makeT((r) => {
  if (r() < 0.5) {
    const vals = [ri(r, 2, 12), ri(r, 2, 12), ri(r, 2, 12)];
    if (new Set(vals).size < 3) return null;
    const rows = shuffle(r, [eqRow(vals, [0, 1], ['+']), eqRow(vals, [1, 2], ['+']), eqRow(vals, [0, 2], ['+'])]);
    return { vals, rows, query: { terms: [pick(r, [0, 1, 2])], ops: [] }, n: 3, extra: { kind: 'pairs' } };
  }
  const A = ri(r, 2, 9);
  const Bv = ri(r, 4, 14);
  const C = ri(r, 2, Bv - 1);
  const vals = [A, Bv, C];
  if (new Set(vals).size < 3) return null;
  const rows = shuffle(r, [eqRow(vals, [0, 0], ['×']), eqRow(vals, [0, 1], ['+']), eqRow(vals, [1, 2], ['-'])]);
  const query = r() < 0.5 ? { terms: [2], ops: [] } : { terms: [2, 2], ops: ['+'] };
  return { vals, rows, query, n: 3, extra: { kind: 'chain' } };
});

// ---------------------------------------------------------------- X: extra number series
const triangular = (n) => (n * (n + 1)) / 2;
const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
const PRIMES = range(400).filter(isPrime);

function xItem(r, shown, ans, cands, extraMeta, fb) {
  const dis = pickDis(r, ans, cands, numOk, fb || numFallback(ans));
  if (!dis) return null;
  return { stem: seqStem(shown), answer: String(ans), distractors: dis.map(String), prompt: P_NUM, optionCols: 5, meta: { shown: shown.map(String), ...extraMeta } };
}
function genX1(r) {
  const k = ri(r, 1, 40);
  const shown = range(5).map((i) => triangular(k + i));
  const ans = triangular(k + 5);
  const last = shown[4];
  return xItem(r, shown, ans, [2 * last - shown[3], ans + 1, ans - 1, triangular(k + 6), last + (k + 6), ans + 2, ans - 2], { k });
}
function genX2(r) {
  const c = pick(r, [1, 1, 2, 3, -1, -2]);
  const k = ri(r, 2, 15);
  const shown = range(5).map((i) => (k + i) ** 2 + c);
  const ans = (k + 5) ** 2 + c;
  const last = shown[4];
  return xItem(r, shown, ans, [2 * last - shown[3], (k + 5) ** 2, (k + 6) ** 2 + c, ans + 1, ans - 1, last + 2 * (k + 4) + 3, ans + 2], { k, c });
}
function genX3(r) {
  const m = pick(r, [2, 3]);
  const p = ri(r, 2, 6);
  const a = ri(r, 1, 6);
  const mulFirst = r() < 0.5;
  const n = pick(r, [6, 7]);
  const t = [a];
  for (let i = 1; i <= n; i++) {
    const mul = mulFirst ? i % 2 === 1 : i % 2 === 0;
    t.push(mul ? t[i - 1] * m : t[i - 1] + p);
  }
  const shown = t.slice(0, n);
  const ans = t[n];
  const last = shown[n - 1];
  const nextIsMul = mulFirst ? n % 2 === 1 : n % 2 === 0;
  const wrongOp = nextIsMul ? last + p : last * m;
  const cands = [wrongOp, ans + 1, ans - 1, last + (last - shown[n - 2]), ans + (nextIsMul ? m : p), ans - (nextIsMul ? m : p), last * m + p];
  return xItem(r, shown, ans, cands, { m, p, mulFirst, nextIsMul });
}
function genX4(r) {
  const u = ri(r, 1, 9);
  const v = ri(r, 1, 9);
  const t = [u, v];
  for (let i = 2; i <= 6; i++) t.push(t[i - 1] + t[i - 2]);
  const ans = t[6];
  return xItem(r, t.slice(0, 6), ans, [ans + 1, ans - 1, 2 * t[5] - t[4], t[5] + t[4] + 1, t[5] + t[3], 2 * t[5], t[5] + t[4] - 1], { u, v });
}
function genX5(r) {
  const k = ri(r, 0, 3);
  const a = ri(r, 1, 20);
  const t = [a];
  for (let i = 1; i <= 5; i++) t.push(t[i - 1] + (k + i) ** 2);
  const ans = t[5];
  const d4 = (k + 4) ** 2;
  const d3 = (k + 3) ** 2;
  const cands = [t[4] + 2 * d4 - d3, t[4] + d4, t[4] + (k + 6) ** 2, ans + 1, ans - 1, t[4] + (k + 5) * (k + 4), t[4] + (k + 5) * (k + 6)];
  return xItem(r, t.slice(0, 5), ans, cands, { k, a });
}
function genX6(r) {
  const k = ri(r, 0, 30);
  const shown = PRIMES.slice(k, k + 5);
  const ans = PRIMES[k + 5];
  const last = shown[4];
  const cands = [last + 2, last + 4, last + (last - shown[3]), ans + 2, ans - 2, ans + 4, ans + 1, ans - 1, last + 6].filter((v) => !isPrime(v));
  const fb = range(40).flatMap((i) => [ans + i + 1, ans - i - 1]).filter((v) => !isPrime(v));
  return xItem(r, shown, ans, cands, { k }, fb);
}

const GEN = {
  L1: genL1, L2: genL2, L3: genL3, L4: genL4, L5: genL5,
  G1: genG1, G2: genG2, G3: genG3, G4: genG4,
  D1: genD1, D2: genD2, D3: genD3,
  Q1: genQ1, Q2: genQ2, Q3: genQ3,
  T1: genT1, T2: genT2, T3: genT3,
  X1: genX1, X2: genX2, X3: genX3, X4: genX4, X5: genX5, X6: genX6,
};

// ---------------------------------------------------------------- public API
export function variant(id, seed) {
  const gen = GEN[id];
  if (!gen) throw new Error('unknown numeric template ' + id);
  const s = seed >>> 0;
  const r = rng(`numeric:${id}:${s}`);
  for (let i = 0; i < 500; i++) {
    const g = gen(r);
    if (!g) continue;
    const placed = placeOptions(`${id}#${s}`, g.answer, g.distractors);
    const item = { id, category: 'series', b: B[id], prompt: g.prompt, stem: g.stem, options: placed.options, answer: placed.answer, optionCols: g.optionCols };
    const meta = { ...g.meta, answer: g.answer, distractors: g.distractors };
    return { item, meta };
  }
  throw new Error(`no ${id} variant for seed ${s}`);
}

const places = (n) => `${Math.abs(n)} place${Math.abs(n) === 1 ? '' : 's'}`;
const dirText = (k) => `${places(k)} ${k < 0 ? 'back' : 'forward'}`;
const join = (xs) => xs.join(', ');

export function explain(id, m) {
  const a = m.answer;
  switch (id) {
    case 'L1':
      return `Every term moves its letter ${places(m.s)} on in the alphabet and adds ${m.t} to its number, so ${m.shown[m.shown.length - 1]} is followed by ${a}.`;
    case 'L2':
      return `The first letters move ${places(m.s)} forward each time while the second letters move ${places(m.s)} back, so ${m.shown[m.shown.length - 1]} is followed by ${a}.`;
    case 'L3':
      return `Two series are interleaved: the letters move ${places(m.s)} on each time and the numbers go ${m.down ? 'down' : 'up'} by ${m.t} each time. The next term belongs to whichever series is due, which gives ${a}.`;
    case 'L4':
      return `The letters jump ${m.g0}, then ${m.g0 + 1}, then ${m.g0 + 2}, so the next jump is ${m.g0 + 3}, while each number is multiplied by ${m.m}. That gives ${a}.`;
    case 'L5':
      return `The letters move ${places(m.s)} on each time, and each number is the sum of the two before it (${m.shown[3].slice(1)} + ${m.shown[4].slice(1)} = ${a.slice(1)}). So the next term is ${a}.`;
    case 'G1': {
      const word = m.orient === 'row' ? 'row' : 'column';
      return `Every ${word} adds up to ${m.S}. In the ${word} with the gap the other two numbers add to ${m.S - Number(a)}, so the missing number is ${m.S} - ${m.S - Number(a)} = ${a}.`;
    }
    case 'G2': {
      const word = m.orient === 'row' ? 'row' : 'column';
      const li = m.orient === 'row' ? Math.floor(m.missing / 3) : m.missing % 3;
      const cells = [0, 1, 2].map((k) => (m.orient === 'row' ? m.grid[3 * li + k] : m.grid[3 * k + li]));
      return `In every ${word} the third number is the first multiplied by the second. The ${word} with the gap reads ${cells[0]} × ${cells[1]} = ${cells[2]}, so the missing number is ${a}.`;
    }
    case 'G3': {
      const other = m.panels[(m.missingPanel + 1) % 3];
      const p = m.panels[m.missingPanel];
      const known = m.missingCell === 4 ? `${p.slice(0, 4).join(' + ')} = ${a}` : `the centre ${p[4]} minus the three known corners leaves ${a}`;
      return `In each diagram the centre is the sum of the four corners (for example ${other.slice(0, 4).join(' + ')} = ${other[4]}). In the diagram with the gap ${known}.`;
    }
    case 'G4': {
      const word = m.orient === 'row' ? 'row' : 'column';
      const li = m.orient === 'row' ? Math.floor(m.missing / 3) : m.missing % 3;
      const cells = [0, 1, 2].map((k) => (m.orient === 'row' ? m.grid[3 * li + k] : m.grid[3 * k + li]));
      return `Each ${word} goes up or down by a fixed step, but every ${word} has its own step. The ${word} with the gap reads ${join(cells)}, so its step is ${(cells[2] - cells[0]) / 2} and the missing number is ${a}.`;
    }
    case 'D1':
      return `Each letter moves ${dirText(m.k)} in the alphabet (${m.ex[0]} to ${m.exCode[0]}, ${m.ex[1]} to ${m.exCode[1]}). Applying that to ${m.tg} gives ${a}.`;
    case 'D2':
      return `The word is written backwards and then each letter moves ${dirText(m.k)}: ${m.ex} reversed is ${rev(m.ex)}, which becomes ${m.exCode}. Doing the same to ${m.tg} gives ${a}.`;
    case 'D3':
      return `Each letter is replaced by its place in the alphabet (A = 1, B = 2 and so on), with hyphens between: ${m.ex} is ${m.exCode}. So ${m.tg} is ${a}.`;
    case 'Q1':
      return `The second number in each pair is the square of the first (${m.xs[0]} gives ${m.ys[0]}, ${m.xs[1]} gives ${m.ys[1]}). So ${m.xs[2]} gives ${m.xs[2]} × ${m.xs[2]} = ${a}.`;
    case 'Q2': {
      const sg = m.c > 0 ? '+' : '-';
      return `Cube the first number and ${m.c > 0 ? 'add' : 'subtract'} 1: ${m.xs[0]}³ ${sg} 1 = ${m.ys[0]}. So ${m.xs[2]}³ ${sg} 1 = ${m.xs[2] ** 3} ${sg} 1 = ${a}.`;
    }
    case 'Q3': {
      const sg = m.c > 0 ? '+' : '-';
      const c = Math.abs(m.c);
      return `Square the first number, multiply by ${m.m}, then ${m.c > 0 ? 'add' : 'subtract'} ${c}: ${m.m} × ${m.xs[0] ** 2} ${sg} ${c} = ${m.ys[0]}. For ${m.xs[2]} that is ${m.m} × ${m.xs[2] ** 2} ${sg} ${c} = ${a}.`;
    }
    case 'T1':
    case 'T2':
    case 'T3': {
      const nm = m.syms.map((s) => s.shape);
      const v = m.values;
      let steps;
      if (m.kind === 'T1') steps = `${m.k} ${nm[0]}s add up to ${m.k * v[0]}, so a ${nm[0]} is ${v[0]}. A ${nm[0]} plus a ${nm[1]} is ${v[0] + v[1]}, so a ${nm[1]} is ${v[1]}.`;
      else if (m.kind === 'T2') steps = `Two ${nm[0]}s make ${2 * v[0]}, so a ${nm[0]} is ${v[0]}. Then the ${nm[1]} is ${v[1]}, and ${v[1]} × the ${nm[2]} = ${v[1] * v[2]} makes the ${nm[2]} ${v[2]}.`;
      else if (m.kind === 'pairs') {
        const S = v[0] + v[1] + v[2];
        steps = `Adding the three equations counts each shape twice, so the three shapes total ${S}. Taking away the pair that leaves one out gives the ${nm[0]} = ${v[0]}, the ${nm[1]} = ${v[1]} and the ${nm[2]} = ${v[2]}.`;
      } else steps = `The ${nm[0]} times itself is ${v[0] * v[0]}, so it is ${v[0]}. Then the ${nm[1]} is ${v[1]} and the ${nm[2]} is ${v[1]} - ${v[1] - v[2]} = ${v[2]}.`;
      return `${steps} The last line is therefore ${a}.`;
    }
    case 'X1':
      return `These are triangular numbers: the gaps are ${m.k + 1}, ${m.k + 2}, ${m.k + 3}, ${m.k + 4}, growing by 1 each time, so the next gap is ${m.k + 5} and the next number is ${a}.`;
    case 'X2': {
      const sg = m.c > 0 ? '+' : '-';
      const c = Math.abs(m.c);
      return `Each term is a square ${m.c > 0 ? 'plus' : 'minus'} ${c}: ${m.k}² ${sg} ${c} = ${m.shown[0]}, ${m.k + 1}² ${sg} ${c} = ${m.shown[1]}, and so on. The next is ${m.k + 5}² ${sg} ${c} = ${a}.`;
    }
    case 'X3':
      return `The rule alternates between multiplying by ${m.m} and adding ${m.p}. The next step is to ${m.nextIsMul ? `multiply by ${m.m}` : `add ${m.p}`}: ${m.shown[m.shown.length - 1]} ${m.nextIsMul ? '×' : '+'} ${m.nextIsMul ? m.m : m.p} = ${a}.`;
    case 'X4':
      return `Each term is the sum of the two before it, so the next is ${m.shown[4]} + ${m.shown[5]} = ${a}.`;
    case 'X5': {
      const d = (i) => (m.k + i) ** 2;
      return `The gaps are consecutive squares: ${d(1)}, ${d(2)}, ${d(3)}, ${d(4)}. The next gap is ${d(5)}, so the next number is ${m.shown[4]} + ${d(5)} = ${a}.`;
    }
    case 'X6':
      return `These are consecutive prime numbers, so the next term is the first prime after ${m.shown[4]}, which is ${a}.`;
    default:
      throw new Error('unknown numeric template ' + id);
  }
}
