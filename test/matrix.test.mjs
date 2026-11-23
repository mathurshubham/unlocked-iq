import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matrixItems, matrixSpecs, key, segRows, segIds, union, xor, inter,
  matrixVariant, matrixMeta, MATRIX_IDS, SEG_SYMMETRIES, confusablePairs,
} from '../public/js/items-matrix.js';
import { oracle, SYM, ROWS } from './lib/matrix-oracle.mjs';
import {
  cellSvg, gridSvg, SHAPES, FILLS, SIZE_R, STROKE, DOT_RING, DOT_R,
  radiusFor, layout, shapeGeom, outerRadius,
} from '../public/js/svg.js';

const specOf = (id) => matrixSpecs.find((s) => s.id === id);
const itemOf = (id) => matrixItems.find((i) => i.id === id);

// ---- markup well-formedness ---------------------------------------------

function checkMarkup(html, where) {
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  const stack = [];
  let last = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    const between = html.slice(last, m.index);
    assert.ok(!/[<>]/.test(between), `${where}: stray angle bracket near ${m.index}`);
    last = tagRe.lastIndex;
    const [, close, name, , self] = m;
    if (close) {
      assert.equal(stack.pop(), name, `${where}: mismatched </${name}>`);
    } else if (!self) {
      stack.push(name);
    }
  }
  assert.ok(!/[<>]/.test(html.slice(last)), `${where}: trailing junk`);
  assert.deepEqual(stack, [], `${where}: unclosed tags`);
  assert.ok(!/\sid=/.test(html), `${where}: id attribute`);
  assert.ok(!/<defs|url\(#/.test(html), `${where}: defs/url ref`);
  assert.ok(!/NaN|undefined|Infinity/.test(html), `${where}: bad number`);
  // Fills only via classes (text uses fill="currentColor" per spec).
  for (const f of html.matchAll(/\sfill="([^"]*)"/g)) {
    assert.equal(f[1], 'currentColor', `${where}: fill attribute ${f[1]}`);
  }
  for (const c of html.matchAll(/class="([^"]*)"/g)) {
    assert.match(c[1], /^f-(none|grey|solid)$/, `${where}: class ${c[1]}`);
  }
  assert.ok(html.startsWith('<svg') && html.endsWith('</svg>'), `${where}: single svg`);
  assert.equal((html.match(/<svg/g) || []).length, 1, `${where}: nested svg`);
}

// ---- per-item contract ---------------------------------------------------

test('12 items M1..M12 with contract fields', () => {
  assert.deepEqual(matrixItems.map((i) => i.id), Array.from({ length: 12 }, (_, i) => `M${i + 1}`));
  for (const it of matrixItems) {
    assert.equal(it.category, 'matrix');
    assert.equal(typeof it.b, 'number');
    assert.equal(typeof it.prompt, 'string');
    assert.equal(it.optionCols, 3);
    assert.equal(it.options.length, 6);
    assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 6);
  }
});

for (const spec of matrixSpecs) {
  test(`${spec.id}: options distinct, answer = rule(2,2), no distractor equals answer`, () => {
    const item = itemOf(spec.id);
    const cells = [spec.answer, ...spec.distractors];
    assert.equal(spec.distractors.length, 5);
    const keys = cells.map(key);
    assert.equal(new Set(keys).size, 6, 'cell keys pairwise distinct');
    assert.equal(new Set(item.options).size, 6, 'option markup pairwise distinct');
    assert.equal(key(spec.answer), key(spec.rule(2, 2)), 'answer equals rule (2,2)');
    for (const d of spec.distractors) assert.notEqual(key(d), key(spec.rule(2, 2)));
    assert.equal(item.options[item.answer], cellSvg(spec.rule(2, 2)), 'answer option renders rule (2,2)');
    // Every other option renders a distractor.
    const dMarkup = new Set(spec.distractors.map((d) => cellSvg(d)));
    item.options.forEach((o, i) => { if (i !== item.answer) assert.ok(dMarkup.has(o)); });
  });

  test(`${spec.id}: markup well-formed, stem cells match rule`, () => {
    const item = itemOf(spec.id);
    checkMarkup(item.stem, `${spec.id} stem`);
    item.options.forEach((o, i) => checkMarkup(o, `${spec.id} option ${i}`));
    assert.match(item.stem, /viewBox="0 0 320 320"/);
    assert.equal((item.stem.match(/<text/g) || []).length, 1, 'one "?"');
    assert.ok(item.stem.includes('>?</text>'));
    for (const o of item.options) assert.match(o, /viewBox="0 0 100 100"/);
    // Stem shows the 8 rule cells and the 9th is "?".
    const expected = gridSvg((r, c) => (r === 2 && c === 2 ? null : spec.rule(r, c)));
    assert.equal(item.stem, expected);
    // Rule cells are never empty.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) assert.ok(spec.rule(r, c).length > 0);
  });
}

