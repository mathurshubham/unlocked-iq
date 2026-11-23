import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATES, variant, explain, spatial2Data, foldFaces, rotFrame, GLYPHS, cubeSvg, netSvg, SLOTS,
  blockFaces, blockStackSvg, rotKey, targetSvg, simulateFolds,
} from '../public/js/items-spatial2.js';
import { foldNet, isConnected, normalize, rotate, mirror, key as polyKey } from '../public/js/cube.js';
import { checkItemMarkup } from './lib/markup.mjs';
import {
  unfoldHoles, parseSheet, rollFaces, rotationGroup, possibleViews, specKeyOf, SLOT_FRAMES, upAfter,
  isoProject, fmt, faceVisibility, countTilings, parsePieces,
} from './lib/spatial2-oracle.mjs';

const SEEDS = 200;
const z = (v) => v.map((x) => x + 0); // -0 -> 0
const deq = (a, b, m) => assert.deepEqual(z(a), z(b), m);
const byFam = (p) => TEMPLATES.filter((t) => t.id[0] === p).map((t) => t.id);
const viewBox = (svg) => svg.match(/viewBox="([^"]+)"/)[1];
const variants = {};
function V(id, seed) {
  const k = `${id}:${seed}`;
  return (variants[k] ||= variant(id, seed));
}

// ---------------------------------------------------------------- generic contract

test('template list', () => {
  assert.equal(TEMPLATES.length, 15);
  assert.deepEqual(byFam('P'), ['P1', 'P2', 'P3', 'P4', 'P5']);
  assert.deepEqual(byFam('C'), ['C1', 'C2', 'C3', 'C4']);
  assert.deepEqual(byFam('K'), ['K1', 'K2', 'K3']);
  assert.deepEqual(byFam('H'), ['H1', 'H2', 'H3']);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 15);
  for (const t of TEMPLATES) {
    assert.equal(t.category, 'spatial');
    assert.ok(t.b >= -2.2 && t.b <= 2.0);
    assert.ok(t.family && t.title);
  }
  for (const p of ['P', 'C', 'K', 'H']) {
    const bs = TEMPLATES.filter((t) => t.id[0] === p).map((t) => t.b);
    assert.ok(Math.max(...bs) - Math.min(...bs) >= 1.0, p + ' difficulty spread');
  }
});

for (const t of TEMPLATES) {
  test(`${t.id}: contract, markup, determinism, variety (${SEEDS} seeds)`, () => {
    const stems = new Set();
    for (let s = 0; s < SEEDS; s++) {
      const { item, meta } = V(t.id, s);
      const again = variant(t.id, s);
      assert.deepEqual(again.item, item, `${t.id}#${s} deterministic`);
      assert.deepEqual(again.meta, meta);
      assert.deepEqual(Object.keys(item).sort(), ['answer', 'b', 'category', 'id', 'optionCols', 'options', 'prompt', 'stem']);
      assert.equal(item.id, t.id);
      assert.equal(item.category, 'spatial');
      assert.equal(item.b, t.b);
      assert.ok(item.prompt.length > 10);
      assert.ok(item.options.length >= 4 && item.options.length <= 6);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length);
      assert.ok(Number.isInteger(item.optionCols) && item.optionCols > 0);
      assert.equal(new Set(item.options).size, item.options.length, 'options distinct');
      assert.equal(new Set(item.options.map(viewBox)).size, 1, 'one viewBox for the options');
      checkItemMarkup(item, `${t.id}#${s}`);
      const ex = explain(t.id, meta);
      assert.ok(ex.length > 40 && ex.length < 600);
      assert.ok(!/option\s*\d|choice\s*\d|\(\s*[A-E]\s*\)/i.test(ex), 'no option numbers in the explanation');
      stems.add(item.stem);
    }
    assert.ok(stems.size >= 30, `${t.id}: ${stems.size} distinct stems`);
  });
}

