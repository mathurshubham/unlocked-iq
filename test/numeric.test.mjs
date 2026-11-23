import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, variant, explain, WORDS } from '../public/js/items-numeric.js';
import { checkSvg } from './lib/markup.mjs';
import * as O from './lib/numeric-oracle.mjs';

const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const IDS = TEMPLATES.map((t) => t.id);
const FAMILY_COUNT = { L: 5, G: 4, D: 3, Q: 3, T: 3, X: 6 };
const ch = (n) => String.fromCharCode(65 + n);
const idx = (c) => c.charCodeAt(0) - 65;
const isLetter = (x) => /^[A-Z]$/.test(x);
const triangular = (n) => (n * (n + 1)) / 2;
const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
const constDiff = (a) => {
  const d = a[1] - a[0];
  a.forEach((v, i) => i && assert.equal(v - a[i - 1], d, 'constant difference'));
  return d;
};

// ------------------------------------------------------------------ templates & word list
test('template list: contract fields, unique ids, family prefixes, difficulty spread', () => {
  assert.ok(TEMPLATES.length >= 23);
  assert.equal(new Set(IDS).size, IDS.length);
  const counts = {};
  for (const t of TEMPLATES) {
    assert.deepEqual(Object.keys(t).sort(), ['b', 'category', 'family', 'id', 'title']);
    assert.match(t.id, /^[LGDQTX]\d+$/);
    assert.equal(t.category, 'series');
    assert.ok(t.b >= -2.2 && t.b <= 2.0, t.id);
    assert.ok(t.title.length > 5);
    counts[t.id[0]] = (counts[t.id[0]] || 0) + 1;
  }
  assert.deepEqual(counts, FAMILY_COUNT);
  // each family spans at least 1.2 logits of difficulty
  for (const f of Object.keys(FAMILY_COUNT)) {
    const bs = TEMPLATES.filter((t) => t.id[0] === f).map((t) => t.b);
    assert.ok(Math.max(...bs) - Math.min(...bs) >= 1.2, `family ${f} spread`);
  }
});

test('word list: >= 150 distinct short uppercase words, no palindromes, none offensive', () => {
  assert.ok(WORDS.length >= 150, `${WORDS.length} words`);
  assert.equal(new Set(WORDS).size, WORDS.length, 'no duplicates');
  const banned = /^(ASS|BUM|DAMN|HELL|SEX|GAY|DIE|KILL|GUN|BOMB|NAZI|RAPE|SHIT|FUCK|CRAP|PISS|TIT|TITS|DICK|COCK|SLUT|WHORE|BITCH|DRUG|DRUGS|HATE|DEAD|DEATH|BLOOD|BEER|WINE|GIN|RUM|POT|WEED|HOE|NIP|BUTT|FART|POO|PEE|SPIT|SMOKE|DOPE|FAT|UGLY|STUPID|IDIOT)$/;
  const lens = new Set();
  for (const w of WORDS) {
    assert.match(w, /^[A-Z]{3,5}$/);
    assert.notEqual(w, [...w].reverse().join(''), `${w} is a palindrome`);
    assert.ok(!banned.test(w), `${w} is on the blocklist`);
    lens.add(w.length);
  }
  assert.deepEqual([...lens].sort(), [3, 4, 5]);
});

