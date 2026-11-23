// 12 matrix-reasoning items (3x3 grid, find the bottom-right cell).
// Pure: no DOM. Rules are hand-designed per docs/SPEC.md and verified in
// test/matrix.test.mjs.
import { placeOptions } from './rng.js';
import { cellSvg, gridSvg, SEG_IDS } from './svg.js';

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
