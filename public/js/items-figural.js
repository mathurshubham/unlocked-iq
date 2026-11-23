// v3 item families for pattern reasoning ("matrix" category):
//   R  RAVEN-style attribute matrices   F  figure series
//   O  odd one out                      A  figural analogies
//
// Ideas (rules, distractor design), not code, come from published research:
//  - RAVEN: Zhang, Gao, Jia, Zhu et al., CVPR 2019 (github.com/WellyZhang/RAVEN, GPL-3.0):
//    entities with number / position / type / size / colour attributes, row rules
//    constant, progression, arithmetic, distribute-three, and five layouts.
//  - I-RAVEN: Hu, Ma, Liu, Shen, Liu, AAAI 2021: attribute-bisection distractors, so the
//    answer cannot be found by taking the most common value of each attribute.
//  - Carpenter, Just & Shell (1990), "What one intelligence test measures": the rule
//    taxonomy (constant in a row, quantitative pairwise progression, figure addition or
//    subtraction, distribution of three values).
//  - matRiks R package (MIT): common distractor error patterns (one attribute wrong,
//    value copied from a neighbouring panel, rule applied in the wrong direction).
//  - IMak: Blum & Holling 2018 (GPL-3): figural analogy transformations (rotation,
//    reflection, scaling, fill change, adding or removing an element, combinations).
//  - Yang et al. 2021, "A review of automatic item generation for figural reasoning"
//    (arXiv 2201.08450): overview of rule-based figural item generators.
// Everything below is written from scratch; the generators share nothing with those
// code bases.
//
// Contract (docs/SPEC-v3-items.md): TEMPLATES, variant(id, seed) -> { item, meta },
// explain(id, meta). Pure and deterministic. Figures are built from flat geometric
// primitives (polygon / circle / line) so that visual identity can be checked by
// geometry, not by markup text.
import { rng, placeOptions } from './rng.js';
import { STROKE, SHAPES, shapeGeom, layout, radiusFor } from './svg.js';

// ===========================================================================
// Small helpers
// ===========================================================================

