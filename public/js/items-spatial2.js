// Spatial items, second batch (v3): P paper folding, C cube views from a net,
// K block counting, H shape assembly. Pure: builds markup strings, no DOM.
//
// Our own generators. Published work consulted for the task formats only (ideas, no code or items copied):
//  - Ekstrom, French, Harman & Dermen (1976), Kit of Factor-Referenced Cognitive Tests, Paper Folding
//    Test VZ-2: fold panels with dashed fold line and arrow, then a punched hole, pick the unfolded sheet.
//  - SpatialViz-Bench (arXiv 2507.07610): paper-folding generator = fold sequence on a discrete grid,
//    punch in the folded state, answer by reverse reflection; distractors by omitted / wrong folds.
//  - Shepard & Metzler (1971) mental rotation, and cube-net / cube-view tasks in standard spatial
//    batteries: which cube can be made from this net, impossible cubes show opposite faces together,
//    reverse the cyclic order of faces, or turn an oriented symbol the wrong way.
//  - Block counting from an isometric stack ("every cube rests on the floor or on another cube").
//  - Shape assembly: choose the two pieces that tile a target (rotation allowed, no flips).
//
// Template ids: P1-P5, C1-C4, K1-K3, H1-H3. Variant builders are deterministic from (id, seed).
import { rng, placeOptions } from './rng.js';
import {
  normalize,
  rotate,
  mirror,
  key as polyKey,
  boundingBox,
  isConnected,
  freePolyominoes,
  foldNet,
} from './cube.js';

export const TEMPLATES = [
  { id: 'P1', category: 'spatial', b: -1.5, family: 'fold', title: 'Paper folding: one fold, one hole' },
  { id: 'P2', category: 'spatial', b: -0.7, family: 'fold', title: 'Paper folding: two folds, one hole' },
  { id: 'P3', category: 'spatial', b: 0.2, family: 'fold', title: 'Paper folding: uneven folds, two holes' },
  { id: 'P4', category: 'spatial', b: 0.9, family: 'fold', title: 'Paper folding: diagonal folds' },
  { id: 'P5', category: 'spatial', b: 1.5, family: 'fold', title: 'Paper folding: three folds with a diagonal' },
  { id: 'C1', category: 'spatial', b: -0.5, family: 'cubeview', title: 'Cube from a net: symbols' },
  { id: 'C2', category: 'spatial', b: 0.3, family: 'cubeview', title: 'Cube from a net: order of faces' },
  { id: 'C3', category: 'spatial', b: 1.0, family: 'cubeview', title: 'Cube from a net: turned symbols' },
  { id: 'C4', category: 'spatial', b: 1.6, family: 'cubeview', title: 'Cube from a net: symbol orientation only' },
  { id: 'K1', category: 'spatial', b: -1.3, family: 'blocks', title: 'Block counting: small stack' },
  { id: 'K2', category: 'spatial', b: -0.3, family: 'blocks', title: 'Block counting: larger stack' },
  { id: 'K3', category: 'spatial', b: 0.9, family: 'blocks', title: 'Block counting: cubes to fill the block' },
  { id: 'H1', category: 'spatial', b: -1.0, family: 'assembly', title: 'Shape assembly: small pieces' },
  { id: 'H2', category: 'spatial', b: 0.0, family: 'assembly', title: 'Shape assembly: four-square pieces' },
  { id: 'H3', category: 'spatial', b: 1.1, family: 'assembly', title: 'Shape assembly: large pieces, flip traps' },
];

// ---------------------------------------------------------------------------------------------
// shared helpers

const EPS = 1e-9;
const num = (x) => {
  const v = Math.round(x * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
};
const ptsAttr = (pts) => pts.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
const ri = (r, n) => Math.floor(r() * n);
const pick = (r, arr) => arr[ri(r, arr.length)];
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = ri(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const setKey = (s) => [...s].sort().join(';');

function svgWrap(w, h, inner, label, style = '') {
  return (
    `<svg viewBox="0 0 ${num(w)} ${num(h)}" width="100%" role="img" aria-label="${label}"` +
    `${style ? ` style="${style}"` : ''}>${inner}</svg>`
  );
}
function polygonEl(pts, cls, extra = '', sw = 2) {
  return (
    `<polygon class="${cls}" points="${ptsAttr(pts)}" stroke="currentColor" stroke-width="${sw}" ` +
    `stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`
  );
}
function polylineEl(pts, sw = 2, extra = '') {
  return (
    `<polyline class="f-none" points="${ptsAttr(pts)}" stroke="currentColor" stroke-width="${sw}" ` +
    `stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`
  );
}
function textSvg(text, size, label) {
  return svgWrap(
    100,
    100,
    `<text x="50" y="50" font-size="${size}" font-weight="600" fill="currentColor" font-family="inherit" ` +
      `text-anchor="middle" dominant-baseline="central">${text}</text>`,
    label
  );
}

function finishItem({ id, b, prompt, stem, answerMarkup, distractorMarkups, seed, optionCols }) {
  const placed = placeOptions(`${id}#${seed}`, answerMarkup, distractorMarkups);
  return {
    id,
    category: 'spatial',
    b,
    prompt,
    stem,
    options: placed.options,
    answer: placed.answer,
    optionCols,
  };
}

const TB = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.b]));

// ---------------------------------------------------------------------------------------------
// P: paper folding

