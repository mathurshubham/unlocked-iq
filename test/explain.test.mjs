import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, buildItem } from '../public/js/engine.js';
import { explain } from '../public/js/explain.js';
import { matrixVariant } from '../public/js/items-matrix.js';
import { spatialVariant } from '../public/js/items-spatial.js';
import { seriesVariant } from '../public/js/items-series.js';
import { oracle } from './lib/matrix-oracle.mjs';
import { oppositeOf } from '../public/js/cube.js';

const SEEDS = [0, ...Array.from({ length: 100 }, (_, i) => i + 1)];
const FILL = { none: 'empty', grey: 'grey', solid: 'solid' };
const SEG = {
  h: 'horizontal middle line', v: 'vertical middle line', d1: 'top-left to bottom-right diagonal',
  d2: 'top-right to bottom-left diagonal', t: 'top edge', b: 'bottom edge', l: 'left edge', r: 'right edge',
};
const DOT = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];

// Sentences end with . ! ? followed by a capital letter or "(".
const sentences = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z(])/);

test('every explanation: non-empty, 1-3 sentences, no template leftovers', () => {
  for (const t of TEMPLATES) {
    for (const seed of SEEDS) {
      const it = buildItem(t.id, seed);
      const e = it.explanation;
      const where = `${t.id}@${seed}: ${e}`;
      assert.ok(typeof e === 'string' && e.length > 30, where);
      const n = sentences(e).length;
      assert.ok(n >= 1 && n <= 3, `${n} sentences: ${where}`);
      assert.ok(!/undefined|NaN|null|\[object|\{|\}|\$\{/.test(e), where);
      assert.ok(/[.)]$/.test(e), where);
      assert.equal(e, buildItem(t.id, seed).explanation, 'deterministic');
    }
  }
});

test('explain(): unknown template throws', () => {
  assert.throws(() => explain('Z9', {}));
});

for (const t of TEMPLATES.filter((x) => x.category === 'matrix')) {
  test(`${t.id} explanation mentions the correct answer's features (all seeds)`, () => {
    const words = new Set();
    for (const seed of SEEDS) {
      const built = buildItem(t.id, seed);
      const { meta } = matrixVariant(t.id, built.variantSeed);
      const o = oracle(t.id, meta);
      const text = built.explanation;
      const where = `${t.id}@${seed}: ${text}`;
      for (const el of o.answer) {
        if (el.t === 'shape') {
          assert.ok(text.includes(el.shape), where + ` -> shape ${el.shape}`);
          assert.ok(text.includes(FILL[el.fill]), where + ` -> fill ${el.fill}`);
          if (el.n > 1) assert.ok(text.includes(`${el.n} `), where + ` -> count ${el.n}`);
        } else if (el.t === 'arrow') {
          assert.ok(text.includes(`${el.rot}°`), where + ` -> ${el.rot}`);
        } else if (el.t === 'seg') {
          assert.ok(text.includes(SEG[el.id]), where + ` -> ${el.id}`);
        } else if (el.t === 'dot') {
          assert.ok(text.includes(`dot at the ${DOT[el.k]}`), where + ` -> dot ${el.k}`);
        }
      }
      // sizes in M4 / M9
      if (t.id === 'M4') assert.ok(text.includes({ s: 'small', m: 'medium', l: 'large' }[o.answer[0].size]), where);
      // the explanation uses the variant's own vocabulary, not the other way round
      if (meta.transpose && /^(M1|M2)$/.test(t.id)) assert.ok(/column/.test(text.split('.')[0]), where);
      words.add(text);
    }
    assert.ok(words.size >= 8, `${t.id}: explanations barely vary (${words.size})`);
  });
}

test('seg explanations name the rule operation (union / exactly one / both)', () => {
  const cue = { M5: 'either of them', M8: 'exactly one of them', M11: 'both of them' };
  for (const id of ['M5', 'M8', 'M11']) {
    for (const seed of SEEDS) assert.ok(buildItem(id, seed).explanation.includes(cue[id]), id);
  }
});

test('series explanations contain the answer and the rule numbers', () => {
  for (const t of TEMPLATES.filter((x) => x.category === 'series')) {
    for (const seed of SEEDS) {
      const built = buildItem(t.id, seed);
      const { item, meta } = seriesVariant(t.id, built.variantSeed);
      const text = built.explanation;
      assert.ok(text.includes(item.options[item.answer]), `${t.id}@${seed}: ${text}`);
      if (t.id !== 'N3') assert.ok(text.includes(meta.shown[meta.shown.length - 1]), `${t.id}@${seed}: last term`);
      const p = meta.params;
      const key = { N1: p.d, N2: p.m, N4: p.step, N5: p.c, N6: p.p, N7: p.g, N8: p.g0 }[t.id];
      if (key !== undefined) assert.ok(text.includes(String(key)), `${t.id}@${seed}: ${key} in ${text}`);
    }
  }
});

const optionText = (svg) => svg.match(/>([^<]+)<\/text>/)[1];

test('spatial explanations describe the transformation or fold', () => {
  for (const seed of SEEDS) {
    const text = (id) => buildItem(id, seed).explanation;
    assert.ok(/mirror/.test(text('S1')) && /left and right/.test(text('S1')));
    assert.ok(/quarter turn clockwise \(90°\)/.test(text('S2')));
    assert.ok(/three quarter turns clockwise \(270°\)/.test(text('S3')));
    assert.ok(/mirror image/.test(text('S4')));
    assert.ok(/half turn \(180°\)/.test(text('S5')));
    assert.ok(/folded|fold/.test(text('S6')) && /different face/.test(text('S6')));
    assert.ok(/cannot fold/.test(text('S7')));
    for (const id of ['S8', 'S9']) {
      const it = buildItem(id, seed);
      const ask = it.prompt.match(/opposite ([A-F])\?$/)[1];
      const ans = optionText(it.options[it.answer]);
      assert.ok(it.explanation.includes(`${ask} ends up touching`), it.explanation);
      assert.ok(it.explanation.includes(`${ans}, must be the opposite of ${ask}`), it.explanation);
      // letters listed as touching are exactly the other four
      const touching = it.explanation.match(/touching ([A-F, and]+), so/)[1].replace(/ and /g, ',').split(/,\s*/).map((s) => s.trim());
      assert.deepEqual(touching.sort(), ['A', 'B', 'C', 'D', 'E', 'F'].filter((l) => l !== ask && l !== ans));
    }
    const s10 = buildItem('S10', seed);
    const ans = optionText(s10.options[s10.answer]).replace('&amp;', '&');
    assert.ok(s10.explanation.includes(`${ans} are opposite faces`), s10.explanation);
    // the three listed opposite pairs are exactly the folded ones
    const listed = s10.explanation.match(/opposite faces are (.*?); every/)[1].split(/, | and /).sort();
    const { meta } = spatialVariant('S10', s10.variantSeed);
    const want = [0, 1, 2, 3, 4, 5].map((i) => [i, oppositeOf(meta.cells, i)]).filter(([i, j]) => j > i)
      .map(([i, j]) => [meta.letters[i], meta.letters[j]].sort().join(' & ')).sort();
    assert.deepEqual(listed, want);
  }
});