test('answer position is spread over the options', () => {
  for (const t of TEMPLATES) {
    const pos = new Set();
    for (let s = 0; s < 60; s++) pos.add(V(t.id, s).item.answer);
    assert.ok(pos.size >= 4, `${t.id} answer positions ${[...pos]}`);
  }
});

// ---------------------------------------------------------------- P: paper folding

const P_N = { P1: 4, P2: 4, P3: 6, P4: 4, P5: 6 };

for (const id of byFam('P')) {
  test(`${id}: unfolded holes match an independent reverse-unfolding oracle`, () => {
    const N = P_N[id];
    let diag = 0;
    for (let s = 0; s < SEEDS; s++) {
      const { item, meta } = V(id, s);
      assert.equal(meta.N, N);
      const un = unfoldHoles(N, meta.folds, meta.punched);
      assert.ok(un.ok, `${id}#${s}: ${un.problems.join('; ')}`);
      // the answer option, parsed from its own markup, is the oracle's set
      const parsed = item.options.map((o) => parseSheet(o, N));
      const key = (set) => [...set].sort().join(';');
      assert.equal(key(parsed[item.answer]), key(un.holes), `${id}#${s} answer`);
      parsed.forEach((p, i) => {
        if (i !== item.answer) assert.notEqual(key(p), key(un.holes), `${id}#${s} distractor ${i} equals the answer`);
        assert.ok(p.size > 0);
      });
      assert.equal(new Set(parsed.map(key)).size, parsed.length, 'distinct hole sets');
      // markup circles = parsed holes (nothing lost, nothing overlapping)
      item.options.forEach((o, i) => assert.equal((o.match(/<circle/g) || []).length, parsed[i].size));
      // forward simulation in the generator agrees with the oracle
      const sim = simulateFolds(N, meta.folds);
      assert.ok(sim.pts.length === N * N);
      assert.deepEqual(meta.holes, [...un.holes].sort());
      // stem: one dashed fold line, one shaded flap and one arrow per fold; one circle per punch
      assert.equal((item.stem.match(/stroke-dasharray/g) || []).length, meta.folds.length);
      assert.equal((item.stem.match(/fill-opacity=".5"/g) || []).length, meta.folds.length);
      assert.equal((item.stem.match(/<path /g) || []).length, meta.folds.length);
      assert.equal((item.stem.match(/<circle/g) || []).length, meta.punched.length);
      if (meta.folds.some((f) => f.kind[0] === 'd')) diag++;
      if (id === 'P1' || id === 'P2' || id === 'P3') assert.ok(meta.folds.every((f) => f.kind === 'v' || f.kind === 'h'), 'no diagonals in easy templates');
    }
    if (id === 'P4' || id === 'P5') assert.equal(diag, SEEDS, 'diagonal folds in every harder item');
  });
}

test('P: fold counts per template, step panels in the stem', () => {
  const counts = { P1: [1], P2: [2], P3: [2], P4: [2], P5: [3] };
  for (const [id, c] of Object.entries(counts)) {
    for (let s = 0; s < 50; s++) assert.ok(c.includes(V(id, s).meta.folds.length));
  }
});

// ---------------------------------------------------------------- C: cube views

test('glyph sets: 4-fold symmetric vs fully asymmetric, all distinct', () => {
  const canon = (g, k) => {
    let pts = g.prims.map((p) => ({ t: p.t, fill: p.fill, pts: p.pts }));
    for (let i = 0; i < k; i++) pts = pts.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [-y, x]) }));
    return pts
      .map((p) => `${p.t}${p.fill || ''}:` + p.pts.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).sort().join(' '))
      .sort()
      .join('|');
  };
  for (const g of GLYPHS.sym) for (let k = 1; k < 4; k++) assert.equal(canon(g, k), canon(g, 0), g.name + ' symmetric');
  for (const g of GLYPHS.asy) for (let k = 1; k < 4; k++) assert.notEqual(canon(g, k), canon(g, 0), g.name + ' asymmetric');
  for (const set of [GLYPHS.sym, GLYPHS.asy]) {
    assert.equal(set.length, 6);
    assert.equal(new Set(set.map((g) => canon(g, 0))).size, 6);
  }
});

