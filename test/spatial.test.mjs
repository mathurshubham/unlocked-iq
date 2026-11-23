import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  rot90,
  rotate,
  mirror,
  flipY,
  key,
  isConnected,
  isAsymmetric,
  orientations,
  sameByRotation,
  foldNet,
  oppositeOf,
} from '../public/js/cube.js';
import {
  spatialItems, spatialData, spatialVariant, SPATIAL_IDS, shapePool, netPools, pairSignature,
} from '../public/js/items-spatial.js';
import { freePolyominoes, hasBlock2x2, longestRun, netFamily, boundingBox } from '../public/js/cube.js';
import { checkSvg } from './lib/markup.mjs';

const { SHAPES, NETS } = spatialData;
const byId = Object.fromEntries(spatialItems.map((i) => [i.id, i]));

// Cell size of the first rect (all rects in a figure share it).
function cellSize(svg) {
  return +svg.match(/<rect [^>]*width="([\d.]+)"/)[1];
}

// Parse a figure back into integer grid cells by dividing offsets from the min by cell size.
function gridCells(svg) {
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const cs = rects[0][2];
  const minX = Math.min(...rects.map((r) => r[0]));
  const minY = Math.min(...rects.map((r) => r[1]));
  return normalize(rects.map((r) => [Math.round((r[0] - minX) / cs), Math.round((r[1] - minY) / cs)]));
}

function viewBox(svg) {
  return svg.match(/viewBox="([^"]+)"/)[1];
}

// ---- helper checks ----

test('polyomino helpers', () => {
  const f = [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]];
  assert.equal(key(normalize([[5, 7], [6, 7]])), '0,0;1,0');
  assert.equal(key(rotate(f, 4)), key(f));
  assert.equal(key(mirror(mirror(f))), key(f));
  assert.equal(key(flipY(flipY(f))), key(f));
  assert.equal(key(rot90(rot90(rot90(rot90(f))))), key(f));
  assert.equal(key(flipY(f)), key(mirror(rotate(f, 2))));
  assert.ok(isConnected(f));
  assert.ok(!isConnected([[0, 0], [2, 0]]));
});

// ---- cube folding vs known facts ----

const NAMED_VALID = {
  cross: NETS.S7.cross,
  stairs: NETS.S7.stairs,
  threeThree: NETS.S7.threeThree,
  oneThreeTwo: NETS.S7.oneThreeTwo,
};

test('foldNet: known valid nets', () => {
  for (const [name, cells] of Object.entries(NAMED_VALID)) {
    assert.ok(isConnected(cells), name + ' connected');
    assert.equal(foldNet(cells).valid, true, name);
  }
  assert.equal(foldNet(NETS.S6.valid).valid, true);
});