test('option order is deterministic', async () => {
  const again = (await import('../public/js/items-matrix.js?again')).matrixItems;
  for (let i = 0; i < 12; i++) {
    assert.deepEqual(again[i].options, matrixItems[i].options);
    assert.equal(again[i].answer, matrixItems[i].answer);
  }
});

// ---- set-operation items -------------------------------------------------

const OPS = { OR: union, XOR: xor, AND: inter };
const differs = (rows, f, g) => rows.some(([a, b]) => key(f(a, b).map((id) => ({ t: 'seg', id }))) !== key(g(a, b).map((id) => ({ t: 'seg', id }))));
const sameSet = (x, y) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());

for (const [id, name] of [['M5', 'OR'], ['M8', 'XOR'], ['M11', 'AND']]) {
  test(`${id}: rows 0-1 pin down the ${name} rule`, () => {
    const { op, rows } = segRows[id];
    assert.equal(op, OPS[name]);
    const first2 = rows.slice(0, 2);
    // Rows 0-1 follow the rule...
    for (const [a, b] of first2) assert.ok(sameSet(op(a, b), OPS[name](a, b)));
    // ...and each rival op gives a different col3 in at least one of rows 0-1.
    const rivals = Object.keys(OPS).filter((n) => n !== name);
    for (const rival of rivals) {
      if (id === 'M5' && rival === 'XOR') {
        // Inputs are disjoint in every row, so OR and XOR coincide everywhere:
        // they predict the same (2,2), so nothing to disambiguate.
        for (const [a, b] of rows) assert.deepEqual(inter(a, b), [], 'M5 rows are disjoint');
        assert.ok(!differs(rows, union, xor));
      } else {
        assert.ok(differs(first2, OPS[name], OPS[rival]), `${name} vs ${rival} indistinguishable in rows 0-1`);
      }
    }
    // The pairwise separations among all three ops (M8/M11 are fully strict).
    if (id !== 'M5') {
      assert.ok(differs(first2, union, xor));
      assert.ok(differs(first2, union, inter));
      assert.ok(differs(first2, xor, inter));
    } else {
      assert.ok(differs(first2, union, inter));
    }
    // Rival ops would give a (2,2) different from the answer (except OR=XOR in M5), and
    // the corresponding distractors exist for the plausible rivals.
    const [a2, b2] = rows[2];
    const ans = specOf(id).answer;
    assert.ok(sameSet(op(a2, b2), segIds(ans)));
    for (const rival of rivals) {
      if (id === 'M5' && rival === 'XOR') continue;
      const rv = OPS[rival](a2, b2);
      assert.ok(!sameSet(rv, segIds(ans)), `${rival} gives the same (2,2) as ${name}`);
    }
  });
}

// ---- geometry sanity -----------------------------------------------------

const allCells = matrixSpecs.flatMap((s) => [
  ...[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => s.rule(r, c))),
  s.answer,
  ...s.distractors,
]);

