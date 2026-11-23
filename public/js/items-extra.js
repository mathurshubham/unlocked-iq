// Extra item families (v3, Agent V). Pure: builds markup strings, no DOM.
//   E embedded figures, Y 3D mental rotation, W gears & directions  (category 'spatial')
//   Z domino sequences, J clock & calendar                            (category 'series')
// Contract: TEMPLATES, variant(id, seed) -> { item, meta }, explain(id, meta) -> string.
import { rng, placeOptions } from './rng.js';

export const TEMPLATES = [
  { id: 'E1', category: 'spatial', b: -1.2, family: 'embedded', title: 'Hidden shape in a grid of straight lines' },
  { id: 'E2', category: 'spatial', b: 0.3, family: 'embedded', title: 'Hidden shape with diagonals' },
  { id: 'E3', category: 'spatial', b: 1.4, family: 'embedded', title: 'Hidden shape, near-miss figures' },
  { id: 'Y1', category: 'spatial', b: -0.3, family: 'rotation3d', title: 'Turned block object (spin about upright axis)' },
  { id: 'Y2', category: 'spatial', b: 0.5, family: 'rotation3d', title: 'Rotated block object' },
  { id: 'Y3', category: 'spatial', b: 1.2, family: 'rotation3d', title: 'Rotated 10-block object, five options' },
  { id: 'Y4', category: 'spatial', b: 1.9, family: 'rotation3d', title: 'Rotated 11-block object, one block moved' },
  { id: 'W1', category: 'spatial', b: -1.3, family: 'gears', title: 'Gear chain directions' },
  { id: 'W2', category: 'spatial', b: 0.9, family: 'gears', title: 'Gears joined by shared axles' },
  { id: 'W3', category: 'spatial', b: 0.6, family: 'gears', title: 'Route with turns and compass' },
  { id: 'Z1', category: 'series', b: -1.0, family: 'domino', title: 'Domino sequence, simple steps' },
  { id: 'Z2', category: 'series', b: 0.3, family: 'domino', title: 'Domino sequence, both halves change' },
  { id: 'Z3', category: 'series', b: 1.3, family: 'domino', title: 'Domino sequence, alternating and growing steps' },
  { id: 'J1', category: 'series', b: -0.9, family: 'clock', title: 'Clock sequence, fixed interval' },
  { id: 'J2', category: 'series', b: 0.1, family: 'clock', title: 'Day of the week arithmetic' },
  { id: 'J3', category: 'series', b: 0.9, family: 'clock', title: 'Clock sequence, growing interval' },
  { id: 'J4', category: 'series', b: 1.3, family: 'clock', title: 'Angle between clock hands' },
];

// ---------------------------------------------------------------- helpers

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const f2 = (n) => String(+n.toFixed(2));
const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const mod = (a, n) => ((a % n) + n) % n;

function svg(viewBox, inner, label) {
  return `<svg ${NS} viewBox="${viewBox}" width="100%" role="img" aria-label="${label}">${inner}</svg>`;
}

// Small SVG holding 1-2 lines of centred text (answers as figures, for spatial items).
function textSvg(lines, size, label) {
  const ls = Array.isArray(lines) ? lines : [lines];
  const H = ls.length === 1 ? 60 : 70;
  const y0 = H / 2 - ((ls.length - 1) * size * 1.15) / 2;
  const body = ls
    .map(
      (t, i) =>
        `<text x="50" y="${f2(y0 + i * size * 1.15)}" font-size="${size}" font-weight="600" fill="currentColor" ` +
        `font-family="inherit" text-anchor="middle" dominant-baseline="central">${t}</text>`
    )
    .join('');
  return svg(`0 0 100 ${H}`, body, label);
}

const LINE = 'stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

// Finish an item: place options, attach meta. `markups` = [answer, ...distractors]; `info` aligned.
function finish(id, seed, base, answerMarkup, distractorMarkups, infos, meta) {
  const placed = placeOptions(`${id}#${seed}`, answerMarkup, distractorMarkups);
  const order = [answerMarkup, ...distractorMarkups];
  const optionInfo = placed.options.map((m) => infos[order.indexOf(m)]);
  return {
    item: { id, category: base.category, b: base.b, prompt: base.prompt, stem: base.stem, options: placed.options, answer: placed.answer, optionCols: base.optionCols },
    meta: { ...meta, template: id, seed, optionInfo },
  };
}
const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
const baseOf = (id, prompt, stem, optionCols) => ({ category: TPL[id].category, b: TPL[id].b, prompt, stem, optionCols });

// ================================================================ E: embedded figures
// Figures are sets of unit lattice edges. The target must appear with the same size and
// orientation (translation only) inside exactly one option figure.

const ek = (x1, y1, x2, y2) =>
  x1 < x2 || (x1 === x2 && y1 <= y2) ? `${x1},${y1}-${x2},${y2}` : `${x2},${y2}-${x1},${y1}`;
const edgeOfKey = (k) => k.split('-').flatMap((p) => p.split(',').map(Number));
const keyOfEdge = (e) => ek(e[0], e[1], e[2], e[3]);

function latticeEdges(W, diag) {
  const out = [];
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (x + 1 < W) out.push([x, y, x + 1, y]);
      if (y + 1 < W) out.push([x, y, x, y + 1]);
      if (diag && x + 1 < W && y + 1 < W) {
        out.push([x, y, x + 1, y + 1]);
        out.push([x + 1, y, x, y + 1]);
      }
    }
  }
  return out;
}