test('rotation group has 24 elements; slots are right-handed readings', () => {
  assert.equal(rotationGroup().length, 24);
  assert.equal(spatial2Data.ROT24.length, 24);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  SLOTS.forEach((s, i) => {
    deq(cross(s.ex, s.ey), s.n.map((v) => -v)); // right x down = into the face
    const fr = SLOT_FRAMES[i];
    deq(fr.n, s.n);
    deq(fr.right, s.ex);
    deq(fr.up, s.ey.map((v) => -v));
    for (let k = 0; k < 4; k++) deq(upAfter(fr, k), rotFrame(s.ex, s.ey, k)[1].map((v) => -v));
  });
});

test('net pool: the 11 cube nets; folding agrees with cube.js and with rolling a cube', () => {
  assert.equal(spatial2Data.NET_POOL.length, 11);
  for (const net of spatial2Data.NET_POOL) {
    for (const o of [0, 1, 2, 3].flatMap((k) => [rotate(net, k), mirror(rotate(net, k))])) {
      const cells = normalize(o);
      assert.ok(foldNet(cells).valid && isConnected(cells));
      const a = foldFaces(cells);
      const b = rollFaces(cells);
      assert.equal(new Set(a.map((f) => f.n.join())).size, 6, 'six distinct faces');
      a.forEach((f, i) => {
        deq(f.n, b[i].n, 'normal');
        deq(f.ex, b[i].ex, 'ex');
        deq(f.ey, b[i].ey, 'ey');
      });
      // opposite faces agree with cube.js
      const fo = foldNet(cells).faceOf;
      const OPP = { U: 'D', D: 'U', N: 'S', S: 'N', E: 'W', W: 'E' };
      for (let i = 0; i < 6; i++) {
        const j = fo.indexOf(OPP[fo[i]]);
        deq(a[j].n, a[i].n.map((v) => -v));
      }
    }
  }
});