const mod = (a, n) => ((a % n) + n) % n;
const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuf(r, a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
const art = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const num = (v) => String(+v.toFixed(2));
const FILL = ['none', 'grey', 'solid'];
const FILL_ADJ = { none: 'empty', grey: 'grey', solid: 'solid' };
const plural = (shape, n) => (n === 1 ? shape : shape + 's');

// ===========================================================================
// Geometry: scenes are arrays of primitives
//   { t:'poly', pts:[[x,y]..], fill } | { t:'circle', cx, cy, r, fill } | { t:'line', x1,y1,x2,y2 }
// ===========================================================================

const P = {
  poly: (pts, fill = 'none') => ({ t: 'poly', pts, fill }),
  circle: (cx, cy, r, fill = 'none') => ({ t: 'circle', cx, cy, r, fill }),
  line: (x1, y1, x2, y2) => ({ t: 'line', x1, y1, x2, y2 }),
};

// Rotate a point clockwise (screen coordinates, y down) by deg about (cx, cy).
export function rotPt([x, y], deg, cx = 50, cy = 50) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

function shapePrim(shape, fill, cx, cy, r) {
  const g = shapeGeom(shape, cx, cy, r);
  return g.type === 'circle' ? P.circle(g.cx, g.cy, g.r, fill) : P.poly(g.pts, fill);
}

// Asymmetric arrow (head, shaft and one barb); rot clockwise degrees, flip = mirror left-right first.
function arrowPrims(rot, flip = false) {
  const f = ([x, y]) => rotPt(flip ? [100 - x, y] : [x, y], rot);
  const l = (a, b) => P.line(...f(a), ...f(b));
  return [l([50, 40], [50, 82]), l([50, 70], [60, 80]), P.poly([[50, 18], [37, 42], [63, 42]].map(f), 'solid')];
}

// Polyomino helpers. Orientation o in 0..7: bit 2 = mirror left-right first, then o%4 clockwise quarter turns.
const normCells = (c) => {
  const mx = Math.min(...c.map((p) => p[0]));
  const my = Math.min(...c.map((p) => p[1]));
  return c.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
export function orientCells(cells, o) {
  let c = cells;
  if (o >= 4) c = c.map(([x, y]) => [-x, y]);
  for (let i = 0; i < o % 4; i++) c = c.map(([x, y]) => [-y, x]);
  return normCells(c);
}
const extent = (c) => [Math.max(...c.map((p) => p[0])) + 1, Math.max(...c.map((p) => p[1])) + 1];
function cellPrims(cells, cs, fill) {
  const [w, h] = extent(cells);
  const ox = 50 - (w * cs) / 2;
  const oy = 50 - (h * cs) / 2;
  return cells.map(([x, y]) =>
    P.poly([[ox + x * cs, oy + y * cs], [ox + (x + 1) * cs, oy + y * cs], [ox + (x + 1) * cs, oy + (y + 1) * cs], [ox + x * cs, oy + (y + 1) * cs]], fill));
}

// Pentominoes with no symmetry (8 distinct orientations): glyphs for rotation/reflection analogies.
const GLYPHS = [
  [[0, 0], [0, 1], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [1, 1], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
  [[0, 1], [1, 0], [1, 1], [2, 0], [3, 0]],
  [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
];
// Hexominoes with no symmetry (8 distinct orientations), compact: for the odd-one-out mirror item.
const HEXOS = [
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1], [2, 2]],
  [[0, 1], [0, 2], [1, 1], [1, 2], [2, 0], [2, 1]],
  [[0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [3, 0]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [1, 1], [1, 2], [2, 1], [3, 1]],
];

// Visual identity key of a scene (order independent, tolerant to float noise).
const q = (v) => Math.floor(v * 10 + 0.4137);
function primKey(p) {
  if (p.t === 'circle') return `C${p.fill}:${q(p.cx)},${q(p.cy)},${q(p.r)}`;
  if (p.t === 'line') {
    const e = [`${q(p.x1)},${q(p.y1)}`, `${q(p.x2)},${q(p.y2)}`].sort();
    return `L${e.join('|')}`;
  }
  return `P${p.fill}:${p.pts.map(([x, y]) => `${q(x)},${q(y)}`).sort().join('|')}`;
}
export const sceneKey = (scene) => scene.map(primKey).sort().join(';');

// ---- markup ----

function primMarkup(p) {
  if (p.t === 'circle') return `<circle class="f-${p.fill}" cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(p.r)}"/>`;
  if (p.t === 'line') return `<line x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}"/>`;
  return `<polygon class="f-${p.fill}" points="${p.pts.map(([x, y]) => `${num(x)},${num(y)}`).join(' ')}"/>`;
}
const ink = (inner) => `<g stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
const sceneMarkup = (scene) => ink(scene.map(primMarkup).join(''));
const FRAME =
  '<rect class="f-none" x="1" y="1" width="98" height="98" rx="4" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>';
const QMARK =
  '<text x="50" y="52" font-size="64" font-weight="600" font-family="inherit" fill="currentColor" text-anchor="middle" dominant-baseline="central">?</text>';
const svgWrap = (vb, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" role="img" aria-label="${label}">${body}</svg>`;

// One 100x100 figure (answer options).
const cellSvg = (scene, label = 'figure') => svgWrap('0 0 100 100', label, FRAME + sceneMarkup(scene));

// 3x3 matrix stem, same layout as the v1 matrix items (viewBox 320, 10px gaps, "?" bottom right).
function matrixSvg(sceneAt) {
  let body = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sc = sceneAt(r, c);
      body += `<g transform="translate(${c * 110} ${r * 110})">${FRAME}${sc ? sceneMarkup(sc) : QMARK}</g>`;
    }
  }
  return svgWrap('0 0 320 320', '3 by 3 pattern grid, bottom-right cell missing', body);
}

// Single-row stem: panels at x = i * (100 + ROW_GAP); a null panel shows "?".
const ROW_GAP = 8;
function rowSvg(panels, label) {
  const n = panels.length;
  const w = n * 100 + (n - 1) * ROW_GAP;
  let body = '';
  panels.forEach((sc, i) => {
    body += `<g transform="translate(${i * (100 + ROW_GAP)} 0)">${FRAME}${sc ? sceneMarkup(sc) : QMARK}</g>`;
  });
  return svgWrap(`0 0 ${w} 100`, label, body);
}

// ===========================================================================
// Distractor selection (attribute bisection, after I-RAVEN)
// ===========================================================================
// Options are vectors of attribute values. A distractor set is chosen so that, for the
// answer's value of each attribute, no value is systematically more common than it among
// the options, and no option is uniquely "central" (closest to all the others).

const hamming = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

export function heuristicProbs(opts, ai = 0) {
  const n = opts.length;
  const score = new Array(n).fill(0);
  for (let d = 0; d < opts[0].length; d++) {
    const cnt = new Map();
    for (const o of opts) cnt.set(o[d], (cnt.get(o[d]) || 0) + 1);
    const mx = Math.max(...cnt.values());
    const modes = [...cnt].filter(([, c]) => c === mx).map(([v]) => v);
    for (let i = 0; i < n; i++) if (modes.includes(opts[i][d])) score[i] += 1 / modes.length;
  }
  const top = Math.max(...score);
  const tied = score.filter((s) => Math.abs(s - top) < 1e-9).length;
  const mode = Math.abs(score[ai] - top) < 1e-9 ? 1 / tied : 0;
  const dist = opts.map((o, i) => opts.reduce((s, p, j) => s + (i === j ? 0 : hamming(o, p)), 0));
  const mn = Math.min(...dist);
  const ct = dist.filter((x) => x === mn).length;
  const central = dist[ai] === mn ? 1 / ct : 0;
  return { mode, central };
}

function chooseSet(pool, ans, k, r) {
  // Half of the time the answer ties for "most typical" with at least two other options (chance 1/3 for
  // a guesser using the heuristic), otherwise it is strictly less typical than some option. Averaged over
  // seeds the heuristic then lands near chance instead of systematically avoiding the answer.
  const wantTie = r() < 0.5;
  let best = null;
  let bestScore = Infinity;
  for (let t = 0; t < 600; t++) {
    const sel = shuf(r, pool).slice(0, k);
    const { mode, central } = heuristicProbs([ans, ...sel], 0);
    const h1 = sel.filter((v) => hamming(v, ans) === 1).length;
    const worst = Math.max(mode, central);
    const tied = mode > 0 || central > 0;
    const score = worst + (tied === wantTie ? 0 : 0.5) - 0.01 * Math.min(h1, 2);
    if (score < bestScore) {
      best = sel;
      bestScore = score;
    }
    if (worst <= 1 / 3 + 1e-9 && tied === wantTie && h1 >= 1) return sel;
  }
  return best;
}

// Cartesian pool of option vectors around the answer (dims[d][0] is the answer's value),
// keeping only vectors whose rendering is visually new.
function poolFor(dims, render) {
  const seen = new Set([sceneKey(render(dims.map((d) => d[0])))]);
  const out = [];
  const rec = (d, cur) => {
    if (d === dims.length) {
      const k = sceneKey(render(cur));
      if (!seen.has(k)) {
        seen.add(k);
        out.push(cur.slice());
      }
      return;
    }
    for (const v of dims[d]) rec(d + 1, [...cur, v]);
  };
  rec(0, []);
  return out;
}

// ===========================================================================
// R: RAVEN-style attribute matrices
// ===========================================================================

const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const QUAD = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const RING_NAME = ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'];
const QUAD_NAME = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
export const R_RADII = { single: [11, 17, 24, 31], pair: [9, 13, 17], nest: [8, 11, 14] };
const SIZE_ADJ4 = ['tiny', 'small', 'medium', 'large'];
const SIZE_ADJ3 = ['small', 'medium', 'large'];
const SIDES = ['triangle', 'square', 'pentagon', 'hexagon'];

const R_SPECS = {
  R1: { b: -1.6, title: 'Grid: one growing attribute', config: 'single', rules: { size: 'prog' } },
  R2: { b: -1.3, title: 'Grid: shading cycles through three values', config: 'single', rules: { fill: 'dist3' } },
  R3: { b: -1.0, title: 'Grid: number of shapes counts up', config: 'dice', rules: { n: 'prog' } },
  R4: { b: -0.6, title: 'Grid: sides and size both progress', config: 'single', rules: { type: 'prog', size: 'prog' } },
  R5: { b: -0.2, title: 'Grid: nested shapes', config: 'nest', rules: { oType: 'dist3', iFill: 'prog' } },
  R6: { b: 0.2, title: 'Grid: left and right shapes', config: 'pair', rules: { lType: 'dist3', rSize: 'prog' } },
  R7: { b: 0.6, title: 'Grid: shape travels around a ring', config: 'ring', rules: { pos: 'prog', fill: 'dist3' } },
  R8: { b: 1.0, title: 'Grid: counts add up, shapes cycle', config: 'dice', rules: { n: 'arith', type: 'dist3' } },
  R9: { b: 1.4, title: 'Grid: 2x2 slots, three rules', config: 'quad', rules: { pos: 'prog', type: 'dist3', fill: 'dist3' } },
  R10: { b: 1.8, title: 'Grid: size sum with two cycling attributes', config: 'single', rules: { size: 'arith', type: 'dist3', fill: 'dist3' } },
};
const CONFIG_ATTRS = {
  single: ['type', 'size', 'fill'],
  dice: ['n', 'type', 'fill'],
  ring: ['pos', 'type', 'fill'],
  quad: ['pos', 'type', 'fill'],
  pair: ['lType', 'lFill', 'rType', 'rFill', 'rSize'],
  nest: ['oType', 'iType', 'iFill'],
};
const isType = (a) => a === 'type' || a.endsWith('Type');
const isFill = (a) => a === 'fill' || a.endsWith('Fill');

// Value range of one attribute: integers lo..hi (cyc: wraps), pd = allowed progression steps.
function domainOf(attr, config, typeCount) {
  if (isType(attr)) return { lo: 0, hi: typeCount - 1, pd: [1, -1] };
  if (isFill(attr)) return { lo: 0, hi: 2, pd: [1, -1] };
  if (attr === 'size') return { lo: 1, hi: 4, pd: [1, -1], numeric: true };
  if (attr === 'rSize') return { lo: 1, hi: 3, pd: [1, -1], numeric: true };
  if (attr === 'n') return { lo: 1, hi: 5, pd: [1, -1], numeric: true };
  if (attr === 'pos') {
    return config === 'ring'
      ? { lo: 0, hi: 7, cyc: true, pd: [1, 2, 3, -1, -2, -3] }
      : { lo: 0, hi: 3, cyc: true, pd: [1, -1] };
  }
  throw new Error('unknown attribute ' + attr);
}

function typeList(attr, rule, r) {
  if (attr === 'oType') return shuf(r, ['circle', 'square', 'pentagon', 'hexagon']);
  if (attr === 'iType') return shuf(r, ['triangle', 'diamond', 'star', 'circle']);
  if (rule === 'prog') return SIDES.slice();
  return shuf(r, SHAPES).slice(0, 5);
}

// Every rule hypothesis a solver could hold that fits the eight visible cells; the values
// it predicts for the missing cell. A table is unambiguous when this set is exactly one value.
function predictions(T, d) {
  const span = d.hi - d.lo + 1;
  const wrap = (v) => (d.cyc ? d.lo + mod(v - d.lo, span) : v);
  const inDom = (v) => v >= d.lo && v <= d.hi;
  const out = new Set();
  const rowEq = (i) => T[i][0] === T[i][1] && T[i][1] === T[i][2];
  if (rowEq(0) && rowEq(1) && T[2][0] === T[2][1]) out.add(T[2][0]);
  for (const s of [1, 2, 3, -1, -2, -3]) {
    if (!d.cyc && Math.abs(s) > 2) continue;
    const ok = [0, 1].every((i) => wrap(T[i][0] + s) === T[i][1] && wrap(T[i][1] + s) === T[i][2]) && wrap(T[2][0] + s) === T[2][1];
    if (ok && inDom(wrap(T[2][1] + s))) out.add(wrap(T[2][1] + s));
  }
  if (d.numeric) {
    for (const f of [(a, b) => a + b, (a, b) => a - b, (a, b) => b - a]) {
      if ([0, 1].every((i) => f(T[i][0], T[i][1]) === T[i][2]) && inDom(f(T[2][0], T[2][1]))) out.add(f(T[2][0], T[2][1]));
    }
  }
  const set0 = [...T[0]].sort((a, b) => a - b);
  if (new Set(set0).size === 3 && [1].every((i) => [...T[i]].sort((a, b) => a - b).join() === set0.join())) {
    const a = T[2][0];
    const b = T[2][1];
    if (a !== b && set0.includes(a) && set0.includes(b)) out.add(set0.find((v) => v !== a && v !== b));
  }
  return out;
}

function genTable(rule, d, r) {
  const span = d.hi - d.lo + 1;
  const wrap = (v) => (d.cyc ? d.lo + mod(v - d.lo, span) : v);
  const range = Array.from({ length: span }, (_, i) => d.lo + i);
  if (rule === 'const') {
    if (r() < 0.5 && span >= 3) {
      const v = shuf(r, range);
      return { T: [0, 1, 2].map((i) => [v[i], v[i], v[i]]), info: { rule, mode: 'rows' } };
    }
    const v = pick(r, range);
    return { T: [[v, v, v], [v, v, v], [v, v, v]], info: { rule, mode: 'same' } };
  }
  if (rule === 'prog') {
    const dd = pick(r, d.pd);
    const starts = range.filter((s) => d.cyc || (s + 2 * dd >= d.lo && s + 2 * dd <= d.hi));
    const sh = shuf(r, starts);
    const rows = [0, 1, 2].map((i) => sh[i % sh.length]);
    return { T: rows.map((s) => [0, 1, 2].map((k) => wrap(s + k * dd))), info: { rule, d: dd } };
  }
  if (rule === 'arith') {
    const sign = pick(r, [1, -1]);
    const pairs = [];
    for (let a = d.lo; a <= d.hi; a++) {
      for (let b = d.lo; b <= d.hi; b++) {
        const c = sign === 1 ? a + b : a - b;
        if (c >= d.lo && c <= d.hi) pairs.push([a, b, c]);
      }
    }
    return { T: shuf(r, pairs).slice(0, 3), info: { rule, sign } };
  }
  // dist3: the same three values in every row, each row a cyclic shift of the previous one
  const base = shuf(r, range).slice(0, 3);
  const dir = pick(r, [1, -1]);
  return { T: [0, 1, 2].map((i) => [0, 1, 2].map((k) => base[mod(k - i * dir, 3)])), info: { rule, base, dir } };
}

function renderR(config, v, ctx) {
  const t = (a) => ctx.types[a][v[a]];
  switch (config) {
    case 'single':
      return [shapePrim(t('type'), FILL[v.fill], 50, 50, R_RADII.single[v.size - 1])];
    case 'dice': {
      const rr = radiusFor('m', v.n);
      return layout(v.n).map(([dx, dy]) => shapePrim(t('type'), FILL[v.fill], 50 + dx, 50 + dy, rr));
    }
    case 'ring': {
      const [dx, dy] = RING[v.pos];
      return [shapePrim(t('type'), FILL[v.fill], 50 + 30 * dx, 50 + 30 * dy, 12)];
    }
    case 'quad': {
      const [dx, dy] = QUAD[v.pos];
      return [shapePrim(t('type'), FILL[v.fill], 50 + 23 * dx, 50 + 23 * dy, 15)];
    }
    case 'pair':
      return [
        shapePrim(t('lType'), FILL[v.lFill], 27, 50, R_RADII.pair[1]),
        shapePrim(t('rType'), FILL[v.rFill], 73, 50, R_RADII.pair[v.rSize - 1]),
      ];
    case 'nest':
      return [
        shapePrim(t('oType'), 'none', 50, 50, 33),
        shapePrim(t('iType'), FILL[v.iFill], 50, 50, R_RADII.nest[1]),
      ];
    default:
      throw new Error('unknown config ' + config);
  }
}

function describeR(config, v, ctx) {
  const t = (a) => ctx.types[a][v[a]];
  const f = (x) => FILL_ADJ[FILL[x]];
  switch (config) {
    case 'single': return `${art(SIZE_ADJ4[v.size - 1])} ${SIZE_ADJ4[v.size - 1]} ${f(v.fill)} ${t('type')}`;
    case 'dice': return `${v.n} ${f(v.fill)} ${plural(t('type'), v.n)}`;
    case 'ring': return `${art(f(v.fill))} ${f(v.fill)} ${t('type')} at the ${RING_NAME[v.pos]} spot`;
    case 'quad': return `${art(f(v.fill))} ${f(v.fill)} ${t('type')} in the ${QUAD_NAME[v.pos]} corner`;
    case 'pair': return `${art(f(v.lFill))} ${f(v.lFill)} ${t('lType')} on the left and ${art(SIZE_ADJ3[v.rSize - 1])} ${SIZE_ADJ3[v.rSize - 1]} ${f(v.rFill)} ${t('rType')} on the right`;
    case 'nest': return `${art(t('oType'))} ${t('oType')} containing ${art(f(v.iFill))} ${f(v.iFill)} ${t('iType')}`;
    default: return 'a figure';
  }
}

function genR(id, seed) {
  const spec = R_SPECS[id];
  const r = rng(`${id}:${seed}`);
  const attrs = CONFIG_ATTRS[spec.config];
  const ctx = { types: {} };
  const doms = {};
  for (const a of attrs) {
    const rule = spec.rules[a] || 'const';
    if (isType(a)) ctx.types[a] = typeList(a, rule, r);
    doms[a] = domainOf(a, spec.config, ctx.types[a] ? ctx.types[a].length : 0);
  }
  const tables = {};
  const info = {};
  for (const a of attrs) {
    const rule = spec.rules[a] || 'const';
    for (let tries = 0; ; tries++) {
      const g = genTable(rule, doms[a], r);
      const pr = predictions(g.T, doms[a]);
      if (pr.size === 1 && pr.has(g.T[2][2])) {
        tables[a] = g.T;
        info[a] = g.info;
        break;
      }
      if (tries > 400) throw new Error(`no unambiguous table for ${id} ${a}`);
    }
  }
  const cellVals = (rr, cc) => Object.fromEntries(attrs.map((a) => [a, tables[a][rr][cc]]));
  const ansVals = cellVals(2, 2);
  // Distractor dimensions: the answer's value first, then up to two plausible wrong values.
  const dims = attrs.map((a) => {
    const d = doms[a];
    const span = d.hi - d.lo + 1;
    const v = ansVals[a];
    const T = tables[a];
    const cands = [];
    const add = (x) => {
      if (d.cyc) x = d.lo + mod(x - d.lo, span);
      if (x >= d.lo && x <= d.hi && x !== v && !cands.includes(x)) cands.push(x);
    };
    for (const x of shuf(r, [v + 1, v - 1, T[2][1], T[1][2], T[2][0]])) add(x);
    return [v, ...cands.slice(0, 2)];
  });
  const vecToVals = (vec) => Object.fromEntries(attrs.map((a, i) => [a, vec[i]]));
  const render = (vec) => renderR(spec.config, vecToVals(vec), ctx);
  const ansVec = dims.map((d) => d[0]);
  const pool = poolFor(dims, render);
  const sel = chooseSet(pool, ansVec, 5, r);
  if (sel.length < 5) throw new Error(`${id}: pool too small`);
  const placed = placeOptions(`${id}#${seed}`, ansVec, sel);
  const optVals = placed.options.map(vecToVals);
  const item = {
    id,
    category: 'matrix',
    b: spec.b,
    prompt: 'Which option completes the pattern?',
    stem: matrixSvg((rr, cc) => (rr === 2 && cc === 2 ? null : renderR(spec.config, cellVals(rr, cc), ctx))),
    options: optVals.map((v) => cellSvg(renderR(spec.config, v, ctx), describeR(spec.config, v, ctx))),
    answer: placed.answer,
    optionCols: 3,
  };
  const meta = { kind: 'R', config: spec.config, attrs, ctx, rules: info, tables, doms, answerVals: ansVals, optionVals: optVals };
  return { item, meta };
}

const PROG_WORDS = {
  type: (d) => `the shape ${d > 0 ? 'gains' : 'loses'} one side at each step (triangle, square, pentagon, hexagon)`,
  size: (d) => `the shapes ${d > 0 ? 'grow' : 'shrink'} by one size step at each step`,
  rSize: (d) => `the right-hand shape ${d > 0 ? 'grows' : 'shrinks'} by one size step at each step`,
  fill: (d) => `the shading ${d > 0 ? 'gets darker' : 'gets lighter'} by one step each time (empty, grey, solid)`,
  iFill: (d) => `the inner shape's shading ${d > 0 ? 'gets darker' : 'gets lighter'} by one step each time (empty, grey, solid)`,
  n: (d) => `the number of shapes ${d > 0 ? 'goes up' : 'goes down'} by one each time`,
  pos: (d, cfg) => `the shape moves ${Math.abs(d)} ${cfg === 'ring' ? (Math.abs(d) === 1 ? 'place' : 'places') : 'corner'} ${d > 0 ? 'clockwise' : 'anticlockwise'} around the ${cfg === 'ring' ? 'ring of spots' : 'four corners'} each time`,
};
const ATTR_WORD = {
  type: 'shapes', lType: 'left-hand shapes', rType: 'right-hand shapes', oType: 'outer shapes', iType: 'inner shapes',
  size: 'sizes', rSize: 'right-hand sizes', fill: 'shadings', lFill: 'left-hand shadings', rFill: 'right-hand shadings',
  iFill: 'inner shadings', n: 'numbers of shapes', pos: 'positions',
};

function explainR(meta) {
  const parts = [];
  for (const a of meta.attrs) {
    const inf = meta.rules[a];
    if (inf.rule === 'const') continue;
    if (inf.rule === 'prog') parts.push(PROG_WORDS[a] ? PROG_WORDS[a](inf.d, meta.config) : `the ${ATTR_WORD[a]} progress`);
    else if (inf.rule === 'arith') {
      const what = a === 'n' ? 'number of shapes' : 'size step';
      parts.push(inf.sign === 1
        ? `the ${what} in the third panel is the first panel's plus the second's`
        : `the ${what} in the third panel is the first panel's minus the second's`);
    } else parts.push(`each row uses the same three ${ATTR_WORD[a]} once each, shifted along by one place from row to row`);
  }
  const head = parts.length === 1
    ? `Along each row, ${parts[0]}.`
    : `Two or more things change along each row: ${parts.join('; ')}.`;
  return `${head} Everything else stays fixed, so the missing panel is ${describeR(meta.config, meta.answerVals, meta.ctx)}.`;
}

// ===========================================================================
// F: figure series
// ===========================================================================

const F_SPECS = {
  F1: { b: -1.4, title: 'Series: rotating arrow' },
  F2: { b: -0.9, title: 'Series: an element added each step' },
  F3: { b: -0.3, title: 'Series: dot travelling round a frame' },
  F4: { b: 0.6, title: 'Series: two interleaved sequences' },
  F5: { b: 1.1, title: 'Series: rotation combined with counting' },
};
const ring8 = (k, rad = 32) => {
  const a = (k * Math.PI) / 4;
  return [50 + rad * Math.sin(a), 50 - rad * Math.cos(a)];
};
const SQ_POS = [[50, 15], [85, 15], [85, 50], [85, 85], [50, 85], [15, 85], [15, 50], [15, 15]];
const ELEMENT_SHAPES = ['circle', 'square', 'triangle', 'diamond'];

function dotsRow(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(P.circle(50 + (i - (n - 1) / 2) * 11, 9, 3.5, 'solid'));
  return out;
}

function genF(id, seed) {
  const r = rng(`${id}:${seed}`);
  const spec = F_SPECS[id];
  let panels; // 4 or 5 shown scenes
  let ansScene;
  let dist = []; // distractor scenes (pool)
  let meta;
  let label;
  let nDist = 4;
  if (id === 'F1') {
    const step = pick(r, [45, 90, 135]) * pick(r, [1, -1]);
    const a0 = ri(r, 0, 7) * 45;
    const ang = (i) => mod(a0 + i * step, 360);
    panels = [0, 1, 2, 3].map((i) => arrowPrims(ang(i)));
    ansScene = arrowPrims(ang(4));
    dist = [arrowPrims(ang(3)), arrowPrims(ang(5)), arrowPrims(ang(2)), arrowPrims(ang(4), true),
      arrowPrims(ang(4) + 180), arrowPrims(ang(3), true), arrowPrims(ang(5), true)];
    meta = { a0, step };
    label = 'a row of arrows rotating step by step, next one missing';
  } else if (id === 'F2') {
    const shape = pick(r, ELEMENT_SHAPES);
    const start = ri(r, 0, 7);
    const dir = pick(r, [1, -1, 3, -3]);
    const idx = (i) => mod(start + dir * i, 8);
    const make = (slots, lastShape) =>
      slots.map((s, i) => shapePrim(i === slots.length - 1 && lastShape ? lastShape : shape, 'solid', ...ring8(s), 8));
    const upto = (n) => Array.from({ length: n }, (_, i) => idx(i));
    panels = [1, 2, 3, 4].map((n) => make(upto(n)));
    ansScene = make(upto(5));
    const other = pick(r, ELEMENT_SHAPES.filter((s) => s !== shape));
    dist = [make(upto(4)), make([...upto(4), idx(5)]), make(upto(6)), make([...upto(4), mod(start - dir, 8)]),
      make([...upto(4), mod(idx(4) + 4, 8)]), make(upto(5), other)];
    meta = { shape, start, dir, other };
    label = 'a row of figures gaining one element each step, next one missing';
  } else if (id === 'F3') {
    const frame = pick(r, ['square', 'circle']);
    const k = pick(r, [1, -1, 2, -2, 3, -3]);
    const p0 = ri(r, 0, 7);
    const pos = (i) => mod(p0 + k * i, 8);
    const at = (p) => (frame === 'square' ? SQ_POS[p] : ring8(p, 35));
    const scene = (p) => [frame === 'square' ? P.poly([[15, 15], [85, 15], [85, 85], [15, 85]], 'none') : P.circle(50, 50, 35, 'none'),
      P.circle(at(p)[0], at(p)[1], 7, 'solid')];
    panels = [0, 1, 2, 3].map((i) => scene(pos(i)));
    ansScene = scene(pos(4));
    dist = [pos(4) + 1, pos(4) - 1, pos(3), pos(5), pos(4) + 4, pos(2)].map((p) => scene(mod(p, 8)));
    meta = { frame, k, p0 };
    label = 'a row of frames with a dot moving round the frame, next one missing';
  } else if (id === 'F4') {
    const sA = pick(r, [90, -90, 45, -45]);
    const a0 = ri(r, 0, 7) * 45;
    const c0 = ri(r, 1, 2);
    const bShape = pick(r, SHAPES);
    const bFill = pick(r, FILL);
    const cnt = (n, shape = bShape, fill = bFill) =>
      layout(n).map(([dx, dy]) => shapePrim(shape, fill, 50 + dx, 50 + dy, radiusFor('m', n)));
    const A = (j) => arrowPrims(mod(a0 + sA * j, 360));
    panels = [A(0), cnt(c0), A(1), cnt(c0 + 1), A(2)];
    ansScene = cnt(c0 + 2);
    const otherShape = pick(r, SHAPES.filter((s) => s !== bShape));
    const otherFill = pick(r, FILL.filter((f) => f !== bFill));
    dist = [cnt(c0 + 1), cnt(c0 + 3), A(3), cnt(c0 + 2, otherShape), cnt(c0 + 2, bShape, otherFill)];
    meta = { sA, a0, c0, bShape, bFill, otherShape, otherFill };
    label = 'a row alternating between two sequences, next one missing';
  } else {
    const rs = pick(r, [45, 90, -45, -90]);
    const a0 = ri(r, 0, 7) * 45;
    const e = pick(r, [1, -1]);
    const c0 = e === 1 ? ri(r, 1, 2) : ri(r, 5, 6);
    const ang = (i) => mod(a0 + rs * i, 360);
    const c = (i) => c0 + e * i;
    const fig = (rot, n, flip = false) => [...arrowPrims(rot, flip), ...dotsRow(n)];
    panels = [0, 1, 2, 3].map((i) => fig(ang(i), c(i)));
    ansScene = fig(ang(4), c(4));
    const rv = [ang(4), ang(3), ang(5)];
    const cv = [c(4), c(3), c(5)].filter((n) => n >= 1 && n <= 6);
    const raw = [];
    for (const rot of rv) for (const n of cv) raw.push([rot, n, false]);
    for (const n of cv) raw.push([ang(4), n, true]);
    dist = raw.filter((v) => !(v[0] === ang(4) && v[1] === c(4) && !v[2])).map(([rot, n, fl]) => fig(rot, n, fl));
    meta = { rs, a0, e, c0 };
    label = 'a row of arrows with dots, rotation and count both changing, next one missing';
  }
  // dedupe by visual key, drop anything identical to the answer
  const seen = new Set([sceneKey(ansScene)]);
  const uniq = [];
  for (const d of shuf(r, dist)) {
    const k = sceneKey(d);
    if (!seen.has(k)) { seen.add(k); uniq.push(d); }
  }
  const sel = uniq.slice(0, nDist);
  if (sel.length < nDist) throw new Error(`${id}: not enough distractors`);
  const placed = placeOptions(`${id}#${seed}`, ansScene, sel);
  const item = {
    id,
    category: 'matrix',
    b: spec.b,
    prompt: 'Which figure comes next in the series?',
    stem: rowSvg([...panels, null], label),
    options: placed.options.map((s) => cellSvg(s)),
    answer: placed.answer,
    optionCols: 5,
  };
  return { item, meta: { kind: 'F', id, ...meta, shown: panels.length } };
}

function explainF(id, m) {
  switch (id) {
    case 'F1': return `The arrow turns ${Math.abs(m.step)} degrees ${m.step > 0 ? 'clockwise' : 'anticlockwise'} at every step. Turn the last arrow by the same amount once more to get the next figure.`;
    case 'F2': {
      const d = Math.abs(m.dir);
      return `One more ${m.shape} is added at every step, always ${d === 1 ? 'in the next spot' : `${d} spots further on`} around the circle ${m.dir > 0 ? 'clockwise' : 'anticlockwise'}. The next figure therefore has five ${m.shape}s, the fifth in the following spot.`;
    }
    case 'F3': {
      const d = Math.abs(m.k);
      return `The dot moves ${d} ${d === 1 ? 'position' : 'positions'} ${m.k > 0 ? 'clockwise' : 'anticlockwise'} around the ${m.frame} frame at each step (the frame has eight positions: corners and midpoints, or eight evenly spaced points). Move it the same distance once more.`;
    }
    case 'F4':
      return `Two sequences alternate. The arrows turn ${Math.abs(m.sA)} degrees ${m.sA > 0 ? 'clockwise' : 'anticlockwise'} each time they appear, and the ${plural(m.bShape, 2)} gain one in number each time they appear. The missing figure is the next ${m.bShape} figure, with ${m.c0 + 2} of them.`;
    default:
      return `Two things change together: the arrow turns ${Math.abs(m.rs)} degrees ${m.rs > 0 ? 'clockwise' : 'anticlockwise'} each step, and the number of dots ${m.e > 0 ? 'rises' : 'falls'} by one each step. Apply both changes once more.`;
  }
}

// ===========================================================================
// O: odd one out
// ===========================================================================

const O_SPECS = {
  O1: { b: -0.7, title: 'Odd one out: count parity' },
  O2: { b: -0.2, title: 'Odd one out: number of sides inside' },
  O3: { b: 0.6, title: 'Odd one out: mirrored shape' },
  O4: { b: 1.0, title: 'Odd one out: symmetry' },
};

// Which index is the only different one among five values (or -1).
function singled(vals) {
  for (let i = 0; i < vals.length; i++) {
    const rest = vals.filter((_, j) => j !== i);
    if (rest.every((v) => v === rest[0]) && vals[i] !== rest[0]) return i;
  }
  return -1;
}

// ---- O1: parity of the number of shapes ----
function scatter(r, n, minD) {
  for (let tries = 0; tries < 300; tries++) {
    const pts = [];
    for (let k = 0; k < 4000 && pts.length < n; k++) {
      const p = [14 + r() * 72, 14 + r() * 72];
      if (pts.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) >= minD)) pts.push(p);
    }
    if (pts.length === n) return pts;
  }
  throw new Error('scatter failed');
}
function genO1(seed) {
  const r = rng(`O1:${seed}`);
  const shape = pick(r, SHAPES);
  const fill = pick(r, FILL);
  const evenMajor = r() < 0.5;
  const major = evenMajor ? [2, 4, 6, 8] : [1, 3, 5, 7];
  const odd = evenMajor ? 3 : 6;
  const counts = [...major, odd];
  const draw = (n) => scatter(r, n, 19).map(([x, y]) => shapePrim(shape, fill, x, y, 6.2));
  const figs = counts.map(draw);
  const placed = placeOptions(`O1#${seed}`, figs[4], figs.slice(0, 4));
  return {
    options: placed.options, answer: placed.answer,
    meta: { kind: 'O', id: 'O1', evenMajor, counts, shape, fill, oddCount: odd },
  };
}

