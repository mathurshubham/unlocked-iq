// Independent checking code for test/numeric.test.mjs. Nothing here imports the generator:
// it parses rendered markup and recomputes answers / ambiguity from scratch.
import assert from 'node:assert/strict';

export const unesc = (s) => s.replace(/&nbsp;/g, ' ');

// '<div class="series">a, b, c, <span class="q">?</span></div>' -> ['a','b','c']
export function seriesTerms(stem) {
  const m = stem.match(/^<div class="series">(.*), <span class="q">\?<\/span><\/div>$/);
  assert.ok(m, 'series stem format: ' + stem);
  return m[1].split(', ');
}

// '<div class="series">EX → CODE<br>TG → <span class="q">?</span></div>'
export function codeLines(stem) {
  const m = stem.match(/^<div class="series">([A-Z]+) → ([A-Z0-9-]+)<br>([A-Z]+) → <span class="q">\?<\/span><\/div>$/);
  assert.ok(m, 'code stem format: ' + stem);
  return { ex: m[1], exCode: m[2], tg: m[3] };
}

// '<div class="series">a : b :: c : d :: e : <span class="q">?</span></div>'
export function analogyParts(stem) {
  const m = stem.match(/^<div class="series">(\d+) : (\d+) :: (\d+) : (\d+) :: (\d+) : <span class="q">\?<\/span><\/div>$/);
  assert.ok(m, 'analogy stem format: ' + stem);
  return m.slice(1).map(Number);
}

