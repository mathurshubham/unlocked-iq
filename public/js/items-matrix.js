// 12 matrix-reasoning items (3x3 grid, find the bottom-right cell).
// Pure: no DOM. Rules are hand-designed per docs/SPEC.md and verified in
// test/matrix.test.mjs.
import { placeOptions, rng } from './rng.js';
import { cellSvg, gridSvg, SEG_IDS, SHAPES } from './svg.js';

// ---- cell model ----------------------------------------------------------

export const shp = (shape, fill = 'none', size = 'm', n = 1) => ({ t: 'shape', shape, fill, size, n });
export const arr = (rot) => ({ t: 'arrow', rot });
export const dot = (k) => ({ t: 'dot', k: ((k % 8) + 8) % 8 });
// Segment set: ids deduplicated and put in canonical order.
export const segs = (ids) =>
  SEG_IDS.filter((id) => ids.includes(id)).map((id) => ({ t: 'seg', id }));

const canon = (e) => JSON.stringify(Object.fromEntries(Object.entries(e).sort(([a], [b]) => (a < b ? -1 : 1))));
// Canonical key: elements as sorted-key JSON, sorted, joined.
export const key = (cell) => JSON.stringify(cell.map(canon).sort());

// Segment-set operations (sets are arrays of ids).
export const union = (a, b) => SEG_IDS.filter((x) => a.includes(x) || b.includes(x));
export const xor = (a, b) => SEG_IDS.filter((x) => a.includes(x) !== b.includes(x));
export const inter = (a, b) => SEG_IDS.filter((x) => a.includes(x) && b.includes(x));

const ids = (cell) => cell.filter((e) => e.t === 'seg').map((e) => e.id);

// ---- per-item data -------------------------------------------------------

// Segment items: rows of [col1, col2]; col3 = op(col1, col2).
export const segRows = {
  M5: { op: union, rows: [[['h'], ['v']], [['d1'], ['t', 'b']], [['l', 'd2'], ['r', 'h']]] },
  M8: { op: xor, rows: [[['h', 'v'], ['v', 'd1']], [['t', 'b', 'l'], ['l', 'r']], [['d1', 'd2', 'h'], ['d2', 'v', 'h']]] },
  M11: {
    op: inter,
    rows: [
      [['h', 'v', 'd1'], ['v', 'd1', 't']],
      [['l', 'r', 'h'], ['h', 'b', 'l']],
      [['t', 'b', 'd2', 'v'], ['d2', 'b', 'r', 'h']],
    ],
  },
};

const segRule = (id) => (r, c) => {
  const { op, rows } = segRows[id];
  const [a, b] = rows[r];
  return segs(c === 0 ? a : c === 1 ? b : op(a, b));
};

// M12: col3 = col1 + col2.
export const M12_COUNTS = [[2, 1, 3], [1, 3, 4], [3, 2, 5]];