test('foldNet: known invalid nets', () => {
  assert.equal(foldNet(NETS.S6.block).valid, false, '2x3 block');
  assert.equal(foldNet(NETS.S6.row5).valid, false, '5 in a row + 1');
  assert.equal(foldNet([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).valid, false, '6 in a row');
  assert.equal(foldNet(NETS.S6.square).valid, false, '2x2 block');
  assert.equal(foldNet(NETS.S7.invalid).valid, false);
  assert.equal(foldNet([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]).valid, false, '5 cells');
  assert.equal(foldNet([[0, 0], [1, 0], [2, 0], [5, 5], [6, 5], [7, 5]]).valid, false, 'disconnected');
});

test('foldNet: orientation-independent', () => {
  for (const cells of Object.values(NAMED_VALID)) {
    for (const o of orientations(cells)) {
      assert.equal(foldNet(o).valid, true);
      // permuting the start cell must not change validity or opposite pairs
      const shifted = [...o.slice(3), ...o.slice(0, 3)];
      assert.equal(foldNet(shifted).valid, true);
    }
  }
});

// Enumerate all free hexominoes: exactly 35, of which exactly 11 fold.
test('foldNet: exactly 11 of the 35 hexominoes are cube nets', () => {
  const canon = (c) => orientations(c).map(key).sort()[0];
  let level = new Map([['0,0', [[0, 0]]]]);
  for (let n = 2; n <= 6; n++) {
    const next = new Map();
    for (const cells of level.values()) {
      const have = new Set(cells.map(([x, y]) => x + ',' + y));
      for (const [x, y] of cells) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!have.has(x + dx + ',' + (y + dy))) {
            const c = normalize([...cells, [x + dx, y + dy]]);
            next.set(key(c), c);
          }
        }
      }
    }
    level = next;
  }
  const free = new Map();
  for (const c of level.values()) free.set(canon(c), c);
  assert.equal(free.size, 35);
  const valid = [...free.values()].filter((c) => foldNet(c).valid);
  assert.equal(valid.length, 11);
  for (const c of free.values()) assert.ok(isConnected(c));
  // folding result is independent of which cell is first and of orientation
  for (const c of valid) {
    for (let i = 0; i < 6; i++) {
      const rotated = [...c.slice(i), ...c.slice(0, i)];
      assert.equal(foldNet(rotated).valid, true);
    }
  }
});

test('oppositeOf: symmetric, a permutation without fixed points', () => {
  for (const cells of [...Object.values(NAMED_VALID), NETS.S6.valid]) {
    for (let i = 0; i < 6; i++) {
      const j = oppositeOf(cells, i);
      assert.ok(j >= 0 && j !== i);
      assert.equal(oppositeOf(cells, j), i);
    }
  }
  assert.equal(oppositeOf(NETS.S7.invalid, 0), -1);
  // known: in a straight line of 4, cells two apart are opposite (1-4-1 cross, row y=1: x=0..3)
  const cross = NETS.S7.cross; // sorted: (1,0),(0,1),(1,1),(2,1),(3,1),(1,2)
  const idx = (x, y) => cross.findIndex((c) => c[0] === x && c[1] === y);
  assert.equal(oppositeOf(cross, idx(0, 1)), idx(2, 1));
  assert.equal(oppositeOf(cross, idx(1, 1)), idx(3, 1));
  assert.equal(oppositeOf(cross, idx(1, 0)), idx(1, 2));
});

// ---- generic item contract ----