// All <text> contents of an svg, in document order.
export function svgTexts(svg) {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

// ---- number grids ------------------------------------------------------
// Rules written as predicates on a *completed* grid (array of 9, row-major). A rule is
// "consistent" if it holds on every line (rows or columns). The gap is ambiguous if some other
// value than the answer makes any rule hold.
const roles = (l) => [
  [l[0], l[1], l[2]],
  [l[1], l[0], l[2]],
  [l[2], l[0], l[1]],
];
const GRID_RULES = [
  { name: 'equal sums', ok: (ls) => new Set(ls.map((l) => l[0] + l[1] + l[2])).size === 1 },
  { name: 'equal products', ok: (ls) => new Set(ls.map((l) => l[0] * l[1] * l[2])).size === 1 },
  { name: 'equal sums of squares', ok: (ls) => new Set(ls.map((l) => l[0] ** 2 + l[1] ** 2 + l[2] ** 2)).size === 1 },
  { name: 'sums in AP', ok: (ls) => { const s = ls.map((l) => l[0] + l[1] + l[2]); return s[1] - s[0] === s[2] - s[1]; } },
  { name: 'products in AP', ok: (ls) => { const s = ls.map((l) => l[0] * l[1] * l[2]); return s[1] - s[0] === s[2] - s[1]; } },
  { name: 'first = col... any role is the sum', ok: (ls) => ls.every((l) => roles(l).some(([x, y, z]) => x === y + z)) },
  { name: 'third = first + second', ok: (ls) => ls.every((l) => l[2] === l[0] + l[1]) },
  { name: 'middle = first + third', ok: (ls) => ls.every((l) => l[1] === l[0] + l[2]) },
  { name: 'first = second + third', ok: (ls) => ls.every((l) => l[0] === l[1] + l[2]) },
  { name: 'third = first * second', ok: (ls) => ls.every((l) => l[2] === l[0] * l[1]) },
  { name: 'middle = first * third', ok: (ls) => ls.every((l) => l[1] === l[0] * l[2]) },
  { name: 'first = second * third', ok: (ls) => ls.every((l) => l[0] === l[1] * l[2]) },
  { name: 'third = first - second', ok: (ls) => ls.every((l) => l[2] === l[0] - l[1]) },
  { name: 'third = second - first', ok: (ls) => ls.every((l) => l[2] === l[1] - l[0]) },
  { name: 'arithmetic progression', ok: (ls) => ls.every((l) => l[1] - l[0] === l[2] - l[1]) },
  { name: 'geometric progression', ok: (ls) => ls.every((l) => l[1] * l[1] === l[0] * l[2]) },
  { name: 'all equal', ok: (ls) => ls.every((l) => l[0] === l[1] && l[1] === l[2]) },
  { name: 'third = first squared + second', ok: (ls) => ls.every((l) => l[2] === l[0] ** 2 + l[1]) },
  { name: 'third = first + second squared', ok: (ls) => ls.every((l) => l[2] === l[0] + l[1] ** 2) },
  { name: 'third = 2 first + second', ok: (ls) => ls.every((l) => l[2] === 2 * l[0] + l[1]) },
  { name: 'third = first + 2 second', ok: (ls) => ls.every((l) => l[2] === l[0] + 2 * l[1]) },
];
// Returns [{rule, axis, value}] for every other value (1..2000) that a rule would allow in the gap.
export function gridAlternatives(grid, q, answer) {
  const out = [];
  for (let v = 1; v <= 2000; v++) {
    if (v === answer) continue;
    const g = grid.slice();
    g[q] = v;
    const rows = [0, 1, 2].map((r) => g.slice(3 * r, 3 * r + 3));
    const cols = [0, 1, 2].map((c) => [g[c], g[3 + c], g[6 + c]]);
    for (const rule of GRID_RULES) {
      if (rule.ok(rows)) out.push({ rule: rule.name, axis: 'rows', value: v });
      if (rule.ok(cols)) out.push({ rule: rule.name, axis: 'cols', value: v });
    }
  }
  return out;
}
// Diagram rules: centre as a function of [tl, tr, bl, br].
const CENTRE = [
  ([a, b, c, d]) => a + b + c + d,
  ([a, b, c, d]) => a * d + b * c,
  ([a, b, c, d]) => a * c + b * d,
  ([a, b, c, d]) => a * b + c * d,
  ([a, b, c, d]) => Math.abs(a * d - b * c),
  ([a, b, c, d]) => (a + d) * (b + c),
  ([a, b, c, d]) => (a + b) * (c + d),
  ([a, b, c, d]) => (a + c) * (b + d),
  ([a, b, c, d]) => a * b * c * d,
  ([a, b, c, d]) => 2 * (a + d),
  ([a, b, c, d]) => 2 * (b + c),
  ([a, b, c, d]) => a + d + b * c,
  ([a, b, c, d]) => b + c + a * d,
  ([a, b, c, d]) => a + b + c + d - 1,
  ([a, b, c, d]) => a + b + c + d + 1,
  ([a, b, c, d]) => Math.max(a, b, c, d) * 2,
  ([a, b, c, d]) => a * b + c + d,
  ([a, b, c, d]) => a + b + c * d,
];
export function centreAlternatives(panels, qp, qk, answer) {
  const out = [];
  for (let v = 1; v <= 2000; v++) {
    if (v === answer) continue;
    const ps = panels.map((p) => p.slice());
    ps[qp][qk] = v;
    CENTRE.forEach((f, i) => {
      if (ps.every((p) => f(p.slice(0, 4)) === p[4])) out.push({ rule: i, value: v });
    });
  }
  return out;
}

// ---- symbol equations --------------------------------------------------
// Parse the rows (<g>) of a T svg into equations over shape names.
export function parseSymbolSvg(svg) {
  const rows = [...svg.matchAll(/<g>(.*?)<\/g>/g)].map((m) => m[1]);
  assert.ok(rows.length >= 3, 'rows');
  const fillOf = {};
  const eqs = rows.map((body) => {
    const toks = [];
    for (const m of body.matchAll(/<(circle|rect|polygon|text)\b([^>]*?)(?:\/>|>([^<]*)<\/text>)/g)) {
      const [, tag, attrs, txt] = m;
      if (tag === 'text') toks.push({ t: txt });
      else {
        const cls = attrs.match(/class="(f-(?:none|grey|solid))"/);
        assert.ok(cls, 'shape has fill class');
        let shape = tag === 'circle' ? 'circle' : tag === 'rect' ? 'square' : null;
        if (tag === 'polygon') {
          const pts = attrs.match(/points="([^"]*)"/)[1].trim().split(/\s+/).length;
          shape = pts === 3 ? 'triangle' : pts === 4 ? 'diamond' : null;
        }
        assert.ok(shape, 'known shape');
        if (fillOf[shape]) assert.equal(fillOf[shape], cls[1], `shape ${shape} always has the same fill`);
        fillOf[shape] = cls[1];
        toks.push({ s: shape });
      }
    }
    const eq = toks.findIndex((x) => x.t === '=');
    assert.ok(eq > 0 && eq === toks.length - 2, 'row shape: lhs = rhs');
    const lhs = toks.slice(0, eq);
    const terms = lhs.filter((_, i) => i % 2 === 0).map((x) => x.s);
    const ops = lhs.filter((_, i) => i % 2 === 1).map((x) => x.t);
    assert.ok(terms.every(Boolean), 'terms are shapes');
    assert.ok(ops.every((o) => ['+', '−', '×'].includes(o)), 'ops ' + ops);
    return { terms, ops, rhs: toks[eq + 1].t };
  });
  const fills = Object.values(fillOf);
  assert.equal(new Set(fills).size, fills.length, 'different shapes have different fills');
  return { eqs, fillOf };
}
const apply = (acc, op, v) => (op === '+' ? acc + v : op === '−' ? acc - v : acc * v);
export const evalEq = (env, eq) => eq.terms.slice(1).reduce((acc, s, i) => apply(acc, eq.ops[i], env[s]), env[eq.terms[0]]);
// All assignments of positive integers (1..max) to the shapes that satisfy every given equation.
export function allSolutions(given, max = 200) {
  const vars = [...new Set(given.flatMap((e) => e.terms))];
  const sols = [];
  const env = {};
  const rec = (i) => {
    if (i === vars.length) {
      sols.push({ ...env });
      return;
    }
    for (let v = 1; v <= max; v++) {
      env[vars[i]] = v;
      const assigned = new Set(vars.slice(0, i + 1));
      const live = given.filter((e) => e.terms.every((s) => assigned.has(s)) && e.terms.includes(vars[i]));
      if (live.every((e) => evalEq(env, e) === Number(e.rhs))) rec(i + 1);
    }
    delete env[vars[i]];
  };
  rec(0);
  return sols;
}