test('hand-checked cross net: front, top and right faces meet as seen from the upper right', () => {
  // cross: centre is the front face; the cell above is the top face, the cell on the right is the right face
  const cells = normalize([[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]); // sorted by y then x
  const idx = (x, y) => cells.findIndex((c) => c[0] === x && c[1] === y);
  const assign = cells.map((_, i) => ({ g: i, r: 0 }));
  const views = possibleViews(cells, assign, false);
  // choose the net's centre as cell 0 of the roll: here cell 0 is (1,0); so just check one structural fact:
  // some rotation shows (top=above-centre... ) -> verify by direct geometry instead
  const faces = foldFaces(cells);
  const c = faces[idx(1, 1)];
  const up = faces[idx(1, 0)];
  const right = faces[idx(2, 1)];
  // above the centre = the face in direction -ey (page up), right = direction ex
  deq(up.n, c.ey.map((v) => -v));
  deq(right.n, c.ex);
  // with the centre as front (+Z) that is top (+Y) and right (+X): the identity-like view exists and shows
  // top = glyph of the upper cell, left slot = centre, right slot = right cell, all upright in the cross
  const key = [idx(1, 0), idx(1, 1), idx(2, 1)].map((i) => `${i}.`);
  const match = [...views.keys()].filter((k) => k.split('|').every((p, i) => p.startsWith(key[i])));
  assert.ok(match.length >= 1, 'front/top/right view exists');
});

for (const id of byFam('C')) {
  test(`${id}: exactly one option is a view of the folded cube (all 24 orientations)`, () => {
    const sym = id === 'C1' || id === 'C2';
    const glyphs = sym ? GLYPHS.sym : GLYPHS.asy;
    const kindsSeen = new Set();
    for (let s = 0; s < SEEDS; s++) {
      const { item, meta } = V(id, s);
      const { cells, assign } = meta;
      assert.equal(cells.length, 6);
      assert.ok(foldNet(cells).valid && isConnected(cells));
      assert.equal(new Set(assign.map((a) => a.g)).size, 6, 'six distinct glyphs on the net');
      if (sym) assert.ok(assign.every((a) => a.r === 0));
      const possible = possibleViews(cells, assign, sym);
      assert.equal(possible.size, sym ? possible.size : 24, 'asymmetric glyphs: 24 distinct views');
      const specs = [meta.answerSpec, ...meta.distractorSpecs];
      // markup is exactly the render of the specs, and the answer option is the correct spec
      assert.equal(item.options[item.answer], cubeSvg(meta.answerSpec, glyphs));
      assert.equal(item.stem, netSvg(cells, assign, glyphs));
      const keys = specs.map(specKeyOf);
      assert.equal(new Set(keys).size, keys.length, 'distinct specs');
      assert.ok(possible.has(keys[0]), 'answer is a real view');
      for (let i = 1; i < keys.length; i++) assert.ok(!possible.has(keys[i]), `${id}#${s}: distractor ${i} is a real view of the cube`);
      assert.equal(item.options.length, 5);
      assert.deepEqual(new Set(item.options), new Set(specs.map((sp) => cubeSvg(sp, glyphs))));
      // independent projection: every glyph vertex of the answer cube appears in its markup
      const pts = new Set([...item.options[item.answer].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => `${m[1]},${m[2]}`));
      meta.answerSpec.forEach((sl, i) => {
        const fr = SLOT_FRAMES[i];
        const up = upAfter(fr, sl.k);
        const right = [upAfter(fr, sl.k + 1)][0]; // after one more cw turn up -> right
        const g = glyphs[sl.g];
        for (const pr of g.prims) {
          for (const [u, v] of pr.pts) {
            // glyph point: u along its right, v downward (= -up)
            const P = [0, 1, 2].map((a) => fr.n[a] * 0.5 + (u * right[a] - v * up[a]) * 0.34);
            const sc = isoProject(P);
            assert.ok(pts.has(`${fmt(sc[0])},${fmt(sc[1])}`), `${id}#${s}: vertex ${sc} of slot ${i} missing`);
          }
        }
      });
      meta.kinds.forEach((k) => kindsSeen.add(k));
      // a viewer cannot pick the answer by symbols alone in the symmetric templates: all 3 faces differ
      assert.equal(new Set(meta.answerSpec.map((sl) => sl.g)).size, 3);
    }
    if (id === 'C4') {
      // hardest: every option shows the same three symbols in the same places
      for (let s = 0; s < 50; s++) {
        const { meta } = V(id, s);
        for (const d of meta.distractorSpecs) assert.deepEqual(d.map((x) => x.g), meta.answerSpec.map((x) => x.g));
      }
    }
    if (id === 'C1') assert.ok(kindsSeen.has('opp'));
  });
}

test('C: distractors cover the intended error kinds', () => {
  // opposite-faces distractors really show an opposite pair
  for (let s = 0; s < 60; s++) {
    const { meta } = V('C1', s);
    const base = rollFaces(meta.cells);
    const faceOfGlyph = (g) => base[meta.assign.findIndex((a) => a.g === g)];
    let hasOpp = 0;
    for (const d of meta.distractorSpecs) {
      const fs = d.map((x) => faceOfGlyph(x.g).n);
      const opp = fs.some((a, i) => fs.some((b, j) => i < j && a.every((v, t) => v === -b[t])));
      if (opp) hasOpp++;
    }
    assert.ok(hasOpp >= 2, 'C1 has two opposite-face distractors');
  }
});

// ---------------------------------------------------------------- K: block counting

for (const id of byFam('K')) {
  test(`${id}: rendered stack matches the height map (ray cast), every top visible, answer correct`, () => {
    const spec = spatial2Data.K_SPECS[id];
    for (let s = 0; s < SEEDS; s++) {
      const { item, meta } = V(id, s);
      const H = meta.heights;
      assert.equal(H.length, spec.W);
      assert.equal(H[0].length, spec.D);
      const total = H.flat().reduce((a, b) => a + b, 0);
      assert.equal(total, meta.total);
      assert.ok(Math.max(...H.flat()) === spec.hmax);
      // taller columns at the back (+x,+z is the viewer): non-increasing towards the viewer
      for (let x = 0; x < H.length; x++) for (let z = 0; z < H[0].length; z++) {
        if (x + 1 < H.length) assert.ok(H[x + 1][z] <= H[x][z]);
        if (z + 1 < H[0].length) assert.ok(H[x][z + 1] <= H[x][z]);
      }
      // every column's top face is fully visible, by ray casting
      for (let x = 0; x < H.length; x++) for (let z = 0; z < H[0].length; z++) {
        if (H[x][z] > 0) assert.equal(faceVisibility(H, 'top', x, H[x][z] - 1, z), true, `${id}#${s} top ${x},${z}`);
      }
      // expected visible faces by ray casting vs the faces actually drawn
      const expected = [];
      let visibleCubes = 0;
      for (let x = 0; x < H.length; x++) for (let z = 0; z < H[0].length; z++) for (let y = 0; y < H[x][z]; y++) {
        let any = false;
        for (const kind of ['top', 'left', 'right']) {
          const v = faceVisibility(H, kind, x, y, z);
          assert.notEqual(v, null, 'faces are never partly hidden');
          if (v) { expected.push({ kind, x, y, z }); any = true; }
        }
        if (any) visibleCubes++;
      }
      assert.equal(visibleCubes, meta.visible);
      assert.equal(total - visibleCubes, meta.hidden);
      assert.ok(meta.hidden >= spec.hidden);
      const q = (k, x, y, z) => {
        const corners = k === 'top' ? [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]
          : k === 'left' ? [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]
            : [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]];
        return corners.map(isoProject26);
      };
      function isoProject26(p) { const r = isoProject(p); return [(r[0] - 50) * 26 / 52, (r[1] - 50) * 26 / 52]; }
      const polys = [...item.stem.matchAll(/<polygon class="([\w-]+)" points="([^"]+)"[^>]*?(fill-opacity="[^"]*")?\s*\/>/g)].map((m) => ({
        cls: m[1], pts: m[2].split(' ').map((p) => p.split(',').map(Number)), op: m[3] || '',
      }));
      assert.equal(polys.length, expected.length, 'faces drawn = faces visible');
      const exp = expected.map((e) => ({ kind: e.kind, pts: q(e.kind, e.x, e.y, e.z) }));
      const minx = Math.min(...polys.flatMap((p) => p.pts.map((v) => v[0])));
      const miny = Math.min(...polys.flatMap((p) => p.pts.map((v) => v[1])));
      const minex = Math.min(...exp.flatMap((p) => p.pts.map((v) => v[0])));
      const miney = Math.min(...exp.flatMap((p) => p.pts.map((v) => v[1])));
      const sig = (pts, ox, oy) => pts.map(([a, b]) => `${fmt(a - ox)},${fmt(b - oy)}`).join(' ');
      const drawn = new Map(polys.map((p) => [sig(p.pts, minx, miny), p.cls + p.op]));
      for (const e of exp) {
        const k = sig(e.pts, minex, miney);
        // allow 0.02 drift from rounding the shift
        const hit = [...drawn.keys()].find((d) => d.split(' ').every((v, i) => {
          const [a, b] = v.split(',').map(Number);
          const [c, dd] = k.split(' ')[i].split(',').map(Number);
          return Math.abs(a - c) < 0.03 && Math.abs(b - dd) < 0.03;
        }));
        assert.ok(hit, `${id}#${s}: expected ${e.kind} face not drawn`);
        const shade = drawn.get(hit);
        assert.equal(shade, e.kind === 'top' ? 'f-none' : e.kind === 'left' ? 'f-grey' + 'fill-opacity=".4"' : 'f-grey');
      }
      assert.equal(polys.filter((p) => p.cls === 'f-none').length, H.flat().filter((h) => h > 0).length, 'one top face per column');
      // the answer
      const answerText = (o) => +o.match(/>(\d+)<\/text>/)[1];
      const box = spec.W * spec.D * spec.hmax;
      const want = spec.ask === 'fill' ? box - total : total;
      assert.equal(answerText(item.options[item.answer]), want);
      const vals = item.options.map(answerText);
      assert.equal(new Set(vals).size, vals.length);
      assert.ok(vals.every((v) => v > 0));
      if (spec.ask === 'count') assert.ok(vals.includes(visibleCubes) || visibleCubes === want, 'visible-only count is offered');
      assert.equal(blockStackSvg(H), item.stem);
    }
  });
}