// ------------------------------------------------------------------ independent solvers
// Each solver reads ONLY the rendered stem (plus option texts for the ambiguity checks) and returns the answer string.
const SOLVE = {
  L1(item) {
    const t = O.seriesTerms(item.stem);
    const Ls = t.map((x) => idx(x[0]));
    const Ns = t.map((x) => Number(x.slice(1)));
    assert.ok(t.every((x) => /^[A-Z][1-9]\d{0,2}$/.test(x)));
    const s = constDiff(Ls);
    const d = constDiff(Ns);
    assert.ok(s >= 1 && s <= 3 && d >= 1 && d <= 6);
    return ch(Ls.at(-1) + s) + (Ns.at(-1) + d);
  },
  L2(item) {
    const t = O.seriesTerms(item.stem);
    assert.ok(t.every((x) => /^[A-Z]{2}$/.test(x)));
    const a = constDiff(t.map((x) => idx(x[0])));
    const b = constDiff(t.map((x) => idx(x[1])));
    assert.equal(a, -b, 'second letters step back by the same amount');
    assert.ok(a === 1 || a === 2);
    return ch(idx(t.at(-1)[0]) + a) + ch(idx(t.at(-1)[1]) + b);
  },
  L3(item) {
    const t = O.seriesTerms(item.stem);
    t.forEach((x, i) => assert.equal(isLetter(x), isLetter(t[0]) === (i % 2 === 0), 'alternating types'));
    const sub = (kind) => t.filter((x) => isLetter(x) === kind).map((x) => (kind ? idx(x) : Number(x)));
    const lett = sub(true);
    const nums = sub(false);
    const sl = constDiff(lett);
    const sn = constDiff(nums);
    assert.ok(sl >= 1 && sl <= 4 && Math.abs(sn) >= 2 && Math.abs(sn) <= 7);
    const nextIsLetter = isLetter(t.at(-2));
    return nextIsLetter ? ch(lett.at(-1) + sl) : String(nums.at(-1) + sn);
  },
  L4(item) {
    const t = O.seriesTerms(item.stem);
    const Ls = t.map((x) => idx(x[0]));
    const Ns = t.map((x) => Number(x.slice(1)));
    const gaps = Ls.slice(1).map((v, i) => v - Ls[i]);
    gaps.forEach((g, i) => i && assert.equal(g, gaps[i - 1] + 1, 'gaps grow by 1'));
    const m = Ns[1] / Ns[0];
    assert.ok(Number.isInteger(m) && (m === 2 || m === 3));
    Ns.forEach((v, i) => i && assert.equal(v, Ns[i - 1] * m));
    return ch(Ls.at(-1) + gaps.at(-1) + 1) + Ns.at(-1) * m;
  },
  L5(item) {
    const t = O.seriesTerms(item.stem);
    const Ls = t.map((x) => idx(x[0]));
    const Ns = t.map((x) => Number(x.slice(1)));
    const s = constDiff(Ls);
    assert.ok(s >= 2 && s <= 4);
    Ns.forEach((v, i) => i >= 2 && assert.equal(v, Ns[i - 1] + Ns[i - 2]));
    return ch(Ls.at(-1) + s) + (Ns.at(-1) + Ns.at(-2));
  },
  G1: (item) => solveGrid(item, 'sum'),
  G2: (item) => solveGrid(item, 'product'),
  G4: (item) => solveGrid(item, 'ap'),
  G3(item) {
    const tx = O.svgTexts(item.stem);
    assert.equal(tx.length, 15);
    const panels = [0, 1, 2].map((p) => tx.slice(5 * p, 5 * p + 5));
    const q = tx.indexOf('?');
    assert.equal(tx.filter((x) => x === '?').length, 1);
    const qp = Math.floor(q / 5);
    const full = panels.filter((_, i) => i !== qp).map((p) => p.map(Number));
    full.forEach((p) => assert.equal(p[0] + p[1] + p[2] + p[3], p[4], 'visible diagrams: centre = sum of corners'));
    const p = panels[qp];
    const k = q % 5;
    if (k === 4) return String(p.slice(0, 4).reduce((a, b) => a + Number(b), 0));
    const known = p.slice(0, 4).filter((_, i) => i !== k).reduce((a, b) => a + Number(b), 0);
    return String(Number(p[4]) - known);
  },
  D1(item) {
    const { ex, exCode, tg } = O.codeLines(item.stem);
    assert.equal(ex.length, exCode.length);
    const ks = [...ex].map((c, i) => idx(exCode[i]) - idx(c));
    assert.ok(ks.every((k) => k === ks[0]), 'uniform shift');
    assert.ok(ks[0] !== 0 && Math.abs(ks[0]) <= 3);
    return O.shiftBy(tg, ks[0]);
  },
  D2(item) {
    const { ex, exCode, tg } = O.codeLines(item.stem);
    const r = O.rev(ex);
    const ks = [...r].map((c, i) => idx(exCode[i]) - idx(c));
    assert.ok(ks.every((k) => k === ks[0]), 'uniform shift after reversal');
    assert.ok(ks[0] !== 0 && Math.abs(ks[0]) <= 3);
    return O.shiftBy(O.rev(tg), ks[0]);
  },
  D3(item) {
    const { ex, exCode, tg } = O.codeLines(item.stem);
    assert.equal(exCode, O.positions(ex).join('-'));
    return O.positions(tg).join('-');
  },
  Q1: (item) => solveAnalogy(item, (x) => x * x),
  Q2(item) {
    const [x1, y1, x2, y2] = O.analogyParts(item.stem);
    const c = y1 - x1 ** 3;
    assert.ok(c === 1 || c === -1);
    assert.equal(y2, x2 ** 3 + c);
    return String(O.analogyParts(item.stem)[4] ** 3 + c);
  },
  Q3(item) {
    const [x1, y1, x2, y2, x3] = O.analogyParts(item.stem);
    const m = (y2 - y1) / (x2 * x2 - x1 * x1);
    assert.ok(m === 2 || m === 3, 'm=' + m);
    const c = y1 - m * x1 * x1;
    assert.ok([-1, 1, 2].includes(c));
    return String(m * x3 * x3 + c);
  },
  T1: (item) => solveSymbols(item),
  T2: (item) => solveSymbols(item),
  T3: (item) => solveSymbols(item),
  X1(item) {
    const t = O.seriesTerms(item.stem).map(Number);
    t.forEach((v) => assert.ok(Number.isInteger((Math.sqrt(8 * v + 1) - 1) / 2), `${v} triangular`));
    const k = (Math.sqrt(8 * t[0] + 1) - 1) / 2;
    t.forEach((v, i) => assert.equal(v, triangular(k + i)));
    const d = t.at(-1) - t.at(-2);
    t.forEach((v, i) => i > 1 && assert.equal(v - t[i - 1], t[i - 1] - t[i - 2] + 1));
    return String(t.at(-1) + d + 1);
  },
  X2(item) {
    const t = O.seriesTerms(item.stem).map(Number);
    const sec = t.slice(2).map((v, i) => v - 2 * t[i + 1] + t[i]);
    assert.ok(sec.every((s) => s === 2), 'second differences all 2');
    const fits = [-2, -1, 1, 2, 3].filter((c) => {
      const r = Math.sqrt(t[0] - c);
      return Number.isInteger(r) && t.every((v, i) => v === (r + i) ** 2 + c);
    });
    assert.equal(fits.length, 1, 'exactly one "square + c" reading');
    return String(t.at(-1) + (t.at(-1) - t.at(-2)) + 2);
  },
  X3(item) {
    const t = O.seriesTerms(item.stem).map(Number);
    const nexts = new Set();
    for (const m of [2, 3]) {
      for (let p = 2; p <= 6; p++) {
        for (const mulFirst of [true, false]) {
          const sim = [t[0]];
          for (let i = 1; i <= t.length; i++) sim.push((mulFirst ? i % 2 === 1 : i % 2 === 0) ? sim[i - 1] * m : sim[i - 1] + p);
          if (t.every((v, i) => v === sim[i])) nexts.add(sim[t.length]);
        }
      }
    }
    assert.equal(nexts.size, 1, 'all alternating readings agree');
    return String([...nexts][0]);
  },
  X4(item) {
    const t = O.seriesTerms(item.stem).map(Number);
    t.forEach((v, i) => i >= 2 && assert.equal(v, t[i - 1] + t[i - 2]));
    return String(t.at(-1) + t.at(-2));
  },
  X5(item) {
    const t = O.seriesTerms(item.stem).map(Number);
    const d = t.slice(1).map((v, i) => v - t[i]);
    const roots = d.map(Math.sqrt);
    roots.forEach((r, i) => {
      assert.ok(Number.isInteger(r), 'diff is a square');
      if (i) assert.equal(r, roots[i - 1] + 1);
    });
    return String(t.at(-1) + (roots.at(-1) + 1) ** 2);
  },
  X6(item) {
    const t = O.seriesTerms(item.stem).map(Number);
    assert.ok(t.every(isPrime));
    t.forEach((v, i) => {
      if (!i) return;
      for (let n = t[i - 1] + 1; n < v; n++) assert.ok(!isPrime(n), 'no prime skipped');
    });
    let n = t.at(-1) + 1;
    while (!isPrime(n)) n++;
    return String(n);
  },
};

