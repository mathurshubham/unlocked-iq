// Shared SVG primitives for figure items. Pure: builds markup strings, no DOM.
//
// Conventions (see docs/SPEC.md "SVG rules"): no ids/defs/url(#), ink is
// currentColor, stroke width 3 in a 100x100 cell, fills via classes only
// (f-none / f-grey / f-solid).

export const STROKE = 3;
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star'];
export const FILLS = ['none', 'grey', 'solid'];
export const SEG_IDS = ['h', 'v', 'd1', 'd2', 't', 'b', 'l', 'r'];
export const DOT_RING = 32;
export const DOT_R = 3.5; // plus stroke => visual radius 5

// Nominal "radius" per size, in a 100-unit cell.
export const SIZE_R = { xs: 12, s: 16, m: 22, l: 34 };
// When n copies share a cell, their radius is capped so nothing overlaps.
const COPY_CAP = { 1: Infinity, 2: 20, 3: 14, 4: 14, 5: 13, 6: 10.5 };
// Dice-style offsets from the cell centre.
const LAYOUTS = {
  1: [[0, 0]],
  2: [[-20, -20], [20, 20]],
  3: [[-27, -27], [0, 0], [27, 27]],
  4: [[-25, -25], [25, -25], [-25, 25], [25, 25]],
  5: [[-27, -27], [27, -27], [0, 0], [-27, 27], [27, 27]],
  6: [[-24, -29], [24, -29], [-24, 0], [24, 0], [-24, 29], [24, 29]],
};

const num = (v) => String(+v.toFixed(2));

export function radiusFor(size, n = 1) {
  const r = SIZE_R[size];
  if (r === undefined) throw new Error('unknown size ' + size);
  if (!COPY_CAP[n]) throw new Error('unsupported copy count ' + n);
  return Math.min(r, COPY_CAP[n]);
}

export function layout(n) {
  if (!LAYOUTS[n]) throw new Error('unsupported copy count ' + n);
  return LAYOUTS[n];
}

function regular(cx, cy, R, sides, shift) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (-90 + (360 / sides) * i) * (Math.PI / 180);
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a) + shift]);
  }
  return pts;
}

// Geometry of a shape of nominal radius r centred (optically) at cx, cy.
// Returns { type: 'circle', cx, cy, r } or { type: 'poly', pts }.
export function shapeGeom(shape, cx, cy, r) {
  switch (shape) {
    case 'circle':
      return { type: 'circle', cx, cy, r };
    case 'square': {
      const h = 0.78 * r;
      return { type: 'poly', pts: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]] };
    }
    case 'diamond': {
      const hh = 1.15 * r;
      const hw = 0.88 * r;
      return { type: 'poly', pts: [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]] };
    }
    case 'triangle': {
      const R = 1.15 * r;
      // Centroid is at the circumcentre but the bounding box is higher; nudge
      // halfway so the triangle reads as centred.
      return { type: 'poly', pts: regular(cx, cy, R, 3, 0.125 * R) };
    }
    case 'pentagon': {
      const R = 1.05 * r;
      return { type: 'poly', pts: regular(cx, cy, R, 5, 0.05 * R) };
    }
    case 'hexagon':
      return { type: 'poly', pts: regular(cx, cy, 1.05 * r, 6, 0) };
    case 'star': {
      const R = 1.15 * r;
      const shift = 0.05 * R;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (-90 + 36 * i) * (Math.PI / 180);
        const rr = i % 2 === 0 ? R : 0.42 * R;
        pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a) + shift]);
      }
      return { type: 'poly', pts };
    }
    default:
      throw new Error('unknown shape ' + shape);
  }
}

// Furthest the drawn shape (including half the stroke) reaches from its centre.
export function outerRadius(shape, r) {
  const g = shapeGeom(shape, 0, 0, r);
  const reach = g.type === 'circle' ? g.r : Math.max(...g.pts.map(([x, y]) => Math.hypot(x, y)));
  return reach + STROKE / 2;
}

export function shapeEl(shape, fill, cx, cy, r) {
  if (!FILLS.includes(fill)) throw new Error('unknown fill ' + fill);
  const g = shapeGeom(shape, cx, cy, r);
  if (g.type === 'circle') {
    return `<circle class="f-${fill}" cx="${num(g.cx)}" cy="${num(g.cy)}" r="${num(g.r)}"/>`;
  }
  const pts = g.pts.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
  return `<polygon class="f-${fill}" points="${pts}"/>`;
}