const LINE_MAKERS = {
  v: (c) => ({ nx: 1, ny: 0, d: c }), // x = c
  h: (c) => ({ nx: 0, ny: 1, d: c }), // y = c
  d1: (c) => ({ nx: 1, ny: -1, d: c }), // x - y = c
  d2: (c) => ({ nx: 1, ny: 1, d: c }), // x + y = c
};
const lineOf = (f) => LINE_MAKERS[f.kind](f.c);
const sd = (L, p) => L.nx * p[0] + L.ny * p[1] - L.d;
function reflectPt(L, p) {
  const t = sd(L, p) / (L.nx * L.nx + L.ny * L.ny);
  return [p[0] - 2 * t * L.nx, p[1] - 2 * t * L.ny];
}
// Keep the part of a convex polygon where s * signedDistance >= 0.
function clipPoly(poly, L, s) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = s * sd(L, a);
    const db = s * sd(L, b);
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  const res = [];
  for (const p of out) {
    const q = res[res.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) res.push(p);
  }
  if (res.length > 1 && Math.hypot(res[0][0] - res[res.length - 1][0], res[0][1] - res[res.length - 1][1]) < 1e-7) res.pop();
  return res;
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
function inConvex(poly, p) {
  let pos = false;
  let neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cr > 1e-7) pos = true;
    if (cr < -1e-7) neg = true;
  }
  return !(pos && neg);
}
function centroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cy += (p[1] + q[1]) * cr;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
function bbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const posKey = (p) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`;

// Is this fold a legal paper fold in the current region? The flapping part must land inside the rest.
function checkFold(region, f, step) {
  const L = lineOf(f);
  const flap = clipPoly(region, L, f.flap);
  const stat = clipPoly(region, L, -f.flap);
  if (flap.length < 3 || stat.length < 3) return null;
  const ratio = polyArea(flap) / polyArea(region);
  if (ratio < (step.minRatio ?? 0.25) - 1e-9) return null;
  if (step.mid && Math.abs(ratio - 0.5) > 1e-9) return null;
  if (!flap.every((p) => inConvex(stat, reflectPt(L, p)))) return null;
  return { flap, stat };
}

// Forward simulation: every original cell centre is carried through the folds.
// States: pts[i].p is the current position, pts[i].crease marks cells that lay on a fold line.
export function simulateFolds(N, folds) {
  let region = [[0, 0], [N, 0], [N, N], [0, N]];
  const pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push({ o: [i, j], p: [i + 0.5, j + 0.5], crease: false });
  const steps = [];
  for (const f of folds) {
    const L = lineOf(f);
    const flap = clipPoly(region, L, f.flap);
    const stat = clipPoly(region, L, -f.flap);
    steps.push({ fold: f, L, region, flap, stat });
    for (const pt of pts) {
      const s = sd(L, pt.p);
      if (Math.abs(s) < EPS) pt.crease = true;
      else if (f.flap * s > 0) pt.p = reflectPt(L, pt.p);
    }
    region = stat;
  }
  return { steps, region, pts };
}

function buildFolds(r, spec) {
  const N = spec.N;
  let region = [[0, 0], [N, 0], [N, N], [0, N]];
  const folds = [];
  for (const step of spec.seq) {
    const bb = bbox(region);
    const cands = [];
    for (const kind of step.kinds) {
      let lo;
      let hi;
      if (kind === 'v') { lo = Math.ceil(bb.x0 + EPS); hi = Math.floor(bb.x1 - EPS); }
      else if (kind === 'h') { lo = Math.ceil(bb.y0 + EPS); hi = Math.floor(bb.y1 - EPS); }
      else if (kind === 'd1') { lo = Math.ceil(bb.x0 - bb.y1 + EPS); hi = Math.floor(bb.x1 - bb.y0 - EPS); }
      else { lo = Math.ceil(bb.x0 + bb.y0 + EPS); hi = Math.floor(bb.x1 + bb.y1 - EPS); }
      for (let c = lo; c <= hi; c++) {
        for (const flap of [1, -1]) {
          const f = { kind, c, flap };
          const chk = checkFold(region, f, step);
          if (chk) cands.push({ f, stat: chk.stat });
        }
      }
    }
    if (!cands.length) return null;
    const ch = pick(r, cands);
    folds.push(ch.f);
    region = ch.stat;
  }
  return folds;
}

// Cell indices (i,j) of original cells that end at one of the punched positions.
function holesFrom(pts, Q) {
  const out = new Set();
  for (const pt of pts) if (Q.has(posKey(pt.p))) out.add(`${pt.o[0]},${pt.o[1]}`);
  return out;
}

// Re-run the folds with a mistake in fold `k` (a typical solver error) and read off the holes.
function mistakeHoles(N, folds, Q, kind, k) {
  const fs = folds.map((f) => ({ ...f }));
  if (kind === 'skip') fs.splice(k, 1);
  else if (kind === 'side') fs[k].flap = -fs[k].flap;
  else if (kind === 'axis') fs[k] = { kind: { v: 'h', h: 'v', d1: 'd2', d2: 'd1' }[fs[k].kind], c: fs[k].c, flap: fs[k].flap };
  const sim = simulateFolds(N, fs);
  return holesFrom(sim.pts, Q);
}

const FOLD_NAMES = { v: 'vertical', h: 'horizontal', d1: 'diagonal', d2: 'diagonal' };

const P_SPECS = {
  P1: { N: 4, nHoles: [1, 2], cap: 8, variants: [[{ kinds: ['v', 'h'], mid: true }]] },
  P2: { N: 4, nHoles: [1], cap: 8, variants: [[{ kinds: ['v', 'h'], mid: true }, { kinds: ['v', 'h'], mid: true }]] },
  P3: { N: 6, nHoles: [2], cap: 14, variants: [[{ kinds: ['v', 'h'], minRatio: 0.3 }, { kinds: ['v', 'h'], minRatio: 0.3 }]] },
  P4: {
    N: 4,
    nHoles: [1, 2],
    cap: 8,
    variants: [
      [{ kinds: ['d1', 'd2'], minRatio: 0.45 }, { kinds: ['d1', 'd2'], minRatio: 0.45 }],
      [{ kinds: ['v', 'h'], mid: true }, { kinds: ['d1', 'd2'], minRatio: 0.2 }],
    ],
  },
  P5: {
    N: 6,
    nHoles: [1, 2],
    cap: 16,
    variants: [
      [{ kinds: ['v', 'h'], mid: true }, { kinds: ['v', 'h'], mid: true }, { kinds: ['d1', 'd2'], minRatio: 0.45 }],
      [{ kinds: ['d1', 'd2'], minRatio: 0.45 }, { kinds: ['d1', 'd2'], minRatio: 0.45 }, { kinds: ['v', 'h'], mid: true }],
    ],
  },
};

// ---- P rendering ----

const PANEL = 100;
const PGAP = 18;

function sheetPanel(N, ox, oy, content) {
  return `<rect x="${ox}" y="${oy}" width="${PANEL}" height="${PANEL}" rx="6" class="f-none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.5"/>${content}`;
}

function foldStepPanel(N, step, ox, oy, idx) {
  const s = (PANEL - 36) / N;
  const bb = bbox(step.region);
  const tx = ox + PANEL / 2 - (s * (bb.x0 + bb.x1)) / 2;
  const ty = oy + PANEL / 2 - (s * (bb.y0 + bb.y1)) / 2;
  const T = (p) => [tx + s * p[0], ty + s * p[1]];
  let g = polygonEl(step.region.map(T), 'f-none', '', 2);
  g += `<polygon class="f-grey" points="${ptsAttr(step.flap.map(T))}" fill-opacity=".5" stroke="none"/>`;
  // dashed fold line across the paper
  const L = step.L;
  const dir = [-L.ny, L.nx];
  const onLine = step.stat.filter((p) => Math.abs(sd(L, p)) < 1e-7);
  const ts = onLine.map((p) => p[0] * dir[0] + p[1] * dir[1]);
  const lo = onLine[ts.indexOf(Math.min(...ts))];
  const hi = onLine[ts.indexOf(Math.max(...ts))];
  const dl = Math.hypot(dir[0], dir[1]);
  const ext = 4 / s;
  const a = T([lo[0] - (dir[0] / dl) * ext, lo[1] - (dir[1] / dl) * ext]);
  const b = T([hi[0] + (dir[0] / dl) * ext, hi[1] + (dir[1] / dl) * ext]);
  g += `<line x1="${num(a[0])}" y1="${num(a[1])}" x2="${num(b[0])}" y2="${num(b[1])}" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3.5"/>`;
  // curved arrow from the flap to where it lands
  const cf = centroid(step.flap);
  const ce = reflectPt(L, cf);
  const p0 = T(cf);
  const p1 = T(ce);
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  let u = [dir[0] / dl, dir[1] / dl];
  if (Math.abs(u[1]) > 0.1 ? u[1] > 0 : u[0] < 0) u = [-u[0], -u[1]];
  const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const off = 2 * (0.3 * chord + 3);
  const ctrl = [mid[0] + u[0] * off, mid[1] + u[1] * off];
  g += `<path class="f-none" d="M${num(p0[0])} ${num(p0[1])} Q${num(ctrl[0])} ${num(ctrl[1])} ${num(p1[0])} ${num(p1[1])}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
  const tg = [p1[0] - ctrl[0], p1[1] - ctrl[1]];
  const tl = Math.hypot(tg[0], tg[1]);
  const t = [tg[0] / tl, tg[1] / tl];
  const nrm = [-t[1], t[0]];
  const base = [p1[0] - t[0] * 8, p1[1] - t[1] * 8];
  const head = [
    [p1[0] + t[0] * 1.5, p1[1] + t[1] * 1.5],
    [base[0] + nrm[0] * 4.2, base[1] + nrm[1] * 4.2],
    [base[0] - nrm[0] * 4.2, base[1] - nrm[1] * 4.2],
  ];
  g += `<polygon class="f-solid" points="${ptsAttr(head)}" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>`;
  g += `<text x="${ox + 9}" y="${oy + 10}" font-size="9" font-weight="700" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central" opacity=".6">${idx}</text>`;
  return sheetPanel(N, ox, oy, g);
}

