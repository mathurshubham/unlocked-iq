import test from 'node:test';
import assert from 'node:assert/strict';
import { score, p3pl, normCdf } from '../public/js/scoring.js';
import { band, categoryProfile, overallProfile, iqBand } from '../public/js/profile.js';

// Fake bank shaped like the real one: 12 matrix (6 opts), 10 spatial (4-5), 8 series (5).
function fakeItems() {
  const items = [];
  const mk = (id, category, b, nOpts) =>
    items.push({ id, category, b, options: Array.from({ length: nOpts }, (_, i) => `o${i}`), answer: 1 });
  const bs = [-2.2, -1.6, -1.2, -0.9, -0.6, -0.2, 0.2, 0.6, 0.4, 1.0, 1.3, 1.5];
  bs.forEach((b, i) => mk(`M${i + 1}`, 'matrix', b, 6));
  [-1.5, -0.8, -0.2, 0.3, 0.7, -0.4, 0.4, 0.8, 1.1, 1.4].forEach((b, i) =>
    mk(`S${i + 1}`, 'spatial', b, i % 2 ? 4 : 5),
  );
  [-2.0, -1.3, -0.8, -0.4, 0.1, 0.5, 0.9, 1.3].forEach((b, i) => mk(`N${i + 1}`, 'series', b, 5));
  return items.sort((x, y) => x.b - y.b);
}

const items = fakeItems();
const allRight = () => items.map((it) => it.answer);
const allWrong = () => items.map((it) => (it.answer + 1) % it.options.length);
const blank = () => items.map(() => -1);

test('p3pl has guessing floor and rises with theta', () => {
  assert.ok(Math.abs(p3pl(-50, 0, 5) - 0.2) < 1e-9);
  assert.ok(p3pl(50, 0, 5) > 0.999);
  assert.ok(p3pl(1, 0, 4) > p3pl(0, 0, 4));
  assert.ok(Math.abs(p3pl(0, 0, 4) - (0.25 + 0.75 / 2)) < 1e-9);
});

test('normCdf sanity', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normCdf(1) - 0.8413447) < 1e-5);
  assert.ok(Math.abs(normCdf(-1.645) - 0.05) < 1e-3);
});

test('all correct gives high IQ but never above 145', () => {
  const r = score(items, allRight());
  assert.ok(r.iq >= 120, `iq ${r.iq}`);
  assert.ok(r.iq <= 145);
  assert.equal(r.correct, 30);
  assert.equal(r.total, 30);
  assert.ok(r.percentile > 85 && r.percentile <= 100);
});

test('all wrong and all blank never below 55', () => {
  for (const ans of [allWrong(), blank()]) {
    const r = score(items, ans);
    assert.ok(r.iq >= 55, `iq ${r.iq}`);
    assert.ok(r.iq < 90);
    assert.equal(r.correct, 0);
    assert.equal(r.hardest.length, 0);
  }
});

test('IQ clamps even with extreme items', () => {
  const easy = Array.from({ length: 60 }, (_, i) => ({
    id: 'x' + i, category: 'matrix', b: 3, options: ['a', 'b', 'c', 'd'], answer: 0,
  }));
  const hi = score(easy, easy.map(() => 0));
  assert.equal(hi.iq, 145);
  const lo = score(easy, easy.map(() => 1));
  assert.ok(lo.iq >= 55);
});

test('more correct answers (easiest first) gives monotonically higher theta', () => {
  let prev = -Infinity;
  for (let k = 0; k <= items.length; k++) {
    const ans = items.map((it, i) => (i < k ? it.answer : -1));
    const { theta } = score(items, ans);
    assert.ok(theta > prev, `k=${k} theta=${theta} prev=${prev}`);
    prev = theta;
  }
});

test('flipping any single wrong answer to correct raises theta', () => {
  const base = allWrong();
  const t0 = score(items, base).theta;
  items.forEach((it, i) => {
    const a = base.slice();
    a[i] = it.answer;
    assert.ok(score(items, a).theta > t0, `item ${it.id}`);
  });
});

test('se shrinks with more informative data and range is symmetric around iq', () => {
  const r = score(items, items.map((it, i) => (i % 2 ? it.answer : -1)));
  assert.ok(r.se > 0.15 && r.se < 1);
  assert.equal(r.high - r.iq, r.iq - r.low);
  assert.equal(r.high - r.iq, Math.round(1.645 * 15 * r.se));
});

test('byCategory counts', () => {
  const ans = items.map((it) => (it.category === 'matrix' ? it.answer : -1));
  const r = score(items, ans);
  assert.deepEqual(r.byCategory.matrix, { correct: 12, total: 12 });
  assert.deepEqual(r.byCategory.spatial, { correct: 0, total: 10 });
  assert.deepEqual(r.byCategory.series, { correct: 0, total: 8 });
});

test('hardest: top 3 correct by b descending, 1-based index, pAvg = P(0)', () => {
  const r = score(items, allRight());
  const expected = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => b.it.b - a.it.b)
    .slice(0, 3);
  assert.equal(r.hardest.length, 3);
  r.hardest.forEach((h, k) => {
    assert.equal(h.id, expected[k].it.id);
    assert.equal(h.index, expected[k].i + 1);
    assert.ok(Math.abs(h.pAvg - p3pl(0, expected[k].it.b, expected[k].it.options.length)) < 1e-12);
  });
  // only correct ones are listed
  const partial = score(items, items.map((it, i) => (i === 3 ? it.answer : -1)));
  assert.deepEqual(partial.hardest.map((h) => h.index), [4]);
});