function solveGrid(item, kind) {
  const tx = O.svgTexts(item.stem);
  assert.equal(tx.length, 9);
  const q = tx.indexOf('?');
  assert.equal(tx.filter((x) => x === '?').length, 1);
  const g = tx.map((x) => (x === '?' ? NaN : Number(x)));
  const answers = new Set();
  for (const axis of ['rows', 'cols']) {
    const lines = [0, 1, 2].map((i) => [0, 1, 2].map((k) => (axis === 'rows' ? g[3 * i + k] : g[3 * k + i])));
    const gapLine = axis === 'rows' ? Math.floor(q / 3) : q % 3;
    const gapPos = axis === 'rows' ? q % 3 : Math.floor(q / 3);
    const full = lines.filter((_, i) => i !== gapLine);
    const gl = lines[gapLine];
    const others = gl.filter((_, k) => k !== gapPos);
    let ans = null;
    if (kind === 'sum') {
      const S = full[0][0] + full[0][1] + full[0][2];
      if (full.every((l) => l[0] + l[1] + l[2] === S)) ans = S - others[0] - others[1];
    } else if (kind === 'product') {
      if (full.every((l) => l[0] * l[1] === l[2])) {
        if (gapPos === 2) ans = others[0] * others[1];
        else if (others[1] % others[0] === 0) ans = others[1] / others[0];
      }
    } else if (kind === 'ap') {
      if (full.every((l) => l[1] - l[0] === l[2] - l[1])) {
        if (gapPos === 0) ans = 2 * gl[1] - gl[2];
        else if (gapPos === 2) ans = 2 * gl[1] - gl[0];
        else if ((gl[0] + gl[2]) % 2 === 0) ans = (gl[0] + gl[2]) / 2;
      }
    }
    if (ans !== null && Number.isInteger(ans) && ans >= 1) answers.add(ans);
  }
  assert.equal(answers.size, 1, `grid rule read exactly one way: ${[...answers]}`);
  return String([...answers][0]);
}
function solveAnalogy(item, f) {
  const [x1, y1, x2, y2, x3] = O.analogyParts(item.stem);
  assert.equal(y1, f(x1));
  assert.equal(y2, f(x2));
  return String(f(x3));
}
function solveSymbols(item) {
  const { eqs, fillOf } = O.parseSymbolSvg(item.stem);
  const given = eqs.slice(0, -1);
  const query = eqs.at(-1);
  assert.equal(query.rhs, '?');
  given.forEach((e) => assert.match(e.rhs, /^[1-9]\d{0,3}$/));
  assert.ok(query.terms.every((s) => given.some((e) => e.terms.includes(s))), 'query shapes appear in the given equations');
  const sols = O.allSolutions(given, 200);
  assert.equal(sols.length, 1, `unique positive-integer solution, got ${sols.length}`);
  assert.ok(Object.keys(fillOf).length <= 3);
  return String(O.evalEq(sols[0], query));
}