test('shapes stay inside the cell and copies do not overlap', () => {
  const sizes = Object.keys(SIZE_R);
  for (const shape of SHAPES) {
    for (const size of sizes) {
      for (let n = 1; n <= 6; n++) {
        const r = radiusFor(size, n);
        const reach = outerRadius(shape, r);
        // inside the cell with a little margin
        for (const [dx, dy] of layout(n)) {
          const g = shapeGeom(shape, 50 + dx, 50 + dy, r);
          const pts = g.type === 'circle'
            ? [[g.cx - g.r, g.cy - g.r], [g.cx + g.r, g.cy + g.r]]
            : g.pts;
          for (const [x, y] of pts) {
            assert.ok(x - STROKE / 2 >= 2 && x + STROKE / 2 <= 98, `${shape} ${size} n=${n} x=${x}`);
            assert.ok(y - STROKE / 2 >= 2 && y + STROKE / 2 <= 98, `${shape} ${size} n=${n} y=${y}`);
          }
        }
        // circumscribed discs (stroke included) of any two copies are disjoint
        const L = layout(n);
        for (let i = 0; i < L.length; i++) {
          for (let j = i + 1; j < L.length; j++) {
            const d = Math.hypot(L[i][0] - L[j][0], L[i][1] - L[j][1]);
            assert.ok(d >= 2 * reach, `${shape} ${size} n=${n} copies ${i},${j} overlap (${d} < ${2 * reach})`);
          }
        }
      }
    }
  }
});

test('copy radius shrinks (never grows) as n increases', () => {
  for (const size of Object.keys(SIZE_R)) {
    for (let n = 2; n <= 6; n++) assert.ok(radiusFor(size, n) <= radiusFor(size, n - 1));
  }
});

test('M7 dots clear the centre shape; M9 inner shape sits inside the outer shape', () => {
  for (const shape of ['square', 'circle', 'hexagon']) {
    const reach = outerRadius(shape, SIZE_R.m);
    assert.ok(reach + DOT_R + STROKE / 2 < DOT_RING, `${shape} collides with ring dot`);
  }
  for (const outer of ['circle', 'square', 'hexagon']) {
    for (const inner of ['triangle', 'star', 'diamond']) {
      // inscribed radius of outer is at least its half-width; inner reach must be smaller
      assert.ok(outerRadius(inner, SIZE_R.xs) < 0.7 * SIZE_R.l, `${inner} too big inside ${outer}`);
    }
  }
});

test('triangle is optically centred (between centroid and bbox centre)', () => {
  const g = shapeGeom('triangle', 0, 0, 20);
  const ys = g.pts.map((p) => p[1]);
  const bboxCentre = (Math.min(...ys) + Math.max(...ys)) / 2;
  const centroid = ys.reduce((a, b) => a + b, 0) / 3;
  assert.ok(bboxCentre < 0 && centroid > 0 && bboxCentre < centroid);
  assert.ok(Math.abs(centroid) > 0 && Math.abs(bboxCentre) > 0);
  assert.ok(Math.abs((bboxCentre + centroid) / 2) < 3);
});

test('all fills and shapes used are valid', () => {
  for (const cell of allCells) {
    for (const e of cell) {
      if (e.t === 'shape') {
        assert.ok(SHAPES.includes(e.shape));
        assert.ok(FILLS.includes(e.fill));
        assert.ok(e.size in SIZE_R);
        assert.ok(e.n >= 1 && e.n <= 6);
      }
    }
  }
});

test('key is order-independent and discriminating', () => {
  const a = [{ t: 'seg', id: 'h' }, { t: 'seg', id: 'v' }];
  const b = [{ t: 'seg', id: 'v' }, { t: 'seg', id: 'h' }];
  assert.equal(key(a), key(b));
  assert.notEqual(key(a), key([{ t: 'seg', id: 'h' }]));
  assert.notEqual(key([{ t: 'shape', shape: 'circle', fill: 'none', size: 'm', n: 1 }]),
    key([{ t: 'shape', shape: 'circle', fill: 'grey', size: 'm', n: 1 }]));
});


// ==========================================================================
// Variants: 200 seeds per template, verified against an independent oracle.
// ==========================================================================

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const SEG_OPS = { M5: ['OR', union], M8: ['XOR', xor], M11: ['AND', inter] };

test('variants: seed 0 is the v1 item (byte for byte)', () => {
  for (const id of MATRIX_IDS) {
    assert.deepEqual(matrixVariant(id, 0).item, itemOf(id), id);
  }
});

