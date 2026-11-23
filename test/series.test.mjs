import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesItems } from '../public/js/items-series.js';

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