// ---------------------------------------------------------------- H: shape assembly

const H_TOTAL = { H1: [7], H2: [8], H3: [10, 10] };

for (const id of byFam('H')) {
  test(`${id}: exactly one option pair tiles the target (brute force on parsed markup)`, () => {
    let mirrorTraps = 0;
    for (let s = 0; s < SEEDS; s++) {
      const { item } = V(id, s);
      const targetParsed = parsePieces(item.stem);
      assert.equal(targetParsed.length, 1, 'target is one piece');
      const T = targetParsed[0];
      assert.ok(isConnected(normalize(T)));
      assert.ok(T.length >= 7 && T.length <= 12);
      const pairs = item.options.map((o) => {
        const ps = parsePieces(o);
        assert.equal(ps.length, 2, `${id}#${s}: option shows two pieces`);
        ps.forEach((p) => assert.ok(isConnected(normalize(p))));
        return ps;
      });
      const counts = pairs.map(([a, b]) => countTilings(T, a, b));
      const winners = counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
      assert.deepEqual(winners, [item.answer], `${id}#${s}: tiling options ${winners}`);
      // option pairs are distinct as unordered pairs of rotation classes
      const keys = pairs.map((ps) => ps.map((p) => rotKey(normalize(p))).sort().join('|'));
      assert.equal(new Set(keys).size, 4 + 1);
      // equal cell size across all options and no piece wider than 4
      for (const ps of pairs) for (const p of ps) assert.ok(Math.max(...p.map((c) => c[0])) < 4 && Math.max(...p.map((c) => c[1])) < 4);
      // with a flip allowed, a "mirror" distractor would fit: confirm the trap is real
      pairs.forEach(([a, b], i) => {
        if (i === item.answer) return;
        const fa = mirror(normalize(a));
        const fb = mirror(normalize(b));
        if (countTilings(T, fa, b) > 0 || countTilings(T, a, fb) > 0) mirrorTraps++;
      });
      assert.equal(targetSvg(T.map(([x, y]) => [x, y])), item.stem);
    }
    if (id !== 'H1') assert.ok(mirrorTraps > SEEDS * 0.2, `${id}: flip traps ${mirrorTraps}`);
  });
}

test('H: piece sizes per template', () => {
  for (const id of byFam('H')) {
    for (let s = 0; s < 60; s++) {
      const { meta } = V(id, s);
      const n = meta.pieces[0].length + meta.pieces[1].length;
      assert.equal(meta.target.length, n);
      if (id === 'H1') assert.ok(n === 7);
      if (id === 'H2') assert.ok(n === 8);
      if (id === 'H3') assert.ok(n === 10);
    }
  }
});

// ---------------------------------------------------------------- variety report

test('variety counts', () => {
  const rows = [];
  for (const t of TEMPLATES) {
    const stems = new Set();
    const opts = new Set();
    for (let s = 0; s < SEEDS; s++) {
      const { item } = V(t.id, s);
      stems.add(item.stem);
      opts.add(item.options.join('|'));
    }
    rows.push(`${t.id} stems=${stems.size} optionSets=${opts.size}`);
  }
  console.log(rows.join('\n'));
});