function finalPanel(N, region, Q, ox, oy, idx) {
  const s = (PANEL - 36) / N;
  const bb = bbox(region);
  const tx = ox + PANEL / 2 - (s * (bb.x0 + bb.x1)) / 2;
  const ty = oy + PANEL / 2 - (s * (bb.y0 + bb.y1)) / 2;
  const T = (p) => [tx + s * p[0], ty + s * p[1]];
  let g = polygonEl(region.map(T), 'f-none', '', 2);
  for (const q of Q) {
    const [x, y] = T(q);
    g += `<circle class="f-solid" cx="${num(x)}" cy="${num(y)}" r="${num(0.3 * s)}" stroke="currentColor" stroke-width="1"/>`;
  }
  g += `<text x="${ox + 9}" y="${oy + 10}" font-size="9" font-weight="700" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central" opacity=".6">${idx}</text>`;
  return sheetPanel(N, ox, oy, g);
}

function foldStem(N, sim, Qpts) {
  const n = sim.steps.length;
  const total = n + 1;
  const cols = total <= 3 ? total : 2;
  const rows = Math.ceil(total / cols);
  const W = cols * PANEL + (cols - 1) * PGAP;
  const H = rows * PANEL + (rows - 1) * PGAP;
  let inner = '';
  for (let k = 0; k < total; k++) {
    const cx = k % cols;
    const cy = Math.floor(k / cols);
    const ox = cx * (PANEL + PGAP);
    const oy = cy * (PANEL + PGAP);
    inner += k < n ? foldStepPanel(N, sim.steps[k], ox, oy, k + 1) : finalPanel(N, sim.region, Qpts, ox, oy, k + 1);
    if (cx < cols - 1 && k < total - 1) {
      const mx = ox + PANEL + PGAP / 2;
      const my = oy + PANEL / 2;
      inner += polylineEl([[mx - 2.5, my - 5], [mx + 2.5, my], [mx - 2.5, my + 5]], 2);
    }
  }
  const label = `Paper folded in ${n} step${n > 1 ? 's' : ''}, then punched`;
  return svgWrap(W, H, inner, label, 'display:block;margin:0 auto');
}

const OPT_PAD = 6;
function sheetOption(N, holes) {
  const s = (100 - 2 * OPT_PAD) / N;
  let g = `<rect x="${OPT_PAD}" y="${OPT_PAD}" width="${num(100 - 2 * OPT_PAD)}" height="${num(100 - 2 * OPT_PAD)}" class="f-none" stroke="currentColor" stroke-width="2.5"/>`;
  for (let i = 1; i < N; i++) {
    const p = OPT_PAD + i * s;
    g += `<line x1="${num(p)}" y1="${OPT_PAD}" x2="${num(p)}" y2="${100 - OPT_PAD}" stroke="currentColor" stroke-opacity=".13" stroke-width="1"/>`;
    g += `<line x1="${OPT_PAD}" y1="${num(p)}" x2="${100 - OPT_PAD}" y2="${num(p)}" stroke="currentColor" stroke-opacity=".13" stroke-width="1"/>`;
  }
  const hs = [...holes]
    .map((k) => k.split(',').map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [i, j] of hs) {
    g += `<circle class="f-solid" cx="${num(OPT_PAD + (i + 0.5) * s)}" cy="${num(OPT_PAD + (j + 0.5) * s)}" r="${num(0.3 * s)}"/>`;
  }
  return svgWrap(100, 100, g, `Unfolded sheet with ${hs.length} hole${hs.length === 1 ? '' : 's'}`);
}

function paperVariant(id, seed) {
  const spec = P_SPECS[id];
  const r = rng(`${id}#${seed}`);
  const N = spec.N;
  for (let attempt = 0; attempt < 600; attempt++) {
    const seq = pick(r, spec.variants);
    const folds = buildFolds(r, { N, seq });
    if (!folds) continue;
    const sim = simulateFolds(N, folds);
    // punchable positions: occupied by paper, no layer lying on a crease
    const byPos = new Map();
    for (const pt of sim.pts) {
      const k = posKey(pt.p);
      const e = byPos.get(k) || { p: pt.p, crease: false, n: 0 };
      e.crease = e.crease || pt.crease;
      e.n++;
      byPos.set(k, e);
    }
    const avail = [...byPos.entries()].filter(([, e]) => !e.crease);
    const nHoles = pick(r, spec.nHoles);
    if (avail.length < nHoles + 1) continue;
    const chosen = shuffle(r, avail).slice(0, nHoles);
    const Q = new Set(chosen.map(([k]) => k));
    const Qpts = chosen.map(([, e]) => e.p);
    const H = holesFrom(sim.pts, Q);
    if (H.size > spec.cap || H.size < nHoles + (id === 'P1' ? 1 : 0)) continue;
    // candidate wrong answers
    const hk = setKey(H);
    const sims = [];
    for (let k = 0; k < folds.length; k++) {
      for (const kind of ['skip', 'side', 'axis']) {
        if (kind === 'skip' && folds.length < 2 && false) continue;
        sims.push(mistakeHoles(N, folds, Q, kind, k));
      }
    }
    const arr = [...H].map((s) => s.split(',').map(Number));
    const mk = (f) => new Set(arr.map(([i, j]) => f(i, j).join(',')));
    const others = [
      mk((i, j) => [N - 1 - i, j]),
      mk((i, j) => [i, N - 1 - j]),
      mk((i, j) => [j, i]),
      mk((i, j) => [N - 1 - j, N - 1 - i]),
      mk((i, j) => [N - 1 - j, i]),
      mk((i, j) => [j, N - 1 - i]),
    ];
    const freeCells = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!H.has(`${i},${j}`)) freeCells.push(`${i},${j}`);
    // perturbations of the true answer
    const holeList = shuffle(r, [...H]);
    for (let t = 0; t < 3; t++) {
      const victim = holeList[t % holeList.length];
      if (H.size > 1) {
        const s2 = new Set(H);
        s2.delete(victim);
        others.push(s2);
      }
      const [vi, vj] = victim.split(',').map(Number);
      const dirs = shuffle(r, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      for (const [dx, dy] of dirs) {
        const k2 = `${vi + dx},${vj + dy}`;
        if (vi + dx >= 0 && vi + dx < N && vj + dy >= 0 && vj + dy < N && !H.has(k2)) {
          const s2 = new Set(H);
          s2.delete(victim);
          s2.add(k2);
          others.push(s2);
          break;
        }
      }
      const s3 = new Set(H);
      s3.add(pick(r, freeCells));
      others.push(s3);
    }
    const seen = new Set([hk]);
    const take = (list, want, out) => {
      for (const s of shuffle(r, list)) {
        if (out.length >= want) break;
        if (!s.size || s.size > Math.floor(N * N * 0.6)) continue;
        const k = setKey(s);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
      }
    };
    const chosenD = [];
    take(sims, 2, chosenD);
    take(others, 4, chosenD);
    take(sims, 4, chosenD);
    take(others, 4, chosenD);
    if (chosenD.length < 4) continue;
    const stem = foldStem(N, sim, Qpts);
    const item = finishItem({
      id,
      b: TB[id],
      prompt: 'The paper is folded as shown and then punched. Which option shows the sheet unfolded?',
      stem,
      answerMarkup: sheetOption(N, H),
      distractorMarkups: chosenD.map((s) => sheetOption(N, s)),
      seed,
      optionCols: 5,
    });
    const meta = {
      N,
      folds: folds.map((f) => ({ ...f })),
      punched: chosen.map(([, e]) => [e.p[0] - 0.5, e.p[1] - 0.5]),
      holes: [...H].sort(),
      distractors: chosenD.map((s) => [...s].sort()),
    };
    return { item, meta };
  }
  throw new Error(`${id}: no paper-folding variant for seed ${seed}`);
}