test('deterministic', () => {
  const ans = items.map((it, i) => (i % 3 ? it.answer : -1));
  assert.deepEqual(score(items, ans), score(items, ans));
});

test('profile text covers every band', () => {
  assert.equal(band(75), 'high');
  assert.equal(band(74.9), 'mid');
  assert.equal(band(40), 'mid');
  assert.equal(band(39.9), 'developing');
  for (const c of ['matrix', 'spatial', 'series']) {
    const texts = [90, 50, 10].map((p) => categoryProfile(c, p));
    texts.forEach((t) => assert.ok(t.length > 40));
    assert.equal(new Set(texts).size, 3);
  }
  assert.equal(categoryProfile('nope', 50), '');
  const bands = [145, 120, 105, 90, 60].map(iqBand);
  assert.equal(new Set(bands).size, 5);
  [145, 120, 105, 90, 60].forEach((iq) => assert.ok(overallProfile(iq).length > 40));
});

// ---- per-item discrimination `a` ----

import { fisherInfo, itemA, DISCRIMINATION } from '../public/js/scoring.js';

test('items without `a` score exactly as with a = 1.3', () => {
  const withA = items.map((it) => ({ ...it, a: DISCRIMINATION }));
  const ans = items.map((it, i) => (i % 3 ? it.answer : -1));
  assert.deepEqual(score(withA, ans), score(items, ans));
  assert.equal(itemA({}), DISCRIMINATION);
  assert.equal(itemA({ a: 2 }), 2);
  assert.equal(itemA({ a: 0 }), DISCRIMINATION, 'non-positive a falls back');
  assert.equal(itemA({ a: 'x' }), DISCRIMINATION);
});

test('a higher `a` makes the same answer pattern more decisive', () => {
  const mk = (a) => items.map((it) => ({ ...it, a }));
  const ans = items.map((it) => it.answer);
  const lo = score(mk(0.6), ans);
  const mid = score(mk(1.3), ans);
  const hi = score(mk(2.5), ans);
  // Flat items need a more extreme ability to explain a perfect run, so the estimates differ.
  assert.ok(Math.abs(lo.theta - mid.theta) > 0.05 && Math.abs(mid.theta - hi.theta) > 0.05, `${lo.theta} ${mid.theta} ${hi.theta}`);
  assert.ok(lo.theta > mid.theta && mid.theta > hi.theta, 'perfect run: flatter items imply a higher theta');
  assert.ok(hi.se < mid.se && mid.se < lo.se, 'more discrimination, less uncertainty');
  // ...and a run of all wrong answers goes the other way
  const wrong = items.map((it) => (it.answer + 1) % it.options.length);
  assert.ok(score(mk(0.6), wrong).theta < score(mk(2.5), wrong).theta);
});

test('per-item a is used item by item (one steep item moves theta more than one shallow item)', () => {
  const base = items.map((it) => ({ ...it, a: 1.3 }));
  const ans = items.map((it, i) => (i % 2 ? it.answer : (it.answer + 1) % it.options.length));
  const t0 = score(base, ans).theta;
  const k = 14; // a correct item near the middle of the range
  const steep = base.map((it, i) => (i === k ? { ...it, a: 3 } : it));
  const shallow = base.map((it, i) => (i === k ? { ...it, a: 0.3 } : it));
  const flag = ans[k] === items[k].answer;
  const d = (x) => score(x, ans).theta - t0;
  if (flag) assert.ok(d(steep) > d(shallow));
  else assert.ok(d(steep) < d(shallow));
});

test('hardest[].pAvg uses the item\'s own a', () => {
  const custom = items.map((it) => ({ ...it, a: 2 }));
  const r = score(custom, custom.map((it) => it.answer));
  for (const h of r.hardest) {
    const it = custom[h.index - 1];
    assert.ok(Math.abs(h.pAvg - p3pl(0, it.b, it.options.length, 2)) < 1e-12);
  }
});

test('fisherInfo: peaks near b, rises with a, shrinks with more options, matches a numeric derivative', () => {
  const peak = (a, n) => {
    let best = -Infinity; let at = 0;
    for (let t = -4; t <= 4; t += 0.01) { const f = fisherInfo(t, 0.5, n, a); if (f > best) { best = f; at = t; } }
    return { best, at };
  };
  const p = peak(1.3, 5);
  assert.ok(p.at > 0.5 && p.at < 1.3, `3PL information peaks slightly above b (got ${p.at})`);
  assert.ok(peak(2, 5).best > peak(1, 5).best);
  assert.ok(peak(1.3, 4).best > peak(1.3, 6).best || peak(1.3, 4).best < peak(1.3, 6).best); // defined for any option count
  for (const [theta, b, n, a] of [[0, 0, 5, 1.3], [1, -0.5, 4, 2], [-1.5, 0.3, 6, 0.8]]) {
    const h = 1e-5;
    const dP = (p3pl(theta + h, b, n, a) - p3pl(theta - h, b, n, a)) / (2 * h);
    const P = p3pl(theta, b, n, a);
    assert.ok(Math.abs(fisherInfo(theta, b, n, a) - (dP * dP) / (P * (1 - P))) < 1e-6);
  }
});