function bboxOf(edges) {
  const xs = edges.flatMap((e) => [e[0], e[2]]);
  const ys = edges.flatMap((e) => [e[1], e[3]]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const shiftEdges = (edges, dx, dy) => edges.map((e) => [e[0] + dx, e[1] + dy, e[2] + dx, e[3] + dy]);
function normEdges(edges) {
  const b = bboxOf(edges);
  return shiftEdges(edges, -b.x0, -b.y0);
}
function mirrorEdges(edges) {
  const b = bboxOf(edges);
  return normEdges(edges.map((e) => [b.x1 - e[0], e[1], b.x1 - e[2], e[3]]));
}
function rotEdges(edges) {
  const b = bboxOf(edges);
  return normEdges(edges.map((e) => [b.y1 - e[1], e[0], b.y1 - e[3], e[2]]));
}

function embedTarget(figKeys, target, W) {
  // true if every target edge, translated by some (dx, dy), lies in the figure
  const t = normEdges(target);
  for (let dx = 0; dx < W; dx++) {
    for (let dy = 0; dy < W; dy++) {
      if (t.every((e) => figKeys.has(ek(e[0] + dx, e[1] + dy, e[2] + dx, e[3] + dy)))) return true;
    }
  }
  return false;
}

function genTarget(r, k, diag) {
  const pool = latticeEdges(3, diag);
  for (let g = 0; g < 400; g++) {
    const set = new Map();
    const first = pick(r, pool);
    set.set(keyOfEdge(first), first);
    while (set.size < k) {
      const verts = new Set([...set.values()].flatMap((e) => [`${e[0]},${e[1]}`, `${e[2]},${e[3]}`]));
      const cand = pool.filter((e) => !set.has(keyOfEdge(e)) && (verts.has(`${e[0]},${e[1]}`) || verts.has(`${e[2]},${e[3]}`)));
      if (!cand.length) break;
      const e = pick(r, cand);
      set.set(keyOfEdge(e), e);
    }
    if (set.size !== k) continue;
    const edges = [...set.values()];
    const b = bboxOf(edges);
    if (b.x1 - b.x0 < 1 || b.y1 - b.y0 < 1 || Math.max(b.x1 - b.x0, b.y1 - b.y0) < 2) continue;
    // reject shapes that look the same mirrored (keeps flipped distractors meaningful)
    const mk = new Set(mirrorEdges(edges).map(keyOfEdge));
    if (normEdges(edges).every((e) => mk.has(keyOfEdge(e)))) continue;
    return normEdges(edges);
  }
  throw new Error('target generation failed');
}

// Grow a connected figure to exactly N edges starting from `embed`.
function growFigure(r, embed, N, W, diag, banned) {
  const set = new Set(embed.map(keyOfEdge));
  const pool = latticeEdges(W, diag);
  while (set.size < N) {
    const verts = new Set();
    for (const k of set) {
      const e = edgeOfKey(k);
      verts.add(`${e[0]},${e[1]}`);
      verts.add(`${e[2]},${e[3]}`);
    }
    const cand = pool.filter((e) => {
      const k = keyOfEdge(e);
      return !set.has(k) && !banned.has(k) && (verts.has(`${e[0]},${e[1]}`) || verts.has(`${e[2]},${e[3]}`));
    });
    if (!cand.length) return null;
    set.add(keyOfEdge(pick(r, cand)));
  }
  return set;
}

function renderLattice(edgeKeys, W) {
  const sp = 80 / (W - 1);
  const p = (v) => f2(10 + v * sp);
  const lines = [...edgeKeys]
    .sort()
    .map((k) => {
      const e = edgeOfKey(k);
      return `<line x1="${p(e[0])}" y1="${p(e[1])}" x2="${p(e[2])}" y2="${p(e[3])}"/>`;
    })
    .join('');
  return `<g ${LINE} stroke-width="3">${lines}</g>`;
}
const frame = '<rect class="f-none" x="1.5" y="1.5" width="97" height="97" rx="6" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>';

const E_CFG = {
  E1: { W: 4, diag: false, k: [3, 4], extra: 5, near: 2, mirror: 0, rot: 0, plain: 1 },
  E2: { W: 5, diag: true, k: [4, 5], extra: 8, near: 2, mirror: 1, rot: 0, plain: 1 },
  E3: { W: 5, diag: true, k: [5, 6], extra: 8, near: 2, mirror: 1, rot: 1, plain: 0 },
};

function genE(id, seed) {
  const cfg = E_CFG[id];
  const r = rng(`${id}#${seed}`);
  const { W, diag } = cfg;
  const target = genTarget(r, pick(r, cfg.k), diag);
  const N = target.length + cfg.extra;
  const place = (edges) => shiftEdges(edges, randInt(r, 0, W - 1 - bboxOf(edges).x1), randInt(r, 0, W - 1 - bboxOf(edges).y1));
  const all = latticeEdges(W, diag);

  const answerKeys = (() => {
    for (let g = 0; g < 200; g++) {
      const s = growFigure(r, place(target), N, W, diag, new Set());
      if (s) return s;
    }
    throw new Error('E answer failed');
  })();

  const kinds = [];
  for (let i = 0; i < cfg.near; i++) kinds.push('near');
  for (let i = 0; i < cfg.mirror; i++) kinds.push('mirror');
  for (let i = 0; i < cfg.rot; i++) kinds.push('rot');
  for (let i = 0; i < cfg.plain; i++) kinds.push('plain');
  const figs = [{ keys: answerKeys, kind: 'answer' }];
  const seen = new Set([[...answerKeys].sort().join('|')]);
  for (const kind of kinds) {
    let done = false;
    for (let g = 0; g < 400 && !done; g++) {
      let embed = [];
      const banned = new Set();
      if (kind === 'near') {
        const placed = place(target);
        const drop = pick(r, placed);
        const kept = placed.filter((e) => e !== drop);
        const verts = new Set([`${drop[0]},${drop[1]}`, `${drop[2]},${drop[3]}`]);
        const tk = new Set(placed.map(keyOfEdge));
        const alt = all.filter((e) => !tk.has(keyOfEdge(e)) && (verts.has(`${e[0]},${e[1]}`) || verts.has(`${e[2]},${e[3]}`)));
        embed = alt.length ? [...kept, pick(r, alt)] : kept;
        banned.add(keyOfEdge(drop));
      } else if (kind === 'mirror') embed = place(mirrorEdges(target));
      else if (kind === 'rot') embed = place(rotEdges(target));
      else embed = [pick(r, all)];
      const s = growFigure(r, embed, N, W, diag, banned);
      if (!s || embedTarget(s, target, W)) continue;
      const sig = [...s].sort().join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      figs.push({ keys: s, kind });
      done = true;
    }
    if (!done) throw new Error('E distractor failed');
  }
  const markups = figs.map((f) => svg('0 0 100 100', frame + renderLattice(f.keys, W), 'Figure made of line segments'));
  const stem = svg('0 0 100 100', frame + renderLattice(new Set(shiftEdgesCentered(target, W).map(keyOfEdge)), W), 'The shape to find');
  const base = baseOf(id, 'Which figure contains the shape on the left? It appears at the same size and the same way round, just with other lines added.', stem, figs.length === 4 ? 2 : 3);
  return finish(id, seed, base, markups[0], markups.slice(1), figs.map((f) => ({ kind: f.kind, edges: [...f.keys].sort() })), {
    W,
    target: target.map(keyOfEdge).sort(),
  });
}
function shiftEdgesCentered(target, W) {
  const b = bboxOf(target);
  const dx = Math.floor((W - 1 - b.x1) / 2);
  const dy = Math.floor((W - 1 - b.y1) / 2);
  return shiftEdges(target, dx, dy);
}

function explainE(m) {
  const k = m.target.length;
  const ans = m.optionInfo.find((o) => o.kind === 'answer');
  return `The shape is made of ${k} line segments. Only one figure contains all ${k} of them in exactly the same size and orientation (here it sits inside a figure of ${ans.edges.length} segments). In the others at least one segment is missing or bent, or the shape appears flipped or turned.`;
}

// ================================================================ Y: 3D mental rotation
// Polycubes built from straight arms (Shepard-Metzler style), drawn isometrically.
// Cubes are [x, y, z] with z up. The viewer looks from the +x, +y, +z corner.

const ROTS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const sg = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) m[i][p[i]] = sg[i];
      const det =
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      if (det === 1) out.push(m);
    }
  }
  return out;
})();
const applyRot = (m, c) => c.map(([x, y, z]) => [m[0][0] * x + m[0][1] * y + m[0][2] * z, m[1][0] * x + m[1][1] * y + m[1][2] * z, m[2][0] * x + m[2][1] * y + m[2][2] * z]);
const mirrorCubes = (cubes) => cubes.map(([x, y, z]) => [-x, y, z]);
function cubeKey(cubes) {
  const mx = Math.min(...cubes.map((c) => c[0])), my = Math.min(...cubes.map((c) => c[1])), mz = Math.min(...cubes.map((c) => c[2]));
  return cubes
    .map(([x, y, z]) => [x - mx, y - my, z - mz])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .map((c) => c.join(','))
    .join(';');
}
const canonCubes = (cubes) => ROTS.map((m) => cubeKey(applyRot(m, cubes))).sort()[0];

function buildArms(spec) {
  const seen = new Set(['0,0,0']);
  const cubes = [[0, 0, 0]];
  let p = [0, 0, 0];
  for (const a of spec) {
    for (let i = 0; i < a.len; i++) {
      p = p.slice();
      p[a.axis] += a.sign;
      const k = p.join(',');
      if (seen.has(k)) return null;
      seen.add(k);
      cubes.push(p);
    }
  }
  return cubes;
}

