// Independent oracles for the spatial2 families. Nothing here imports the generator's geometry:
// each check is a second derivation of the same facts (reverse unfolding, rolling a cube over a
// net, ray casting a voxel stack, brute-force tiling).

// ---------- P: reverse unfolding on lattice positions ----------

const side = (f, p) => {
  if (f.kind === 'v') return p[0] - f.c;
  if (f.kind === 'h') return p[1] - f.c;
  if (f.kind === 'd1') return p[0] - p[1] - f.c;
  return p[0] + p[1] - f.c;
};
const refl = (f, p) => {
  if (f.kind === 'v') return [2 * f.c - p[0], p[1]];
  if (f.kind === 'h') return [p[0], 2 * f.c - p[1]];
  if (f.kind === 'd1') return [p[1] + f.c, p[0] - f.c];
  return [f.c - p[1], f.c - p[0]];
};
const pk = (p) => `${p[0]},${p[1]}`;

// Returns { holes:Set('i,j'), ok, problems } for a fold list and punched cells (i,j in the folded state).
export function unfoldHoles(N, folds, punched) {
  const problems = [];
  const all = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) all.push([i + 0.5, j + 0.5]);
  const states = [all];
  for (const f of folds) {
    const prev = states[states.length - 1];
    const keys = new Set(prev.map(pk));
    const stat = prev.filter((p) => -f.flap * side(f, p) >= -1e-9);
    // legality at lattice level: every flapping position lands on paper that stays put
    const statKeys = new Set(stat.map(pk));
    for (const p of prev) {
      if (f.flap * side(f, p) > 1e-9 && !statKeys.has(pk(refl(f, p)))) problems.push(`flap ${pk(p)} lands off the paper`);
    }
    if (!prev.some((p) => f.flap * side(f, p) > 1e-9) || !stat.length) problems.push('empty side');
    states.push(stat);
    void keys;
  }
  let H = new Set(punched.map(([i, j]) => pk([i + 0.5, j + 0.5])));
  for (const q of H) if (!states[folds.length].some((p) => pk(p) === q)) problems.push(`punch ${q} not on paper`);
  for (let k = folds.length - 1; k >= 0; k--) {
    const f = folds[k];
    const next = new Set();
    for (const p of states[k]) {
      const flapping = f.flap * side(f, p) > 1e-9;
      const image = flapping ? refl(f, p) : p;
      if (H.has(pk(image))) {
        next.add(pk(p));
        if (Math.abs(side(f, p)) < 1e-9) problems.push(`hole on crease ${pk(p)}`);
      }
    }
    H = next;
  }
  const holes = new Set([...H].map((s) => s.split(',').map((v) => v - 0.5).join(',')));
  return { holes, ok: problems.length === 0, problems };
}

// Parse an unfolded-sheet option back to hole cells (layout: pad 6, square sheet in a 100 box).
export function parseSheet(svg, N) {
  const s = (100 - 12) / N;
  const out = new Set();
  for (const m of svg.matchAll(/<circle class="f-solid" cx="([\d.]+)" cy="([\d.]+)"/g)) {
    const i = Math.round((+m[1] - 6) / s - 0.5);
    const j = Math.round((+m[2] - 6) / s - 0.5);
    out.add(`${i},${j}`);
  }
  return out;
}

// ---------- C: roll a cube over the net ----------

const matmul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const transpose = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
const mv = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// Cube lies under the paper (z up towards the viewer, y up on the page), printed side up.
// Rolling towards a neighbour makes the face on that side the new top face.
const ROLL = {
  E: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  W: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  N: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  S: [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
};

// Face frames in the cube's own frame: { n, ex, ey } per net cell (ex = page right, ey = page down).
export function rollFaces(cells) {
  const idx = new Map(cells.map(([x, y], i) => [`${x},${y}`, i]));
  const Ms = new Array(cells.length).fill(null);
  Ms[0] = I3;
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    const [x, y] = cells[i];
    for (const [dx, dy, d] of [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']]) {
      const j = idx.get(`${x + dx},${y + dy}`);
      if (j === undefined || Ms[j]) continue;
      Ms[j] = matmul(ROLL[d], Ms[i]);
      queue.push(j);
    }
  }
  return Ms.map((M) => {
    const T = transpose(M);
    return { n: mv(T, [0, 0, 1]), ex: mv(T, [1, 0, 0]), ey: mv(T, [0, -1, 0]) };
  });
}

// The 24 rotations as the closure of two quarter turns.
export function rotationGroup() {
  const Rx = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  const Ry = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
  const key = (M) => M.flat().join(',');
  const seen = new Map([[key(I3), I3]]);
  const queue = [I3];
  while (queue.length) {
    const M = queue.pop();
    for (const G of [Rx, Ry]) {
      const N = matmul(G, M);
      if (!seen.has(key(N))) {
        seen.set(key(N), N);
        queue.push(N);
      }
    }
  }
  return [...seen.values()];
}

// Slot geometry written out again: normal, and the 3D direction of "right" and "up" for a glyph
// drawn upright on that face as the viewer reads it.
export const SLOT_FRAMES = [
  { n: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] }, // top
  { n: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] }, // left-front
  { n: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] }, // right-front
];
const eqv = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const neg = (a) => a.map((v) => -v);
// glyph "up" after k clockwise quarter turns on a face: up -> right -> down -> left
export const upAfter = (fr, k) => [fr.up, fr.right, neg(fr.up), neg(fr.right)][((k % 4) + 4) % 4];