// Each spec: { id, b, rule(r, c) -> cell, answer, distractors }. `answer` is
// written out by hand (not derived from rule) so the tests check them against
// each other.
export const matrixSpecs = [
  {
    id: 'M1', b: -2.2,
    rule: (r, c) => [shp(['circle', 'square', 'diamond'][r], 'none', 'm', c + 1)],
    answer: [shp('diamond', 'none', 'm', 3)],
    distractors: [
      [shp('diamond', 'none', 'm', 2)],
      [shp('diamond', 'none', 'm', 4)],
      [shp('square', 'none', 'm', 3)],
      [shp('circle', 'none', 'm', 3)],
      [shp('diamond', 'solid', 'm', 3)],
    ],
  },
  {
    id: 'M2', b: -1.6,
    rule: (r, c) => [shp(['circle', 'triangle', 'square'][(r + c) % 3], ['none', 'grey', 'solid'][r], 'm')],
    answer: [shp('triangle', 'solid')],
    distractors: [
      [shp('triangle', 'none')],
      [shp('triangle', 'grey')],
      [shp('circle', 'solid')],
      [shp('square', 'solid')],
      [shp('hexagon', 'solid')],
    ],
  },
  {
    id: 'M3', b: -1.2,
    rule: (r, c) => [arr(90 * r + 45 * c)],
    answer: [arr(270)],
    distractors: [[arr(225)], [arr(315)], [arr(90)], [arr(180)], [arr(0)]],
  },
  {
    id: 'M4', b: -0.9,
    rule: (r, c) => [shp(['pentagon', 'circle', 'square'][(c + 2 * r) % 3], 'none', ['s', 'm', 'l'][c])],
    answer: [shp('pentagon', 'none', 'l')],
    distractors: [
      [shp('pentagon', 'none', 'm')],
      [shp('pentagon', 'none', 's')],
      [shp('circle', 'none', 'l')],
      [shp('square', 'none', 'l')],
      [shp('pentagon', 'solid', 'l')],
    ],
  },
  {
    id: 'M5', b: -0.6,
    rule: segRule('M5'),
    answer: segs(['l', 'd2', 'r', 'h']),
    distractors: [
      segs(['l', 'd2', 'r']),
      segs(['l', 'r', 'h', 'd1']),
      segs(['d2', 'r', 'h']),
      segs(['l', 'd2', 'r', 'h', 'v']),
      segs(['l', 'd2', 'r', 'h', 'b']),
    ],
  },
  {
    id: 'M6', b: -0.2,
    rule: (r, c) => [shp(['circle', 'square', 'triangle'][(r + c) % 3], 'grey', 'm', r + c + 1)],
    answer: [shp('square', 'grey', 'm', 5)],
    distractors: [
      [shp('square', 'grey', 'm', 4)],
      [shp('square', 'grey', 'm', 6)],
      [shp('circle', 'grey', 'm', 5)],
      [shp('triangle', 'grey', 'm', 5)],
      [shp('square', 'solid', 'm', 5)],
    ],
  },
  {
    id: 'M7', b: 0.2,
    rule: (r, c) => [shp(['square', 'circle', 'hexagon'][(r + 2 * c) % 3], 'none', 'm'), dot(2 * r + c)],
    answer: [shp('square'), dot(6)],
    distractors: [
      [shp('square'), dot(5)],
      [shp('square'), dot(7)],
      [shp('square'), dot(2)],
      [shp('circle'), dot(6)],
      [shp('hexagon'), dot(6)],
    ],
  },
  {
    id: 'M8', b: 0.6,
    rule: segRule('M8'),
    answer: segs(['d1', 'v']),
    distractors: [
      segs(['d1', 'd2', 'h', 'v']),
      segs(['d2', 'h']),
      segs(['d1']),
      segs(['v']),
      segs(['d1', 'v', 'd2']),
    ],
  },
  {
    id: 'M9', b: 0.4,
    rule: (r, c) => [
      shp(['circle', 'square', 'hexagon'][(r + c) % 3], 'none', 'l'),
      shp(['triangle', 'star', 'diamond'][(2 * r + c) % 3], 'solid', 'xs'),
    ],
    answer: [shp('square', 'none', 'l'), shp('triangle', 'solid', 'xs')],
    distractors: [
      [shp('square', 'none', 'l'), shp('star', 'solid', 'xs')],
      [shp('square', 'none', 'l'), shp('diamond', 'solid', 'xs')],
      [shp('circle', 'none', 'l'), shp('triangle', 'solid', 'xs')],
      [shp('hexagon', 'none', 'l'), shp('triangle', 'solid', 'xs')],
      [shp('square', 'none', 'l'), shp('triangle', 'grey', 'xs')],
    ],
  },
  {
    id: 'M10', b: 1.0,
    rule: (r, c) => [
      shp(['triangle', 'circle', 'square'][(r + c) % 3], ['none', 'grey', 'solid'][(2 * r + c) % 3], 'm', [1, 2, 3][(r + 2 * c) % 3]),
    ],
    answer: [shp('circle', 'none', 'm', 1)],
    distractors: [
      [shp('circle', 'none', 'm', 2)],
      [shp('circle', 'none', 'm', 3)],
      [shp('circle', 'grey', 'm', 1)],
      [shp('circle', 'solid', 'm', 1)],
      [shp('square', 'none', 'm', 1)],
    ],
  },
  {
    id: 'M11', b: 1.3,
    rule: segRule('M11'),
    answer: segs(['b', 'd2']),
    distractors: [
      segs(['t', 'v', 'r', 'h']),
      segs(['t', 'b', 'd2', 'v', 'r', 'h']),
      segs(['b']),
      segs(['d2']),
      segs(['b', 'd2', 'v']),
    ],
  },
  {
    id: 'M12', b: 1.5,
    rule: (r, c) => [shp(['square', 'triangle', 'circle'][(r + c) % 3], ['none', 'grey', 'solid'][(r + 2 * c) % 3], 'm', M12_COUNTS[r][c])],
    answer: [shp('triangle', 'none', 'm', 5)],
    distractors: [
      [shp('triangle', 'none', 'm', 6)],
      [shp('triangle', 'none', 'm', 4)],
      [shp('triangle', 'grey', 'm', 5)],
      [shp('square', 'none', 'm', 5)],
      [shp('circle', 'none', 'm', 5)],
    ],
  },
];