function randomSpec(r, total) {
  for (let g = 0; g < 500; g++) {
    const lens = [];
    let sum = 0;
    while (sum < total - 1) {
      const l = Math.min(randInt(r, 2, 3), total - 1 - sum);
      lens.push(l);
      sum += l;
    }
    if (lens.some((l) => l < 2) || lens.length < 3) continue;
    const spec = [];
    let prev = -1;
    for (const len of lens) {
      let axis;
      do axis = randInt(r, 0, 2); while (axis === prev);
      prev = axis;
      spec.push({ axis, sign: r() < 0.5 ? -1 : 1, len });
    }
    if (new Set(spec.map((a) => a.axis)).size < 3) continue;
    const cubes = buildArms(spec);
    if (!cubes) continue;
    if (canonCubes(cubes) === canonCubes(mirrorCubes(cubes))) continue; // must be chiral
    return { spec, cubes };
  }
  throw new Error('object generation failed');
}

function mutateArm(r, spec) {
  for (let g = 0; g < 100; g++) {
    const i = randInt(r, 1, spec.length - 1);
    const axis = randInt(r, 0, 2), sign = r() < 0.5 ? -1 : 1;
    if (axis === spec[i].axis && sign === spec[i].sign) continue;
    if (axis === spec[i - 1].axis || (spec[i + 1] && axis === spec[i + 1].axis)) continue;
    const s2 = spec.map((a, j) => (j === i ? { ...a, axis, sign } : a));
    const cubes = buildArms(s2);
    if (cubes) return cubes;
  }
  return null;
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const nbrs = (c, set) => DIRS.filter((d) => set.has(`${c[0] + d[0]},${c[1] + d[1]},${c[2] + d[2]}`)).length;
function moveCube(r, cubes) {
  const set = new Set(cubes.map((c) => c.join(',')));
  for (let g = 0; g < 100; g++) {
    const ends = cubes.filter((c) => nbrs(c, set) === 1);
    const e = pick(r, ends);
    const rest = cubes.filter((c) => c !== e);
    const rs = new Set(rest.map((c) => c.join(',')));
    const cand = [];
    for (const c of rest) {
      for (const d of DIRS) {
        const n = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
        const k = n.join(',');
        if (!rs.has(k) && k !== e.join(',')) cand.push(n);
      }
    }
    if (cand.length) return [...rest, pick(r, cand)];
  }
  return null;
}

// Isometric rendering through unit triangles. Lattice point (x,y,z) -> (x - y, x + y - 2z);
// screen x = P0 * cos30 * u, y = P1 * u / 2. Each face is two lattice triangles; the nearest
// face (largest x+y+z) wins each triangle, so nothing overlaps and no hidden face is drawn.
function isoRender(cubes) {
  const occ = new Set(cubes.map((c) => c.join(',')));
  const has = (x, y, z) => occ.has(`${x},${y},${z}`);
  const best = new Map();
  cubes.forEach(([i, j, k], ci) => {
    const s = i - j, t = i + j - 2 * k, depth = i + j + k;
    const faces = [];
    if (!has(i, j, k + 1)) faces.push(['top', [[s, t - 2], [s + 1, t - 1], [s, t]], [[s, t - 2], [s, t], [s - 1, t - 1]]]);
    if (!has(i + 1, j, k)) faces.push(['right', [[s + 1, t + 1], [s, t + 2], [s, t]], [[s + 1, t + 1], [s, t], [s + 1, t - 1]]]);
    if (!has(i, j + 1, k)) faces.push(['left', [[s - 1, t + 1], [s, t + 2], [s, t]], [[s - 1, t + 1], [s, t], [s - 1, t - 1]]]);
    for (const [shade, ...tris] of faces) {
      tris.forEach((pts, ti) => {
        const id = pts.map((p) => p.join(',')).sort().join('|');
        const cur = best.get(id);
        if (!cur || depth > cur.depth) best.set(id, { depth, face: `${ci}:${shade}`, shade, pts, ci, ti });
      });
    }
  });
  return best;
}

function isoGeometry(cubes) {
  const best = isoRender(cubes);
  const visible = new Set([...best.values()].map((t) => t.ci));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const t of best.values()) for (const [a, b] of t.pts) {
    const X = a * 0.8660254, Y = b * 0.5;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  return { best, visible, x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

function isoSvg(cubes, geo, u, label) {
  const { best } = geo;
  const ox = 50 - ((geo.x0 + geo.x1) / 2) * u, oy = 50 - ((geo.y0 + geo.y1) / 2) * u;
  const P = ([a, b]) => `${f2(ox + a * 0.8660254 * u)},${f2(oy + b * 0.5 * u)}`;
  // fills, grouped by face
  const byFace = new Map();
  for (const t of best.values()) {
    if (!byFace.has(t.face)) byFace.set(t.face, []);
    byFace.get(t.face).push(t);
  }
  let fills = '';
  for (const [, ts] of [...byFace.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const shade = ts[0].shade;
    if (shade === 'top') continue;
    let pts;
    if (ts.length === 2) {
      const [a, b] = ts.sort((p, q) => p.ti - q.ti);
      // quad: triangle A (a0,a1,a2) + triangle B shares the diagonal a0,a2
      const t0 = a.pts, t1 = b.pts;
      const shared = t0.filter((p) => t1.some((q) => q.join() === p.join()));
      const aOnly = t0.find((p) => !shared.some((q) => q.join() === p.join()));
      const bOnly = t1.find((p) => !shared.some((q) => q.join() === p.join()));
      pts = [aOnly, shared[0], bOnly, shared[1]];
    } else pts = ts[0].pts;
    const cls = shade === 'left' ? 'class="f-grey" fill-opacity="0.7"' : 'class="f-solid" fill-opacity="0.42"';
    fills += `<polygon ${cls} stroke="none" points="${pts.map(P).join(' ')}"/>`;
  }
  // outlines: every triangle edge owned by one winning triangle or by two different faces
  const edges = new Map();
  for (const t of best.values()) {
    for (let i = 0; i < 3; i++) {
      const a = t.pts[i], b = t.pts[(i + 1) % 3];
      const k = [a.join(','), b.join(',')].sort().join('|');
      if (!edges.has(k)) edges.set(k, { a, b, owners: [] });
      edges.get(k).owners.push(t.face);
    }
  }
  let d = '';
  for (const e of [...edges.entries()].sort((p, q) => (p[0] < q[0] ? -1 : 1)).map((x) => x[1])) {
    if (e.owners.length === 1 || e.owners[0] !== e.owners[1]) d += `M${P(e.a)}L${P(e.b)}`;
  }
  return svg('0 0 100 100', `<g ${LINE}>${fills}<path class="f-none" d="${d}" stroke-width="1.7"/></g>`, label);
}

const Y_CFG = {
  Y1: { total: 8, options: 4, mirror: 1, rotKind: 'spin', mutate: ['arm'] },
  Y2: { total: 9, options: 4, mirror: 1, rotKind: 'any', mutate: ['arm'] },
  Y3: { total: 10, options: 5, mirror: 1, rotKind: 'any', mutate: ['arm', 'cube'] },
  Y4: { total: 11, options: 5, mirror: 1, rotKind: 'any', mutate: ['cube'] },
};

function pickView(r, cubes, rotKind, avoidKeys) {
  const pool = rotKind === 'spin' ? ROTS.filter((m) => m[2][0] === 0 && m[2][1] === 0) : ROTS;
  const cands = [];
  for (const m of shuffle(r, pool)) {
    const c = applyRot(m, cubes);
    const geo = isoGeometry(c);
    if (geo.visible.size !== c.length) continue;
    const k = JSON.stringify([...geo.best.keys()].sort());
    if (avoidKeys.has(k)) continue;
    cands.push({ cubes: c, geo, renderKey: k, size: Math.max(geo.w, geo.h) });
    if (cands.length >= 12) break;
  }
  if (!cands.length) return null;
  // prefer compact views so every option can be drawn at a readable scale
  cands.sort((a, b) => a.size - b.size);
  return pick(r, cands.slice(0, Math.max(1, Math.ceil(cands.length / 2))));
}

function genY(id, seed) {
  const cfg = Y_CFG[id];
  const r = rng(`${id}#${seed}`);
  for (let attempt = 0; attempt < 60; attempt++) {
    const { spec, cubes } = randomSpec(r, cfg.total);
    const classes = new Set([canonCubes(cubes)]);
    const mir = mirrorCubes(cubes);
    classes.add(canonCubes(mir));
    const variants = [{ kind: 'answer', cubes }, { kind: 'mirror', cubes: mir }];
    let ok = true;
    for (let i = 0; i < cfg.options - 2 && ok; i++) {
      let got = null;
      for (let g = 0; g < 60 && !got; g++) {
        const mk = pick(r, cfg.mutate);
        const c = mk === 'arm' ? mutateArm(r, spec) : moveCube(r, cubes);
        if (!c || c.length !== cubes.length) continue;
        const cc = canonCubes(c);
        if (classes.has(cc)) continue;
        classes.add(cc);
        got = { kind: 'different', how: mk, cubes: c };
      }
      if (!got) ok = false;
      else variants.push(got);
    }
    if (!ok) continue;
    // views
    const used = new Set();
    const stemView = pickView(r, cubes, cfg.rotKind === 'spin' ? 'spin' : 'any', used);
    if (!stemView) continue;
    used.add(stemView.renderKey);
    const views = [];
    for (const v of variants) {
      const view = pickView(r, v.cubes, cfg.rotKind, used);
      if (!view) { ok = false; break; }
      used.add(view.renderKey);
      views.push(view);
    }
    if (!ok) continue;
    const all = [stemView, ...views];
    const maxW = Math.max(...all.map((v) => v.geo.w)), maxH = Math.max(...all.map((v) => v.geo.h));
    const u = Math.min(84 / maxW, 84 / maxH, 13);
    const label = `Object made of ${cfg.total} cubes`;
    const markups = views.map((v) => isoSvg(v.cubes, v.geo, u, label));
    if (new Set(markups).size !== markups.length) continue;
    const stem = isoSvg(stemView.cubes, stemView.geo, u, label);
    if (markups.includes(stem)) continue;
    const base = baseOf(id, 'Which option shows the same object as the one on the left, turned to a different position? Mirror images and different objects do not count.', stem, cfg.options === 4 ? 2 : 3);
    return finish(id, seed, base, markups[0], markups.slice(1), variants.map((v, i) => ({ kind: v.kind, how: v.how, cubes: views[i].cubes })), {
      stemCubes: stemView.cubes,
      cubeCount: cfg.total,
      spec,
    });
  }
  throw new Error(`${id}: could not generate seed ${seed}`);
}

function explainY(m) {
  const n = m.cubeCount;
  return `Each object is made of ${n} cubes joined in arms with turns between them. The correct option can be turned (rotated, never flipped) to match the original. One option is its mirror image, which no rotation can match, and the rest differ in how the arms or single cubes are arranged.`;
}

// ================================================================ W: gears & directions

const GEAR_K = 2.6; // pitch radius per tooth
const TOOTH = 3.2; // half tooth depth

function gearPoints(cx, cy, n, r, phase) {
  const p = (2 * Math.PI) / n;
  const pts = [];
  for (let m = 0; m < n; m++) {
    const th = phase + m * p;
    for (const [rad, off] of [[r - TOOTH, -0.27], [r + TOOTH, -0.14], [r + TOOTH, 0.14], [r - TOOTH, 0.27]]) {
      const a = th + off * p;
      pts.push(`${f2(cx + rad * Math.cos(a))},${f2(cy + rad * Math.sin(a))}`);
    }
  }
  return pts.join(' ');
}

// Curved arrow around a gear centre. cw = true draws a clockwise arc.
function turnArrow(cx, cy, R, cw) {
  const a0 = cw ? 200 : 340, a1 = cw ? 340 : 200; // screen angles, 0 = east, clockwise positive
  const pt = (a, rad = R) => [cx + rad * Math.cos((a * Math.PI) / 180), cy + rad * Math.sin((a * Math.PI) / 180)];
  const [sx, sy] = pt(a0), [ex, ey] = pt(a1);
  const t = cw ? 1 : -1; // tangent direction sign at the end of the arc
  const ang = (a1 * Math.PI) / 180;
  const tx = -Math.sin(ang) * t, ty = Math.cos(ang) * t, nx = Math.cos(ang), ny = Math.sin(ang);
  const tip = [ex + tx * 7, ey + ty * 7];
  const b1 = [ex + nx * 4.5, ey + ny * 4.5], b2 = [ex - nx * 4.5, ey - ny * 4.5];
  return (
    `<path class="f-none" d="M${f2(sx)} ${f2(sy)}A${f2(R)} ${f2(R)} 0 0 ${cw ? 1 : 0} ${f2(ex)} ${f2(ey)}" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>` +
    `<polygon class="f-solid" points="${[tip, b1, b2].map((p) => `${f2(p[0])},${f2(p[1])}`).join(' ')}" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>`
  );
}

// gears: [{cx, cy, n, r, label}], meshes: [[i, j]] (all horizontal), rods: [[i, j]] (vertical)
function gearSvg(gears, meshes, rods, firstCw, label) {
  // propagate tooth phases along meshes so teeth interlock
  const phase = gears.map(() => null);
  phase[0] = 0;
  const adj = gears.map(() => []);
  for (const [i, j] of meshes) { adj[i].push(j); adj[j].push(i); }
  for (const [i, j] of rods) { adj[i].push(j); adj[j].push(i); }
  const q = [0];
  const meshSet = new Set(meshes.map(([i, j]) => `${i}-${j}`).concat(meshes.map(([i, j]) => `${j}-${i}`)));
  while (q.length) {
    const i = q.shift();
    for (const j of adj[i]) {
      if (phase[j] !== null) continue;
      if (meshSet.has(`${i}-${j}`)) {
        const A = gears[i], B = gears[j];
        const psi = Math.atan2(B.cy - A.cy, B.cx - A.cx);
        const pA = (2 * Math.PI) / A.n, pB = (2 * Math.PI) / B.n;
        const fA = mod((psi - phase[i]) / pA, 1);
        const fB = mod(fA + 0.5, 1);
        phase[j] = psi + Math.PI - fB * pB;
      } else phase[j] = 0.3;
      q.push(j);
    }
  }
  const x0 = Math.min(...gears.map((g) => g.cx - g.r - TOOTH)) - 6;
  const x1 = Math.max(...gears.map((g) => g.cx + g.r + TOOTH)) + 6;
  const y0 = Math.min(...gears.map((g) => g.cy - g.r - TOOTH)) - 6;
  const y1 = Math.max(...gears.map((g) => g.cy + g.r + TOOTH)) + 6;
  let body = gears.map((g, i) => `<polygon class="f-none" points="${gearPoints(g.cx, g.cy, g.n, g.r, phase[i])}"/>`).join('');
  body += rods.map(([i, j]) => `<line x1="${f2(gears[i].cx)}" y1="${f2(gears[i].cy)}" x2="${f2(gears[j].cx)}" y2="${f2(gears[j].cy)}" stroke-width="6" stroke-linecap="butt"/>`).join('');
  body += gears.map((g) => `<circle class="f-grey" cx="${f2(g.cx)}" cy="${f2(g.cy)}" r="10"/>`).join('');
  body += turnArrow(gears[0].cx, gears[0].cy, Math.max(16, gears[0].r * 0.62), firstCw);
  body += gears
    .map((g, i) => `<text x="${f2(g.cx)}" y="${f2(g.cy + 0.5)}" font-size="13" font-weight="700" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central" stroke="none">${i + 1}</text>`)
    .join('');
  const W = x1 - x0, H = y1 - y0;
  return svg(`${f2(x0)} ${f2(y0)} ${f2(W)} ${f2(H)}`, `<g ${LINE} stroke-width="2.4">${body}</g>`, label);
}

// direction of every gear: true = same as gear 0
function gearSigns(count, meshes, rods, rodFlips = false) {
  const adj = Array.from({ length: count }, () => []);
  for (const [i, j] of meshes) { adj[i].push([j, -1]); adj[j].push([i, -1]); }
  for (const [i, j] of rods) { const s = rodFlips ? -1 : 1; adj[i].push([j, s]); adj[j].push([i, s]); }
  const sign = new Array(count).fill(0);
  sign[0] = 1;
  const q = [0];
  while (q.length) {
    const i = q.shift();
    for (const [j, s] of adj[i]) if (!sign[j]) { sign[j] = sign[i] * s; q.push(j); }
  }
  return sign;
}

const listText = (idx) => idx.map((i) => i + 1).join(', ');
const DIRNAME = { true: 'clockwise', false: 'anticlockwise' };

function gearOptions(r, count, answerIdx, extras) {
  const key = (a) => a.join(',');
  const ans = answerIdx.slice().sort((a, b) => a - b);
  const seen = new Set([key(ans)]);
  const out = [];
  const add = (a) => {
    const s = [...new Set(a)].sort((x, y) => x - y);
    if (!s.length || seen.has(key(s))) return;
    seen.add(key(s));
    out.push(s);
  };
  extras.forEach(add);
  for (let g = 0; g < 200 && out.length < 8; g++) {
    const s = new Set(ans);
    const k = randInt(r, 0, count - 1);
    if (s.has(k)) s.delete(k); else s.add(k);
    add([...s]);
  }
  return { ans, distractors: out };
}

function genW12(id, seed) {
  const r = rng(`${id}#${seed}`);
  const firstCw = r() < 0.5;
  const askCw = r() < 0.5;
  let gears, meshes, rods = [];
  if (id === 'W1') {
    const count = randInt(r, 4, 5);
    const ns = Array.from({ length: count }, () => pick(r, [8, 10, 12, 14]));
    let x = 0;
    gears = ns.map((n, i) => {
      const rad = n * GEAR_K;
      x += i === 0 ? rad : ns[i - 1] * GEAR_K + rad;
      return { cx: x, cy: 0, n, r: rad };
    });
    const maxR = Math.max(...gears.map((g) => g.r));
    gears.forEach((g) => (g.cy = maxR + 10));
    meshes = gears.slice(1).map((_, i) => [i, i + 1]);
  } else {
    const n = 10, rad = n * GEAR_K, gap = 24;
    const top = randInt(r, 3, 4);
    const total = randInt(r, 5, 6);
    const bottom = total - top;
    const c0 = randInt(r, 0, Math.max(0, top - 1)); // first bottom column
    const cols = [];
    for (let c = 0; c < top; c++) cols.push([c, 0]);
    for (let c = c0; c < c0 + bottom; c++) cols.push([c, 1]);
    gears = cols.map(([c, row]) => ({ cx: rad + c * 2 * rad, cy: rad + row * (2 * rad + gap), n, r: rad }));
    meshes = [];
    for (let i = 0; i < top - 1; i++) meshes.push([i, i + 1]);
    for (let i = top; i < total - 1; i++) meshes.push([i, i + 1]);
    const overlap = [];
    for (let c = c0; c < Math.min(top, c0 + bottom); c++) overlap.push(c);
    const col = pick(r, overlap);
    rods = [[col, top + (col - c0)]];
  }
  const count = gears.length;
  const sign = gearSigns(count, meshes, rods);
  const dirOf = (i) => (sign[i] === 1 ? firstCw : !firstCw);
  const answerIdx = [...Array(count).keys()].filter((i) => dirOf(i) === askCw);
  // distractors from typical slips
  const comp = [...Array(count).keys()].filter((i) => !answerIdx.includes(i));
  const extras = [comp];
  if (id === 'W1') {
    extras.push([...Array(count).keys()]);
    extras.push(answerIdx.slice(0, -1).length ? answerIdx.slice(0, -1) : []);
    extras.push([...answerIdx, count - 1]);
  } else {
    const sFlip = gearSigns(count, meshes, rods, true);
    extras.push([...Array(count).keys()].filter((i) => (sFlip[i] === 1 ? firstCw : !firstCw) === askCw)); // rod treated as a mesh
    extras.push([...Array(count).keys()].filter((i) => ((i % 2 === 0) ? firstCw : !firstCw) === askCw)); // alternate by number
    extras.push(answerIdx.includes(rods[0][1]) ? answerIdx.filter((i) => i !== rods[0][1]) : [...answerIdx, rods[0][1]]);
  }
  const optN = id === 'W1' ? 4 : 5;
  const { ans, distractors } = gearOptions(r, count, answerIdx, extras);
  const dists = distractors.slice(0, optN - 1);
  const mk = (a) => textSvg(listText(a), 24, `Gears ${listText(a)}`.replace(/\s+/g, ' ')).replace('viewBox="0 0 100 60"', 'viewBox="0 0 150 60"').replace('x="50"', 'x="75"');
  const label = `Gears 1 to ${count} in a chain, gear 1 turning ${DIRNAME[firstCw]}`;
  const stem = gearSvg(gears, meshes, rods, firstCw, label);
  const rodNote = rods.length ? ' Gears joined by a thick rod share one axle and turn together.' : '';
  const prompt = `Gear 1 turns ${DIRNAME[firstCw]}, as the arrow shows. Gears that touch teeth drive each other.${rodNote} Which gears turn ${DIRNAME[askCw]}?`;
  const base = baseOf(id, prompt, stem, optN === 4 ? 2 : 3);
  return finish(id, seed, base, mk(ans), dists.map(mk), [ans, ...dists].map((a) => ({ set: a.map((i) => i + 1) })), {
    count,
    firstCw,
    askCw,
    answer: ans.map((i) => i + 1),
    rods: rods.map(([i, j]) => [i + 1, j + 1]),
    meshes: meshes.map(([i, j]) => [i + 1, j + 1]),
  });
}

function explainW12(id, m) {
  const dir = DIRNAME[m.askCw];
  const first = DIRNAME[m.firstCw];
  const rod = m.rods.length ? ` Gears ${m.rods[0][0]} and ${m.rods[0][1]} sit on one axle, so they turn the same way instead of opposite ways.` : '';
  return `Gears that mesh turn in opposite directions, so the direction flips at every contact; gear 1 turns ${first}.${rod} The gears turning ${dir} are ${m.answer.join(', ')}.`;
}

// ---- W3: route with turns

const HEAD = [[0, 1, 'north'], [1, 0, 'east'], [0, -1, 'south'], [-1, 0, 'west']];
function walk(legs) {
  let h = 0, x = 0, y = 0;
  legs.forEach((l, i) => {
    if (i > 0) h = mod(h + (l.turn === 'right' ? 1 : -1), 4);
    x += HEAD[h][0] * l.dist;
    y += HEAD[h][1] * l.dist;
  });
  return [x, y];
}
const posText = ([x, y]) => [`${Math.abs(x)} ${x > 0 ? 'east' : 'west'}`, `${Math.abs(y)} ${y > 0 ? 'north' : 'south'}`];

function compassSvg() {
  const body =
    '<circle class="f-none" cx="60" cy="60" r="34" stroke-width="2.4"/>' +
    '<line x1="60" y1="26" x2="60" y2="94" stroke-width="1.2" stroke-opacity="0.35"/><line x1="26" y1="60" x2="94" y2="60" stroke-width="1.2" stroke-opacity="0.35"/>' +
    '<polygon class="f-solid" points="60,34 52,56 68,56" stroke-width="1.5"/>' +
    '<circle class="f-solid" cx="60" cy="66" r="3.5" stroke-width="1"/>' +
    ['N', 'E', 'S', 'W']
      .map((t, i) => {
        const a = (i * Math.PI) / 2;
        return `<text x="${f2(60 + 48 * Math.sin(a))}" y="${f2(60 - 48 * Math.cos(a))}" font-size="14" font-weight="700" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central" stroke="none">${t}</text>`;
      })
      .join('');
  return svg('0 0 120 120', `<g ${LINE} stroke-width="2">${body}</g>`, 'Compass: north at the top, east on the right. You start in the middle facing north.');
}

function genW3(seed) {
  const id = 'W3';
  const r = rng(`${id}#${seed}`);
  let legs, pos;
  for (let g = 0; g < 500; g++) {
    legs = Array.from({ length: 4 }, (_, i) => ({ turn: i === 0 ? null : r() < 0.5 ? 'left' : 'right', dist: randInt(r, 1, 5) }));
    pos = walk(legs);
    if (pos[0] !== 0 && pos[1] !== 0) break;
  }
  const [dx, dy] = pos;
  const swapped = walk(legs.map((l) => ({ ...l, turn: l.turn && (l.turn === 'left' ? 'right' : 'left') })));
  const cand = [swapped, [-dx, -dy], [dy, dx], [dx + 1, dy], [dx - 1, dy], [dx, dy + 1], [dx, dy - 1], walk(legs.slice(0, 3))];
  const key = (p) => p.join(',');
  const seen = new Set([key(pos)]);
  const dists = [];
  for (const c of cand) {
    if (!c[0] || !c[1] || seen.has(key(c))) continue;
    seen.add(key(c));
    dists.push(c);
  }
  const chosen = [...dists.slice(0, 2), ...shuffle(r, dists.slice(2)).slice(0, 2)];
  const mk = (p) => textSvg(posText(p), 20, `${posText(p).join(' and ')} of the start`);
  const text = legs.map((l, i) => (i === 0 ? `Walk ${l.dist} step${l.dist > 1 ? 's' : ''} forward.` : `Turn ${l.turn} and walk ${l.dist} step${l.dist > 1 ? 's' : ''}.`)).join(' ');
  const prompt = `You stand at the centre of the compass, facing north. ${text} Where are you now, compared with your starting point?`;
  const base = baseOf(id, prompt, compassSvg(), 3);
  return finish(id, seed, base, mk(pos), chosen.map(mk), [pos, ...chosen].map((p) => ({ pos: p })), { legs, pos });
}

function explainW3(m) {
  const t = posText(m.pos);
  return `Track your heading after every turn and add up the steps: ${m.legs.map((l) => `${l.turn ? l.turn + ', ' : ''}${l.dist}`).join('; ')}. The east-west total is ${t[0]} and the north-south total is ${t[1]}.`;
}

// ================================================================ Z: domino sequences

function halfValue(spec, v0, i) {
  let v = v0;
  for (let k = 0; k < i; k++) {
    const d = spec.type === 'const' ? spec.d : spec.type === 'alt' ? (k % 2 === 0 ? spec.d1 : spec.d2) : spec.d + spec.g * k;
    v = mod(v + d, 7);
  }
  return v;
}
const stepText = (d) => (mod(d, 7) <= 3 ? `+${mod(d, 7)}` : `-${7 - mod(d, 7)}`);
function specText(s) {
  if (s.type === 'const') return s.d === 0 ? 'stays the same' : `changes by ${stepText(s.d)} each time`;
  if (s.type === 'alt') return `alternates between ${stepText(s.d1)} and ${stepText(s.d2)}`;
  return `changes by ${stepText(s.d)}, then ${stepText(s.d + s.g)}, then ${stepText(s.d + 2 * s.g)} and so on (the step grows by ${s.g > 0 ? '+' : '-'}${Math.abs(s.g)} each time)`;
}

const PIPS = {
  0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};
function dominoG(a, b, ox) {
  let s = `<rect class="f-none" x="${ox + 4}" y="4" width="32" height="62" rx="5"/><line x1="${ox + 8}" y1="35" x2="${ox + 32}" y2="35" stroke-width="1.8"/>`;
  [[a, 19.5], [b, 50.5]].forEach(([n, cy]) => {
    for (const [px, py] of PIPS[n]) s += `<circle class="f-solid" cx="${f2(ox + 20 + px * 8)}" cy="${f2(cy + py * 8)}" r="3.3" stroke-width="1"/>`;
  });
  return s;
}
const dominoSvg = (a, b) => svg('0 0 40 70', `<g ${LINE} stroke-width="2.4">${dominoG(a, b, 0)}</g>`, `Domino with ${a} pips above and ${b} below`);
function dominoRowSvg(doms, label) {
  const n = doms.length;
  let s = doms.map(([a, b], i) => dominoG(a, b, i * 40)).join('');
  s += `<rect class="f-none" x="${n * 40 + 4}" y="4" width="32" height="62" rx="5" stroke-dasharray="5 4"/>` +
    `<text x="${n * 40 + 20}" y="36" font-size="28" font-weight="600" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central" stroke="none">?</text>`;
  return svg(`0 0 ${(n + 1) * 40} 70`, `<g ${LINE} stroke-width="2.4">${s}</g>`, label);
}

const signedStep = (r, mags) => pick(r, mags) * (r() < 0.5 ? -1 : 1);

function genZ(id, seed) {
  const r = rng(`${id}#${seed}`);
  let top, bot, shown;
  if (id === 'Z1') {
    shown = 5;
    const mover = signedStep(r, [1, 2, 3]);
    const moveTop = r() < 0.5;
    top = { type: 'const', d: moveTop ? mover : 0 };
    bot = { type: 'const', d: moveTop ? 0 : mover };
  } else if (id === 'Z2') {
    shown = 5;
    let d1, d2;
    do { d1 = signedStep(r, [1, 2, 3]); d2 = signedStep(r, [1, 2, 3]); } while (mod(d1, 7) === mod(d2, 7));
    top = { type: 'const', d: d1 };
    bot = { type: 'const', d: d2 };
  } else {
    shown = 6;
    let d1, d2;
    do { d1 = signedStep(r, [1, 2, 3]); d2 = signedStep(r, [1, 2, 3]); } while (mod(d1, 7) === mod(d2, 7));
    top = { type: 'alt', d1, d2 };
    let d, g;
    do { d = signedStep(r, [1, 2]); g = r() < 0.5 ? -1 : 1; } while ([0, 1, 2, 3, 4].some((k) => mod(d + g * k, 7) === 0));
    bot = { type: 'grow', d, g };
  }
  const v0 = [randInt(r, 0, 6), randInt(r, 0, 6)];
  const seq = Array.from({ length: shown + 1 }, (_, i) => [halfValue(top, v0[0], i), halfValue(bot, v0[1], i)]);
  const ans = seq[shown];
  const prev = seq[shown - 1];
  const wrongTop = id === 'Z3' ? mod(prev[0] + (shown % 2 === 0 ? top.d2 : top.d1), 7) : mod(ans[0] + 1, 7);
  const wrongBot = id === 'Z3' ? mod(prev[1] + bot.d + bot.g * (shown - 2), 7) : mod(ans[1] - 1, 7);
  const cand = [
    [wrongTop, ans[1]], [ans[0], wrongBot], [mod(ans[0] + 1, 7), ans[1]], [mod(ans[0] - 1, 7), ans[1]],
    [ans[0], mod(ans[1] + 1, 7)], [ans[0], mod(ans[1] - 1, 7)], [mod(ans[0] + 1, 7), mod(ans[1] + 1, 7)],
    [mod(ans[0] - 1, 7), mod(ans[1] - 1, 7)], prev, [wrongTop, wrongBot],
  ];
  const ukey = (d) => (d[0] < d[1] ? `${d[0]}-${d[1]}` : `${d[1]}-${d[0]}`);
  const seen = new Set([ukey(ans)]);
  const dists = [];
  const mustSeen = new Set(seq.slice(0, shown).map(ukey));
  for (const c of cand) {
    if (seen.has(ukey(c))) continue;
    seen.add(ukey(c));
    dists.push(c);
  }
  void mustSeen;
  const chosen = dists.slice(0, 4);
  const stem = dominoRowSvg(seq.slice(0, shown), `Row of ${shown} dominoes followed by a question mark`);
  const base = baseOf(id, 'Each domino follows the same rules as the ones before it. Pips run from 0 to 6 and wrap around (…5, 6, 0, 1…). Which domino comes next? Dominoes always stay the same way up.', stem, 5);
  return finish(id, seed, base, dominoSvg(...ans), chosen.map((d) => dominoSvg(...d)), [ans, ...chosen].map((d) => ({ domino: d })), {
    top, bottom: bot, start: v0, shown, seq: seq.slice(0, shown), next: ans,
  });
}

function explainZ(m) {
  return `The top half ${specText(m.top)}, and the bottom half ${specText(m.bottom)}; pips wrap from 6 to 0. After ${m.seq[m.seq.length - 1].join(' over ')} the next domino is ${m.next[0]} over ${m.next[1]}.`;
}

// ================================================================ J: clocks and calendar

const MIN12 = 720;
const clockTime = (t) => { const m = mod(t, MIN12); const h = Math.floor(m / 60); return `${h === 0 ? 12 : h}:${String(m % 60).padStart(2, '0')}`; };

function clockInner(t, ox = 0, oy = 0) {
  const m = mod(t, MIN12);
  const hAng = (m / MIN12) * 360, mAng = ((m % 60) / 60) * 360;
  const P = (L, a) => `${f2(50 + ox + L * Math.sin((a * Math.PI) / 180))}`;
  const Q = (L, a) => `${f2(50 + oy - L * Math.cos((a * Math.PI) / 180))}`;
  let s = `<circle class="f-none" cx="${50 + ox}" cy="${50 + oy}" r="45" stroke-width="2.6"/>`;
  for (let i = 0; i < 12; i++) {
    const a = i * 30, big = i % 3 === 0, top = i === 0;
    s += `<line x1="${P(top ? 31 : big ? 34 : 38, a)}" y1="${Q(top ? 31 : big ? 34 : 38, a)}" x2="${P(42, a)}" y2="${Q(42, a)}" stroke-width="${top ? 5 : big ? 3.4 : 1.6}"/>`;
  }
  s += `<line x1="${50 + ox}" y1="${50 + oy}" x2="${P(35, mAng)}" y2="${Q(35, mAng)}" stroke-width="3"/>`;
  s += `<line x1="${50 + ox}" y1="${50 + oy}" x2="${P(22, hAng)}" y2="${Q(22, hAng)}" stroke-width="6"/>`;
  s += `<circle class="f-solid" cx="${50 + ox}" cy="${50 + oy}" r="3.2" stroke-width="1"/>`;
  return s;
}
const clockSvg = (t, label) => svg('0 0 100 100', `<g ${LINE}>${clockInner(t)}</g>`, label || `Analog clock showing ${clockTime(t)}`);
function clockGridSvg(times) {
  let s = '';
  times.forEach((t, i) => { s += clockInner(t, (i % 3) * 110, Math.floor(i / 3) * 110); });
  const i = times.length;
  s += `<circle class="f-none" cx="${50 + (i % 3) * 110}" cy="${50 + Math.floor(i / 3) * 110}" r="45" stroke-dasharray="6 5" stroke-width="2.6"/>` +
    `<text x="${50 + (i % 3) * 110}" y="${52 + Math.floor(i / 3) * 110}" font-size="40" font-weight="600" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central" stroke="none">?</text>`;
  return svg('0 0 320 210', `<g ${LINE}>${s}</g>`, `Clocks showing ${times.map(clockTime).join(', ')} and then a question mark`);
}

function clockOptions(id, seed, r, times, answerT, pool, prompt, meta, label) {
  const seen = new Set([mod(answerT, MIN12)]);
  const dists = [];
  for (const c of pool) {
    const k = mod(c, MIN12);
    if (seen.has(k)) continue;
    seen.add(k);
    dists.push(k);
  }
  for (let g = 0; dists.length < 4 && g < 100; g++) {
    const k = mod(answerT + 5 * randInt(r, -24, 24), MIN12);
    if (!seen.has(k)) { seen.add(k); dists.push(k); }
  }
  const chosen = dists.slice(0, 4);
  const mk = (t) => clockSvg(t);
  const base = baseOf(id, prompt, clockGridSvg(times), 5);
  return finish(id, seed, base, mk(answerT), chosen.map(mk), [answerT, ...chosen].map((t) => ({ minutes: mod(t, MIN12) })), { ...meta, times: times.map((t) => mod(t, MIN12)), answer: mod(answerT, MIN12), label });
}

function genJ1(seed) {
  const r = rng(`J1#${seed}`);
  const I = pick(r, [20, 25, 35, 40, 50, 55, 65, 70, 80, 85, 95, 110]);
  const t0 = 5 * randInt(r, 0, 143);
  const times = Array.from({ length: 5 }, (_, i) => t0 + I * i);
  const ans = t0 + I * 5;
  const pool = [times[4] + I + 5, times[4] + I - 5, ans + 60, ans - 60, MIN12 - mod(ans, MIN12), ans + I];
  return clockOptions('J1', seed, r, times, ans, pool, 'The clocks follow a rule. Which clock comes next? (Hour and minute hands both matter.)', { interval: I });
}

function genJ3(seed) {
  const r = rng(`J3#${seed}`);
  const I0 = pick(r, [5, 10, 15, 20]);
  const g = pick(r, [5, 10, 15]);
  const t0 = 5 * randInt(r, 0, 143);
  const times = [t0];
  for (let i = 0; i < 4; i++) times.push(times[i] + I0 + g * i);
  const I4 = I0 + 4 * g;
  const ans = times[4] + I4;
  const pool = [times[4] + I4 - g, times[4] + I4 + g, ans + 60, ans - 60, MIN12 - mod(ans, MIN12)];
  return clockOptions('J3', seed, r, times, ans, pool, 'The time between one clock and the next changes by the same amount each step. Which clock comes next?', { start: I0, growth: g, nextInterval: I4 });
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function genJ2(seed) {
  const r = rng(`J2#${seed}`);
  const form = pick(r, ['ahead', 'date', 'relative']);
  const d0 = randInt(r, 0, 6);
  let text, ans, N, wrongs, extra = {};
  if (form === 'ahead') {
    do N = randInt(r, 30, 400); while (N % 7 === 0);
    ans = mod(d0 + N, 7);
    text = `Today is ${DAYS[d0]}. What day of the week will it be in ${N} days?`;
    wrongs = [ans + 1, ans - 1, mod(d0 - N, 7), d0 + Math.floor(N / 7)];
  } else if (form === 'date') {
    let a, b;
    do { a = randInt(r, 1, 9); b = randInt(r, 18, 30); } while ((b - a) % 7 === 0);
    N = b - a;
    ans = mod(d0 + N, 7);
    text = `In a certain month the ${a}${a === 1 ? 'st' : a === 2 ? 'nd' : a === 3 ? 'rd' : 'th'} is a ${DAYS[d0]}. What day of the week is the ${b}${b % 10 === 1 && b !== 11 ? 'st' : b % 10 === 2 && b !== 12 ? 'nd' : b % 10 === 3 && b !== 13 ? 'rd' : 'th'} of the same month?`;
    wrongs = [ans + 1, ans - 1, mod(d0 + b, 7), mod(d0 - N, 7)];
    extra = { a, b };
  } else {
    // "the day before yesterday was D" => today = D + 2, then N days after tomorrow
    do N = randInt(r, 20, 150); while (N % 7 === 0);
    const today = mod(d0 + 2, 7);
    ans = mod(today + 1 + N, 7);
    text = `The day before yesterday was ${DAYS[d0]}. What day of the week will it be ${N} days after tomorrow?`;
    wrongs = [ans + 1, mod(d0 + N, 7), mod(today + N, 7), ans - 1, mod(d0 + 1 + N, 7), mod(today + 1 - N, 7)];
    extra = { today };
  }
  const seen = new Set([ans]);
  const dists = [];
  for (const w of wrongs.map((x) => mod(x, 7))) if (!seen.has(w)) { seen.add(w); dists.push(w); }
  for (const w of shuffle(r, [0, 1, 2, 3, 4, 5, 6])) if (dists.length < 4 && !seen.has(w)) { seen.add(w); dists.push(w); }
  const chosen = dists.slice(0, 4);
  const base = baseOf('J2', text, '', 5);
  return finish('J2', seed, base, DAYS[ans], chosen.map((d) => DAYS[d]), [ans, ...chosen].map((d) => ({ day: d })), { form, start: d0, days: N, answer: ans, ...extra });
}

function genJ4(seed) {
  const r = rng(`J4#${seed}`);
  let h, m, ans, noDrift;
  do {
    h = randInt(r, 1, 12);
    m = 10 * randInt(r, 0, 5);
    const hour = 30 * (h % 12) + m / 2, minute = 6 * m;
    const diff = Math.abs(hour - minute) % 360;
    ans = Math.min(diff, 360 - diff);
    const nd = Math.abs(30 * (h % 12) - 6 * m) % 360;
    noDrift = Math.min(nd, 360 - nd);
  } while (ans === 0 || ans === 180 || noDrift === ans || noDrift === 0 || noDrift === 180);
  const pool = [noDrift, 360 - ans > 180 ? ans + 30 : 360 - ans, ans + 10, ans - 10, ans + 20, ans - 20, ans + 30, ans - 30, ans + 5, ans - 5];
  const seen = new Set([ans]);
  const dists = [];
  for (const p of pool) if (p > 0 && p < 180 && !seen.has(p)) { seen.add(p); dists.push(p); }
  const chosen = dists.slice(0, 4);
  const t = h * 60 + m;
  const base = baseOf('J4', `What is the smaller angle between the hour hand and the minute hand when the clock shows ${h}:${String(m).padStart(2, '0')}?`, clockSvg(t), 5);
  return finish('J4', seed, base, `${ans}°`, chosen.map((d) => `${d}°`), [ans, ...chosen].map((d) => ({ angle: d })), { hour: h, minute: m, angle: ans, noDrift });
}

function explainJ(id, m) {
  if (id === 'J1') return `Each clock is ${m.interval} minutes after the one before it. The last clock shows ${clockTime(m.times[4])}, so the next shows ${clockTime(m.answer)}.`;
  if (id === 'J3') return `The gap between clocks grows by ${m.growth} minutes each step (${m.start}, ${m.start + m.growth}, ${m.start + 2 * m.growth}, ${m.start + 3 * m.growth}), so the next gap is ${m.nextInterval} minutes: ${clockTime(m.times[4])} becomes ${clockTime(m.answer)}.`;
  if (id === 'J2') {
    const D = (i) => DAYS[mod(i, 7)];
    if (m.form === 'date') return `The ${m.b}th is ${m.days} days after the ${m.a}th. ${m.days} = ${Math.floor(m.days / 7)} weeks + ${m.days % 7} days, so the day moves ${m.days % 7} forward from ${D(m.start)}: ${D(m.answer)}.`;
    if (m.form === 'relative') return `If the day before yesterday was ${D(m.start)}, today is ${D(m.today)} and tomorrow is ${D(m.today + 1)}. ${m.days} days later is ${m.days % 7} days forward in the week (${m.days} mod 7), giving ${D(m.answer)}.`;
    return `${m.days} days is ${Math.floor(m.days / 7)} whole weeks plus ${m.days % 7} extra days. Counting ${m.days % 7} forward from ${D(m.start)} gives ${D(m.answer)}.`;
  }
  const h = m.hour % 12;
  return `At ${m.hour}:${String(m.minute).padStart(2, '0')} the minute hand is at ${6 * m.minute} degrees and the hour hand has moved to ${30 * h + m.minute / 2} degrees (30 per hour plus half a degree per minute). The gap is ${m.angle} degrees.`;
}

// ================================================================ public API

const GEN = {
  E1: (s) => genE('E1', s), E2: (s) => genE('E2', s), E3: (s) => genE('E3', s),
  Y1: (s) => genY('Y1', s), Y2: (s) => genY('Y2', s), Y3: (s) => genY('Y3', s), Y4: (s) => genY('Y4', s),
  W1: (s) => genW12('W1', s), W2: (s) => genW12('W2', s), W3: genW3,
  Z1: (s) => genZ('Z1', s), Z2: (s) => genZ('Z2', s), Z3: (s) => genZ('Z3', s),
  J1: genJ1, J2: genJ2, J3: genJ3, J4: genJ4,
};

export function variant(id, seed) {
  const g = GEN[id];
  if (!g) throw new Error(`unknown template ${id}`);
  return g(seed >>> 0);
}

export function explain(id, meta) {
  switch (id[0]) {
    case 'E': return explainE(meta);
    case 'Y': return explainY(meta);
    case 'W': return id === 'W3' ? explainW3(meta) : explainW12(id, meta);
    case 'Z': return explainZ(meta);
    case 'J': return explainJ(id, meta);
    default: throw new Error(`unknown template ${id}`);
  }
}