// ---- O2: number of sides ----
const POLY_RAW = {
  3: {
    tri_up: [[0, -1], [0.87, 0.5], [-0.87, 0.5]], tri_down: [[0, 1], [0.87, -0.5], [-0.87, -0.5]],
    tri_right: [[-1, -1], [1, 1], [-1, 1]], tri_wide: [[-1.5, 0.6], [1.5, 0.6], [0, -0.9]],
  },
  4: {
    square: [[-1, -1], [1, -1], [1, 1], [-1, 1]], diamond: [[0, -1.35], [1, 0], [0, 1.35], [-1, 0]],
    rect_wide: [[-1.6, -0.8], [1.6, -0.8], [1.6, 0.8], [-1.6, 0.8]], trapezoid: [[-0.7, -0.8], [0.7, -0.8], [1.4, 0.8], [-1.4, 0.8]],
    parallelogram: [[-1.5, 0.8], [-0.5, -0.8], [1.5, -0.8], [0.5, 0.8]],
  },
  5: {
    pent_up: [0, 1, 2, 3, 4].map((i) => [Math.sin((i * 2 * Math.PI) / 5), -Math.cos((i * 2 * Math.PI) / 5)]),
    pent_down: [0, 1, 2, 3, 4].map((i) => [Math.sin((i * 2 * Math.PI) / 5), Math.cos((i * 2 * Math.PI) / 5)]),
    house: [[-1, 1], [-1, -0.2], [0, -1.2], [1, -0.2], [1, 1]],
    pent_right: [0, 1, 2, 3, 4].map((i) => [Math.cos((i * 2 * Math.PI) / 5), Math.sin((i * 2 * Math.PI) / 5)]),
    pent_kite: [[0, -1.3], [1.1, -0.3], [0.7, 1], [-0.7, 1], [-1.1, -0.3]],
  },
  6: {
    hex_pointy: [0, 1, 2, 3, 4, 5].map((i) => [Math.sin((i * Math.PI) / 3), -Math.cos((i * Math.PI) / 3)]),
    hex_flat: [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]),
    hex_long: [[-1.5, 0], [-0.7, -0.9], [0.7, -0.9], [1.5, 0], [0.7, 0.9], [-0.7, 0.9]],
  },
};
const SIDES_OF = Object.fromEntries(Object.entries(POLY_RAW).flatMap(([k, o]) => Object.keys(o).map((n) => [n, +k])));
const REGULAR = new Set(['tri_up', 'tri_down', 'square', 'diamond', 'pent_up', 'pent_down', 'pent_right', 'hex_pointy', 'hex_flat']);
const POLY_AREA = 1000;
function polyPts(raw) {
  let a = 0;
  for (let i = 0; i < raw.length; i++) {
    const [x1, y1] = raw[i];
    const [x2, y2] = raw[(i + 1) % raw.length];
    a += x1 * y2 - x2 * y1;
  }
  const s = Math.sqrt(POLY_AREA / Math.abs(a / 2));
  const pts = raw.map(([x, y]) => [x * s, y * s]);
  const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
  const cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
  return pts.map(([x, y]) => [50 + x - cx, 50 + y - cy]);
}
function polyAspect(pts) {
  const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  return w / h > 1.15 ? 'wide' : w / h < 0.87 ? 'tall' : 'even';
}
function genO2(seed) {
  const r = rng(`O2:${seed}`);
  const fill = pick(r, FILL);
  for (let tries = 0; tries < 200; tries++) {
    const k = pick(r, [3, 4, 5]);
    const k2 = pick(r, [3, 4, 5, 6].filter((x) => x !== k));
    const names = [...shuf(r, Object.keys(POLY_RAW[k])).slice(0, 4), pick(r, Object.keys(POLY_RAW[k2]))];
    if (names.slice(0, 4).length < 4) continue;
    const pts = names.map((n) => polyPts(POLY_RAW[SIDES_OF[n]][n]));
    const props = [names.map((n) => REGULAR.has(n)), pts.map(polyAspect)];
    if (props.some((v) => singled(v) >= 0)) continue;
    const figs = pts.map((p) => [P.circle(50, 50, 42, 'none'), P.poly(p, fill)]);
    const placed = placeOptions(`O2#${seed}`, figs[4], figs.slice(0, 4));
    return { options: placed.options, answer: placed.answer, meta: { kind: 'O', id: 'O2', k, k2, names, fill } };
  }
  throw new Error('O2: no valid set');
}