// ---- build item objects --------------------------------------------------

function build(spec) {
  const stem = gridSvg((r, c) => (r === 2 && c === 2 ? null : spec.rule(r, c)));
  const placed = placeOptions(spec.id, cellSvg(spec.answer), spec.distractors.map((d) => cellSvg(d)));
  return {
    id: spec.id,
    category: 'matrix',
    b: spec.b,
    prompt: 'Which option completes the pattern?',
    stem,
    options: placed.options,
    answer: placed.answer,
    optionCols: 3,
  };
}

export const matrixItems = matrixSpecs.map(build);

export { ids as segIds };

// ==========================================================================
// Variants (isomorphic items). `matrixVariant(id, seed)` returns
// { item, meta }. Seed 0 uses the v1 parameters and reproduces the v1 item
// exactly (options in the same order). Any other seed draws a random vocabulary
// (shapes, fill order, rotation offset, segment symmetry, dot offset ...) while
// the rule structure and the distractor recipe stay the same.
// ==========================================================================

// Pairs of shapes that look too alike in one item (v1 only has them in M1/M7/M9
// where it was already so; variants avoid them).
const CONFUSABLE = [['square', 'diamond'], ['pentagon', 'hexagon']];
const CONFUSABLE_SMALL = [...CONFUSABLE, ['circle', 'hexagon'], ['circle', 'pentagon']];

export function confusablePairs(shapes, table = CONFUSABLE) {
  let n = 0;
  for (const [a, b] of table) if (shapes.includes(a) && shapes.includes(b)) n++;
  return n;
}

function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// k distinct shapes from pool with no confusable pair among them.
function pickShapes(r, k, pool = SHAPES, table = CONFUSABLE, exclude = []) {
  const from = pool.filter((s) => !exclude.includes(s));
  for (let i = 0; i < 500; i++) {
    const s = shuffle(r, from).slice(0, k);
    if (confusablePairs(s, table) === 0) return s;
  }
  throw new Error('no shape set found');
}

// The 8 symmetries of the square acting on segment ids. Index 0 is identity,
// 1..3 rotate 90/180/270 degrees clockwise, 4..7 are the same followed by a
// left-right mirror.
const ROT90 = { h: 'v', v: 'h', d1: 'd2', d2: 'd1', t: 'r', r: 'b', b: 'l', l: 't' };
const MIRROR = { h: 'h', v: 'v', d1: 'd2', d2: 'd1', t: 't', b: 'b', l: 'r', r: 'l' };
export const SEG_SYMMETRIES = (() => {
  const id = Object.fromEntries(SEG_IDS.map((x) => [x, x]));
  const out = [id];
  for (let k = 1; k < 4; k++) out.push(Object.fromEntries(SEG_IDS.map((x) => [x, ROT90[out[k - 1][x]]])));
  for (let k = 0; k < 4; k++) out.push(Object.fromEntries(SEG_IDS.map((x) => [x, MIRROR[out[k][x]]])));
  return out;
})();

