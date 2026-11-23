// Tests for public/js/items-figural.js (families R, F, O, A). Every template is verified over
// 200+ seeds by re-reading the generated SVG with test/lib/figural-parse.mjs and recomputing the
// rule with code that does not call the generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, variant, explain } from '../public/js/items-figural.js';
import { shapeGeom } from '../public/js/svg.js';
import { checkSvg } from './lib/markup.mjs';
import {
  parseSvg, cellOf, bbox, centre, sceneEq, minus, eqAny, d4, scaleScene, recolor, corners, area,
} from './lib/figural-parse.mjs';

const SEEDS = [0, ...Array.from({ length: 200 }, (_, i) => i + 1), 4294967295];
const IDS = TEMPLATES.map((t) => t.id);
const mod = (a, n) => ((a % n) + n) % n;
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const optScene = (html) => parseSvg(html);
const cells = (svg, xs, y = 0) => { const p = parseSvg(svg); return xs.map((x) => cellOf(p, x, y)); };
const MATRIX_ORIGINS = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [c * 110, r * 110]));
const matrixCells = (svg) => { const p = parseSvg(svg); return MATRIX_ORIGINS.map(([x, y]) => cellOf(p, x, y, 110, 110)); };

function typeOf(p) {
  if (p.t === 'circle') return 'circle';
  const n = corners(p.pts).length;
  const [x0, y0, x1, y1] = bbox(p);
  if (n === 3) return 'triangle';
  if (n === 4) return Math.abs(x1 - x0 - (y1 - y0)) < 0.8 ? 'square' : 'diamond';
  if (n === 5) return 'pentagon';
  if (n === 6) return 'hexagon';
  if (n === 10) return 'star';
  throw new Error('unknown shape with ' + n + ' corners');
}
const widthOf = (p) => { const b = bbox(p); return b[2] - b[0]; };
// Size level of a drawn shape: match its width against the library's own shape geometry at each radius.
function levelOf(p, radii) {
  const t = typeOf(p);
  const w = widthOf(p);
  const ws = radii.map((r) => { const g = shapeGeom(t, 0, 0, r); return g.type === 'circle' ? 2 * g.r : Math.max(...g.pts.map((q) => q[0])) - Math.min(...g.pts.map((q) => q[0])); });
  const i = ws.findIndex((x) => Math.abs(x - w) < 0.4);
  assert.ok(i >= 0, `size of ${t} width ${w} not in ${ws}`);
  return i;
}
const FILLS = ['none', 'grey', 'solid'];

// The "most common attribute" elimination heuristic and the "most central option" heuristic.
// Returns the probability that a guesser using it picks the answer.
function heuristics(vecs, ai) {
  const n = vecs.length;
  const score = Array(n).fill(0);
  for (let d = 0; d < vecs[0].length; d++) {
    const counts = {};
    for (const v of vecs) counts[v[d]] = (counts[v[d]] || 0) + 1;
    const top = Math.max(...Object.values(counts));
    const modes = Object.keys(counts).filter((k) => counts[k] === top);
    vecs.forEach((v, i) => { if (modes.includes(String(v[d]))) score[i] += 1 / modes.length; });
  }
  const pick = (arr, better) => { const b = arr.reduce((m, x) => (better(x, m) ? x : m)); const ties = arr.filter((x) => Math.abs(x - b) < 1e-9); return Math.abs(arr[ai] - b) < 1e-9 ? 1 / ties.length : 0; };
  const mode = pick(score, (x, m) => x > m);
  const dist = vecs.map((v) => vecs.reduce((s, w) => s + v.filter((x, k) => x !== w[k]).length, 0));
  const central = pick(dist, (x, m) => x < m);
  return { mode, central };
}

// a figure value is the single odd one among five when four are equal and one differs
function singled(vals) {
  for (let i = 0; i < vals.length; i++) {
    const rest = vals.filter((_, j) => j !== i);
    if (rest.every((v) => v === rest[0]) && vals[i] !== rest[0]) return i;
  }
  return -1;
}