// ---- O3: mirrored shape among rotations ----
function genO3(seed) {
  const r = rng(`O3:${seed}`);
  const gi = ri(r, 0, HEXOS.length - 1);
  const base = HEXOS[gi];
  const [w, h] = extent(base);
  const cs = Math.min(18, 66 / Math.max(w, h));
  const rots = shuf(r, [0, 1, 2, 3]);
  const oddRot = ri(r, 0, 3);
  const orient = [...rots, 4 + oddRot];
  const figs = orient.map((o) => cellPrims(orientCells(base, o), cs, 'grey'));
  const placed = placeOptions(`O3#${seed}`, figs[4], figs.slice(0, 4));
  return { options: placed.options, answer: placed.answer, meta: { kind: 'O', id: 'O3', gi, orient } };
}

// ---- O4: reflection symmetry ----
const GRID = 5;
const cellKey = ([x, y]) => `${x},${y}`;
function connected(cells) {
  const set = new Set(cells.map(cellKey));
  const seen = new Set([cellKey(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}
const setKey = (cells) => cells.map(cellKey).sort().join(';');
const mirrorV = (cells) => cells.map(([x, y]) => [GRID - 1 - x, y]);
const mirrorH = (cells) => cells.map(([x, y]) => [x, GRID - 1 - y]);
const rot180 = (cells) => cells.map(([x, y]) => [GRID - 1 - x, GRID - 1 - y]);
const diag = (cells) => cells.map(([x, y]) => [y, x]);
const symmetricUnder = (cells, f) => setKey(f(cells)) === setKey(cells);
function symFigure(r, m1, m2) {
  for (let t = 0; t < 500; t++) {
    const left = shuf(r, Array.from({ length: GRID * 2 }, (_, i) => [i % 2, Math.floor(i / 2)])).slice(0, m1);
    const centre = shuf(r, Array.from({ length: GRID }, (_, i) => [2, i])).slice(0, m2);
    const cells = [...left, ...mirrorV(left), ...centre];
    if (connected(cells)) return cells;
  }
  throw new Error('symFigure failed');
}
function genO4(seed) {
  const r = rng(`O4:${seed}`);
  for (let tries = 0; tries < 300; tries++) {
    const m1 = ri(r, 2, 4);
    const m2 = ri(r, 1, 3);
    const syms = [];
    const keys = new Set();
    for (let i = 0; i < 4 && tries < 300; i++) {
      const c = symFigure(r, m1, m2);
      if (!keys.has(setKey(c))) { keys.add(setKey(c)); syms.push(c); }
    }
    if (syms.length < 4) continue;
    // the odd one: a symmetric figure with one cell moved
    const src = symFigure(r, m1, m2);
    const move = pick(r, src);
    const rest = src.filter((c) => c !== move);
    const empties = [];
    for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) {
      if (!rest.some((c) => c[0] === x && c[1] === y) && !(x === move[0] && y === move[1])) empties.push([x, y]);
    }
    const dest = pick(r, empties);
    const odd = [...rest, dest];
    if (!connected(odd) || symmetricUnder(odd, mirrorV) || keys.has(setKey(odd))) continue;
    const figs = [...syms, odd];
    const bb = (c) => [Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1])) - Math.min(...c.map((p) => p[1]))];
    const props = [
      figs.map((c) => bb(c)[0]), figs.map((c) => bb(c)[1]), figs.map((c) => symmetricUnder(c, mirrorH)),
      figs.map((c) => symmetricUnder(c, rot180)), figs.map((c) => symmetricUnder(c, diag)),
      figs.map((c) => c.filter((p) => p[0] < 2).length), figs.map((c) => c.filter((p) => p[1] < 2).length),
    ];
    if (props.some((v) => singled(v) >= 0)) continue;
    const flip = r() < 0.5;
    const cs = 13;
    // the whole 5x5 grid is centred, so the symmetry axis is the cell's centre line
    const grid = (c) => {
      const o = 50 - (GRID * cs) / 2;
      return (flip ? c.map(([x, y]) => [y, x]) : c).map(([x, y]) =>
        P.poly([[o + x * cs, o + y * cs], [o + (x + 1) * cs, o + y * cs], [o + (x + 1) * cs, o + (y + 1) * cs], [o + x * cs, o + (y + 1) * cs]], 'grey'));
    };
    const sc = figs.map(grid);
    const placed = placeOptions(`O4#${seed}`, sc[4], sc.slice(0, 4));
    return { options: placed.options, answer: placed.answer, meta: { kind: 'O', id: 'O4', flip, m1, m2, axis: flip ? 'horizontal' : 'vertical' } };
  }
  throw new Error('O4: no valid set');
}