const V1_META = {
  M1: { shapes: ['circle', 'square', 'diamond'], fill: 'none', altFill: 'solid' },
  M2: { shapes: ['circle', 'triangle', 'square'], extra: 'hexagon', fills: ['none', 'grey', 'solid'] },
  M3: { off: 0, sign: 1 },
  M4: { shapes: ['pentagon', 'circle', 'square'], sizes: ['s', 'm', 'l'], fill: 'none', altFill: 'solid' },
  M5: { sym: 0, swapRows: false, swapCols: false },
  M6: { shapes: ['circle', 'square', 'triangle'], fill: 'grey', altFill: 'solid' },
  M7: { shapes: ['square', 'circle', 'hexagon'], dotOff: 0, dotSign: 1 },
  M8: { sym: 0, swapRows: false, swapCols: false },
  M9: { outer: ['circle', 'square', 'hexagon'], inner: ['triangle', 'star', 'diamond'], innerFill: 'solid', altInnerFill: 'grey' },
  M10: { shapes: ['triangle', 'circle', 'square'], counts: [1, 2, 3], fills: ['none', 'grey', 'solid'] },
  M11: { sym: 0, swapRows: false, swapCols: false },
  M12: { shapes: ['square', 'triangle', 'circle'], fills: ['none', 'grey', 'solid'], pairs: [[2, 1], [1, 3], [3, 2]] },
};

// Random parameter draw per template. Each returns the meta (without `transpose`).
const DRAW = {
  M1(r) {
    const fill = pick(r, FILLS3);
    return { shapes: pickShapes(r, 3), fill, altFill: pick(r, FILLS3.filter((f) => f !== fill)) };
  },
  M2(r) {
    const s = pickShapes(r, 4);
    return { shapes: s.slice(0, 3), extra: s[3], fills: shuffle(r, FILLS3) };
  },
  M3(r) {
    return { off: 45 * Math.floor(r() * 8), sign: r() < 0.5 ? 1 : -1 };
  },
  M4(r) {
    return {
      shapes: pickShapes(r, 3),
      sizes: r() < 0.5 ? ['s', 'm', 'l'] : ['l', 'm', 's'],
      fill: pick(r, ['none', 'grey']),
      altFill: 'solid',
    };
  },
  seg(r) {
    return { sym: Math.floor(r() * 8), swapRows: r() < 0.5, swapCols: r() < 0.5 };
  },
  M6(r) {
    return { shapes: pickShapes(r, 3), fill: pick(r, ['none', 'grey']), altFill: 'solid' };
  },
  M7(r) {
    return {
      shapes: pickShapes(r, 3, ['circle', 'square', 'hexagon', 'pentagon', 'diamond']),
      dotOff: Math.floor(r() * 8),
      dotSign: r() < 0.5 ? 1 : -1,
    };
  },
  M9(r) {
    // Outer shapes must be big enough to hold the inner ones (no star / triangle outside).
    const outer = pickShapes(r, 3, ['circle', 'square', 'hexagon', 'pentagon', 'diamond']);
    const inner = pickShapes(r, 3, SHAPES, CONFUSABLE_SMALL, outer);
    const solidInner = r() < 0.5;
    return { outer, inner, innerFill: solidInner ? 'solid' : 'grey', altInnerFill: solidInner ? 'grey' : 'solid' };
  },
  M10(r) {
    return { shapes: pickShapes(r, 3), counts: shuffle(r, [1, 2, 3]), fills: shuffle(r, FILLS3) };
  },
  M12(r) {
    // Row sums are always 3, 4, 5 (as in v1); operands differ and are never equal.
    const split = { 3: [[1, 2], [2, 1]], 4: [[1, 3], [3, 1]], 5: [[1, 4], [2, 3], [3, 2], [4, 1]] };
    return {
      shapes: pickShapes(r, 3),
      fills: shuffle(r, FILLS3),
      pairs: [3, 4, 5].map((s) => pick(r, split[s])),
    };
  },
};
const FILLS3 = ['none', 'grey', 'solid'];