function paperExplain(meta) {
  const names = meta.folds.map((f) => FOLD_NAMES[f.kind]);
  const nf = names.length;
  const diag = names.includes('diagonal');
  const nh = meta.punched.length;
  return (
    `Undo the folds in reverse order: each fold line works like a mirror, so every hole is copied to the other side of it` +
    `${diag ? ' (a diagonal fold swaps rows and columns across the diagonal)' : ''}. ` +
    `${nf} fold${nf > 1 ? 's' : ''} (${names.join(', ')}) and ${nh} punch${nh > 1 ? 'es' : ''} give ${meta.holes.length} holes on the open sheet.`
  );
}

// ---------------------------------------------------------------------------------------------
// C: cube views from a net

const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  neg: (a) => [-a[0], -a[1], -a[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  eq: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
};

// Rotate the (ex, ey) frame of a glyph by k quarter turns clockwise (as read on the face).
export function rotFrame(ex, ey, k) {
  k = ((k % 4) + 4) % 4;
  if (k === 0) return [ex, ey];
  if (k === 1) return [ey, v3.neg(ex)];
  if (k === 2) return [v3.neg(ex), v3.neg(ey)];
  return [v3.neg(ey), ex];
}

// Fold a net so the printed side is outside the cube. Each face: outward normal n and the 3D images of
// the net's "right" (ex) and "down" (ey) directions. (ex x ey = -n: right-then-down reads from outside.)
export function foldFaces(cells) {
  const idx = new Map(cells.map(([x, y], i) => [`${x},${y}`, i]));
  const faces = new Array(cells.length).fill(null);
  faces[0] = { n: [0, 0, 1], ex: [1, 0, 0], ey: [0, -1, 0] };
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    const [x, y] = cells[i];
    const f = faces[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = idx.get(`${x + dx},${y + dy}`);
      if (j === undefined || faces[j]) continue;
      let g;
      if (dx === 1) g = { n: f.ex, ex: v3.neg(f.n), ey: f.ey };
      else if (dx === -1) g = { n: v3.neg(f.ex), ex: f.n, ey: f.ey };
      else if (dy === 1) g = { n: f.ey, ex: f.ex, ey: v3.neg(f.n) };
      else g = { n: v3.neg(f.ey), ex: f.ex, ey: f.n };
      faces[j] = g;
      queue.push(j);
    }
  }
  return faces;
}

const circlePts = (rad, n = 16, cx = 0, cy = 0) =>
  Array.from({ length: n }, (_, i) => [cx + rad * Math.cos((2 * Math.PI * i) / n), cy + rad * Math.sin((2 * Math.PI * i) / n)]);

// Glyphs live in [-1,1]^2 (v down). SYM glyphs have 4-fold symmetry, ASY glyphs none.
export const GLYPHS = {
  sym: [
    { name: 'ring', prims: [{ t: 'poly', fill: 'none', pts: circlePts(0.7) }] },
    { name: 'disc', prims: [{ t: 'poly', fill: 'solid', pts: circlePts(0.62) }] },
    { name: 'plus', prims: [{ t: 'line', pts: [[-0.72, 0], [0.72, 0]] }, { t: 'line', pts: [[0, -0.72], [0, 0.72]] }] },
    { name: 'cross', prims: [{ t: 'line', pts: [[-0.62, -0.62], [0.62, 0.62]] }, { t: 'line', pts: [[-0.62, 0.62], [0.62, -0.62]] }] },
    { name: 'square', prims: [{ t: 'poly', fill: 'none', pts: [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]] }] },
    { name: 'diamond', prims: [{ t: 'poly', fill: 'solid', pts: [[0, -0.82], [0.82, 0], [0, 0.82], [-0.82, 0]] }] },
  ],
  asy: [
    { name: 'F', prims: [{ t: 'line', pts: [[-0.45, 0.8], [-0.45, -0.8], [0.55, -0.8]] }, { t: 'line', pts: [[-0.45, 0], [0.35, 0]] }] },
    { name: 'arrow', prims: [{ t: 'line', pts: [[0, 0.8], [0, -0.8]] }, { t: 'line', pts: [[-0.48, -0.3], [0, -0.8], [0.48, -0.3]] }] },
    { name: 'triangle', prims: [{ t: 'poly', fill: 'solid', pts: [[-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7]] }] },
    { name: 'L', prims: [{ t: 'poly', fill: 'solid', pts: [[-0.5, -0.8], [-0.1, -0.8], [-0.1, 0.4], [0.6, 0.4], [0.6, 0.8], [-0.5, 0.8]] }] },
    {
      name: 'half-disc',
      prims: [{ t: 'poly', fill: 'solid', pts: [...Array.from({ length: 9 }, (_, i) => [0.78 * Math.cos(Math.PI + (Math.PI * i) / 8), 0.78 * Math.sin(Math.PI + (Math.PI * i) / 8) + 0.4])] }],
    },
    { name: 'flag', prims: [{ t: 'line', pts: [[-0.4, 0.8], [-0.4, -0.8]] }, { t: 'poly', fill: 'solid', pts: [[-0.4, -0.8], [0.62, -0.4], [-0.4, 0]] }] },
  ],
};

function glyphEls(glyph, map, sw = 2.2) {
  let out = '';
  for (const pr of glyph.prims) {
    const pts = pr.pts.map(map);
    if (pr.t === 'line') out += polylineEl(pts, sw);
    else out += polygonEl(pts, pr.fill === 'solid' ? 'f-solid' : 'f-none', '', sw * 0.7);
  }
  return out;
}