function genO(id, seed) {
  const g = { O1: genO1, O2: genO2, O3: genO3, O4: genO4 }[id](seed);
  const item = {
    id,
    category: 'matrix',
    b: O_SPECS[id].b,
    prompt: 'Which figure does not belong with the others?',
    stem: '',
    options: g.options.map((s) => cellSvg(s)),
    answer: g.answer,
    optionCols: 5,
  };
  return { item, meta: g.meta };
}

function explainO(id, m) {
  switch (id) {
    case 'O1':
      return m.evenMajor
        ? 'Four of the figures contain an even number of shapes (2, 4, 6 and 8); only one contains an odd number, three.'
        : 'Four of the figures contain an odd number of shapes (1, 3, 5 and 7); only one contains an even number, six.';
    case 'O2':
      return `Four figures contain a shape with ${m.k} sides (different ${m.k}-sided shapes, in different orientations); the odd figure contains a ${m.k2}-sided shape. Fill and size are not the clue.`;
    case 'O3':
      return 'Four of the figures are the same shape turned to different angles. One is the mirror image of it, which no amount of turning can reproduce, so it does not belong.';
    default:
      return `Four of the figures are mirror-symmetric about the ${m.axis} centre line. One has a single block moved, so its two halves no longer match.`;
  }
}