const stats = {};

// ---------------------------------------------------------------------------
// R: read cells back into attributes, solve each attribute independently
// ---------------------------------------------------------------------------

const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const QUAD = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const RAD = { single: [11, 17, 24, 31], pair: [9, 13, 17], nest: [8, 11, 14] };

function readCell(config, scene, meta) {
  const T = (a, p) => { const i = meta.ctx.types[a].indexOf(typeOf(p)); assert.ok(i >= 0, `type ${typeOf(p)} not in ${a} domain`); return i; };
  const F = (p) => FILLS.indexOf(p.fill);
  switch (config) {
    case 'single': { assert.equal(scene.length, 1); const [p] = scene; return { type: T('type', p), size: levelOf(p, RAD.single) + 1, fill: F(p) }; }
    case 'dice': {
      assert.ok(scene.every((p) => typeOf(p) === typeOf(scene[0]) && p.fill === scene[0].fill));
      return { n: scene.length, type: T('type', scene[0]), fill: F(scene[0]) };
    }
    case 'ring': case 'quad': {
      assert.equal(scene.length, 1);
      const [cx, cy] = centre(scene[0]);
      const step = config === 'ring' ? 30 : 23;
      const slots = config === 'ring' ? RING : QUAD;
      const dx = Math.round((cx - 50) / step);
      const dy = Math.round((cy - 50) / step);
      const pos = slots.findIndex(([a, b]) => a === dx && b === dy);
      assert.ok(pos >= 0 && Math.abs(cx - 50 - dx * step) < 3 && Math.abs(cy - 50 - dy * step) < 3, 'slot');
      return { pos, type: T('type', scene[0]), fill: F(scene[0]) };
    }
    case 'pair': {
      assert.equal(scene.length, 2);
      const [l, r] = scene.slice().sort((a, b) => centre(a)[0] - centre(b)[0]);
      assert.equal(levelOf(l, RAD.pair), 1, 'left size fixed');
      return { lType: T('lType', l), lFill: F(l), rType: T('rType', r), rFill: F(r), rSize: levelOf(r, RAD.pair) + 1 };
    }
    case 'nest': {
      assert.equal(scene.length, 2);
      const [i, o] = scene.slice().sort((a, b) => widthOf(a) - widthOf(b));
      assert.equal(o.fill, 'none');
      assert.equal(levelOf(i, RAD.nest), 1);
      assert.ok(widthOf(o) > 50);
      return { oType: T('oType', o), iType: T('iType', i), iFill: F(i) };
    }
    default: throw new Error(config);
  }
}

// Which values of the missing cell complete the 3x3 table under *some* rule?
function completions(T, d) {
  const span = d.hi - d.lo + 1;
  const step = (a, b) => (d.cyc ? mod(b - a, span) : b - a);
  const out = [];
  for (let v = d.lo; v <= d.hi; v++) {
    const t = T.map((r) => r.slice());
    t[2][2] = v;
    const rows = t;
    const constant = rows.every((r) => r[0] === r[1] && r[1] === r[2]);
    const steps = d.cyc ? [1, 2, 3, -1, -2, -3] : [1, 2, -1, -2];
    const prog = steps.some((s) => rows.every((r) => step(r[0], r[1]) === (d.cyc ? mod(s, span) : s) && step(r[1], r[2]) === (d.cyc ? mod(s, span) : s)));
    const arith = d.numeric && [(a, b) => a + b, (a, b) => a - b, (a, b) => b - a].some((f) => rows.every((r) => f(r[0], r[1]) === r[2]));
    const sets = rows.map((r) => [...r].sort((x, y) => x - y).join());
    const dist3 = rows.every((r) => new Set(r).size === 3) && sets.every((s) => s === sets[0]);
    if (constant || prog || arith || dist3) out.push(v);
  }
  return out;
}