const SQ2 = Math.SQRT2;
const SQ6 = Math.sqrt(6);
const CUBE_SC = 52;
// Isometric view from the (+X, +Y, +Z) corner: +Y up, +X to the right-front, +Z to the left-front.
export function projectIso(p, sc = CUBE_SC, cx = 50, cy = 50) {
  return [cx + (sc * (p[0] - p[2])) / SQ2, cy - (sc * (-p[0] + 2 * p[1] - p[2])) / SQ6];
}

export const SLOTS = [
  { name: 'top', n: [0, 1, 0], ex: [1, 0, 0], ey: [0, 0, 1] },
  { name: 'left', n: [0, 0, 1], ex: [1, 0, 0], ey: [0, -1, 0] },
  { name: 'right', n: [1, 0, 0], ex: [0, 0, -1], ey: [0, -1, 0] },
];
const SLOT_SHADE = [
  ['f-none', ''],
  ['f-grey', 'fill-opacity=".4"'],
  ['f-grey', ''],
];
const GLYPH_SCALE = 0.34;

function faceCorners(n) {
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].filter((a) => !v3.eq(a, n) && !v3.eq(a, v3.neg(n)));
  const [ta, tb] = axes;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
    v3.add(v3.scale(n, 0.5), v3.add(v3.scale(ta, a * 0.5), v3.scale(tb, b * 0.5)))
  );
}

// spec: [{g, k} x3] for slots top, left, right. glyphs: array of glyph definitions.
export function cubeSvg(spec, glyphs) {
  let inner = '';
  spec.forEach((sl, i) => {
    const slot = SLOTS[i];
    inner += polygonEl(faceCorners(slot.n).map((p) => projectIso(p)), SLOT_SHADE[i][0], SLOT_SHADE[i][1], 2);
  });
  spec.forEach((sl, i) => {
    const slot = SLOTS[i];
    const [ex, ey] = rotFrame(slot.ex, slot.ey, sl.k);
    const map = ([u, v]) =>
      projectIso(v3.add(v3.scale(slot.n, 0.5), v3.add(v3.scale(ex, u * GLYPH_SCALE), v3.scale(ey, v * GLYPH_SCALE))));
    inner += glyphEls(glyphs[sl.g], map, 2.2);
  });
  return svgWrap(100, 100, inner, 'Cube seen from a corner showing three faces');
}

const NET_CELL = 40;
export function netSvg(cells, assign, glyphs) {
  const pad = 4;
  const { w, h } = boundingBox(cells);
  const W = Math.max(w, 4) * NET_CELL + 2 * pad;
  const H = Math.max(h, 3) * NET_CELL + 2 * pad;
  const ax = (W - w * NET_CELL) / 2;
  const ay = (H - h * NET_CELL) / 2;
  let inner = '';
  cells.forEach(([x, y], i) => {
    const ox = ax + x * NET_CELL;
    const oy = ay + y * NET_CELL;
    inner += `<rect x="${ox}" y="${oy}" width="${NET_CELL}" height="${NET_CELL}" class="f-none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>`;
    const { g, r } = assign[i];
    const map = ([u, v]) => {
      let a = u;
      let b = v;
      for (let t = 0; t < r; t++) [a, b] = [-b, a];
      return [ox + NET_CELL / 2 + a * NET_CELL * 0.36, oy + NET_CELL / 2 + b * NET_CELL * 0.36];
    };
    inner += glyphEls(glyphs[g], map, 2.4);
  });
  return svgWrap(W, H, inner, 'Cube net with a symbol on each face', 'display:block;margin:0 auto');
}

// ---- C geometry: the 24 rotations of the cube and the possible views ----

function rotations24() {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const sg = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) M[i][p[i]] = sg[i];
      const det =
        M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
        M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
        M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      if (det === 1) out.push(M);
    }
  }
  return out;
}
const ROT24 = rotations24();
const mulV = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);

const specKey = (spec) => spec.map((s) => `${s.g}.${s.k}`).join('|');

// Spec (3 slots) shown by the cube `faces` (each {n, ex, ey, g}) after rotation Q. symmetric: ignore k.
export function viewSpec(faces, Q, symmetric) {
  return SLOTS.map((slot) => {
    const f = faces.find((fc) => v3.eq(mulV(Q, fc.n), slot.n));
    const exw = mulV(Q, f.ex);
    const eyw = mulV(Q, f.ey);
    let k = -1;
    for (let t = 0; t < 4; t++) {
      const [ex, ey] = rotFrame(slot.ex, slot.ey, t);
      if (v3.eq(ex, exw) && v3.eq(ey, eyw)) k = t;
    }
    if (k < 0) throw new Error('frame mismatch');
    return { g: f.g, k: symmetric ? 0 : k };
  });
}

function possibleViews(faces, symmetric) {
  return new Map(ROT24.map((Q) => [specKey(viewSpec(faces, Q, symmetric)), viewSpec(faces, Q, symmetric)]));
}

const NET_POOL = freePolyominoes(6).filter((c) => foldNet(c).valid);

const C_SPECS = {
  C1: { sym: true, printRot: false, recipe: ['opp', 'opp', 'swap', 'replace'] },
  C2: { sym: true, printRot: false, recipe: ['opp', 'swap', 'swap', 'replace'] },
  C3: { sym: false, printRot: true, recipe: ['swap', 'rot1', 'rot1', 'rot2'] },
  C4: { sym: false, printRot: true, recipe: ['rot1', 'rot1', 'rot2', 'rot2'] },
};