// ===========================================================================
// A: figural analogies   A : B  as  C : ?
// ===========================================================================

const A_SPECS = {
  A1: { b: -1.2, title: 'Analogy: rotation or reflection' },
  A2: { b: -0.8, title: 'Analogy: change of shading' },
  A3: { b: -0.2, title: 'Analogy: change of size' },
  A4: { b: 0.4, title: 'Analogy: adding or removing a mark' },
  A5: { b: 1.1, title: 'Analogy: two changes combined' },
};

// Figure model: { k:'glyph'|'shape', id, o (0..7), s (size level), f (fill 0..2), x (extra marks) }
const SIZE_STEP = 1.4;
const shapeRadius = (s) => 12 * SIZE_STEP ** (s - 1);
const glyphCell = (id, s) => {
  const [w, h] = extent(GLYPHS[id]);
  return (39.8 / Math.max(w, h)) * SIZE_STEP ** (s - 1);
};
// Extra marks for the add / remove / replace analogy.
const MARKS = {
  tr: () => [P.circle(82, 18, 6, 'solid')],
  bl: () => [P.circle(18, 82, 6, 'solid')],
  mid: () => [P.circle(50, 50, 5, 'solid')],
  bar: () => [P.line(28, 90, 72, 90)],
};
function renderFig(fig) {
  let sc;
  if (fig.k === 'glyph') sc = cellPrims(orientCells(GLYPHS[fig.id], fig.o), glyphCell(fig.id, fig.s), FILL[fig.f]);
  else sc = [shapePrim(SHAPES[fig.id], FILL[fig.f], 50, 50, shapeRadius(fig.s))];
  for (const m of fig.x || []) sc.push(...MARKS[m]());
  return sc;
}
// Group algebra on orientations: o = (mirror m, quarter turns k); apply `first`, then `second`.
const oParts = (o) => [o >= 4 ? 1 : 0, o % 4];
function compose(first, second) {
  const [m1, k1] = oParts(first);
  const [m2, k2] = oParts(second);
  return ((m1 + m2) % 2) * 4 + mod(k2 + (m2 ? -k1 : k1), 4);
}
const invOp = (o) => {
  const [m, k] = oParts(o);
  return m ? o : mod(-k, 4);
};
const O_NAMES = { 1: 'turned a quarter turn clockwise', 3: 'turned a quarter turn anticlockwise', 2: 'turned upside down (a half turn)', 4: 'reflected left to right', 6: 'reflected top to bottom' };

