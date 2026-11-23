// Independent oracle for matrix variants: given only the variant's meta (its
// vocabulary), recompute the 3x3 grid, the answer and the distractors with
// hand-written rules. Does not call the engine's spec builder.
import { shp, arr, dot, segs, union, xor, inter } from '../../public/js/items-matrix.js';

const mod = (n, m) => ((n % m) + m) % m;

export function oracle(id, m) {
  // grid(r, c) is the rule on the untransposed grid; the variant may show it transposed.
  let grid;
  let answer;
  let distractors;
  const one = (shape, fill, size, n) => [shp(shape, fill, size, n)];
  switch (id) {
    case 'M1': {
      grid = (r, c) => one(m.shapes[r], m.fill, 'm', c + 1);
      answer = one(m.shapes[2], m.fill, 'm', 3);
      distractors = [
        one(m.shapes[2], m.fill, 'm', 2), one(m.shapes[2], m.fill, 'm', 4),
        one(m.shapes[1], m.fill, 'm', 3), one(m.shapes[0], m.fill, 'm', 3),
        one(m.shapes[2], m.altFill, 'm', 3),
      ];
      break;
    }
    case 'M2': {
      grid = (r, c) => one(m.shapes[(r + c) % 3], m.fills[r], 'm', 1);
      answer = one(m.shapes[1], m.fills[2], 'm', 1);
      distractors = [
        one(m.shapes[1], m.fills[0], 'm', 1), one(m.shapes[1], m.fills[1], 'm', 1),
        one(m.shapes[0], m.fills[2], 'm', 1), one(m.shapes[2], m.fills[2], 'm', 1),
        one(m.extra, m.fills[2], 'm', 1),
      ];
      break;
    }
    case 'M3': {
      const rot = (r, c) => mod(m.off + m.sign * (90 * r + 45 * c), 360);
      grid = (r, c) => [arr(rot(r, c))];
      answer = [arr(rot(2, 2))];
      // neighbours of the answer: +-45, +-90, 180 (in rotation space)
      distractors = [-45, 45, 180, -90, 90].map((d) => [arr(mod(rot(2, 2) + d, 360))]);
      break;
    }
    case 'M4': {
      grid = (r, c) => one(m.shapes[(c + 2 * r) % 3], m.fill, m.sizes[c], 1);
      answer = one(m.shapes[0], m.fill, m.sizes[2], 1);
      distractors = [
        one(m.shapes[0], m.fill, m.sizes[1], 1), one(m.shapes[0], m.fill, m.sizes[0], 1),
        one(m.shapes[1], m.fill, m.sizes[2], 1), one(m.shapes[2], m.fill, m.sizes[2], 1),
        one(m.shapes[0], m.altFill, m.sizes[2], 1),
      ];
      break;
    }
    case 'M5': case 'M8': case 'M11': {
      const sig = SYM[m.sym];
      const base = ROWS[id];
      const mp = (ids) => ids.map((x) => sig[x]);
      let rows = base.rows.map(([a, b]) => [mp(a), mp(b)]);
      if (m.swapRows) rows = [rows[1], rows[0], rows[2]];
      if (m.swapCols) rows = rows.map(([a, b]) => [b, a]);
      grid = (r, c) => segs(c === 0 ? rows[r][0] : c === 1 ? rows[r][1] : base.op(rows[r][0], rows[r][1]));
      answer = segs(mp(base.answer));
      distractors = base.distractors.map((d) => segs(mp(d)));
      break;
    }
    case 'M6': {
      grid = (r, c) => one(m.shapes[(r + c) % 3], m.fill, 'm', r + c + 1);
      answer = one(m.shapes[1], m.fill, 'm', 5);
      distractors = [
        one(m.shapes[1], m.fill, 'm', 4), one(m.shapes[1], m.fill, 'm', 6),
        one(m.shapes[0], m.fill, 'm', 5), one(m.shapes[2], m.fill, 'm', 5),
        one(m.shapes[1], m.altFill, 'm', 5),
      ];
      break;
    }
    case 'M7': {
      const k = (v) => mod(m.dotOff + m.dotSign * v, 8);
      grid = (r, c) => [shp(m.shapes[(r + 2 * c) % 3], 'none', 'm', 1), dot(k(2 * r + c))];
      answer = [shp(m.shapes[0], 'none', 'm', 1), dot(k(6))];
      distractors = [
        [shp(m.shapes[0], 'none', 'm', 1), dot(k(5))], [shp(m.shapes[0], 'none', 'm', 1), dot(k(7))],
        [shp(m.shapes[0], 'none', 'm', 1), dot(k(2))], [shp(m.shapes[1], 'none', 'm', 1), dot(k(6))],
        [shp(m.shapes[2], 'none', 'm', 1), dot(k(6))],
      ];
      break;
    }
    case 'M9': {
      const cell = (o, i, f) => [shp(o, 'none', 'l', 1), shp(i, f, 'xs', 1)];
      grid = (r, c) => cell(m.outer[(r + c) % 3], m.inner[(2 * r + c) % 3], m.innerFill);
      answer = cell(m.outer[1], m.inner[0], m.innerFill);
      distractors = [
        cell(m.outer[1], m.inner[1], m.innerFill), cell(m.outer[1], m.inner[2], m.innerFill),
        cell(m.outer[0], m.inner[0], m.innerFill), cell(m.outer[2], m.inner[0], m.innerFill),
        cell(m.outer[1], m.inner[0], m.altInnerFill),
      ];
      break;
    }
    case 'M10': {
      const cell = (s, f, n) => one(s, f, 'm', n);
      grid = (r, c) => cell(m.shapes[(r + c) % 3], m.fills[(2 * r + c) % 3], m.counts[(r + 2 * c) % 3]);
      answer = cell(m.shapes[1], m.fills[0], m.counts[0]);
      distractors = [
        cell(m.shapes[1], m.fills[0], m.counts[1]), cell(m.shapes[1], m.fills[0], m.counts[2]),
        cell(m.shapes[1], m.fills[1], m.counts[0]), cell(m.shapes[1], m.fills[2], m.counts[0]),
        cell(m.shapes[2], m.fills[0], m.counts[0]),
      ];
      break;
    }
    case 'M12': {
      const n = (r, c) => (c === 0 ? m.pairs[r][0] : c === 1 ? m.pairs[r][1] : m.pairs[r][0] + m.pairs[r][1]);
      const cell = (s, f, k) => one(s, f, 'm', k);
      grid = (r, c) => cell(m.shapes[(r + c) % 3], m.fills[(r + 2 * c) % 3], n(r, c));
      answer = cell(m.shapes[1], m.fills[0], 5);
      distractors = [
        cell(m.shapes[1], m.fills[0], 6), cell(m.shapes[1], m.fills[0], 4),
        cell(m.shapes[1], m.fills[1], 5), cell(m.shapes[0], m.fills[0], 5),
        cell(m.shapes[2], m.fills[0], 5),
      ];
      break;
    }
    default:
      throw new Error('unknown ' + id);
  }
  const rule = m.transpose ? (r, c) => grid(c, r) : grid;
  return { rule, answer, distractors };
}