// ------------------------------------------------------------------ generic per-variant checks
const OPTION_SHAPE = {
  L: (o) => /^([A-Z][1-9]\d{0,3}|[A-Z]{2}|[A-Z]|[1-9]\d{0,3})$/.test(o),
  G: (o) => /^[1-9]\d{0,3}$/.test(o),
  Q: (o) => /^[1-9]\d{0,3}$/.test(o),
  T: (o) => /^[1-9]\d{0,3}$/.test(o),
  X: (o) => /^[1-9]\d{0,3}$/.test(o),
  D: (o) => /^([A-Z]{3,5}|\d{1,2}(-\d{1,2}){2,4})$/.test(o),
};
const KEYS = ['answer', 'b', 'category', 'id', 'optionCols', 'options', 'prompt', 'stem'];

for (const id of IDS) {
  test(`${id}: 200 seeds, answer recomputed from the stem, one correct option, distinct, plausible distractors`, () => {
    const stems = new Set();
    let near = 0;
    for (const seed of SEEDS) {
      const where = `${id}#${seed}`;
      const { item, meta } = variant(id, seed);
      assert.deepEqual(Object.keys(item).sort(), KEYS, where);
      assert.equal(item.id, id);
      assert.equal(item.category, 'series');
      assert.equal(item.b, TEMPLATES.find((t) => t.id === id).b);
      assert.ok(typeof item.prompt === 'string' && item.prompt.length > 10);
      assert.ok(Number.isInteger(item.optionCols) && item.optionCols >= 3 && item.optionCols <= 5);
      assert.ok(item.options.length >= 4 && item.options.length <= 6);
      assert.equal(item.options.length, 5, where);
      assert.equal(new Set(item.options).size, item.options.length, where + ': distinct options');
      item.options.forEach((o) => assert.ok(OPTION_SHAPE[id[0]](o), `${where}: option ${o}`));
      // the independent answer
      const expected = SOLVE[id](item);
      assert.equal(item.options.filter((o) => o === expected).length, 1, `${where}: exactly one option equals ${expected}; options ${item.options}`);
      assert.equal(item.options[item.answer], expected, where);
      assert.equal(meta.answer, expected);
      // distractors: distinct from the answer, listed in meta, same type as the answer
      assert.equal(meta.distractors.length, item.options.length - 1);
      assert.ok(!meta.distractors.includes(expected));
      assert.deepEqual([...meta.distractors, meta.answer].sort(), [...item.options].sort());
      if (/^\d+$/.test(expected)) {
        if (meta.distractors.some((d) => Math.abs(Number(d) - Number(expected)) <= 3)) near++;
        item.options.forEach((o) => assert.ok(Number(o) <= 9999));
      }
      // stems: no ids / defs / scripts; svg stems follow the figure rules
      assert.ok(!/\sid=|<defs|url\(#|<script|\son\w+=/i.test(item.stem), where);
      assert.ok(!/NaN|undefined|Infinity/.test(item.stem), where);
      if (item.stem.startsWith('<svg')) {
        checkSvg(item.stem, where);
        assert.ok(item.stem.includes('role="img"') && /aria-label="[^"]{20,}"/.test(item.stem), where + ': accessible name');
        assert.ok(item.stem.includes('stroke="currentColor"'), where);
        for (const m of item.stem.matchAll(/<text\b[^>]*>/g)) assert.ok(/fill="currentColor"/.test(m[0]) && /text-anchor="middle"/.test(m[0]) && /dominant-baseline="central"/.test(m[0]) && /font-family="inherit"/.test(m[0]), where);
      } else {
        assert.ok(item.stem.startsWith('<div class="series">') && item.stem.endsWith('</div>'));
      }
      options_not_markup(item, where);
      // explanation
      const ex = explain(id, meta);
      assert.ok(typeof ex === 'string' && ex.length >= 40, where);
      assert.ok(ex.includes(expected), `${where}: explanation mentions the answer ${expected}: ${ex}`);
      assert.ok(!/[Oo]ption\s*\d|[Cc]hoice\s*\d|\bundefined\b|\bNaN\b/.test(ex), where);
      assert.ok((ex.match(/[.!?](\s|$)/g) || []).length <= 3, `${where}: at most 3 sentences: ${ex}`);
      stems.add(item.stem);
      // determinism
      assert.deepEqual(variant(id, seed), { item, meta });
    }
    assert.ok(stems.size >= 30, `${id}: ${stems.size} distinct stems`);
    if (/^[GQTX]/.test(id)) assert.ok(near >= 150, `${id}: ${near}/200 seeds have a near-miss distractor`);
  });
}
function options_not_markup(item, where) {
  for (const o of item.options) assert.ok(!/[<>&"]/.test(o), `${where}: plain-text option`);
}

// ------------------------------------------------------------------ rule-specific proofs
test('G1/G2/G3/G4: no second simple rule gives a different value for the gap (any value, so a fortiori none among the options)', () => {
  for (const id of ['G1', 'G2', 'G4']) {
    for (const seed of SEEDS) {
      const { item } = variant(id, seed);
      const tx = O.svgTexts(item.stem);
      const q = tx.indexOf('?');
      const ans = Number(item.options[item.answer]);
      const grid = tx.map((x) => (x === '?' ? ans : Number(x)));
      const alts = O.gridAlternatives(grid, q, ans);
      assert.deepEqual(alts, [], `${id}#${seed}: alternative rule reads ${JSON.stringify(alts[0])} (grid ${grid})`);
      for (const a of alts) assert.ok(!item.options.includes(String(a.value)));
    }
  }
  for (const seed of SEEDS) {
    const { item } = variant('G3', seed);
    const tx = O.svgTexts(item.stem);
    const q = tx.indexOf('?');
    const ans = Number(item.options[item.answer]);
    const panels = [0, 1, 2].map((p) => tx.slice(5 * p, 5 * p + 5).map((x) => (x === '?' ? ans : Number(x))));
    const alts = O.centreAlternatives(panels, Math.floor(q / 5), q % 5, ans);
    assert.deepEqual(alts, [], `G3#${seed}: ${JSON.stringify(alts[0])}`);
  }
});

test('G*: gap position, both orientations and the figure grid shape all occur', () => {
  for (const id of ['G1', 'G2', 'G4']) {
    const gaps = new Set();
    const orient = new Set();
    for (const seed of SEEDS) {
      const { item, meta } = variant(id, seed);
      gaps.add(O.svgTexts(item.stem).indexOf('?'));
      orient.add(meta.orient);
      assert.equal((item.stem.match(/<rect /g) || []).length, 9);
    }
    assert.equal(gaps.size, 9, `${id} gap positions`);
    assert.deepEqual([...orient].sort(), ['col', 'row']);
  }
  const k = new Set();
  for (const seed of SEEDS) {
    const { meta } = variant('G3', seed);
    k.add(`${meta.missingPanel}${meta.missingCell}`);
  }
  assert.ok(k.size >= 10);
});

test('G4: every line has a different step (so a step from the wrong line gives a different answer)', () => {
  for (const seed of SEEDS) {
    const { meta } = variant('G4', seed);
    assert.equal(new Set(meta.steps).size, 3);
    assert.ok(meta.steps.every((s) => s !== 0));
  }
});

test('T: brute force over all positive integer assignments finds exactly one solution; shapes distinct without colour', () => {
  for (const id of ['T1', 'T2', 'T3']) {
    const kinds = new Set();
    for (const seed of SEEDS) {
      const { item, meta } = variant(id, seed);
      const { eqs, fillOf } = O.parseSymbolSvg(item.stem);
      const sols = O.allSolutions(eqs.slice(0, -1), 200);
      assert.equal(sols.length, 1, `${id}#${seed}`);
      // the rendered shapes (not only their fills) are all different
      const shapes = Object.keys(fillOf);
      assert.equal(new Set(shapes).size, shapes.length);
      // solution matches the meta's secret values
      const names = [...new Set(eqs.slice(0, -1).flatMap((e) => e.terms))];
      assert.equal(names.length, id === 'T1' ? 2 : 3);
      assert.equal(eqs.length, id === 'T1' ? 3 : 4, 'two/three given equations plus the question');
      assert.deepEqual(Object.values(sols[0]).sort((a, b) => a - b), [...meta.values.slice(0, names.length)].sort((a, b) => a - b));
      kinds.add(meta.kind);
    }
    if (id === 'T3') assert.deepEqual([...kinds].sort(), ['chain', 'pairs']);
  }
});

test('T: operator mix never needs precedence (no x with + or -); all four shapes occur; all three fills occur', () => {
  const shapes = new Set();
  const fills = new Set();
  for (const id of ['T1', 'T2', 'T3']) {
    for (const seed of SEEDS) {
      const { item } = variant(id, seed);
      const { eqs, fillOf } = O.parseSymbolSvg(item.stem);
      for (const e of eqs) {
        const mul = e.ops.includes('×');
        assert.ok(!mul || e.ops.every((o) => o === '×'), 'no mixed x with + or -');
        assert.ok(e.ops.length <= 2);
      }
      Object.keys(fillOf).forEach((s) => shapes.add(s));
      Object.values(fillOf).forEach((f) => fills.add(f));
    }
  }
  assert.equal(shapes.size, 4);
  assert.equal(fills.size, 3);
});

test('T: wrong-answer options include other shapes\' values (reading the wrong shape)', () => {
  let hits = 0;
  for (const seed of SEEDS) {
    const { item, meta } = variant('T2', seed);
    const others = meta.values.map(String).filter((v) => v !== meta.answer);
    if (item.options.some((o) => others.includes(o))) hits++;
  }
  assert.ok(hits >= 120, `hits ${hits}`);
});

test('Q: every natural rival rule (base(x)+c, |c|<=6) that fits both worked pairs predicts the same answer', () => {
  for (const id of ['Q1', 'Q2', 'Q3']) {
    for (const seed of SEEDS) {
      const { item } = variant(id, seed);
      const [x1, y1, x2, y2, x3] = O.analogyParts(item.stem);
      const expected = Number(item.options[item.answer]);
      const preds = O.rivalPredictions([x1, x2], [y1, y2], x3);
      assert.ok(preds.length >= 1, 'intended rule is among the candidates');
      for (const p of preds) assert.equal(p.value, expected, `${id}#${seed}: rival ${p.base}/${p.c} predicts ${p.value}`);
      assert.ok(x1 < x2 && x2 < x3);
    }
  }
});

test('D: only one candidate code (shifts, wraps, reversals, positions, mirrors...) fits the worked example', () => {
  const cands = O.codeCandidates();
  for (const id of ['D1', 'D2', 'D3']) {
    for (const seed of SEEDS) {
      const { item } = variant(id, seed);
      const { ex, exCode, tg } = O.codeLines(item.stem);
      const expected = item.options[item.answer];
      const fit = cands.filter((c) => c.f(ex) === exCode);
      assert.ok(fit.length >= 1, `${id}#${seed}: intended rule is a candidate`);
      const outs = new Set(fit.map((c) => c.f(tg)));
      assert.deepEqual([...outs], [expected], `${id}#${seed}: ${fit.map((c) => c.name)} -> ${[...outs]}`);
      // wrapping variants should not be needed: example and target never wrap
      assert.ok(WORDS.includes(ex) && WORDS.includes(tg) && ex !== tg);
    }
  }
});

test('D: distractors are the usual slips (wrong shift size, wrong direction, forgot to reverse)', () => {
  let d1 = 0;
  for (const seed of SEEDS) {
    const { item } = variant('D1', seed);
    const { ex, exCode, tg } = O.codeLines(item.stem);
    const k = idx(exCode[0]) - idx(ex[0]);
    const slips = [k + 1, k - 1, -k].map((s) => ([...tg].every((c) => idx(c) + s >= 0 && idx(c) + s <= 25) ? O.shiftBy(tg, s) : null));
    if (item.options.some((o) => slips.includes(o))) d1++;
  }
  assert.ok(d1 >= 150, `D1 slips ${d1}`);
  let forgot = 0;
  for (const seed of SEEDS) {
    const { item } = variant('D2', seed);
    const { ex, exCode, tg } = O.codeLines(item.stem);
    const k = idx(exCode[0]) - idx(ex.at(-1));
    const noRev = [...tg].map((c) => ch(idx(c) + k)).join('');
    if (item.options.includes(noRev) || item.options.includes(O.rev(tg))) forgot++;
  }
  assert.ok(forgot >= 100, `D2 forgot-a-step ${forgot}`);
});

test('L/X distractors: off-by-one or "rule one step too far" appears in most seeds', () => {
  for (const id of ['L1', 'L2', 'L4', 'L5', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6']) {
    let hit = 0;
    for (const seed of SEEDS) {
      const { item } = variant(id, seed);
      const ans = item.options[item.answer];
      const n = Number(ans.replace(/^[A-Z]+/, ''));
      const L0 = ans.replace(/[0-9]+$/, '');
      const close = item.options.some((o) => {
        if (o === ans) return false;
        const on = Number(o.replace(/^[A-Z]+/, ''));
        const oL = o.replace(/[0-9]+$/, '');
        if (/^\d+$/.test(ans)) return Math.abs(on - n) <= 2;
        if (/^[A-Z]\d+$/.test(ans)) return (oL === L0 && Math.abs(on - n) <= 2) || (on === n && Math.abs(idx(oL) - idx(L0)) <= 2);
        return Math.abs(idx(o[0]) - idx(ans[0])) <= 1 || Math.abs(idx(o[1]) - idx(ans[1])) <= 1;
      });
      if (close) hit++;
    }
    assert.ok(hit >= 190, `${id}: ${hit}/200`);
  }
});

test('X3: both multiply-then-add and add-then-multiply, answer after either operation, all occur', () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { meta } = variant('X3', seed);
    seen.add(`${meta.mulFirst}/${meta.nextIsMul}`);
  }
  assert.equal(seen.size, 4);
});

test('L3: both answer types (letter, number), both number directions, both start types occur', () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { item, meta } = variant('L3', seed);
    seen.add(`${isLetter(item.options[item.answer])}/${meta.down}/${meta.startLetter}`);
  }
  assert.equal(seen.size, 8);
});

test('variants differ across seeds and never throw for a wider seed range', () => {
  for (const id of IDS) {
    for (let seed = 200; seed < 260; seed++) {
      const { item } = variant(id, seed);
      assert.equal(item.options.length, 5);
    }
  }
  assert.throws(() => variant('Z9', 1));
  assert.throws(() => explain('Z9', {}));
  // uint32 edge seeds
  for (const seed of [0, 4294967295]) assert.ok(variant('X1', seed).item);
});

test('option order differs between seeds (placeOptions is seeded per variant)', () => {
  const pos = new Set();
  for (const seed of SEEDS) pos.add(variant('X1', seed).item.answer);
  assert.ok(pos.size >= 4, 'answer position varies');
});