// Analogy stem: A -> B  ::  C -> ?
function analogySvg(A, B, C) {
  const cell = (x, sc) => `<g transform="translate(${x} 0)">${FRAME}${sc ? sceneMarkup(sc) : QMARK}</g>`;
  const arrow = (x) =>
    ink(`<line x1="${x + 6}" y1="50" x2="${x + 24}" y2="50"/><line x1="${x + 18}" y1="43" x2="${x + 24}" y2="50"/><line x1="${x + 18}" y1="57" x2="${x + 24}" y2="50"/>`);
  const dots = ink([[252, 43], [268, 43], [252, 57], [268, 57]].map(([x, y]) => primMarkup(P.circle(x, y, 2.5, 'solid'))).join(''));
  return svgWrap('0 0 520 100', 'figure analogy: the first figure is to the second as the third is to the missing one',
    cell(0, A) + arrow(100) + cell(130, B) + dots + cell(290, C) + arrow(390) + cell(420, null));
}

function genA(id, seed) {
  const r = rng(`${id}:${seed}`);
  const spec = A_SPECS[id];
  const flat = [0, 1, 2, 3, 4];
  let A; let B; let C; let ans;
  let dims; let toFig; let meta;
  const shapes3 = shuf(r, SHAPES.map((_, i) => i)).slice(0, 3);
  const [g1, g2] = shuf(r, flat);
  const fills = shuf(r, [0, 1, 2]);

  if (id === 'A1') {
    const op = pick(r, [1, 3, 2, 4, 6]);
    const base = ri(r, 0, 3);
    A = { k: 'glyph', id: g1, o: base, s: 2, f: 1 };
    B = { ...A, o: compose(base, op) };
    C = { k: 'glyph', id: g2, o: base, s: 2, f: 1 };
    ans = { ...C, o: compose(base, op) };
    const oAlts = shuf(r, [0, 1, 2, 3, 4, 5, 6, 7].filter((o) => o !== ans.o));
    dims = [[g2, g1], [ans.o, ...oAlts.slice(0, 7)]];
    toFig = ([g, o]) => ({ k: 'glyph', id: g, o, s: 2, f: 1 });
    meta = { op, base, glyphs: [g1, g2] };
  } else if (id === 'A2') {
    const [s1, s2, s3] = shapes3;
    const [f1, f2, f3] = fills;
    const sz = ri(r, 2, 3);
    A = { k: 'shape', id: s1, o: 0, s: sz, f: f1 };
    B = { ...A, f: f2 };
    C = { ...A, id: s2 };
    ans = { ...C, f: f2 };
    dims = [[s2, s1, s3], [f2, f1, f3], [sz, sz - 1, sz + 1].filter((x) => x >= 1 && x <= 4)];
    toFig = ([s, f, z]) => ({ k: 'shape', id: s, o: 0, s: z, f, x: [] });
    meta = { shapes: [s1, s2], fills: [f1, f2] };
  } else if (id === 'A3') {
    const [s1, s2, s3] = shapes3;
    const delta = pick(r, [1, -1, 2, -2]);
    const sa = delta > 0 ? ri(r, 1, 4 - delta) : ri(r, 1 - delta, 4);
    const f = pick(r, [0, 1, 2]);
    A = { k: 'shape', id: s1, o: 0, s: sa, f };
    B = { ...A, s: sa + delta };
    C = { ...A, id: s2 };
    ans = { ...C, s: sa + delta };
    const sizes = [sa + delta, sa - delta, sa + 2 * delta, sa, sa + delta + (delta > 0 ? -1 : 1)].filter((x, i, a) => x >= 1 && x <= 4 && a.indexOf(x) === i);
    dims = [[s2, s1, s3], sizes.slice(0, 3), [f, (f + 1) % 3]];
    toFig = ([s, z, ff]) => ({ k: 'shape', id: s, o: 0, s: z, f: ff, x: [] });
    meta = { shapes: [s1, s2], sa, delta, f };
  } else if (id === 'A4') {
    const [s1, s2, s3] = shapes3;
    const marks = shuf(r, Object.keys(MARKS));
    const mode = pick(r, ['add', 'remove', 'replace']);
    const [E, E2, E3] = marks;
    const setA = mode === 'add' ? [] : [E];
    const setB = mode === 'remove' ? [] : mode === 'add' ? [E] : [E2];
    A = { k: 'shape', id: s1, o: 0, s: 3, f: 0, x: setA };
    B = { ...A, x: setB };
    C = { ...A, id: s2 };
    ans = { ...C, x: setB };
    const sets = [setB, setA, [E3], [E, E2], [E2, E3], [], [E2], [E]]
      .filter((x, i, a) => a.findIndex((y) => y.slice().sort().join() === x.slice().sort().join()) === i);
    dims = [[s2, s1, s3], sets.slice(0, 5)];
    toFig = ([s, x]) => ({ k: 'shape', id: s, o: 0, s: 3, f: 0, x });
    meta = { mode, marks: [E, E2], shapes: [s1, s2] };
  } else {
    const combo = pick(r, ['geom+fill', 'geom+scale', 'scale+fill']);
    const op = pick(r, [1, 3, 4, 6]);
    const [f1, f2, f3] = fills;
    const base = ri(r, 0, 3);
    if (combo === 'scale+fill') {
      const [s1, s2, s3] = shapes3;
      const delta = pick(r, [1, -1, 2, -2]);
      const sa = delta > 0 ? ri(r, 1, 4 - delta) : ri(r, 1 - delta, 4);
      A = { k: 'shape', id: s1, o: 0, s: sa, f: f1 };
      B = { ...A, s: sa + delta, f: f2 };
      C = { ...A, id: s2 };
      ans = { ...C, s: sa + delta, f: f2 };
      const sizes = [sa + delta, sa, sa - delta, sa + 2 * delta].filter((x, i, a) => x >= 1 && x <= 4 && a.indexOf(x) === i);
      dims = [[s2, s1, s3], sizes.slice(0, 3), [f2, f1, f3]];
      toFig = ([s, z, f]) => ({ k: 'shape', id: s, o: 0, s: z, f, x: [] });
      meta = { combo, shapes: [s1, s2], delta, sa, fills: [f1, f2] };
    } else {
      const withScale = combo === 'geom+scale';
      const delta = withScale ? pick(r, [1, -1]) : 0;
      A = { k: 'glyph', id: g1, o: base, s: 2, f: f1 };
      B = { ...A, o: compose(base, op), s: 2 + delta, f: withScale ? f1 : f2 };
      C = { k: 'glyph', id: g2, o: base, s: 2, f: f1 };
      ans = { ...C, o: compose(base, op), s: 2 + delta, f: withScale ? f1 : f2 };
      const oVals = [ans.o, base, compose(base, invOp(op)), compose(ans.o, 4)].filter((x, i, a) => a.indexOf(x) === i);
      const sVals = withScale ? [2 + delta, 2, 2 - delta] : [2];
      const fVals = withScale ? [f1] : [f2, f1, f3];
      dims = [[g2, g1], oVals.slice(0, 3), sVals, fVals];
      toFig = ([g, o, s, f]) => ({ k: 'glyph', id: g, o, s, f });
      meta = { combo, op, base, glyphs: [g1, g2], delta, fills: [f1, f2] };
    }
  }

  const render = (vec) => renderFig(toFig(vec));
  const ansVec = dims.map((d) => d[0]);
  const pool = poolFor(dims, render);
  const sel = chooseSet(pool, ansVec, 4, r);
  if (sel.length < 4) throw new Error(`${id}: pool too small`);
  const placed = placeOptions(`${id}#${seed}`, ansVec, sel);
  const item = {
    id,
    category: 'matrix',
    b: spec.b,
    prompt: 'The first figure is to the second as the third is to which option?',
    stem: analogySvg(renderFig(A), renderFig(B), renderFig(C)),
    options: placed.options.map((v) => cellSvg(render(v))),
    answer: placed.answer,
    optionCols: 5,
  };
  const optionVecs = placed.options;
  return { item, meta: { kind: 'A', id, ...meta, A, B, C, ans, optionVecs, dims } };
}