// n copies of one shape in a dice-style layout, smaller as n grows.
export function copies(shape, fill, size, n = 1, cx = 50, cy = 50) {
  const r = radiusFor(size, n);
  return layout(n)
    .map(([dx, dy]) => shapeEl(shape, fill, cx + dx, cy + dy, r))
    .join('');
}

// Asymmetric arrow: points up at rot 0, rotated clockwise by rot degrees.
export function arrowEl(rot) {
  return (
    `<g transform="rotate(${num(rot)} 50 50)">` +
    '<line x1="50" y1="40" x2="50" y2="82"/>' +
    '<line x1="50" y1="70" x2="60" y2="80"/>' +
    '<polygon class="f-solid" points="50,18 37,42 63,42"/>' +
    '</g>'
  );
}

const SEG_COORDS = {
  h: [15, 50, 85, 50],
  v: [50, 15, 50, 85],
  d1: [15, 15, 85, 85],
  d2: [85, 15, 15, 85],
  t: [15, 15, 85, 15],
  b: [15, 85, 85, 85],
  l: [15, 15, 15, 85],
  r: [85, 15, 85, 85],
};

export function segEl(id) {
  const c = SEG_COORDS[id];
  if (!c) throw new Error('unknown segment ' + id);
  return `<line x1="${c[0]}" y1="${c[1]}" x2="${c[2]}" y2="${c[3]}"/>`;
}

// Dot on a ring of 8 positions: k = 0 at top, clockwise by 45 degrees.
export function dotPos(k) {
  const a = (k % 8) * 45 * (Math.PI / 180);
  return [50 + DOT_RING * Math.sin(a), 50 - DOT_RING * Math.cos(a)];
}

export function dotEl(k) {
  const [x, y] = dotPos(k);
  return `<circle class="f-solid" cx="${num(x)}" cy="${num(y)}" r="${DOT_R}"/>`;
}

// Cell model: array of elements
//   { t: 'shape', shape, fill, size, n } | { t: 'arrow', rot } | { t: 'seg', id } | { t: 'dot', k }
export function elementMarkup(e) {
  switch (e.t) {
    case 'shape': return copies(e.shape, e.fill, e.size, e.n ?? 1);
    case 'arrow': return arrowEl(e.rot);
    case 'seg': return segEl(e.id);
    case 'dot': return dotEl(e.k);
    default: throw new Error('unknown element ' + e.t);
  }
}

export function cellContent(cell) {
  return (
    `<g stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">` +
    cell.map(elementMarkup).join('') +
    '</g>'
  );
}

const border = (x, y) =>
  `<rect class="f-none" x="${x + 1}" y="${y + 1}" width="98" height="98" rx="4" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Short plain-language description of a cell, for aria-label.
export function describeCell(cell) {
  const parts = [];
  const segs = cell.filter((e) => e.t === 'seg').map((e) => e.id);
  for (const e of cell) {
    if (e.t === 'shape') {
      const fill = e.fill === 'none' ? 'empty' : e.fill === 'grey' ? 'grey' : 'solid';
      const n = e.n ?? 1;
      parts.push(`${n} ${fill} ${e.size} ${e.shape}${n === 1 ? '' : 's'}`);
    } else if (e.t === 'arrow') {
      parts.push(`arrow rotated ${e.rot} degrees`);
    } else if (e.t === 'dot') {
      parts.push(`dot at position ${e.k}`);
    }
  }
  if (segs.length) parts.push(`${plural(segs.length, 'line')}: ${segs.join(', ')}`);
  return parts.join(' with ') || 'empty cell';
}

// Single 100x100 cell as its own SVG (used for answer options).
export function cellSvg(cell, label = describeCell(cell)) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" role="img" ' +
    `aria-label="${label}">` +
    border(0, 0) +
    cellContent(cell) +
    '</svg>'
  );
}

// 3x3 stem: viewBox 320, cells 100x100 with 10px gaps. cellAt(r, c) returns a
// cell, or null for the missing cell, which shows a large "?".
export function gridSvg(cellAt, label = '3 by 3 pattern grid, bottom-right cell missing') {
  let body = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = c * 110;
      const y = r * 110;
      const cell = cellAt(r, c);
      const inner = cell
        ? cellContent(cell)
        : '<text x="50" y="52" font-size="64" font-weight="600" font-family="inherit" fill="currentColor" ' +
          'text-anchor="middle" dominant-baseline="central">?</text>';
      body += `<g transform="translate(${x} ${y})">${border(0, 0)}${inner}</g>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="100%" role="img" aria-label="${label}">${body}</svg>`;
}
