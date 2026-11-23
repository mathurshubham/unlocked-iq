// Polyomino helpers and cube-net folding. Pure: no DOM access.
// Cells are [x, y] pairs on a grid, y pointing down.

// Translate to min 0 and sort (by y, then x) so equal shapes compare equal.
export function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// Rotate 90 degrees clockwise on screen (y down): east -> south.
export function rot90(cells) {
  return normalize(cells.map(([x, y]) => [-y, x]));
}

// Rotate by k quarter turns clockwise.
export function rotate(cells, k) {
  let out = normalize(cells);
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) out = rot90(out);
  return out;
}

// Flip left <-> right.
export function mirror(cells) {
  return normalize(cells.map(([x, y]) => [-x, y]));
}

// Flip top <-> bottom.
export function flipY(cells) {
  return normalize(cells.map(([x, y]) => [x, -y]));
}

// Canonical string for a normalized cell set (no rotation applied).
export function key(cells) {
  return normalize(cells)
    .map(([x, y]) => x + ',' + y)
    .join(';');
}

// The 4 rotations of a shape.
export function rotations(cells) {
  return [0, 1, 2, 3].map((k) => rotate(cells, k));
}

// All 8 orientations: 4 rotations, then 4 rotations of the mirror image.
export function orientations(cells) {
  return [...rotations(cells), ...rotations(mirror(cells))];
}

// True if b is a rotation of a (mirror images do not count).
export function sameByRotation(a, b) {
  const kb = key(b);
  return rotations(a).some((r) => key(r) === kb);
}

// True if all 8 orientations are pairwise different (no rotational or mirror symmetry).
export function isAsymmetric(cells) {
  return new Set(orientations(cells).map(key)).size === 8;
}

export function boundingBox(cells) {
  const n = normalize(cells);
  return {
    w: Math.max(...n.map((c) => c[0])) + 1,
    h: Math.max(...n.map((c) => c[1])) + 1,
  };
}

// 4-neighbour connectivity.
export function isConnected(cells) {
  if (!cells.length) return false;
  const set = new Set(cells.map(([x, y]) => x + ',' + y));
  if (set.size !== cells.length) return false;
  const seen = new Set();
  const stack = [cells[0]];
  seen.add(cells[0][0] + ',' + cells[0][1]);
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = x + dx + ',' + (y + dy);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === set.size;
}

// ---- cube folding ----

const OPP = { U: 'D', D: 'U', N: 'S', S: 'N', E: 'W', W: 'E' };

// Roll the cube one step. s maps position (U,D,N,S,E,W) -> original face.
// Rolling east: D<-E, E<-U, U<-W, W<-D (N, S unchanged); others analogous.
function roll(s, dir) {
  const t = { ...s };
  if (dir === 'E') { t.D = s.E; t.E = s.U; t.U = s.W; t.W = s.D; }
  else if (dir === 'W') { t.D = s.W; t.W = s.U; t.U = s.E; t.E = s.D; }
  else if (dir === 'S') { t.D = s.S; t.S = s.U; t.U = s.N; t.N = s.D; } // y + 1
  else { t.D = s.N; t.N = s.U; t.U = s.S; t.S = s.D; } // 'N', y - 1
  return t;
}

const STEPS = [
  [1, 0, 'E'],
  [-1, 0, 'W'],
  [0, 1, 'S'],
  [0, -1, 'N'],
];

// Fold a 6-cell net by rolling a cube across it, BFS from cell 0.
// Returns { valid, faceOf } where faceOf[i] is the original face ('U','D','N','S','E','W')
// that touches the net at cell i. valid <=> connected, 6 cells, 6 distinct faces.
export function foldNet(cells) {
  const n = cells.length;
  const faceOf = new Array(n).fill(null);
  if (n !== 6) return { valid: false, faceOf };
  const index = new Map(cells.map(([x, y], i) => [x + ',' + y, i]));
  if (index.size !== n) return { valid: false, faceOf };
  const states = new Array(n).fill(null);
  states[0] = { U: 'U', D: 'D', N: 'N', S: 'S', E: 'E', W: 'W' };
  faceOf[0] = 'D';
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    const [x, y] = cells[i];
    for (const [dx, dy, dir] of STEPS) {
      const j = index.get(x + dx + ',' + (y + dy));
      if (j === undefined || states[j]) continue;
      states[j] = roll(states[i], dir);
      faceOf[j] = states[j].D;
      queue.push(j);
    }
  }
  if (states.some((s) => !s)) return { valid: false, faceOf };
  return { valid: new Set(faceOf).size === 6, faceOf };
}

// Index of the net cell that ends up opposite cell i, or -1 if the net is invalid.
export function oppositeOf(cells, i) {
  const { valid, faceOf } = foldNet(cells);
  if (!valid) return -1;
  return faceOf.indexOf(OPP[faceOf[i]]);
}