const SEG_V1 = { M5: segRows.M5, M8: segRows.M8, M11: segRows.M11 };
const SEG_V1_ANSWER = {
  M5: ['l', 'd2', 'r', 'h'],
  M8: ['d1', 'v'],
  M11: ['b', 'd2'],
};
const SEG_V1_DISTRACTORS = {
  M5: [['l', 'd2', 'r'], ['l', 'r', 'h', 'd1'], ['d2', 'r', 'h'], ['l', 'd2', 'r', 'h', 'v'], ['l', 'd2', 'r', 'h', 'b']],
  M8: [['d1', 'd2', 'h', 'v'], ['d2', 'h'], ['d1'], ['v'], ['d1', 'v', 'd2']],
  M11: [['t', 'v', 'r', 'h'], ['t', 'b', 'd2', 'v', 'r', 'h'], ['b'], ['d2'], ['b', 'd2', 'v']],
};
const B = Object.fromEntries(matrixSpecs.map((s) => [s.id, s.b]));

// Build { rule, answer, distractors } for a template from its meta. The rule is
// defined on the untransposed grid; meta.transpose swaps rows and columns
// (the missing cell (2,2) is unaffected).
export function specFromMeta(id, m) {
  const mk = (rule, answer, distractors) => ({
    id,
    b: B[id],
    rule: m.transpose ? (r, c) => rule(c, r) : rule,
    answer,
    distractors,
  });
  switch (id) {
    case 'M1': {
      const [s0, s1, s2] = m.shapes;
      const sh = (s, n, f = m.fill) => [shp(s, f, 'm', n)];
      return mk((r, c) => sh(m.shapes[r], c + 1), sh(s2, 3), [
        sh(s2, 2), sh(s2, 4), sh(s1, 3), sh(s0, 3), sh(s2, 3, m.altFill),
      ]);
    }
    case 'M2': {
      const [t0, t1, t2] = m.shapes;
      const [f0, f1, f2] = m.fills;
      return mk((r, c) => [shp(m.shapes[(r + c) % 3], m.fills[r], 'm')], [shp(t1, f2)], [
        [shp(t1, f0)], [shp(t1, f1)], [shp(t0, f2)], [shp(t2, f2)], [shp(m.extra, f2)],
      ]);
    }
    case 'M3': {
      const rot = (v) => (((m.off + m.sign * v) % 360) + 360) % 360;
      const base = 270;
      return mk((r, c) => [arr(rot(90 * r + 45 * c))], [arr(rot(base))],
        [-45, 45, 180, -90, 90].map((d) => [arr(rot(base + d))]));
    }
    case 'M4': {
      const [t0, t1, t2] = m.shapes;
      const [z0, z1, z2] = m.sizes;
      return mk((r, c) => [shp(m.shapes[(c + 2 * r) % 3], m.fill, m.sizes[c])], [shp(t0, m.fill, z2)], [
        [shp(t0, m.fill, z1)], [shp(t0, m.fill, z0)], [shp(t1, m.fill, z2)], [shp(t2, m.fill, z2)],
        [shp(t0, m.altFill, z2)],
      ]);
    }
    case 'M5': case 'M8': case 'M11': {
      const sig = SEG_SYMMETRIES[m.sym];
      const mapSet = (ids) => ids.map((x) => sig[x]);
      const { op, rows: base } = SEG_V1[id];
      let rows = base.map(([a, b]) => [mapSet(a), mapSet(b)]);
      if (m.swapRows) rows = [rows[1], rows[0], rows[2]];
      if (m.swapCols) rows = rows.map(([a, b]) => [b, a]);
      return mk(
        (r, c) => {
          const [a, b] = rows[r];
          return segs(c === 0 ? a : c === 1 ? b : op(a, b));
        },
        segs(mapSet(SEG_V1_ANSWER[id])),
        SEG_V1_DISTRACTORS[id].map((d) => segs(mapSet(d))),
      );
    }
    case 'M6': {
      const [t0, t1, t2] = m.shapes;
      const sh = (s, n, f = m.fill) => [shp(s, f, 'm', n)];
      return mk((r, c) => sh(m.shapes[(r + c) % 3], r + c + 1), sh(t1, 5), [
        sh(t1, 4), sh(t1, 6), sh(t0, 5), sh(t2, 5), sh(t1, 5, m.altFill),
      ]);
    }
    case 'M7': {
      const f = (v) => (((m.dotOff + m.dotSign * v) % 8) + 8) % 8;
      const [t0, t1, t2] = m.shapes;
      return mk((r, c) => [shp(m.shapes[(r + 2 * c) % 3]), dot(f(2 * r + c))], [shp(t0), dot(f(6))], [
        [shp(t0), dot(f(5))], [shp(t0), dot(f(7))], [shp(t0), dot(f(2))], [shp(t1), dot(f(6))], [shp(t2), dot(f(6))],
      ]);
    }
    case 'M9': {
      const [o0, o1, o2] = m.outer;
      const [i0, i1, i2] = m.inner;
      const cell = (o, i, f = m.innerFill) => [shp(o, 'none', 'l'), shp(i, f, 'xs')];
      return mk((r, c) => cell(m.outer[(r + c) % 3], m.inner[(2 * r + c) % 3]), cell(o1, i0), [
        cell(o1, i1), cell(o1, i2), cell(o0, i0), cell(o2, i0), cell(o1, i0, m.altInnerFill),
      ]);
    }
    case 'M10': {
      const [t0, t1, t2] = m.shapes;
      const [n0, n1, n2] = m.counts;
      const [f0, f1, f2] = m.fills;
      const cell = (s, f, n) => [shp(s, f, 'm', n)];
      return mk(
        (r, c) => cell(m.shapes[(r + c) % 3], m.fills[(2 * r + c) % 3], m.counts[(r + 2 * c) % 3]),
        cell(t1, f0, n0),
        [cell(t1, f0, n1), cell(t1, f0, n2), cell(t1, f1, n0), cell(t1, f2, n0), cell(t2, f0, n0)],
      );
    }
    case 'M12': {
      const [t0, t1, t2] = m.shapes;
      const [f0, f1, f2] = m.fills;
      const cell = (s, f, n) => [shp(s, f, 'm', n)];
      const count = (r, c) => (c < 2 ? m.pairs[r][c] : m.pairs[r][0] + m.pairs[r][1]);
      return mk(
        (r, c) => cell(m.shapes[(r + c) % 3], m.fills[(r + 2 * c) % 3], count(r, c)),
        cell(t1, f0, 5),
        [cell(t1, f0, 6), cell(t1, f0, 4), cell(t1, f1, 5), cell(t0, f0, 5), cell(t2, f0, 5)],
      );
    }
    default:
      throw new Error('unknown matrix template ' + id);
  }
}

// Meta for a template and seed. Seed 0 = v1.
export function matrixMeta(id, seed) {
  if (!V1_META[id]) throw new Error('unknown matrix template ' + id);
  if (!seed) return { ...JSON.parse(JSON.stringify(V1_META[id])), transpose: false };
  const r = rng(`matrix:${id}:${seed}`);
  const draw = DRAW[id] || DRAW.seg;
  const meta = draw(r);
  meta.transpose = r() < 0.5;
  return meta;
}

export function matrixVariant(id, seed = 0) {
  const meta = matrixMeta(id, seed);
  const spec = specFromMeta(id, meta);
  const optId = seed ? `${id}#${seed}` : id;
  const item = build({ ...spec, id: optId });
  item.id = id;
  return { item, meta, spec };
}

export const MATRIX_IDS = matrixSpecs.map((s) => s.id);