function cubeVariant(id, seed) {
  const spec = C_SPECS[id];
  const r = rng(`${id}#${seed}`);
  const glyphs = spec.sym ? GLYPHS.sym : GLYPHS.asy;
  for (let attempt = 0; attempt < 200; attempt++) {
    let cells = rotate(pick(r, NET_POOL), ri(r, 4));
    if (r() < 0.5) cells = mirror(cells);
    cells = normalize(cells);
    const base = foldFaces(cells);
    const perm = shuffle(r, [0, 1, 2, 3, 4, 5]);
    const assign = cells.map((_, i) => ({ g: perm[i], r: spec.printRot ? ri(r, 4) : 0 }));
    const faces = base.map((f, i) => {
      const [ex, ey] = rotFrame(f.ex, f.ey, assign[i].r);
      return { n: f.n, ex, ey, g: assign[i].g };
    });
    const possible = possibleViews(faces, spec.sym);
    const Q = pick(r, ROT24);
    const answerSpec = viewSpec(faces, Q, spec.sym);
    const used = new Set([specKey(answerSpec)]);
    const hiddenFaces = faces.filter((f) => !answerSpec.some((s) => s.g === f.g));
    const oppOf = (f) => faces.find((o) => v3.eq(o.n, v3.neg(f.n)));
    const makers = {
      opp: () => {
        const f1 = pick(r, faces);
        const f2 = oppOf(f1);
        const f3 = pick(r, faces.filter((f) => f !== f1 && f !== f2));
        const trio = shuffle(r, [f1, f2, f3]);
        return trio.map((f) => ({ g: f.g, k: spec.sym ? 0 : ri(r, 4) }));
      },
      swap: () => {
        const s = answerSpec.map((x) => ({ ...x }));
        const [i, j] = pick(r, [[0, 1], [0, 2], [1, 2]]);
        [s[i], s[j]] = [s[j], s[i]];
        return s;
      },
      replace: () => {
        const s = answerSpec.map((x) => ({ ...x }));
        const i = ri(r, 3);
        s[i] = { g: pick(r, hiddenFaces).g, k: spec.sym ? 0 : ri(r, 4) };
        return s;
      },
      rot1: () => {
        const s = answerSpec.map((x) => ({ ...x }));
        const i = ri(r, 3);
        s[i].k = (s[i].k + 1 + ri(r, 3)) % 4;
        return s;
      },
      rot2: () => {
        const s = answerSpec.map((x) => ({ ...x }));
        const [i, j] = pick(r, [[0, 1], [0, 2], [1, 2]]);
        s[i].k = (s[i].k + 1 + ri(r, 3)) % 4;
        s[j].k = (s[j].k + 1 + ri(r, 3)) % 4;
        return s;
      },
    };
    const dist = [];
    const fillers = spec.sym ? ['opp', 'swap', 'replace'] : ['rot1', 'rot2', 'swap'];
    for (const kind of [...spec.recipe, ...fillers, ...fillers]) {
      if (dist.length >= 4) break;
      for (let t = 0; t < 40; t++) {
        const s = makers[kind]();
        const k = specKey(s);
        if (possible.has(k) || used.has(k)) continue;
        used.add(k);
        dist.push(s);
        break;
      }
    }
    if (dist.length < 4) continue;
    const stem = netSvg(cells, assign, glyphs);
    const item = finishItem({
      id,
      b: TB[id],
      prompt: spec.sym
        ? 'Which cube can be made by folding this net? The symbols are on the outside.'
        : 'Which cube can be made by folding this net? The symbols are on the outside, and the way each one is turned matters.',
      stem,
      answerMarkup: cubeSvg(answerSpec, glyphs),
      distractorMarkups: dist.map((s) => cubeSvg(s, glyphs)),
      seed,
      optionCols: 5,
    });
    const meta = {
      cells,
      assign,
      sym: spec.sym,
      answerSpec,
      distractorSpecs: dist,
      kinds: spec.recipe,
    };
    return { item, meta };
  }
  throw new Error(`${id}: no cube variant for seed ${seed}`);
}

function cubeExplain(meta) {
  const glyphs = meta.sym ? GLYPHS.sym : GLYPHS.asy;
  const names = meta.answerSpec.map((s) => glyphs[s.g].name);
  const kinds = new Set(meta.kinds);
  const bad = [];
  if (kinds.has('opp')) bad.push('put faces that are opposite each other side by side');
  if (kinds.has('swap')) bad.push('show the right faces in the wrong order around the corner');
  if (kinds.has('replace')) bad.push('use a face that does not touch the other two');
  if (kinds.has('rot1') || kinds.has('rot2')) bad.push('turn a symbol the wrong way');
  return (
    `Fold the net face by face: the ${names[0]}, ${names[1]} and ${names[2]} meet at one corner in exactly the arrangement shown by the correct cube` +
    `${meta.sym ? '' : ', with each symbol turned as it is on the net'}. ` +
    `The other cubes ${bad.join(', or ')}.`
  );
}

// ---------------------------------------------------------------------------------------------
// K: block counting

const K_SPECS = {
  K1: { W: 3, D: 3, hmax: 3, total: [7, 13], hidden: 1, ask: 'count' },
  K2: { W: 4, D: 4, hmax: 4, total: [17, 27], hidden: 3, ask: 'count' },
  K3: { W: 3, D: 3, hmax: 4, total: [12, 21], hidden: 2, ask: 'fill' },
};

// H[x][z] heights; +X is right-front, +Z is left-front. Non-increasing toward the viewer (x+, z+).
function genHeights(r, spec) {
  const { W, D, hmax } = spec;
  const G = Array.from({ length: W }, () => new Array(D).fill(0));
  for (let a = 0; a < W; a++) {
    for (let b = 0; b < D; b++) {
      const cap = Math.min(a > 0 ? G[a - 1][b] : hmax, b > 0 ? G[a][b - 1] : hmax);
      G[a][b] = a === 0 && b === 0 ? hmax : Math.max(0, cap - ri(r, cap >= 2 ? 3 : 2));
    }
  }
  return G; // a = x, b = z: back corner (0,0) is the tallest, heights fall off toward the viewer
}

export function blockFaces(H) {
  const W = H.length;
  const D = H[0].length;
  const faces = [];
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= D ? 0 : H[x][z]);
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      for (let y = 0; y < H[x][z]; y++) {
        if (y === H[x][z] - 1) faces.push({ kind: 'top', x, y, z });
        if (at(x, z + 1) <= y) faces.push({ kind: 'left', x, y, z });
        if (at(x + 1, z) <= y) faces.push({ kind: 'right', x, y, z });
      }
    }
  }
  return faces;
}

function faceQuad(f) {
  const { x, y, z } = f;
  if (f.kind === 'top') return [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
  if (f.kind === 'left') return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
  return [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]];
}

const BLOCK_SC = 26;
export function blockStackSvg(H) {
  const faces = blockFaces(H);
  const quads = faces.map((f) => ({ f, q: faceQuad(f).map((p) => projectIso(p, BLOCK_SC, 0, 0)) }));
  const xs = quads.flatMap((o) => o.q.map((p) => p[0]));
  const ys = quads.flatMap((o) => o.q.map((p) => p[1]));
  const pad = 8;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const bw = Math.max(...xs) + pad - x0;
  const bh = Math.max(...ys) + pad - y0;
  const W = Math.max(bw, 200);
  const Hh = Math.max(bh, 150);
  const dx = (W - bw) / 2;
  const dy = (Hh - bh) / 2;
  let inner = '';
  // far to near, so the SVG order matches depth (all drawn faces are visible; order is cosmetic)
  quads.sort((a, b) => a.f.x + a.f.y + a.f.z - (b.f.x + b.f.y + b.f.z));
  for (const { f, q } of quads) {
    const shade = f.kind === 'top' ? ['f-none', ''] : f.kind === 'left' ? ['f-grey', 'fill-opacity=".4"'] : ['f-grey', ''];
    inner += polygonEl(q.map(([x, y]) => [x - x0 + dx, y - y0 + dy]), shade[0], shade[1], 1.8);
  }
  return svgWrap(W, Hh, inner, 'Stack of cubes seen from a corner', 'display:block;margin:0 auto');
}

function blockStats(H) {
  const total = H.flat().reduce((a, b) => a + b, 0);
  const faces = blockFaces(H);
  const seen = new Set(faces.map((f) => `${f.x},${f.y},${f.z}`));
  return { total, visible: seen.size, hidden: total - seen.size };
}