// Symmetries of the square derived from coordinates (independent of the module's tables).
const COORDS = {
  h: [[15, 50], [85, 50]], v: [[50, 15], [50, 85]], d1: [[15, 15], [85, 85]], d2: [[85, 15], [15, 85]],
  t: [[15, 15], [85, 15]], b: [[15, 85], [85, 85]], l: [[15, 15], [15, 85]], r: [[85, 15], [85, 85]],
};
const norm = (seg) => seg.map((p) => p.join(',')).sort().join('|');
const idOf = Object.fromEntries(Object.entries(COORDS).map(([k, v]) => [norm(v), k]));
// rotate 90 clockwise on screen about (50,50): (x,y) -> (100-y, x); mirror: (x,y) -> (100-x, y)
const rot = ([x, y]) => [100 - y, x];
const mir = ([x, y]) => [100 - x, y];
function symFrom(f) {
  return Object.fromEntries(Object.entries(COORDS).map(([k, seg]) => [k, idOf[norm(seg.map(f))]]));
}
export const SYM = [
  symFrom((p) => p),
  symFrom(rot),
  symFrom((p) => rot(rot(p))),
  symFrom((p) => rot(rot(rot(p)))),
  symFrom((p) => mir(p)),
  symFrom((p) => mir(rot(p))),
  symFrom((p) => mir(rot(rot(p)))),
  symFrom((p) => mir(rot(rot(rot(p))))),
];

export const ROWS = {
  M5: {
    op: union,
    rows: [[['h'], ['v']], [['d1'], ['t', 'b']], [['l', 'd2'], ['r', 'h']]],
    answer: ['l', 'd2', 'r', 'h'],
    distractors: [['l', 'd2', 'r'], ['l', 'r', 'h', 'd1'], ['d2', 'r', 'h'], ['l', 'd2', 'r', 'h', 'v'], ['l', 'd2', 'r', 'h', 'b']],
  },
  M8: {
    op: xor,
    rows: [[['h', 'v'], ['v', 'd1']], [['t', 'b', 'l'], ['l', 'r']], [['d1', 'd2', 'h'], ['d2', 'v', 'h']]],
    answer: ['d1', 'v'],
    distractors: [['d1', 'd2', 'h', 'v'], ['d2', 'h'], ['d1'], ['v'], ['d1', 'v', 'd2']],
  },
  M11: {
    op: inter,
    rows: [[['h', 'v', 'd1'], ['v', 'd1', 't']], [['l', 'r', 'h'], ['h', 'b', 'l']], [['t', 'b', 'd2', 'v'], ['d2', 'b', 'r', 'h']]],
    answer: ['b', 'd2'],
    distractors: [['t', 'v', 'r', 'h'], ['t', 'b', 'd2', 'v', 'r', 'h'], ['b'], ['d2'], ['b', 'd2', 'v']],
  },
};