// ---- number analogies --------------------------------------------------
// Natural rival rules y = base(x) + c, |c| <= 6.
export const RIVAL_BASES = [
  (x) => x, (x) => 2 * x, (x) => 3 * x, (x) => 4 * x, (x) => 5 * x, (x) => 6 * x, (x) => 7 * x, (x) => 8 * x, (x) => 9 * x,
  (x) => x * x, (x) => 2 * x * x, (x) => 3 * x * x, (x) => 4 * x * x, (x) => 5 * x * x,
  (x) => x ** 3, (x) => 2 * x ** 3, (x) => 3 * x ** 3, (x) => 2 ** x, (x) => 3 ** x,
  (x) => x * x + x, (x) => x * x - x, (x) => x * x + 2 * x, (x) => (x + 1) ** 2, (x) => (x - 1) ** 2, (x) => (x + 2) ** 2,
  (x) => x * (x + 1) * (x + 2), (x) => x ** 4, (x) => x * x * x - x,
];
export function rivalPredictions(xs, ys, x3) {
  const preds = [];
  RIVAL_BASES.forEach((f, i) => {
    const c = ys[0] - f(xs[0]);
    if (Math.abs(c) <= 6 && f(xs[1]) + c === ys[1]) preds.push({ base: i, c, value: f(x3) + c });
  });
  return preds;
}

// ---- coding ------------------------------------------------------------
const A = 'A'.charCodeAt(0);
const ch = (n) => String.fromCharCode(A + n);
const idx = (c) => c.charCodeAt(0) - A;
const mapW = (w, f) => [...w].map((c, i) => f(idx(c), i));
const asLetters = (arr) => (arr.every((n) => n >= 0 && n <= 25) ? arr.map(ch).join('') : null);
// Every candidate code rule (as word -> string | null).
export function codeCandidates() {
  const out = [];
  for (let k = -12; k <= 12; k++) {
    out.push({ name: `shift ${k}`, f: (w) => asLetters(mapW(w, (n) => n + k)) });
    out.push({ name: `shift ${k} wrap`, f: (w) => mapW(w, (n) => ch(((n + k) % 26 + 26) % 26)).join('') });
    out.push({ name: `reverse+shift ${k}`, f: (w) => asLetters(mapW([...w].reverse().join(''), (n) => n + k)) });
    for (const d of [-2, -1, 1, 2]) out.push({ name: `progressive shift ${k} step ${d}`, f: (w) => asLetters(mapW(w, (n, i) => n + k + d * i)) });
  }
  out.push({ name: 'mirror alphabet', f: (w) => asLetters(mapW(w, (n) => 25 - n)) });
  out.push({ name: 'mirror+reverse', f: (w) => asLetters(mapW([...w].reverse().join(''), (n) => 25 - n)) });
  out.push({ name: 'reverse', f: (w) => [...w].reverse().join('') });
  out.push({ name: 'swap ends', f: (w) => w.slice(-1) + w.slice(1, -1) + w[0] });
  for (let k = -3; k <= 3; k++) {
    out.push({ name: `position code ${k}`, f: (w) => mapW(w, (n) => n + 1 + k).join('-') });
    out.push({ name: `reverse position code ${k}`, f: (w) => mapW(w, (n) => 26 - n + k).join('-') });
    out.push({ name: `reversed word position code ${k}`, f: (w) => mapW([...w].reverse().join(''), (n) => n + 1 + k).join('-') });
  }
  out.push({ name: 'position sum', f: (w) => String(mapW(w, (n) => n + 1).reduce((a, b) => a + b, 0)) });
  return out;
}
export const shiftBy = (w, k) => [...w].map((c) => ch(idx(c) + k)).join('');
export const rev = (w) => [...w].reverse().join('');
export const positions = (w) => [...w].map((c) => idx(c) + 1);