// All views (3 slots of {g,k}) that the cube can show. assign[i] = {g, r}: glyph and printed turns.
export function possibleViews(cells, assign, symmetric) {
  const base = rollFaces(cells);
  const faces = base.map((f, i) => ({
    n: f.n,
    up: [neg(f.ey), f.ex, f.ey, neg(f.ex)][assign[i].r],
    g: assign[i].g,
  }));
  const out = new Map();
  for (const Q of rotationGroup()) {
    const spec = SLOT_FRAMES.map((s) => {
      const f = faces.find((fc) => eqv(mv(Q, fc.n), s.n));
      const upw = mv(Q, f.up);
      let k = -1;
      for (let t = 0; t < 4; t++) if (eqv(upAfter(s, t), upw)) k = t;
      if (k < 0) throw new Error('bad frame');
      return { g: f.g, k: symmetric ? 0 : k };
    });
    out.set(spec.map((s) => `${s.g}.${s.k}`).join('|'), spec);
  }
  return out;
}
export const specKeyOf = (spec) => spec.map((s) => `${s.g}.${s.k}`).join('|');

export const isoProject = (p) => [50 + (52 * (p[0] - p[2])) / Math.SQRT2, 50 - (52 * (-p[0] + 2 * p[1] - p[2])) / Math.sqrt(6)];
export const fmt = (x) => String(Math.round(x * 100) / 100).replace(/^-0$/, '0');

// ---------- K: ray casting a voxel stack ----------

// Is the point (x,y,z) inside a cube of the stack?
const solid = (H, x, y, z) => {
  const i = Math.floor(x);
  const k = Math.floor(z);
  if (i < 0 || k < 0 || i >= H.length || k >= H[0].length || y < 0) return false;
  return y < H[i][k];
};

// Face visible from the viewer at (+,+,+)? Sample the whole face; all samples must agree.
export function faceVisibility(H, kind, x, y, z) {
  const n = kind === 'top' ? [0, 1, 0] : kind === 'left' ? [0, 0, 1] : [1, 0, 0];
  const res = [];
  for (const a of [0.1, 0.5, 0.9]) {
    for (const b of [0.1, 0.5, 0.9]) {
      let p;
      if (kind === 'top') p = [x + a, y + 1, z + b];
      else if (kind === 'left') p = [x + a, y + b, z + 1];
      else p = [x + 1, y + a, z + b];
      let hit = false;
      for (let t = 0.01; t < 14; t += 0.01) {
        if (solid(H, p[0] + t + n[0] * 1e-6, p[1] + t + n[1] * 1e-6, p[2] + t + n[2] * 1e-6)) { hit = true; break; }
      }
      // a face is only a face if the cube beyond it is empty
      const beyond = solid(H, p[0] + n[0] * 0.5, p[1] + n[1] * 0.5, p[2] + n[2] * 0.5);
      res.push(!hit && !beyond);
    }
  }
  return res.every((v) => v) ? true : res.every((v) => !v) ? false : null;
}

// ---------- H: brute-force tiling with bitmasks ----------

const norm = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]);
};
const rot = (cells) => norm(cells.map(([x, y]) => [-y, x]));

function placements(piece, tcells) {
  const out = [];
  let cur = norm(piece);
  const seen = new Set();
  for (let r = 0; r < 4; r++) {
    for (const [tx, ty] of tcells) {
      for (const [px, py] of cur) {
        const dx = tx - px;
        const dy = ty - py;
        const placed = cur.map(([x, y]) => `${x + dx},${y + dy}`).sort();
        const k = placed.join(';');
        if (!seen.has(k)) {
          seen.add(k);
          out.push(placed);
        }
      }
    }
    cur = rot(cur);
  }
  return out;
}

// Number of ways (A placed, B placed) that exactly cover the target; rotations allowed, no flips.
export function countTilings(target, A, B) {
  const tset = new Set(target.map(([x, y]) => `${x},${y}`));
  if (A.length + B.length !== tset.size) return 0;
  const inT = (pl) => pl.every((c) => tset.has(c));
  const pa = placements(A, target).filter(inT);
  const pb = placements(B, target).filter(inT);
  let n = 0;
  for (const a of pa) {
    const as = new Set(a);
    for (const b of pb) if (b.every((c) => !as.has(c))) n++;
  }
  return n;
}

// Parse the unit squares of a figure and split them into pieces by edge contact.
export function parsePieces(svg) {
  const rects = [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)"/g)].map((m) => ({ x: +m[1], y: +m[2], w: +m[3] }));
  const cs = rects[0].w;
  const parent = rects.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  rects.forEach((a, i) =>
    rects.forEach((b, j) => {
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if ((Math.abs(dx - cs) < 0.06 && dy < 0.06) || (Math.abs(dy - cs) < 0.06 && dx < 0.06)) parent[find(i)] = find(j);
    })
  );
  const groups = new Map();
  rects.forEach((r, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });
  return [...groups.values()].map((g) => {
    const mx = Math.min(...g.map((r) => r.x));
    const my = Math.min(...g.map((r) => r.y));
    return g.map((r) => [Math.round((r.x - mx) / cs), Math.round((r.y - my) / cs)]);
  });
}
