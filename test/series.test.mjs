import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesItems, seriesVariant, SERIES_IDS } from '../public/js/items-series.js';

const byId = Object.fromEntries(seriesItems.map((i) => [i.id, i]));
const L = (n) => String.fromCharCode(65 + n);
const code = (c) => c.charCodeAt(0) - 65;

// Independent recomputation of each rule (recurrences / differences, not the module's closed forms).
const CASES = {
  N1: { shown: ['3', '7', '11', '15'], answer: String(15 + 4) },
  N2: { shown: ['2', '6', '18', '54'], answer: String(54 * 3) },
  N3: { shown: ['1', '4', '9', '16', '25'], answer: String(6 * 6) },
  N4: { shown: ['B', 'E', 'H', 'K'], answer: L(code('K') + 3) },
  N5: { shown: ['2', '5', '11', '23', '47'], answer: String(47 * 2 + 1) },
  N6: { shown: ['4', '9', '7', '12', '10', '15'], answer: String(15 - 2) },
  N7: { shown: ['A', 'C', 'F', 'J', 'O'], answer: L(code('O') + 6) },
  N8: { shown: ['2', '3', '5', '9', '17', '33'], answer: String(33 + 32) },
};

// Verify the shown terms follow the same recurrences as the answer.
test('rules hold on the shown terms', () => {
  const n = (id) => CASES[id].shown.map(Number);
  const seq = (id) => [...CASES[id].shown, CASES[id].answer];
  let t = n('N1').concat(Number(CASES.N1.answer));
  for (let i = 1; i < t.length; i++) assert.equal(t[i] - t[i - 1], 4);
  t = n('N2').concat(Number(CASES.N2.answer));
  for (let i = 1; i < t.length; i++) assert.equal(t[i] / t[i - 1], 3);
  t = n('N3').concat(Number(CASES.N3.answer));
  t.forEach((v, i) => assert.equal(v, (i + 1) ** 2));
  const l4 = seq('N4').map(code);
  for (let i = 1; i < l4.length; i++) assert.equal(l4[i] - l4[i - 1], 3);
  t = n('N5').concat(Number(CASES.N5.answer));
  for (let i = 1; i < t.length; i++) assert.equal(t[i], 2 * t[i - 1] + 1);
  t = n('N6').concat(Number(CASES.N6.answer));
  for (let i = 1; i < t.length; i++) assert.equal(t[i] - t[i - 1], i % 2 ? 5 : -2);
  const l7 = seq('N7').map(code);
  for (let i = 1; i < l7.length; i++) assert.equal(l7[i] - l7[i - 1], i + 1);
  t = n('N8').concat(Number(CASES.N8.answer));
  for (let i = 1; i < t.length; i++) assert.equal(t[i] - t[i - 1], 2 ** (i - 1));
});

test('eight series items with contract fields', () => {
  assert.deepEqual(seriesItems.map((i) => i.id), Object.keys(CASES));
  const bs = [-2.0, -1.3, -0.8, -0.4, 0.1, 0.5, 0.9, 1.3];
  seriesItems.forEach((it, k) => {
    assert.equal(it.category, 'series');
    assert.equal(it.b, bs[k]);
    assert.equal(typeof it.prompt, 'string');
    assert.equal(it.optionCols, 5);
    assert.deepEqual(Object.keys(it).sort(), ['answer', 'b', 'category', 'id', 'optionCols', 'options', 'prompt', 'stem']);
    for (const o of it.options) assert.equal(typeof o, 'string');
  });
});

for (const [id, c] of Object.entries(CASES)) {
  test(`${id}: stem, answer, distinct options`, () => {
    const it = byId[id];
    assert.equal(it.stem, `<div class="series">${c.shown.join(', ')}, <span class="q">?</span></div>`);
    assert.equal(it.options.length, 5);
    assert.equal(new Set(it.options).size, 5);
    assert.equal(it.options[it.answer], c.answer);
    // no distractor equals the answer, and none already appears in the shown terms' next slot
    assert.equal(it.options.filter((o) => o === c.answer).length, 1);
  });
}

test('option order is deterministic', async () => {
  const again = await import('../public/js/items-series.js?again');
  assert.deepEqual(again.seriesItems, seriesItems);
});


// ==========================================================================
// Variants: 200 seeds per template. Everything is recomputed from the
// rendered stem alone (terms parsed from the markup), with recurrences.
// ==========================================================================

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const parseStem = (stem) => {
  const m = stem.match(/^<div class="series">(.*), <span class="q">\?<\/span><\/div>$/);
  assert.ok(m, 'stem format: ' + stem);
  return m[1].split(', ');
};
const isLetter = (x) => /^[A-Z]$/.test(x);

