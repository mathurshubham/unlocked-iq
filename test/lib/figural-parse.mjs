// Independent reader for figural item markup: SVG string -> flat primitives, plus geometry
// helpers (tolerant scene equality, symmetry operations). Shares no code with items-figural.js.

const attr = (s, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(s);
  return m ? m[1] : null;
};
const fillOf = (s) => {
  const m = /class="f-(none|grey|solid)"/.exec(s);
  return m ? m[1] : null;
};

// Returns primitives in the svg's own coordinates. Borders (rect with stroke-opacity) and
// text are skipped. Only `translate(x y)` group transforms are supported (the items use no others).
export function parseSvg(html) {
  const prims = [];
  const stack = [[0, 0]];
  const tagRe = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const [, close, name, rest, self] = m;
    const [ox, oy] = stack[stack.length - 1];
    if (name === 'g') {
      if (close) { stack.pop(); continue; }
      const tr = attr(rest, 'transform');
      if (tr) {
        const t = /^translate\(([-\d.]+)[ ,]([-\d.]+)\)$/.exec(tr);
        if (!t) throw new Error('unsupported transform ' + tr);
        stack.push([ox + +t[1], oy + +t[2]]);
      } else stack.push([ox, oy]);
      continue;
    }
    if (close) continue;
    if (name === 'polygon') {
      const pts = attr(rest, 'points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
      prims.push({ t: 'poly', pts: pts.map(([x, y]) => [x + ox, y + oy]), fill: fillOf(rest) });
    } else if (name === 'circle') {
      prims.push({ t: 'circle', cx: +attr(rest, 'cx') + ox, cy: +attr(rest, 'cy') + oy, r: +attr(rest, 'r'), fill: fillOf(rest) });
    } else if (name === 'line') {
      prims.push({ t: 'line', x1: +attr(rest, 'x1') + ox, y1: +attr(rest, 'y1') + oy, x2: +attr(rest, 'x2') + ox, y2: +attr(rest, 'y2') + oy });
    } else if (name === 'rect' || name === 'text' || name === 'svg') {
      if (name === 'rect' && !rest.includes('stroke-opacity')) throw new Error('unexpected rect');
    } else throw new Error('unexpected element ' + name);
  }
  return prims;
}

export const bbox = (p) => {
  if (p.t === 'circle') return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
  if (p.t === 'line') return [Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2)];
  const xs = p.pts.map((q) => q[0]);
  const ys = p.pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
export const centre = (p) => {
  const b = bbox(p);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
};

// Prims whose bbox centre lies in [x0, x0+w) x [y0, y0+h), shifted to the origin.
export function cellOf(prims, x0, y0, w = 100, h = 100) {
  const out = [];
  for (const p of prims) {
    const [cx, cy] = centre(p);
    if (cx < x0 || cx >= x0 + w || cy < y0 || cy >= y0 + h) continue;
    out.push(shift(p, -x0, -y0));
  }
  return out;
}
export function shift(p, dx, dy) {
  if (p.t === 'circle') return { ...p, cx: p.cx + dx, cy: p.cy + dy };
  if (p.t === 'line') return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
  return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy]) };
}

// Apply a point map (and radius scale for circles) to a scene.
export function mapScene(scene, f, k = 1) {
  return scene.map((p) => {
    if (p.t === 'circle') { const [cx, cy] = f([p.cx, p.cy]); return { ...p, cx, cy, r: p.r * k }; }
    if (p.t === 'line') { const [x1, y1] = f([p.x1, p.y1]); const [x2, y2] = f([p.x2, p.y2]); return { ...p, x1, y1, x2, y2 }; }
    return { ...p, pts: p.pts.map(f) };
  });
}
// Dihedral group about (50, 50): o = mirror (>=4) left-right first, then (o % 4) clockwise quarter turns.
export function d4(scene, o) {
  const f = ([x, y]) => {
    if (o >= 4) x = 100 - x;
    for (let i = 0; i < o % 4; i++) [x, y] = [100 - y, x];
    return [x, y];
  };
  return mapScene(scene, f);
}
export const scaleScene = (scene, s) => mapScene(scene, ([x, y]) => [50 + (x - 50) * s, 50 + (y - 50) * s], s);
export const recolor = (scene, fill) => scene.map((p) => (p.t === 'line' ? p : { ...p, fill }));

const TOL = 0.1;
const close = (a, b) => Math.abs(a - b) <= TOL;
function primEq(a, b) {
  if (a.t !== b.t) return false;
  if (a.t === 'circle') return a.fill === b.fill && close(a.cx, b.cx) && close(a.cy, b.cy) && close(a.r, b.r);
  if (a.t === 'line') {
    const direct = close(a.x1, b.x1) && close(a.y1, b.y1) && close(a.x2, b.x2) && close(a.y2, b.y2);
    const flip = close(a.x1, b.x2) && close(a.y1, b.y2) && close(a.x2, b.x1) && close(a.y2, b.y1);
    return direct || flip;
  }
  if (a.fill !== b.fill || a.pts.length !== b.pts.length) return false;
  const used = new Set();
  for (const [x, y] of a.pts) {
    const j = b.pts.findIndex(([u, v], i) => !used.has(i) && close(x, u) && close(y, v));
    if (j < 0) return false;
    used.add(j);
  }
  return true;
}
// Multiset equality with tolerance.
export function sceneEq(A, B) {
  if (A.length !== B.length) return false;
  const used = new Set();
  for (const p of A) {
    const j = B.findIndex((q, i) => !used.has(i) && primEq(p, q));
    if (j < 0) return false;
    used.add(j);
  }
  return true;
}
// Remove from `scene` one prim matching each of `parts`; returns null if any is missing.
export function minus(scene, parts) {
  const rest = scene.slice();
  for (const p of parts) {
    const j = rest.findIndex((q) => primEq(p, q));
    if (j < 0) return null;
    rest.splice(j, 1);
  }
  return rest;
}
export const eqAny = (scene, list) => list.some((s) => sceneEq(scene, s));

// Number of true corners of a polygon (collinear / duplicate points removed).
export function corners(pts) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-3) out.push(b);
  }
  return out;
}
export const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return s + x * v - u * y; }, 0)) / 2;