function checkR(item, meta, id) {
  const vecAttrs = meta.attrs;
  const st = matrixCells(item.stem);
  const grid = st.map((c, i) => (i === 8 ? null : readCell(meta.config, c, meta)));
  assert.equal(st[8].length, 0, 'missing cell shows only "?"');
  const opts = item.options.map((o) => readCell(meta.config, optScene(o), meta));
  // solve each attribute
  const predicted = {};
  for (const a of vecAttrs) {
    const T = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === 2 && c === 2 ? 0 : grid[r * 3 + c][a])));
    const comp = completions(T, meta.doms[a]);
    assert.equal(comp.length, 1, `${id} attribute ${a}: ${comp.length} rule-consistent values`);
    predicted[a] = comp[0];
    // the declared rule really holds for the whole table
    const full = T.map((r) => r.slice());
    full[2][2] = comp[0];
    assert.deepEqual(full, meta.tables[a], `${id} ${a} table`);
  }
  const eq = (v) => vecAttrs.every((a) => v[a] === predicted[a]);
  const hits = opts.map((v, i) => (eq(v) ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(hits, [item.answer], `${id}: exactly the answer option satisfies the rules`);
  // options pairwise differ in attributes
  const keys = opts.map((v) => vecAttrs.map((a) => v[a]).join());
  assert.equal(new Set(keys).size, keys.length, 'option attribute vectors distinct');
  assert.deepEqual(meta.optionVals.map((v) => vecAttrs.map((a) => v[a]).join()), keys, 'meta vectors match markup');
  assert.deepEqual(vecAttrs.map((a) => predicted[a]), vecAttrs.map((a) => meta.answerVals[a]));
  return heuristics(opts.map((v) => vecAttrs.map((a) => v[a])), item.answer);
}

// ---------------------------------------------------------------------------
// F: figure series
// ---------------------------------------------------------------------------

const ROW = (i) => i * 108;
const deg = (r) => (r * 180) / Math.PI;
const rotBy = ([x, y], d) => { const a = (d * Math.PI) / 180; const dx = x - 50; const dy = y - 50; return [50 + dx * Math.cos(a) - dy * Math.sin(a), 50 + dx * Math.sin(a) + dy * Math.cos(a)]; };
function arrowOf(scene) {
  const head = scene.find((p) => p.t === 'poly' && p.fill === 'solid' && p.pts.length === 3);
  assert.ok(head, 'arrow head');
  const tip = head.pts.reduce((m, p) => (Math.hypot(p[0] - 50, p[1] - 50) > Math.hypot(m[0] - 50, m[1] - 50) ? p : m));
  const ang = mod(Math.round(deg(Math.atan2(tip[0] - 50, 50 - tip[1]))), 360);
  const lines = scene.filter((p) => p.t === 'line');
  const barb = lines.find((l) => Math.abs(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) - 14.14) < 0.3);
  assert.ok(barb, 'barb');
  const ends = [rotBy([barb.x1, barb.y1], -ang), rotBy([barb.x2, barb.y2], -ang)];
  const far = ends.reduce((m, p) => (Math.abs(p[0] - 50) > Math.abs(m[0] - 50) ? p : m));
  return { ang, flip: far[0] < 50 };
}
const dotsOf = (scene) => scene.filter((p) => p.t === 'circle' && p.fill === 'solid' && p.r < 5).length;
const slotOf = (p, mid = 32) => { const [cx, cy] = centre(p); assert.ok(Math.abs(Math.hypot(cx - 50, cy - 50) - mid) < 5, 'on the ring'); return mod(Math.round(deg(Math.atan2(cx - 50, 50 - cy)) / 45), 8); };
const constStep = (xs, m) => { const d = mod(xs[1] - xs[0], m); xs.slice(1).forEach((x, i) => assert.equal(mod(x - xs[i], m), d, 'constant step')); return d; };