// For each template: verify the rule on the shown terms and return the next term it implies.
const RULES = {
  N1(t) {
    const n = t.map(Number); const d = n[1] - n[0];
    assert.ok(d >= 3);
    n.forEach((v, i) => i && assert.equal(v - n[i - 1], d));
    return String(n[3] + d);
  },
  N2(t) {
    const n = t.map(Number); const m = n[1] / n[0];
    assert.ok(Number.isInteger(m) && m >= 3 && m <= 5);
    n.forEach((v, i) => i && assert.equal(v, n[i - 1] * m));
    return String(n[3] * m);
  },
  N3(t) {
    const n = t.map(Number); const k = Math.sqrt(n[0]);
    assert.ok(Number.isInteger(k));
    n.forEach((v, i) => assert.equal(v, (k + i) ** 2));
    return String((k + n.length) ** 2);
  },
  N4(t) {
    assert.ok(t.every(isLetter));
    const c = t.map((x) => x.charCodeAt(0)); const d = c[1] - c[0];
    assert.ok(d === 3 || d === 4);
    c.forEach((v, i) => i && assert.equal(v - c[i - 1], d));
    return String.fromCharCode(c[3] + d);
  },
  N5(t) {
    const n = t.map(Number); const c = n[1] - 2 * n[0];
    assert.ok(c >= 1 && c <= 3);
    n.forEach((v, i) => i && assert.equal(v, 2 * n[i - 1] + c));
    return String(2 * n[4] + c);
  },
  N6(t) {
    const n = t.map(Number); const p = n[1] - n[0]; const q = n[1] - n[2];
    assert.ok(p - q >= 2 && q >= 1);
    n.forEach((v, i) => i && assert.equal(v - n[i - 1], i % 2 ? p : -q));
    return String(n[5] - q);
  },
  N7(t) {
    assert.ok(t.every(isLetter));
    const c = t.map((x) => x.charCodeAt(0)); const g = c[1] - c[0];
    assert.ok(g === 1 || g === 2);
    c.forEach((v, i) => i && assert.equal(v - c[i - 1], g + i - 1));
    return String.fromCharCode(c[4] + g + 4);
  },
  N8(t) {
    const n = t.map(Number); const g = n[1] - n[0];
    assert.notEqual(n[0], g, 'would be plain doubling');
    n.forEach((v, i) => i && assert.equal(v - n[i - 1], g * 2 ** (i - 1)));
    return String(n[5] + g * 32);
  },
};

test('variants: seed 0 is the v1 item (byte for byte)', () => {
  for (const id of SERIES_IDS) assert.deepEqual(seriesVariant(id, 0).item, byId[id], id);
});

for (const id of SERIES_IDS) {
  test(`${id} variants: 200 seeds, rule recomputed, one correct option, distinct, friendly numbers`, () => {
    const stems = new Set();
    for (const seed of SEEDS) {
      const { item } = seriesVariant(id, seed);
      const where = `${id}#${seed}`;
      const shown = parseStem(item.stem);
      const expected = RULES[id](shown);
      assert.equal(item.id, id);
      assert.equal(item.options.length, 5, where);
      assert.equal(new Set(item.options).size, 5, where + ': distinct');
      assert.equal(item.options.filter((o) => o === expected).length, 1, where + ': exactly one correct');
      assert.equal(item.options[item.answer], expected, where);
      for (const o of [...item.options, ...shown]) {
        if (isLetter(o)) continue;
        assert.match(o, /^[1-9]\d{0,3}$/, `${where}: friendly number ${o}`);
      }
      // letters only with letters, numbers only with numbers
      const letters = isLetter(shown[0]);
      for (const o of item.options) assert.equal(isLetter(o), letters, where);
      assert.equal(item.prompt, 'Which number or letter comes next in the sequence?');
      assert.equal(item.optionCols, 5);
      assert.deepEqual(Object.keys(item).sort(), ['answer', 'b', 'category', 'id', 'optionCols', 'options', 'prompt', 'stem']);
      stems.add(item.stem);
      assert.deepEqual(seriesVariant(id, seed).item, item);
    }
    assert.ok(stems.size >= 8, `${id}: ${stems.size} distinct stems`);
  });
}

test('series variants: distractors follow the v1 recipe (plausible wrong rules)', () => {
  for (const seed of SEEDS) {
    // N1: answer +-1, +-2
    let { item, meta } = seriesVariant('N1', seed);
    const a = Number(meta.answer);
    assert.deepEqual(item.options.map(Number).sort((x, y) => x - y).filter((x) => x !== a), [a - 2, a - 1, a + 1, a + 2]);
    // N2: distractors include the "times m-1" and "add the last two" slips
    ({ item, meta } = seriesVariant('N2', seed));
    const s = meta.shown.map(Number);
    assert.ok(meta.distractors.map(Number).includes(s[3] + s[2]));
    assert.ok(meta.distractors.map(Number).includes(s[3] * (meta.params.m - 1)));
    // N8: slips repeat the previous gap / halfway gap
    ({ item, meta } = seriesVariant('N8', seed));
    const t = meta.shown.map(Number);
    assert.ok(meta.distractors.map(Number).includes(t[5] + (t[5] - t[4])));
  }
});
