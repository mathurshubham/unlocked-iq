// Independent re-computation of answers for the v3 "extra" families (E, Y, W, Z, J).
// Parses generated markup / prompts and recomputes with code that shares nothing with items-extra.js.

const num = (s) => parseFloat(s);
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*?/?>`, 'g'))].map((m) => attrs(m[0]));

// ---------- E: segment containment ----------

// Lattice edges of a figure svg: <line> elements inside the figure group, lattice spacing 80/(W-1), margin 10.
export function latticeEdgesFromSvg(html, W) {
  const sp = 80 / (W - 1);
  const toL = (v) => Math.round((num(v) - 10) / sp);
  const out = new Set();
  for (const l of tags(html, 'line')) {
    const a = [toL(l.x1), toL(l.y1)], b = [toL(l.x2), toL(l.y2)];
    const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
    out.add(`${p}|${q}`);
  }
  return out;
}

// Does fig contain target translated by some (dx, dy)? Brute force over all offsets.
export function containsTranslated(fig, target, W) {
  const tl = [...target].map((k) => k.split('|').map((p) => p.split(',').map(Number)));
  for (let dx = -W; dx <= W; dx++) {
    for (let dy = -W; dy <= W; dy++) {
      const ok = tl.every(([p, q]) => {
        const a = [p[0] + dx, p[1] + dy], b = [q[0] + dx, q[1] + dy];
        const [s, t] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
        return fig.has(`${s}|${t}`);
      });
      if (ok) return true;
    }
  }
  return false;
}

// ---------- Y: 3D rotation ----------

// Rotation group built as the closure of two quarter turns (differs from the generator's signed permutations).
const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const RX = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
const RZ = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
export const GROUP = (() => {
  const seen = new Map();
  const id = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const q = [id];
  seen.set(JSON.stringify(id), id);
  while (q.length) {
    const m = q.shift();
    for (const g of [RX, RZ]) {
      const n = mul(g, m);
      const k = JSON.stringify(n);
      if (!seen.has(k)) { seen.set(k, n); q.push(n); }
    }
  }
  return [...seen.values()];
})();

const rotPt = (m, p) => [0, 1, 2].map((i) => m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2]);
function norm(cubes) {
  const mn = [0, 1, 2].map((i) => Math.min(...cubes.map((c) => c[i])));
  return cubes.map((c) => c.map((v, i) => v - mn[i])).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(String).join('/');
}
export const canonical3d = (cubes) => GROUP.map((m) => norm(cubes.map((c) => rotPt(m, c)))).sort()[0];
export const mirrored3d = (cubes) => cubes.map(([x, y, z]) => [x, -y, z]); // different mirror plane than the generator

// Ray-cast one screen point (unit coordinates before scaling) through the cube set.
// Screen: sx = (x - y) * cos30, sy = (x + y) / 2 - z. Rays run along (1,1,1), nearest first.
const C30 = Math.cos(Math.PI / 6);
export function boundsOf(cubes) {
  const mn = [0, 1, 2].map((i) => Math.min(...cubes.map((c) => c[i])));
  const mx = [0, 1, 2].map((i) => Math.max(...cubes.map((c) => c[i])) + 1);
  return { mn, mx, occ: new Set(cubes.map((c) => c.join())) };
}
// Returns { cell, prev } of the first occupied cell met by the ray (prev = cell just before), or null.
export function castRay(bd, sx, sy, dz = 0.012) {
  const D = sx / C30;
  const a = (D + 2 * sy) / 2, b = (2 * sy - D) / 2; // x = a + z0, y = b + z0
  const hi = Math.min(bd.mx[2], bd.mx[0] - a, bd.mx[1] - b) + 1.5;
  const lo = Math.max(bd.mn[2], bd.mn[0] - a, bd.mn[1] - b);
  let prev = null;
  for (let z0 = hi - 1e-9; z0 >= lo; z0 -= dz) {
    const cell = [Math.floor(a + z0), Math.floor(b + z0), Math.floor(z0)];
    if (bd.occ.has(cell.join())) return { cell, prev };
    prev = cell;
  }
  return null;
}
export function hitFace(bd, sx, sy) {
  const h = castRay(bd, sx, sy);
  if (!h) return null;
  if (!h.prev) return 'top'; // entered through the bounding box face
  if (h.prev[2] !== h.cell[2]) return 'top';
  if (h.prev[0] !== h.cell[0]) return 'right';
  if (h.prev[1] !== h.cell[1]) return 'left';
  return null;
}

export function polygonsOf(html) {
  return [...html.matchAll(/<polygon class="(f-[a-z]+)"[^>]*points="([^"]+)"/g)].map((m) => ({
    cls: m[1],
    pts: m[2].split(' ').map((p) => p.split(',').map(Number)),
  }));
}
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Verify a rendered object against its cube list: every sampled screen point shows the face the ray hits.
export function checkRender(html, cubes, step = 0.3) {
  const c30 = Math.cos(Math.PI / 6);
  const corners = [];
  for (const [x, y, z] of cubes) for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) corners.push([x + dx, y + dy, z + dz]);
  const proj = corners.map(([x, y, z]) => [(x - y) * c30, (x + y) / 2 - z]);
  const bx0 = Math.min(...proj.map((p) => p[0])), bx1 = Math.max(...proj.map((p) => p[0]));
  const by0 = Math.min(...proj.map((p) => p[1])), by1 = Math.max(...proj.map((p) => p[1]));
  // scale from the drawn bounding box (path + polygons)
  const nums = [...html.matchAll(/[ML]?(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  const dx0 = Math.min(...nums.map((p) => p[0])), dx1 = Math.max(...nums.map((p) => p[0]));
  const dy0 = Math.min(...nums.map((p) => p[1])), dy1 = Math.max(...nums.map((p) => p[1]));
  const u = (dx1 - dx0) / (bx1 - bx0);
  const ux = (dy1 - dy0) / (by1 - by0);
  if (Math.abs(u - ux) > 0.05 * u) return `scale mismatch ${u} vs ${ux}`;
  const polys = polygonsOf(html);
  const bd = boundsOf(cubes);
  for (let sx = bx0 + step / 2; sx < bx1; sx += step) {
    for (let sy = by0 + step / 2; sy < by1; sy += step) {
      // keep clear of face boundaries so rounding cannot flip the answer
      const face = hitFace(bd, sx + 0.013, sy + 0.007);
      const pt = [dx0 + (sx + 0.013 - bx0) * u, dy0 + (sy + 0.007 - by0) * u];
      const drawn = polys.find((p) => pointInPoly(pt, p.pts));
      const got = drawn ? (drawn.cls === 'f-grey' ? 'left' : 'right') : null;
      const want = face === 'top' || face === null ? null : face;
      if (got !== want) {
        // tolerate points within 0.12 of an edge (stroke/rounding)
        const near = [[0.13, 0], [-0.13, 0], [0, 0.13], [0, -0.13], [0.02, 0], [-0.02, 0], [0, 0.02], [0, -0.02], [0.02, 0.02], [-0.02, -0.02], [0.02, -0.02], [-0.02, 0.02]].some(([ex, ey]) => {
          const f2 = hitFace(bd, sx + 0.013 + ex, sy + 0.007 + ey);
          return f2 !== face;
        });
        if (!near) return `face mismatch at ${sx.toFixed(2)},${sy.toFixed(2)}: want ${want} got ${got}`;
      }
    }
  }
  return null;
}

// Number of distinct cubes that are the first hit of some ray (visible cubes).
export function visibleCubeCount(cubes) {
  const bd = boundsOf(cubes);
  const proj = cubes.flatMap(([x, y, z]) => [[0, 0, 0], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1], [0, 0, 1], [1, 0, 0], [0, 1, 0]].map(([i, j, k]) => [(x + i - y - j) * C30, (x + i + y + j) / 2 - z - k]));
  const x0 = Math.min(...proj.map((p) => p[0])), x1 = Math.max(...proj.map((p) => p[0]));
  const y0 = Math.min(...proj.map((p) => p[1])), y1 = Math.max(...proj.map((p) => p[1]));
  const seen = new Set();
  for (let sx = x0 + 0.01; sx < x1; sx += 0.11) {
    for (let sy = y0 + 0.01; sy < y1; sy += 0.11) {
      const h = castRay(bd, sx, sy, 0.01);
      if (h) seen.add(h.cell.join());
    }
  }
  return seen.size;
}

// ---------- W: gears ----------

export function parseGears(html) {
  const polys = [...html.matchAll(/<polygon class="f-none" points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
  const gears = polys.map((pts) => {
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const r = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length;
    return { cx, cy, r };
  });
  const labels = [...html.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>(\d+)<\/text>/g)].map((m) => ({ x: +m[1], y: +m[2], n: +m[3] }));
  const labelled = gears.map((g) => labels.find((l) => Math.hypot(l.x - g.cx, l.y - g.cy) < 2));
  const rods = [];
  for (const l of tags(html, 'line')) {
    if (l['stroke-width'] !== '6') continue;
    const ends = [[+l.x1, +l.y1], [+l.x2, +l.y2]].map((e) => gears.findIndex((g) => Math.hypot(g.cx - e[0], g.cy - e[1]) < 1));
    rods.push(ends);
  }
  const arc = html.match(/<path class="f-none" d="M[^"]*A[\d.]+ [\d.]+ 0 0 (\d)/);
  return { gears, labelled: labelled.map((l) => l && l.n), rods, firstCw: arc[1] === '1' };
}

export function gearAnswer(html, prompt) {
  const { gears, labelled, rods, firstCw } = parseGears(html);
  const n = gears.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(gears[i].cx - gears[j].cx, gears[i].cy - gears[j].cy);
      if (Math.abs(d - (gears[i].r + gears[j].r)) < 1.2) edges.push([i, j, -1]);
    }
  }
  for (const [a, b] of rods) edges.push([a, b, 1]);
  const dir = new Array(n).fill(null);
  dir[0] = firstCw;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [a, b, s] of edges) {
      for (const [p, q] of [[a, b], [b, a]]) {
        if (dir[p] !== null) {
          const want = s === 1 ? dir[p] : !dir[p];
          if (dir[q] === null) { dir[q] = want; changed = true; }
          else if (dir[q] !== want) throw new Error('contradictory gear train');
        }
      }
    }
  }
  if (dir.some((d) => d === null)) throw new Error('disconnected gear train');
  const askCw = /turn clockwise\?$/.test(prompt) && !/anticlockwise\?$/.test(prompt);
  const ask = /anticlockwise\?$/.test(prompt) ? false : askCw;
  const set = [];
  dir.forEach((d, i) => { if (d === ask) set.push(labelled[i]); });
  const firstSaid = /Gear 1 turns clockwise/.test(prompt);
  return { set: set.sort((a, b) => a - b), rods: rods.length, edges, n, firstSaid, firstCw, labelled };
}

export const textsOf = (html) => [...html.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

export function routeAnswer(prompt) {
  const heads = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  let h = 0, x = 0, y = 0;
  const steps = [...prompt.matchAll(/(?:Walk|Turn (left|right) and walk) (\d+) steps?/g)];
  steps.forEach((m) => {
    if (m[1]) h = (h + (m[1] === 'right' ? 1 : 3)) % 4;
    x += heads[h][0] * +m[2];
    y += heads[h][1] * +m[2];
  });
  return { x, y, legs: steps.length };
}

// ---------- Z: dominoes ----------

export function parseDominoes(html) {
  const circles = tags(html, 'circle');
  const rects = tags(html, 'rect');
  const count = rects.length; // domino outlines (+ the dashed ? slot in a stem)
  const byDomino = new Map();
  for (const c of circles) {
    const i = Math.floor(+c.cx / 40);
    if (!byDomino.has(i)) byDomino.set(i, [0, 0]);
    byDomino.get(i)[+c.cy < 35 ? 0 : 1]++;
  }
  const out = [];
  for (let i = 0; i < count; i++) out.push(byDomino.get(i) || [0, 0]);
  return out;
}
const m7 = (a) => ((a % 7) + 7) % 7;
// Infer the next domino from the shown ones using only the differences.
export function inferNextDomino(seq, kinds) {
  const col = (k) => seq.map((d) => d[k]);
  const diffs = (v) => v.slice(1).map((x, i) => m7(x - v[i]));
  return [0, 1].map((k) => {
    const kind = kinds[k];
    const v = col(k), d = diffs(v);
    if (kind === 'const') {
      if (new Set(d).size !== 1) throw new Error('not constant steps');
      return m7(v[v.length - 1] + d[0]);
    }
    if (kind === 'alt') {
      for (let i = 2; i < d.length; i++) if (d[i] !== d[i - 2]) throw new Error('not alternating');
      return m7(v[v.length - 1] + d[d.length - 2]);
    }
    const dd = d.slice(1).map((x, i) => m7(x - d[i]));
    if (new Set(dd).size !== 1) throw new Error('not growing steps');
    return m7(v[v.length - 1] + d[d.length - 1] + dd[0]);
  });
}

// ---------- J: clocks ----------

// Clock groups: each clock has a circle r=45 and two hands (stroke 3 minute, 6 hour) from its centre.
export function parseClocks(html) {
  const circles = tags(html, 'circle').filter((c) => c.r === '45');
  const lines = tags(html, 'line');
  return circles.map((c) => {
    const cx = +c.cx, cy = +c.cy;
    const hands = lines.filter((l) => +l.x1 === cx && +l.y1 === cy);
    if (!hands.length) return null; // the dashed ? slot
    const ang = (l) => {
      const a = (Math.atan2(+l.x2 - cx, -(+l.y2 - cy)) * 180) / Math.PI;
      return (a + 360) % 360;
    };
    const mh = hands.find((l) => l['stroke-width'] === '3'), hh = hands.find((l) => l['stroke-width'] === '6');
    const mAng = ang(mh), hAng = ang(hh);
    const total = Math.round(hAng * 2); // minutes after 12:00 on a 12 h clock
    if (Math.abs(((total % 60) * 6 - mAng + 540) % 360 - 180) > 3) throw new Error(`inconsistent hands ${hAng} ${mAng}`);
    return { total: total % 720, hAng, mAng };
  });
}