function checkF(id, item, meta) {
  const panels = cells(item.stem, range(0, meta.shown).map(ROW));
  assert.equal(panels[meta.shown].length, 0, 'last panel is "?"');
  const shown = panels.slice(0, meta.shown);
  const opts = item.options.map(optScene);
  let match;
  if (id === 'F1' || id === 'F5') {
    const A = shown.map(arrowOf);
    assert.ok(A.every((a) => !a.flip));
    const d = constStep(A.map((a) => a.ang), 360);
    const want = mod(A[A.length - 1].ang + d, 360);
    let wantN = null;
    if (id === 'F5') {
      const ns = shown.map(dotsOf);
      const dn = ns[1] - ns[0];
      ns.slice(1).forEach((n, i) => assert.equal(n - ns[i], dn));
      assert.ok(dn === 1 || dn === -1);
      wantN = ns[ns.length - 1] + dn;
    } else assert.ok(shown.every((s) => s.length === 3));
    match = (o) => { const a = arrowOf(o); return !a.flip && a.ang === want && (wantN === null ? o.length === 3 : dotsOf(o) === wantN); };
  } else if (id === 'F2') {
    const sets = shown.map((s) => s.map((p) => slotOf(p)));
    const type = typeOf(shown[0][0]);
    shown.forEach((s, i) => { assert.equal(s.length, i + 1); assert.ok(s.every((p) => typeOf(p) === type && p.fill === 'solid')); });
    const added = sets.map((s, i) => (i === 0 ? s[0] : s.find((x) => !sets[i - 1].includes(x))));
    const d = constStep(added, 8);
    const want = [...sets[3], mod(added[3] + d, 8)].sort();
    match = (o) => o.length === 5 && o.every((p) => typeOf(p) === type) && o.map((p) => slotOf(p)).sort().join() === want.join();
  } else if (id === 'F3') {
    const frame = shown[0].find((p) => p.fill === 'none');
    const kind = frame.t;
    const idx = shown.map((s) => { assert.equal(s.length, 2); const f = s.find((p) => p.fill === 'none'); assert.equal(f.t, kind); const dot = s.find((p) => p.fill === 'solid'); assert.ok(dot.r > 6 && dot.r < 8); return mod(Math.round(deg(Math.atan2(dot.cx - 50, 50 - dot.cy)) / 45), 8); });
    const d = constStep(idx, 8);
    const want = mod(idx[3] + d, 8);
    match = (o) => { const f = o.find((p) => p.fill === 'none'); const dot = o.find((p) => p.fill === 'solid'); return o.length === 2 && f.t === kind && mod(Math.round(deg(Math.atan2(dot.cx - 50, 50 - dot.cy)) / 45), 8) === want; };
  } else if (id === 'F4') {
    const arrows = [0, 2, 4].map((i) => arrowOf(shown[i]));
    const cnt = [1, 3].map((i) => shown[i].length);
    const bType = typeOf(shown[1][0]);
    const bFill = shown[1][0].fill;
    [1, 3].forEach((i) => assert.ok(shown[i].every((p) => typeOf(p) === bType && p.fill === bFill)));
    assert.equal(constStep(arrows.map((a) => a.ang), 360) !== undefined, true);
    assert.equal(cnt[1] - cnt[0], 1);
    const want = cnt[1] + 1;
    match = (o) => o.length === want && o.every((p) => p.t !== 'line' && typeOf(p) === bType && p.fill === bFill);
  } else throw new Error(id);
  const hits = opts.map((o, i) => (match(o) ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(hits, [item.answer], `${id}: exactly the answer continues the series`);
}

// ---------------------------------------------------------------------------
// O: odd one out
// ---------------------------------------------------------------------------

const polyOf = (scene) => scene.find((p) => p.t === 'poly');
function cellsOfPoly(scene, offset = null) {
  // cell coordinates of polyomino tiles (each tile a 4-corner polygon)
  const tiles = scene.map((p) => bbox(p));
  const cs = tiles[0][2] - tiles[0][0];
  tiles.forEach((b) => assert.ok(Math.abs(b[2] - b[0] - cs) < 0.05 && Math.abs(b[3] - b[1] - cs) < 0.05, 'square tile'));
  const ox = offset ?? Math.min(...tiles.map((b) => b[0]));
  const oy = offset ?? Math.min(...tiles.map((b) => b[1]));
  return { cs, cells: tiles.map((b) => [Math.round((b[0] - ox) / cs), Math.round((b[1] - oy) / cs)]) };
}
const norm = (c) => { const mx = Math.min(...c.map((p) => p[0])); const my = Math.min(...c.map((p) => p[1])); return c.map(([x, y]) => `${x - mx},${y - my}`).sort().join(';'); };
const rot90 = (c) => c.map(([x, y]) => [-y, x]);
const mir = (c) => c.map(([x, y]) => [-x, y]);
function rotClass(c) { const ks = []; let r = c; for (let i = 0; i < 4; i++) { ks.push(norm(r)); r = rot90(r); } return ks.sort()[0]; }
const isPrime = (n) => n > 1 && range(2, Math.floor(Math.sqrt(n))).every((d) => n % d);
const bboxW = (c) => Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0])) + 1;
const bboxH = (c) => Math.max(...c.map((p) => p[1])) - Math.min(...c.map((p) => p[1])) + 1;
function connectedCells(c) {
  const s = new Set(c.map((p) => p.join()));
  const seen = new Set([c[0].join()]);
  const st = [c[0]];
  while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${y + dy}`; if (s.has(k) && !seen.has(k)) { seen.add(k); st.push([x + dx, y + dy]); } } }
  return seen.size === c.length;
}

function checkO(id, item, meta) {
  assert.equal(item.stem, '');
  const figs = item.options.map(optScene);
  const noOtherSingles = (props, label) => props.forEach((vals, k) => assert.equal(singled(vals), -1, `${id}: ${label}[${k}] singles out a figure ${vals}`));
  let intended;
  if (id === 'O1') {
    const counts = figs.map((f) => f.length);
    figs.forEach((f) => assert.ok(f.every((p) => typeOf(p) === typeOf(figs[0][0]) && p.fill === figs[0][0].fill)));
    intended = singled(counts.map((n) => n % 2));
    assert.deepEqual([...counts].sort((a, b) => a - b), [...meta.counts].sort((a, b) => a - b));
    noOtherSingles([
      figs.map((f) => typeOf(f[0])), figs.map((f) => f[0].fill), figs.map((f) => Math.round(widthOf(f[0]))),
      counts.map((n) => n % 3 === 0), counts.map(isPrime), counts.map((n) => n % 4 === 0),
    ], 'alt');
  } else if (id === 'O2') {
    const polys = figs.map((f) => { assert.equal(f.length, 2); const c = f.find((p) => p.t === 'circle'); assert.ok(c && c.r === 42); return polyOf(f); });
    const sides = polys.map((p) => corners(p.pts).length);
    intended = singled(sides);
    const regular = (p) => { const c = corners(p.pts); const L = c.map((q, i) => Math.hypot(q[0] - c[(i + 1) % c.length][0], q[1] - c[(i + 1) % c.length][1])); return Math.max(...L) - Math.min(...L) < 0.5; };
    const aspect = (p) => { const b = bbox(p); const r = (b[2] - b[0]) / (b[3] - b[1]); return r > 1.15 ? 'wide' : r < 0.87 ? 'tall' : 'even'; };
    noOtherSingles([polys.map((p) => p.fill), polys.map(regular), polys.map(aspect), polys.map((p) => Math.round(area(p.pts) / 100))], 'alt');
    assert.ok(sides.every((s) => s >= 3 && s <= 6));
    assert.equal(sides.filter((s) => s === sides[(intended + 1) % 5]).length, 4, 'four share the side count');
  } else if (id === 'O3') {
    const cs = figs.map((f) => cellsOfPoly(f).cells);
    assert.ok(cs.every((c) => c.length === cs[0].length));
    const rc = cs.map(rotClass);
    intended = singled(rc);
    assert.notEqual(intended, -1, 'four share a rotation class');
    const major = rc[(intended + 1) % 5];
    assert.equal(rotClass(mir(cs[intended])), major, 'the odd figure is the mirror image');
    assert.notEqual(rc[intended], major);
    assert.equal(new Set(cs.map(norm)).size, 5, 'figures distinct');
    noOtherSingles([cs.map((c) => bboxW(c) > bboxH(c)), cs.map((c) => bboxW(c) < bboxH(c)), cs.map((c) => c.length), figs.map((f) => f[0].fill)], 'alt');
  } else {
    const cs = figs.map((f) => { const r = cellsOfPoly(f, 50 - 32.5); assert.ok(Math.abs(r.cs - 13) < 0.05); return r.cells; });
    assert.ok(cs.every((c) => c.every(([x, y]) => x >= 0 && x < 5 && y >= 0 && y < 5)));
    const sym = (c, f) => { const s = new Set(c.map((p) => p.join())); return c.every((p) => s.has(f(p).join())); };
    const V = (p) => [4 - p[0], p[1]];
    const H = (p) => [p[0], 4 - p[1]];
    const symV = cs.map((c) => sym(c, V));
    const symH = cs.map((c) => sym(c, H));
    const iv = singled(symV);
    const ih = singled(symH);
    assert.ok(iv >= 0 || ih >= 0, 'one axis separates the odd figure');
    assert.ok(!(iv >= 0 && ih >= 0 && iv !== ih), 'axes agree');
    intended = iv >= 0 ? iv : ih;
    assert.ok(symV[intended] === false || symH[intended] === false);
    assert.equal(symV.filter(Boolean).length === 4 || symH.filter(Boolean).length === 4, true);
    assert.ok(cs.every((c) => c.length === cs[0].length), 'equal cell counts');
    noOtherSingles([
      cs.map((c) => c.length), cs.map(bboxW), cs.map(bboxH), cs.map((c) => sym(c, (p) => [4 - p[0], 4 - p[1]])),
      cs.map((c) => sym(c, (p) => [p[1], p[0]])), cs.map(connectedCells),
      cs.map((c) => c.filter((p) => p[0] < 2).length), cs.map((c) => c.filter((p) => p[1] < 2).length),
    ], 'alt');
    assert.equal(new Set(cs.map((c) => c.map((q) => q.join()).sort().join(';'))).size, 5);
  }
  assert.equal(intended, item.answer, `${id}: the intended odd figure is the answer`);
}

// ---------------------------------------------------------------------------
// A: figural analogies
// ---------------------------------------------------------------------------

const A_X = [0, 130, 290, 420];
function checkA(id, item, meta) {
  const [A, B, C, Q] = cells(item.stem, A_X);
  assert.equal(Q.length, 0);
  assert.ok(A.length && B.length && C.length);
  const opts = item.options.map(optScene);
  let expected; // list of acceptable answer scenes (all must coincide)
  if (id === 'A4') {
    const removed = A.filter((p) => !B.some((q) => sceneEq([p], [q])));
    const added = B.filter((p) => !A.some((q) => sceneEq([p], [q])));
    const rest = minus(C, removed);
    assert.ok(rest, 'removed marks exist in C');
    expected = [[...rest, ...added]];
    assert.ok(removed.length + added.length > 0);
    assert.equal(meta.mode === 'add' ? 0 : 1, removed.length > 0 ? 1 : 0);
  } else {
    expected = [];
    const combo = id === 'A5' ? meta.combo : null;
    // which kinds of change each template may use (a symmetric figure would otherwise fit several "rotations")
    const allow = id === 'A1' ? { o: true, s: false, f: false } : id === 'A2' ? { o: false, s: false, f: true }
      : id === 'A3' ? { o: false, s: true, f: false } : { o: combo !== 'scale+fill', s: combo !== 'geom+fill', f: combo !== 'geom+scale' };
    const sizes = allow.s ? [1, 1.4, 1.96, 1 / 1.4, 1 / 1.96, 2.744, 1 / 2.744] : [1];
    const fillsTry = allow.f ? FILLS : [null];
    for (const o of allow.o ? [0, 1, 2, 3, 4, 5, 6, 7] : [0]) for (const s of sizes) for (const f of fillsTry) {
      const tf = (sc) => { let r = d4(sc, o); if (s !== 1) r = scaleScene(r, s); if (f) r = recolor(r, f); return r; };
      if (sceneEq(tf(A), B)) expected.push(tf(C));
    }
    assert.ok(expected.length >= 1, `${id}: some transformation maps A to B`);
    // all fits must agree on the image of C
    for (const e of expected) assert.ok(sceneEq(e, expected[0]), `${id}: ambiguous transformation`);
    assert.ok(!sceneEq(A, B));
  }
  const hits = opts.map((o, i) => (eqAny(o, expected) ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(hits, [item.answer], `${id}: exactly the answer completes the analogy`);
  return heuristics(meta.optionVecs, item.answer);
}

// ---------------------------------------------------------------------------
// generic checks and the per-template loops
// ---------------------------------------------------------------------------

test('TEMPLATES: ids, families, difficulty spread', () => {
  const fam = (p) => TEMPLATES.filter((t) => t.id[0] === p);
  assert.ok(fam('R').length >= 8 && fam('R').length <= 10);
  assert.equal(fam('F').length, 5);
  assert.equal(fam('O').length, 4);
  assert.equal(fam('A').length, 5);
  assert.equal(new Set(IDS).size, IDS.length);
  for (const t of TEMPLATES) {
    assert.match(t.id, /^[RFOA]\d+$/);
    assert.equal(t.category, 'matrix');
    assert.equal(typeof t.family, 'string');
    assert.equal(typeof t.title, 'string');
    assert.ok(t.b >= -2.2 && t.b <= 2.0, t.id);
  }
  for (const p of 'RFOA') {
    const bs = fam(p).map((t) => t.b);
    assert.ok(Math.max(...bs) - Math.min(...bs) >= 1.5, `${p}: spread of difficulties`);
  }
});

for (const id of IDS) {
  test(`${id}: ${SEEDS.length} seeds - contract, markup, unique answer, independent rule check`, () => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    const variety = new Set();
    const hs = [];
    const nOpts = id[0] === 'R' ? 6 : 5;
    for (const seed of SEEDS) {
      const where = `${id}#${seed}`;
      const { item, meta } = variant(id, seed);
      // contract
      assert.equal(item.id, id);
      assert.equal(item.category, 'matrix');
      assert.equal(item.b, tpl.b);
      assert.equal(typeof item.prompt, 'string');
      assert.ok(item.prompt.length > 5);
      assert.equal(item.options.length, nOpts, where);
      assert.equal(item.optionCols, id[0] === 'R' ? 3 : 5);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < nOpts);
      // markup rules
      if (item.stem !== '') checkSvg(item.stem, `${where} stem`);
      else assert.equal(id[0], 'O');
      item.options.forEach((o, i) => {
        checkSvg(o, `${where} option ${i}`);
        assert.match(o, /viewBox="0 0 100 100"/);
        assert.match(o, /stroke="currentColor"/);
        assert.match(o, /aria-label="[^"]+"/);
      });
      if (item.stem) { assert.match(item.stem, /aria-label="[^"]+"/); assert.equal((item.stem.match(/<text/g) || []).length, id[0] === 'O' ? 0 : 1); assert.ok(item.stem.includes('>?</text>')); }
      assert.equal(id[0] === 'R' ? /viewBox="0 0 320 320"/.test(item.stem) : true, true);
      assert.equal(new Set(item.options).size, nOpts, 'option markup distinct');
      // geometry inside the cell and options visually distinct (tolerant, by geometry)
      const scenes = item.options.map(optScene);
      for (const sc of scenes) for (const p of sc) { const b = bbox(p); assert.ok(b[0] >= 2 && b[1] >= 2 && b[2] <= 98 && b[3] <= 98, `${where}: figure leaves the cell ${b}`); }
      for (let i = 0; i < nOpts; i++) for (let j = i + 1; j < nOpts; j++) assert.ok(!sceneEq(scenes[i], scenes[j]), `${where}: options ${i} and ${j} look identical`);
      // semantic check
      if (id[0] === 'R') hs.push(checkR(item, meta, where));
      else if (id[0] === 'F') checkF(id, item, meta);
      else if (id[0] === 'O') checkO(id, item, meta);
      else hs.push(checkA(id, item, meta));
      // explanation
      const ex = explain(id, meta);
      assert.equal(typeof ex, 'string');
      assert.ok(ex.length > 40 && ex.length < 600, where);
      assert.ok(!/option\s*(\d|[A-F]\b)/i.test(ex) && !/\bundefined|NaN\b/.test(ex), `${where}: explanation text`);
      assert.ok(ex.split(/[.!?]\s/).length <= 4, `${where}: at most ~3 sentences`);
      variety.add(item.stem + item.options.join(''));
      if (id[0] === 'R') {
        for (const a of meta.attrs) {
          const k = meta.rules[a].rule;
          if (k === 'arith') assert.match(ex, /plus|minus/);
          if (k === 'dist3') assert.match(ex, /same three/);
          if (k === 'prog') assert.match(ex, /one|moves|step|goes/);
          if (isTypeAttr(a)) assert.ok(ex.includes(meta.ctx.types[a][meta.answerVals[a]]), `${where}: answer shape named`);
        }
        if (meta.config === 'dice') assert.ok(ex.includes(String(meta.answerVals.n)));
      }
      // determinism
      if (seed < 5) assert.deepEqual(variant(id, seed), { item, meta });
    }
    assert.ok(variety.size >= 30, `${id}: variety ${variety.size}`);
    if (hs.length) {
      const mode = hs.reduce((s, h) => s + h.mode, 0) / hs.length;
      const central = hs.reduce((s, h) => s + h.central, 0) / hs.length;
      stats[id] = { mode: +mode.toFixed(3), central: +central.toFixed(3), variety: variety.size };
      assert.ok(mode <= 0.45, `${id}: most-common-attribute heuristic finds the answer ${(mode * 100).toFixed(0)}% of seeds`);
      assert.ok(central <= 0.45, `${id}: most-central-option heuristic finds the answer ${(central * 100).toFixed(0)}% of seeds`);
    } else stats[id] = { variety: variety.size };
  });
}
const isTypeAttr = (a) => a === 'type' || a.endsWith('Type');

test('different seeds give different items; seed 0 and huge seeds work', () => {
  for (const id of IDS) {
    const a = variant(id, 0).item;
    const b = variant(id, 1).item;
    const c = variant(id, 4294967295).item;
    assert.ok(a.stem + a.options.join('') !== b.stem + b.options.join('') || a.stem + a.options.join('') !== c.stem + c.options.join(''));
  }
});

test('summary of elimination-heuristic rates and variety', () => {
  console.log('template  mostCommonAttr  mostCentralOption  distinct-items/203');
  for (const id of IDS) {
    const s = stats[id];
    if (s) console.log(`${id.padEnd(8)}  ${s.mode === undefined ? '-' : (s.mode * 100).toFixed(1) + '%'}`.padEnd(30) + `${s.central === undefined ? '-' : (s.central * 100).toFixed(1) + '%'}`.padEnd(20) + s.variety);
  }
  assert.ok(Object.keys(stats).length >= 0);
});