test('variants: SEG_SYMMETRIES match the coordinate-derived symmetries and form the full group', () => {
  assert.deepEqual(SEG_SYMMETRIES, SYM);
  assert.equal(new Set(SEG_SYMMETRIES.map((m) => JSON.stringify(m))).size, 8);
  for (const m of SEG_SYMMETRIES) assert.deepEqual(Object.keys(m).sort(), [...Object.keys(SYM[0])].sort());
});

for (const id of MATRIX_IDS) {
  test(`${id} variants: 200 seeds, one correct option, distinct options, oracle agrees`, () => {
    const stems = new Set();
    for (const seed of SEEDS) {
      const { item, meta } = matrixVariant(id, seed);
      const where = `${id}#${seed}`;
      const o = oracle(id, meta);
      // contract
      assert.equal(item.id, id);
      assert.equal(item.category, 'matrix');
      assert.equal(item.options.length, 6, where);
      assert.equal(item.optionCols, 3);
      assert.equal(item.b, specOf(id).b);
      // stem = oracle grid with "?" in (2,2)
      assert.equal(item.stem, gridSvg((r, c) => (r === 2 && c === 2 ? null : o.rule(r, c))), `${where}: stem`);
      // exactly one option renders the rule's (2,2) cell, and it is the answer
      const truth = cellSvg(o.rule(2, 2));
      assert.equal(item.options.filter((x) => x === truth).length, 1, `${where}: exactly one correct`);
      assert.equal(item.options[item.answer], truth, `${where}: answer index`);
      assert.equal(key(o.answer), key(o.rule(2, 2)), `${where}: oracle answer = rule(2,2)`);
      // options distinct as markup and as cells; distractors are exactly the oracle's, none equals the answer
      assert.equal(new Set(item.options).size, 6, `${where}: markup distinct`);
      const cells = [o.answer, ...o.distractors];
      assert.equal(new Set(cells.map(key)).size, 6, `${where}: cells distinct`);
      assert.deepEqual([...item.options].sort(), cells.map((c) => cellSvg(c)).sort(), `${where}: option set`);
      // markup rules
      checkMarkup(item.stem, `${where} stem`);
      item.options.forEach((x, i) => checkMarkup(x, `${where} option ${i}`));
      // rule cells are never empty and use only valid vocabulary
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) assert.ok(o.rule(r, c).length > 0);
      stems.add(item.stem);
      // deterministic
      assert.deepEqual(matrixVariant(id, seed).item, item);
    }
    assert.ok(stems.size >= 10, `${id}: only ${stems.size} distinct stems over 200 seeds`);
  });
}

for (const [id, [name, op]] of Object.entries(SEG_OPS)) {
  test(`${id} variants: rows 0-1 pin down ${name}; rival rules give a different answer`, () => {
    for (const seed of SEEDS) {
      const { meta } = matrixVariant(id, seed);
      const o = oracle(id, meta);
      // un-transpose to read the (row, col) layout of the rule
      const at = (r, c) => segIds(meta.transpose ? o.rule(c, r) : o.rule(r, c));
      const rows = [0, 1, 2].map((r) => [at(r, 0), at(r, 1), at(r, 2)]);
      const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      for (const [a, b, c] of rows) assert.ok(same(op(a, b), c), `${id}#${seed}: col3 = ${name}`);
      const ops = { OR: union, XOR: xor, AND: inter };
      for (const [rn, rop] of Object.entries(ops)) {
        if (rn === name) continue;
        const bothEarly = rows.slice(0, 2).every(([a, b, c]) => same(rop(a, b), c));
        const disjoint = rows.every(([a, b]) => inter(a, b).length === 0);
        if (id === 'M5' && rn === 'XOR') { assert.ok(disjoint); continue; } // OR = XOR on disjoint sets (as in v1)
        assert.ok(!bothEarly, `${id}#${seed}: rows 0-1 do not rule out ${rn}`);
        const [a2, b2] = rows[2];
        assert.ok(!same(rop(a2, b2), segIds(o.answer)), `${id}#${seed}: ${rn} gives the same answer`);
      }
    }
  });
}