test('item contract', () => {
  assert.equal(spatialItems.length, 10);
  assert.deepEqual(spatialItems.map((i) => i.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
  const bs = { S1: -1.5, S2: -0.8, S3: -0.2, S4: 0.3, S5: 0.7, S6: -0.4, S7: 0.4, S8: 0.8, S9: 1.1, S10: 1.4 };
  for (const it of spatialItems) {
    assert.equal(it.category, 'spatial');
    assert.equal(it.b, bs[it.id]);
    assert.equal(typeof it.prompt, 'string');
    assert.equal(typeof it.stem, 'string');
    assert.ok(Number.isInteger(it.optionCols) && it.optionCols > 0);
    assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length);
    assert.equal(new Set(it.options).size, it.options.length, it.id + ' options distinct');
    assert.deepEqual(Object.keys(it).sort(), ['answer', 'b', 'category', 'id', 'optionCols', 'options', 'prompt', 'stem']);
    for (const o of it.options) {
      assert.ok(!/\sid=|<defs|url\(#/.test(o + it.stem), 'no ids/defs/url refs');
      assert.ok(o.startsWith('<svg'));
      assert.ok(o.includes('width="100%"'));
    }
    // every option shares one viewBox
    assert.equal(new Set(it.options.map(viewBox)).size, 1, it.id + ' uniform viewBox');
  }
});

test('items are deterministic', async () => {
  const again = await import('../public/js/items-spatial.js?again');
  assert.deepEqual(again.spatialItems, spatialItems);
});

// ---- S1-S5: shapes ----

test('S1-S5 shapes: connected, right size, all 8 orientations distinct', () => {
  const sizes = { S1: 7, S2: 5, S3: 6, S4: 6, S5: 8 };
  for (const [id, n] of Object.entries(sizes)) {
    const s = SHAPES[id];
    assert.equal(s.length, n, id + ' cell count');
    assert.ok(isConnected(s), id + ' connected');
    assert.equal(new Set(orientations(s).map(key)).size, 8, id + ' 8 orientations');
    assert.ok(isAsymmetric(s));
  }
  assert.equal(key(SHAPES.S2), key([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]));
});

function optionShapes(id) {
  return byId[id].options.map(gridCells);
}

test('S1: mirror item', () => {
  const it = byId.S1;
  const opts = optionShapes('S1');
  assert.equal(opts.length, 5);
  assert.equal(new Set(opts.map(key)).size, 5);
  const stem = gridCells(it.stem);
  assert.equal(key(stem), key(SHAPES.S1));
  const matches = opts.map((o, i) => (key(o) === key(mirror(stem)) ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(matches, [it.answer]);
  // distractors: original, rot90, rot180, top-bottom flip
  const rest = opts.filter((_, i) => i !== it.answer).map(key).sort();
  const expected = [stem, rotate(stem, 1), rotate(stem, 2), flipY(stem)].map(key).sort();
  assert.deepEqual(rest, expected);
  assert.equal(cellSize(it.stem), cellSize(it.options[0]));
});

for (const [id, k] of [['S2', 1], ['S3', 3], ['S5', 2]]) {
  test(`${id}: rotation item (answer rot${k * 90})`, () => {
    const it = byId[id];
    const opts = optionShapes(id);
    assert.equal(opts.length, 5);
    assert.equal(new Set(opts.map(key)).size, 5);
    const stem = gridCells(it.stem);
    assert.equal(key(stem), key(SHAPES[id]));
    // exactly one option is a pure rotation of the stem, and it is the answer
    const rotated = opts.map((o, i) => (sameByRotation(stem, o) ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(rotated, [it.answer]);
    assert.equal(key(opts[it.answer]), key(rotate(stem, k)));
    // every distractor is a mirror image of some rotation
    for (let i = 0; i < opts.length; i++) {
      if (i === it.answer) continue;
      assert.ok(sameByRotation(mirror(stem), opts[i]));
    }
    assert.equal(cellSize(it.stem), cellSize(it.options[0]));
  });
}

test('S4: odd one out', () => {
  const it = byId.S4;
  assert.equal(it.stem, '');
  const opts = optionShapes('S4');
  assert.equal(opts.length, 4);
  assert.equal(new Set(opts.map(key)).size, 4);
  const others = opts.filter((_, i) => i !== it.answer);
  for (const a of others) for (const b of others) assert.ok(sameByRotation(a, b));
  assert.ok(!sameByRotation(others[0], opts[it.answer]));
  assert.ok(sameByRotation(mirror(others[0]), opts[it.answer]));
  assert.equal(key(opts[it.answer]), key(mirror(rotate(SHAPES.S4, 3))));
  // uniform cell size
  assert.equal(new Set(it.options.map(cellSize)).size, 1);
});

// ---- S6, S7: nets ----

test('S6: exactly one option folds', () => {
  const it = byId.S6;
  const opts = optionShapes('S6');
  assert.equal(opts.length, 4);
  assert.equal(new Set(opts.map(key)).size, 4);
  for (const o of opts) {
    assert.equal(o.length, 6);
    assert.ok(isConnected(o));
  }
  const valid = opts.map((o, i) => (foldNet(o).valid ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(valid, [it.answer]);
  assert.equal(new Set(it.options.map(cellSize)).size, 1);
  assert.equal(it.stem, '');
});

test('S7: exactly one option does not fold', () => {
  const it = byId.S7;
  const opts = optionShapes('S7');
  assert.equal(opts.length, 5);
  assert.equal(new Set(opts.map(key)).size, 5);
  for (const o of opts) {
    assert.equal(o.length, 6);
    assert.ok(isConnected(o));
  }
  const invalid = opts.map((o, i) => (!foldNet(o).valid ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(invalid, [it.answer]);
  assert.equal(new Set(it.options.map(cellSize)).size, 1);
  // all four valid nets are different kinds
  for (const [name, cells] of Object.entries(NAMED_VALID)) assert.ok(foldNet(cells).valid, name);
});

// ---- S8-S10: lettered nets ----

function stemLetters(svg) {
  return [...svg.matchAll(/>([A-F])<\/text>/g)].map((m) => m[1]);
}
function optionText(svg) {
  return svg.match(/>([^<]+)<\/text>/)[1];
}

test('S8: opposite of A (2-2-2 staircase)', () => {
  const it = byId.S8;
  const cells = NETS.S8;
  assert.ok(isConnected(cells) && foldNet(cells).valid);
  assert.deepEqual(stemLetters(it.stem), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(key(gridCells(it.stem)), key(cells));
  assert.match(it.prompt, /opposite A\?/);
  const letters = it.options.map(optionText);
  assert.deepEqual([...letters].sort(), ['B', 'C', 'D', 'E', 'F']);
  const expected = ['A', 'B', 'C', 'D', 'E', 'F'][oppositeOf(cells, 0)];
  assert.equal(letters[it.answer], expected);
  assert.notEqual(expected, 'A');
});

test('S9: opposite is not in line (1-3-2 net, shuffled letters)', () => {
  const it = byId.S9;
  const { cells, letters, askIdx } = spatialData.s9;
  assert.ok(isConnected(cells) && foldNet(cells).valid);
  assert.deepEqual([...letters].sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.notDeepEqual(letters, ['A', 'B', 'C', 'D', 'E', 'F'], 'letters are shuffled');
  assert.deepEqual(stemLetters(it.stem), letters);
  const opp = oppositeOf(cells, askIdx);
  assert.ok(cells[askIdx][0] !== cells[opp][0] && cells[askIdx][1] !== cells[opp][1], 'not in a straight line');
  assert.ok(it.prompt.includes(`opposite ${letters[askIdx]}?`));
  const opts = it.options.map(optionText);
  assert.equal(opts.length, 5);
  assert.ok(!opts.includes(letters[askIdx]));
  assert.equal(opts[it.answer], letters[opp]);
});

test('S10: opposite pair (3-3 net)', () => {
  const it = byId.S10;
  const { cells, letters } = spatialData.s10;
  assert.ok(isConnected(cells) && foldNet(cells).valid);
  assert.deepEqual(stemLetters(it.stem), letters);
  const pairs = it.options.map((o) => optionText(o).replace('&amp;', '&').split(' & '));
  assert.equal(pairs.length, 4);
  for (const p of pairs) {
    assert.equal(p.length, 2);
    assert.ok(p[0] < p[1]);
  }
  const isOpp = (p) => oppositeOf(cells, letters.indexOf(p[0])) === letters.indexOf(p[1]);
  const flags = pairs.map(isOpp);
  assert.equal(flags.filter(Boolean).length, 1, 'exactly one opposite pair');
  assert.equal(flags.indexOf(true), it.answer);
  assert.equal(new Set(pairs.map((p) => p.join())).size, 4);
  assert.ok(it.options.every((o) => o.includes('&amp;')));
});


// ==========================================================================
// Variants: 200 seeds per template, verified from the rendered markup alone.
// ==========================================================================

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const vOf = (id, seed) => spatialVariant(id, seed).item;

test('variants: seed 0 is the v1 item (byte for byte)', () => {
  for (const id of SPATIAL_IDS) assert.deepEqual(spatialVariant(id, 0).item, byId[id], id);
});

test('variant pools: shape pools, hexomino classification', () => {
  for (const n of [5, 6, 7, 8]) {
    const pool = shapePool(n);
    assert.ok(pool.length >= (n === 5 ? 1 : 10), `pool ${n}`);
    for (const sh of pool) {
      assert.equal(sh.length, n);
      assert.ok(isConnected(sh) && isAsymmetric(sh) && !hasBlock2x2(sh));
      const { w, h } = boundingBox(sh);
      assert.ok(Math.min(w, h) >= 3 && Math.max(w, h) <= 4);
    }
  }
  // v1 shapes belong to their pools (up to orientation)
  const canon = (c) => orientations(c).map(key).sort()[0];
  for (const [id, n] of Object.entries({ S1: 7, S2: 5, S3: 6, S4: 6, S5: 8 })) {
    assert.ok(shapePool(n).some((p) => canon(p) === canon(SHAPES[id])), id + ' in pool');
  }
  assert.deepEqual([5, 6, 7, 8].map((n) => freePolyominoes(n).length), [12, 35, 108, 369]);
  const P = netPools();
  assert.equal(P.valid.length, 11);
  assert.deepEqual(Object.fromEntries(Object.entries(P.family).map(([k, v]) => [k, v.length])), { '1-4-1': 6, '2-3-1': 3, '2-2-2': 1, '3-3': 1 });
  assert.equal(P.easyInvalid.length + P.hardInvalid.length, 24);
  for (const c of P.easyInvalid) assert.ok(!foldNet(c).valid && (hasBlock2x2(c) || longestRun(c) >= 5));
  for (const c of P.hardInvalid) assert.ok(!foldNet(c).valid && !hasBlock2x2(c) && longestRun(c) < 5);
  assert.ok(P.hardInvalid.some((c) => canonOf(c) === canonOf(NETS.S7.invalid)), 'v1 S7 invalid is a hard invalid');
});
const canonOf = (c) => orientations(c).map(key).sort()[0];

test('static pools equal the enumeration they were generated from (order included)', () => {
  const profile = (sh) => {
    const { w, h } = boundingBox(sh);
    return isConnected(sh) && isAsymmetric(sh) && !hasBlock2x2(sh) && Math.min(w, h) >= 3 && Math.max(w, h) <= 4;
  };
  for (const n of [5, 6, 7, 8]) {
    assert.deepEqual(shapePool(n).map(key), freePolyominoes(n).filter(profile).map(key), `pool ${n}`);
  }
  const P = netPools();
  const hex = [...P.valid, ...P.easyInvalid, ...P.hardInvalid].map(key).sort();
  assert.deepEqual(hex, freePolyominoes(6).map(key).slice().sort());
  assert.deepEqual(P.valid.map(key), freePolyominoes(6).filter((c) => foldNet(c).valid).map(key));
});

function checkCommon(it, where) {
  assert.equal(it.category, 'spatial');
  assert.deepEqual(Object.keys(it).sort(), ['answer', 'b', 'category', 'id', 'optionCols', 'options', 'prompt', 'stem']);
  assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length);
  assert.equal(new Set(it.options).size, it.options.length, where + ': options distinct');
  assert.equal(new Set(it.options.map(viewBox)).size, 1, where + ': uniform viewBox');
  for (const o of it.options) checkSvg(o, where);
  if (it.stem) checkSvg(it.stem, where + ' stem');
}

const shapeIds = { S1: 7, S2: 5, S3: 6, S4: 6, S5: 8 };
for (const id of ['S1', 'S2', 'S3', 'S4', 'S5']) {
  test(`${id} variants: 200 seeds, exactly one option satisfies the question`, () => {
    const bases = new Set();
    for (const seed of SEEDS) {
      const it = vOf(id, seed);
      const where = `${id}#${seed}`;
      checkCommon(it, where);
      const opts = it.options.map(gridCells);
      assert.equal(new Set(opts.map(key)).size, opts.length, where + ': shapes distinct');
      for (const o of opts) {
        assert.equal(o.length, shapeIds[id], where + ': cell count');
        assert.ok(isConnected(o));
        assert.ok(isAsymmetric(o), where + ': asymmetric');
      }
      assert.equal(new Set(it.options.map(cellSize)).size, 1, where + ': one cell size');
      if (id === 'S4') {
        assert.equal(it.stem, '');
        const others = opts.filter((_, i) => i !== it.answer);
        for (const a of others) for (const b of others) assert.ok(sameByRotation(a, b), where);
        assert.ok(!sameByRotation(others[0], opts[it.answer]));
        assert.ok(sameByRotation(mirror(others[0]), opts[it.answer]));
        bases.add(canonOf(opts[it.answer]));
        continue;
      }
      const stem = gridCells(it.stem);
      assert.equal(stem.length, shapeIds[id]);
      assert.ok(isConnected(stem) && isAsymmetric(stem));
      assert.equal(cellSize(it.stem), cellSize(it.options[0]));
      bases.add(canonOf(stem));
      if (id === 'S1') {
        const hits = opts.map((o, i) => (key(o) === key(mirror(stem)) ? i : -1)).filter((i) => i >= 0);
        assert.deepEqual(hits, [it.answer], where);
        const rest = opts.filter((_, i) => i !== it.answer).map(key).sort();
        assert.deepEqual(rest, [stem, rotate(stem, 1), rotate(stem, 2), flipY(stem)].map(key).sort(), where);
      } else {
        const k = { S2: 1, S3: 3, S5: 2 }[id];
        const rotated = opts.map((o, i) => (sameByRotation(stem, o) ? i : -1)).filter((i) => i >= 0);
        assert.deepEqual(rotated, [it.answer], where + ': exactly one pure rotation');
        assert.equal(key(opts[it.answer]), key(rotate(stem, k)), where + ': rotation angle');
        for (let i = 0; i < opts.length; i++) if (i !== it.answer) assert.ok(sameByRotation(mirror(stem), opts[i]), where);
      }
    }
    if (id !== 'S2') assert.ok(bases.size >= 4, `${id}: only ${bases.size} distinct shapes over 200 seeds`);
  });
}

test('S6 variants: exactly one option folds, all six-cell nets, distinct', () => {
  const fams = new Set();
  for (const seed of SEEDS) {
    const it = vOf('S6', seed);
    const where = `S6#${seed}`;
    checkCommon(it, where);
    const opts = it.options.map(gridCells);
    assert.equal(opts.length, 4);
    assert.equal(new Set(opts.map((o) => canonOf(o))).size, 4, where + ': distinct free shapes');
    for (const o of opts) assert.ok(o.length === 6 && isConnected(o));
    const valid = opts.map((o, i) => (foldNet(o).valid ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(valid, [it.answer], where);
    // distractors are the obvious kind: a 2x2 block or a run of five
    opts.forEach((o, i) => { if (i !== it.answer) assert.ok(hasBlock2x2(o) || longestRun(o) >= 5, where); });
    assert.equal(new Set(it.options.map(cellSize)).size, 1);
    fams.add(canonOf(opts[it.answer]));
  }
  assert.ok(fams.size >= 8, `only ${fams.size} different valid nets`);
});

test('S7 variants: exactly one option does not fold; the other four are valid nets of different families', () => {
  const inv = new Set();
  for (const seed of SEEDS) {
    const it = vOf('S7', seed);
    const where = `S7#${seed}`;
    checkCommon(it, where);
    const opts = it.options.map(gridCells);
    assert.equal(opts.length, 5);
    assert.equal(new Set(opts.map((o) => canonOf(o))).size, 5, where);
    for (const o of opts) assert.ok(o.length === 6 && isConnected(o));
    const bad = opts.map((o, i) => (!foldNet(o).valid ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(bad, [it.answer], where);
    const fams = opts.filter((_, i) => i !== it.answer).map(netFamily);
    assert.deepEqual(fams.slice().sort(), ['1-4-1', '2-2-2', '2-3-1', '3-3'], where);
    assert.ok(!hasBlock2x2(opts[it.answer]) && longestRun(opts[it.answer]) < 5, where + ': subtle invalid net');
    inv.add(canonOf(opts[it.answer]));
  }
  assert.ok(inv.size >= 6);
});

const letterIds = { S8: 'staircase', S9: 'three-in-middle' };
for (const id of ['S8', 'S9']) {
  test(`${id} variants: the answer is the folded opposite of the asked letter`, () => {
    const asked = new Set();
    const orients = new Set();
    for (const seed of SEEDS) {
      const it = vOf(id, seed);
      const where = `${id}#${seed}`;
      checkCommon(it, where);
      const letters = stemLetters(it.stem);
      assert.deepEqual([...letters].sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
      const cells = gridCells(it.stem);
      assert.equal(cells.length, 6);
      assert.ok(isConnected(cells) && foldNet(cells).valid, where);
      assert.equal(netFamily(cells), id === 'S8' ? '2-2-2' : '2-3-1', where);
      const ask = it.prompt.match(/opposite ([A-F])\?$/)[1];
      const askIdx = letters.indexOf(ask);
      const opp = oppositeOf(cells, askIdx);
      const opts = it.options.map(optionText);
      assert.equal(opts.length, 5);
      assert.ok(!opts.includes(ask));
      assert.equal(opts[it.answer], letters[opp], where);
      assert.equal(new Set(opts).size, 5);
      // the answer is the only option that never touches the asked face
      for (let i = 0; i < opts.length; i++) {
        if (i !== it.answer) assert.notEqual(letters.indexOf(opts[i]), opp);
      }
      if (id === 'S9') assert.ok(cells[askIdx][0] !== cells[opp][0] && cells[askIdx][1] !== cells[opp][1], where + ': off-line');
      if (id === 'S8') assert.equal(pairSignature(cells, askIdx), pairSignature(NETS.S8, 0), where + ': same geometry class as v1');
      asked.add(ask);
      orients.add(key(cells));
    }
    assert.ok(asked.size >= 5, 'asked letter varies');
    assert.ok(orients.size >= 3, 'net orientation varies');
  });
}

test('S10 variants: exactly one option is an opposite pair', () => {
  const answers = new Set();
  for (const seed of SEEDS) {
    const it = vOf('S10', seed);
    const where = `S10#${seed}`;
    checkCommon(it, where);
    const letters = stemLetters(it.stem);
    const cells = gridCells(it.stem);
    assert.ok(isConnected(cells) && foldNet(cells).valid);
    assert.equal(netFamily(cells), '3-3');
    const pairs = it.options.map((o) => optionText(o).replace('&amp;', '&').split(' & '));
    assert.equal(pairs.length, 4);
    for (const p of pairs) assert.ok(p.length === 2 && p[0] < p[1]);
    const isOpp = (p) => oppositeOf(cells, letters.indexOf(p[0])) === letters.indexOf(p[1]);
    const flags = pairs.map(isOpp);
    assert.equal(flags.filter(Boolean).length, 1, where);
    assert.equal(flags.indexOf(true), it.answer, where);
    assert.equal(new Set(pairs.map((p) => p.join())).size, 4);
    answers.add(pairs[it.answer].join());
  }
  assert.ok(answers.size >= 5);
});

test('variants are deterministic and different seeds give different items', () => {
  for (const id of SPATIAL_IDS) {
    const seen = new Set();
    for (const seed of SEEDS.slice(0, 60)) {
      const a = vOf(id, seed);
      assert.deepEqual(vOf(id, seed), a);
      seen.add(JSON.stringify(a));
    }
    assert.ok(seen.size >= (id === 'S2' ? 6 : 10), `${id}: ${seen.size} distinct of 60`);
  }
});