function blockVariant(id, seed) {
  const spec = K_SPECS[id];
  const r = rng(`${id}#${seed}`);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const H = genHeights(r, spec);
    const st = blockStats(H);
    if (st.total < spec.total[0] || st.total > spec.total[1] || st.hidden < spec.hidden) continue;
    const cols = H.flat().filter((h) => h > 0).length;
    if (cols < Math.ceil((spec.W * spec.D) / 2)) continue;
    const box = spec.W * spec.D * spec.hmax;
    const answer = spec.ask === 'fill' ? box - st.total : st.total;
    let prompt;
    let cands;
    if (spec.ask === 'fill') {
      prompt = `Every cube rests on the floor or on another cube. How many more cubes are needed to make a solid block ${spec.W} × ${spec.D} cubes wide and as tall as the tallest column?`;
      cands = [answer + 1, answer - 1, st.total, answer + 2, answer - 2, st.hidden, box];
    } else {
      prompt = 'Every cube rests on the floor or on another cube. How many cubes are in the stack?';
      cands = [st.visible, answer + 1, answer - 1, answer + 2, answer - 2, answer + 3];
    }
    const ds = [];
    for (const c of cands) if (c > 0 && c !== answer && !ds.includes(c) && ds.length < 4) ds.push(c);
    if (ds.length < 4) continue;
    const item = finishItem({
      id,
      b: TB[id],
      prompt,
      stem: blockStackSvg(H),
      answerMarkup: textSvg(String(answer), 46, `Answer ${answer}`),
      distractorMarkups: ds.map((c) => textSvg(String(c), 46, `Answer ${c}`)),
      seed,
      optionCols: 5,
    });
    return { item, meta: { heights: H, ...st, answer, ask: spec.ask, box, W: spec.W, D: spec.D, hmax: spec.hmax, distractors: ds } };
  }
  throw new Error(`${id}: no block variant for seed ${seed}`);
}

function blockExplain(meta) {
  const cols = meta.heights.flat().filter((h) => h > 0).sort((a, b) => b - a);
  if (meta.ask === 'fill') {
    return (
      `Add up the column heights (${cols.join(' + ')} = ${meta.total} cubes in the stack). ` +
      `A solid block ${meta.W} × ${meta.D} × ${meta.hmax} holds ${meta.box}, so ${meta.box} - ${meta.total} = ${meta.answer} more are needed.`
    );
  }
  return (
    `Count column by column, remembering that cubes you cannot see are still there under each top face: ` +
    `${cols.join(' + ')} = ${meta.total}. Counting only the cubes with a visible face gives ${meta.visible}, which misses the hidden ones.`
  );
}

// ---------------------------------------------------------------------------------------------
// H: shape assembly

const cellKey = (c) => `${c[0]},${c[1]}`;
// Rotation-only canonical key (flips are NOT allowed to match).
export function rotKey(cells) {
  return [0, 1, 2, 3].map((k) => polyKey(rotate(cells, k))).sort()[0];
}
function distinctRotations(cells) {
  const m = new Map();
  for (let k = 0; k < 4; k++) {
    const c = rotate(cells, k);
    m.set(polyKey(c), c);
  }
  return [...m.values()];
}
const maxDim = (cells) => {
  const { w, h } = boundingBox(cells);
  return Math.max(w, h);
};

// Do A and B (rotations allowed, no flips) tile T exactly? Exhaustive placement.
export function tilesTarget(T, A, B) {
  if (A.length + B.length !== T.length) return false;
  const tset = new Set(T.map(cellKey));
  const bKeys = new Set(distinctRotations(B).map(polyKey));
  for (const ar of distinctRotations(A)) {
    for (const t of T) {
      const dx = t[0] - ar[0][0];
      const dy = t[1] - ar[0][1];
      const placed = ar.map(([x, y]) => [x + dx, y + dy]);
      if (!placed.every((c) => tset.has(cellKey(c)))) continue;
      const pk = new Set(placed.map(cellKey));
      const rest = T.filter((c) => !pk.has(cellKey(c)));
      if (rest.length === B.length && bKeys.has(polyKey(rest))) return true;
    }
  }
  return false;
}

function hasHole(cells) {
  const set = new Set(cells.map(cellKey));
  const { w, h } = boundingBox(cells);
  const n = normalize(cells);
  const s2 = new Set(n.map(cellKey));
  const seen = new Set();
  const stack = [[-1, -1]];
  seen.add('-1,-1');
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (nx < -1 || ny < -1 || nx > w || ny > h || seen.has(k) || s2.has(k)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen.size + n.length !== (w + 2) * (h + 2) && set.size > 0;
}

// Polyominoes one cell-edit away (same size), plus size+1 and size-1 neighbours.
function neighbours(cells) {
  const n = normalize(cells);
  const out = new Map();
  const have = new Set(n.map(cellKey));
  const adds = [];
  for (const [x, y] of n) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!have.has(k)) adds.push([x + dx, y + dy]);
    }
  }
  const grow = new Map();
  for (const a of adds) {
    const c = normalize([...n, a]);
    grow.set(rotKey(c), c);
  }
  const shrink = new Map();
  for (let i = 0; i < n.length; i++) {
    const c = n.filter((_, j) => j !== i);
    if (c.length && isConnected(c)) shrink.set(rotKey(normalize(c)), normalize(c));
  }
  // same-size edits: remove one cell, add one
  for (const s of shrink.values()) {
    const sh = new Set(s.map(cellKey));
    for (const [x, y] of s) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (sh.has(k)) continue;
        const c = normalize([...s, [x + dx, y + dy]]);
        if (c.length === n.length) out.set(rotKey(c), c);
      }
    }
  }
  out.delete(rotKey(n));
  return { same: [...out.values()], grow: [...grow.values()], shrink: [...shrink.values()] };
}

const H_SPECS = {
  H1: { sizes: [[3, 4]], sameTotal: 2, mirrorTrap: false },
  H2: { sizes: [[4, 4], [3, 5]], sameTotal: 3, mirrorTrap: true },
  H3: { sizes: [[5, 5], [4, 6]], sameTotal: 4, mirrorTrap: true },
};

function randomPiece(r, size) {
  for (let t = 0; t < 50; t++) {
    const free = pick(r, freePolyominoes(size));
    let c = rotate(free, ri(r, 4));
    if (r() < 0.5) c = mirror(c);
    c = normalize(c);
    if (maxDim(c) <= 4) return c;
  }
  throw new Error('no piece');
}

function placeBeside(r, A, B) {
  const aset = new Set(A.map(cellKey));
  const options = new Map();
  for (const rb of distinctRotations(B)) {
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -6; dy <= 6; dy++) {
        const placed = rb.map(([x, y]) => [x + dx, y + dy]);
        if (placed.some((c) => aset.has(cellKey(c)))) continue;
        const touches = placed.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => aset.has(`${x + a},${y + b}`)));
        if (!touches) continue;
        const union = normalize([...A, ...placed]);
        const bb = boundingBox(union);
        if (bb.w > 6 || bb.h > 6 || hasHole(union)) continue;
        options.set(polyKey(union), union);
      }
    }
  }
  const list = [...options.values()];
  return list.length ? pick(r, list) : null;
}