test('variants: shape vocabulary has no confusable pairs (square/diamond, pentagon/hexagon) within a set', () => {
  for (const id of MATRIX_IDS) {
    for (const seed of SEEDS) {
      const m = matrixMeta(id, seed);
      const sets = [m.shapes, m.outer, m.inner].filter(Boolean);
      if (m.shapes && m.extra) sets.push([...m.shapes, m.extra]);
      for (const set of sets) assert.equal(confusablePairs(set), 0, `${id}#${seed}: ${set}`);
      if (m.shapes) assert.equal(new Set(m.shapes).size, m.shapes.length);
      if (m.outer) assert.equal(new Set([...m.outer, ...m.inner]).size, 6, `${id}#${seed}: outer/inner overlap`);
    }
  }
});

test('variants: M7 centre shapes clear the dot ring; M9 inner shapes fit inside outer shapes', () => {
  // distance from the centre to the nearest edge of a polygon / radius of a circle
  const inradius = (shape, r) => {
    const g = shapeGeom(shape, 0, 0, r);
    if (g.type === 'circle') return g.r - STROKE / 2;
    let best = Infinity;
    for (let i = 0; i < g.pts.length; i++) {
      const [x1, y1] = g.pts[i];
      const [x2, y2] = g.pts[(i + 1) % g.pts.length];
      const d = Math.abs(x1 * y2 - x2 * y1) / Math.hypot(x2 - x1, y2 - y1);
      best = Math.min(best, d);
    }
    return best - STROKE / 2;
  };
  for (const seed of SEEDS) {
    for (const shape of matrixMeta('M7', seed).shapes) {
      assert.ok(outerRadius(shape, SIZE_R.m) + DOT_R + STROKE / 2 < DOT_RING, `M7#${seed} ${shape}`);
    }
    const m = matrixMeta('M9', seed);
    for (const o of m.outer) {
      assert.ok(['circle', 'square', 'hexagon', 'pentagon', 'diamond'].includes(o), `outer ${o}`);
      for (const i of m.inner) {
        assert.ok(outerRadius(i, SIZE_R.xs) < inradius(o, SIZE_R.l) - 2, `M9#${seed}: ${i} not inside ${o}`);
      }
    }
  }
});

test('variants: M3 rotations are multiples of 45, the 6 options differ, and steps are constant', () => {
  for (const seed of SEEDS) {
    const m = matrixMeta('M3', seed);
    assert.equal(m.off % 45, 0);
    const o = oracle('M3', m);
    const rots = [o.answer, ...o.distractors].map((c) => c[0].rot);
    assert.equal(new Set(rots).size, 6);
    for (const r of rots) assert.ok(r % 45 === 0 && r >= 0 && r < 360);
    // each step across / down turns by a constant multiple of 45 degrees (rule is recomputed from the grid)
    const rotAt = (r, c) => o.rule(r, c)[0].rot;
    const diff = (a, b2) => (((b2 - a) % 360) + 360) % 360;
    const stepAcross = diff(rotAt(0, 0), rotAt(0, 1));
    const stepDown = diff(rotAt(0, 0), rotAt(1, 0));
    assert.deepEqual([stepAcross, stepDown].sort(), m.transpose ? [m.sign > 0 ? 45 : 315, m.sign > 0 ? 90 : 270].sort() : [m.sign > 0 ? 45 : 315, m.sign > 0 ? 90 : 270].sort());
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if (c < 2) assert.equal(diff(rotAt(r, c), rotAt(r, c + 1)), stepAcross);
      if (r < 2) assert.equal(diff(rotAt(r, c), rotAt(r + 1, c)), stepDown);
    }
  }
});

test('variants: M12 operands are positive, distinct and every row sums to its total', () => {
  for (const seed of SEEDS) {
    const m = matrixMeta('M12', seed);
    assert.deepEqual(m.pairs.map(([a, b]) => a + b), [3, 4, 5]);
    for (const [a, b] of m.pairs) assert.ok(a >= 1 && b >= 1 && a <= 4 && b <= 4 && a !== b);
    assert.equal(new Set(m.pairs.map((p) => p.join())).size, 3);
  }
});