const sNames = (i) => SHAPES[i];
function explainA(id, m) {
  switch (id) {
    case 'A1': {
      const how = O_NAMES[m.op];
      return `The first figure becomes the second by being ${how}. Apply the same movement to the third figure, keeping its shape and shading as they are.`;
    }
    case 'A2':
      return `Going from the first figure to the second, the ${sNames(m.shapes[0])} changes from ${FILL_ADJ[FILL[m.fills[0]]]} to ${FILL_ADJ[FILL[m.fills[1]]]} and nothing else changes. Give the ${sNames(m.shapes[1])} the same change of shading.`;
    case 'A3':
      return `The first figure ${m.delta > 0 ? 'grows' : 'shrinks'} by ${Math.abs(m.delta)} size ${Math.abs(m.delta) === 1 ? 'step' : 'steps'} to become the second, with the same shading. Make the ${sNames(m.shapes[1])} ${m.delta > 0 ? 'bigger' : 'smaller'} by the same number of steps.`;
    case 'A4':
      return m.mode === 'add'
        ? `A small mark is added to the first figure to make the second. Add the same mark, in the same place, to the ${sNames(m.shapes[1])}.`
        : m.mode === 'remove'
          ? `A small mark is taken away from the first figure to make the second. Remove the same mark from the ${sNames(m.shapes[1])}.`
          : `One small mark is swapped for another between the first and second figures. Make the same swap on the ${sNames(m.shapes[1])}.`;
    default:
      return m.combo === 'geom+fill'
        ? `Two things happen at once: the shape is ${O_NAMES[m.op]} and its shading changes from ${FILL_ADJ[FILL[m.fills[0]]]} to ${FILL_ADJ[FILL[m.fills[1]]]}. Apply both changes to the third figure.`
        : m.combo === 'geom+scale'
          ? `Two things happen at once: the shape is ${O_NAMES[m.op]} and it becomes ${m.delta > 0 ? 'larger' : 'smaller'}. Apply both changes to the third figure.`
          : `Two things happen at once: the ${sNames(m.shapes[0])} ${m.delta > 0 ? 'grows' : 'shrinks'} by ${Math.abs(m.delta)} size ${Math.abs(m.delta) === 1 ? 'step' : 'steps'} and its shading changes from ${FILL_ADJ[FILL[m.fills[0]]]} to ${FILL_ADJ[FILL[m.fills[1]]]}. Apply both changes to the ${sNames(m.shapes[1])}.`;
  }
}

// ===========================================================================
// Public API
// ===========================================================================

const SPECS = { ...R_SPECS, ...F_SPECS, ...O_SPECS, ...A_SPECS };
const FAMILY = { R: 'raven', F: 'series', O: 'odd', A: 'analogy' };

export const TEMPLATES = Object.entries(SPECS).map(([id, s]) => ({
  id, category: 'matrix', b: s.b, family: FAMILY[id[0]], title: s.title,
}));

export function variant(id, seed = 0) {
  if (!SPECS[id]) throw new Error(`unknown template ${id}`);
  const s = seed >>> 0;
  switch (id[0]) {
    case 'R': return genR(id, s);
    case 'F': return genF(id, s);
    case 'O': return genO(id, s);
    default: return genA(id, s);
  }
}

export function explain(id, meta) {
  switch (id[0]) {
    case 'R': return explainR(meta);
    case 'F': return explainF(id, meta);
    case 'O': return explainO(id, meta);
    default: return explainA(id, meta);
  }
}