const PAIR_VB = [120, 80];
function pairSvg(pieces, cs) {
  let inner = '';
    pieces.forEach((cells, i) => {
    const n = normalize(cells);
    const { w, h } = boundingBox(n);
    const ox = (i === 0 ? 28 : 92) - (w * cs) / 2;
    const oy = PAIR_VB[1] / 2 - (h * cs) / 2;
    for (const [x, y] of n) {
      inner += `<rect x="${num(ox + x * cs)}" y="${num(oy + y * cs)}" width="${num(cs)}" height="${num(cs)}" class="f-grey" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`;
    }
  });
  inner += `<text x="60" y="40" font-size="14" font-weight="700" fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central">+</text>`;
  return svgWrap(PAIR_VB[0], PAIR_VB[1], inner, `Two pieces of ${pieces[0].length} and ${pieces[1].length} squares`);
}

const TARGET_VB = [180, 140];
export function targetSvg(cells) {
  const n = normalize(cells);
  const { w, h } = boundingBox(n);
  const cs = Math.min(26, (TARGET_VB[0] - 16) / w, (TARGET_VB[1] - 16) / h);
  const ox = (TARGET_VB[0] - w * cs) / 2;
  const oy = (TARGET_VB[1] - h * cs) / 2;
  let inner = '';
  for (const [x, y] of n) {
    inner += `<rect x="${num(ox + x * cs)}" y="${num(oy + y * cs)}" width="${num(cs)}" height="${num(cs)}" class="f-grey" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  return svgWrap(TARGET_VB[0], TARGET_VB[1], inner, `Target shape made of ${n.length} squares`, 'display:block;margin:0 auto');
}

function assemblyVariant(id, seed) {
  const spec = H_SPECS[id];
  const r = rng(`${id}#${seed}`);
  for (let attempt = 0; attempt < 400; attempt++) {
    const [sa, sb] = pick(r, spec.sizes);
    const A = randomPiece(r, sa);
    const B = randomPiece(r, sb);
    const T = placeBeside(r, A, B);
    if (!T || !tilesTarget(T, A, B)) continue;
    const total = T.length;
    const trueKey = [rotKey(A), rotKey(B)].sort().join('|');
    const seen = new Set([trueKey]);
    const dist = [];
    const tryAdd = (P, Qp, kind) => {
      if (dist.length >= 4) return false;
      if (maxDim(P) > 4 || maxDim(Qp) > 4) return false;
      const k = [rotKey(P), rotKey(Qp)].sort().join('|');
      if (seen.has(k)) return false;
      if (tilesTarget(T, P, Qp) || tilesTarget(T, Qp, P)) return false;
      seen.add(k);
      dist.push({ pieces: [P, Qp], kind, total: P.length + Qp.length });
      return true;
    };
    const nbA = neighbours(A);
    const nbB = neighbours(B);
    const same = [];
    if (spec.mirrorTrap) {
      if (rotKey(mirror(A)) !== rotKey(A)) same.push([mirror(A), B, 'mirror']);
      if (rotKey(mirror(B)) !== rotKey(B)) same.push([A, mirror(B), 'mirror']);
    }
    const mirrors = shuffle(r, same);
    if (mirrors.length) tryAdd(...mirrors[0]);
    const near = shuffle(r, [
      ...nbA.same.map((P) => [P, B, 'near']),
      ...nbB.same.map((Qp) => [A, Qp, 'near']),
      ...nbA.grow.flatMap((P) => nbB.shrink.map((Qp) => [P, Qp, 'move'])),
      ...nbA.shrink.flatMap((P) => nbB.grow.map((Qp) => [P, Qp, 'move'])),
    ]);
    for (const c of near) {
      if (dist.length >= spec.sameTotal) break;
      tryAdd(...c);
    }
    for (let t = 0; t < 60 && dist.length < spec.sameTotal; t++) {
      const x = pick(r, [Math.max(2, sa - 1), sa, sa + 1]);
      const y = total - x;
      if (y < 2 || y > 6) continue;
      tryAdd(randomPiece(r, x), randomPiece(r, y), 'random');
    }
    // wrong-total pairs for the easier templates
    for (let t = 0; t < 80 && dist.length < 4; t++) {
      const pa = pick(r, [A, ...nbA.grow, ...nbA.shrink]);
      const pb = pick(r, [B, ...nbB.grow, ...nbB.shrink]);
      if (pa.length + pb.length === total) continue;
      tryAdd(pa, pb, 'size');
    }
    if (dist.length < 4) continue;
    // display: every piece turned by a random quarter turn, never mirrored
    const turn = (c) => rotate(c, ri(r, 4));
    const shownTrue = [turn(A), turn(B)];
    const shownD = dist.map((d) => d.pieces.map(turn));
    const all = [...shownTrue, ...shownD.flat()];
    const cs = Math.min(18, ...all.map((c) => Math.min(44 / boundingBox(c).w, 66 / boundingBox(c).h)));
    const item = finishItem({
      id,
      b: TB[id],
      prompt: 'Which two pieces fit together, without overlapping, to make the shape? Pieces may be turned but not flipped over.',
      stem: targetSvg(T),
      answerMarkup: pairSvg(shownTrue, cs),
      distractorMarkups: shownD.map((p) => pairSvg(p, cs)),
      seed,
      optionCols: 5,
    });
    const meta = {
      target: T,
      pieces: [A, B],
      distractors: dist.map((d) => ({ pieces: d.pieces, kind: d.kind })),
      shown: { answer: shownTrue, distractors: shownD },
      cs,
    };
    return { item, meta };
  }
  throw new Error(`${id}: no assembly variant for seed ${seed}`);
}

function assemblyExplain(meta) {
  const [a, b] = meta.pieces.map((p) => p.length);
  const kinds = new Set(meta.distractors.map((d) => d.kind));
  const why = [];
  if (kinds.has('mirror')) why.push('one pair needs a piece flipped over, which is not allowed');
  if (kinds.has('size')) why.push('some pairs have the wrong number of squares');
  why.push('the rest leave a gap or overlap wherever they are turned');
  return (
    `The ${a}-square piece and the ${b}-square piece fit together, turned into place, to cover all ${meta.target.length} squares of the shape. ` +
    `The other pairs fail: ${why.join('; ')}.`
  );
}

// ---------------------------------------------------------------------------------------------
// public API

export function variant(id, seed) {
  seed = seed >>> 0;
  switch (id[0]) {
    case 'P': if (P_SPECS[id]) return paperVariant(id, seed); break;
    case 'C': if (C_SPECS[id]) return cubeVariant(id, seed); break;
    case 'K': if (K_SPECS[id]) return blockVariant(id, seed); break;
    case 'H': if (H_SPECS[id]) return assemblyVariant(id, seed); break;
    default:
  }
  throw new Error(`unknown spatial2 template ${id}`);
}

export function explain(id, meta) {
  switch (id[0]) {
    case 'P': return paperExplain(meta);
    case 'C': return cubeExplain(meta);
    case 'K': return blockExplain(meta);
    case 'H': return assemblyExplain(meta);
    default: throw new Error(`unknown spatial2 template ${id}`);
  }
}

// Internals for tests and tooling. Not part of the module contract.
export const spatial2Data = { P_SPECS, C_SPECS, K_SPECS, H_SPECS, ROT24, NET_POOL, PANEL, PGAP, OPT_PAD, NET_CELL, PAIR_VB, TARGET_VB, BLOCK_SC };
