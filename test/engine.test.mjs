import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TEMPLATES, buildItem, buildForm, itemSeed, practiceItem, CATEGORY_LABELS,
} from '../public/js/engine.js';
import { ITEMS, CATEGORIES, ITEMS_VERSION } from '../public/js/items.js';
import { CALIBRATION } from '../public/js/calibration.js';
import { score } from '../public/js/scoring.js';
import { checkItemMarkup } from './lib/markup.mjs';

// Snapshot of the v1 ITEMS export, taken before the engine existed.
const V1 = JSON.parse(readFileSync(new URL('./fixtures/v1-items.json', import.meta.url), 'utf8'));
const CONTRACT = ['id', 'category', 'b', 'prompt', 'stem', 'options', 'answer', 'optionCols'];
const contract = (it) => Object.fromEntries(CONTRACT.map((k) => [k, it[k]]));
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

test('items.js still exports the v1 contract', () => {
  assert.equal(ITEMS_VERSION, 1);
  assert.equal(ITEMS.length, 30);
  assert.deepEqual(JSON.parse(JSON.stringify(ITEMS)), V1, 'ITEMS equals the pre-engine snapshot');
  assert.deepEqual(CATEGORIES, { matrix: 'Pattern reasoning', spatial: 'Spatial reasoning', series: 'Numerical & sequence reasoning' });
  assert.deepEqual(CATEGORY_LABELS, CATEGORIES);
});

test('TEMPLATES: 30 templates, 12/10/8 per category, sorted by b, a defaults to 1.3', () => {
  assert.equal(TEMPLATES.length, 30);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 30);
  const count = (c) => TEMPLATES.filter((t) => t.category === c).length;
  assert.deepEqual([count('matrix'), count('spatial'), count('series')], [12, 10, 8]);
  for (let i = 1; i < TEMPLATES.length; i++) assert.ok(TEMPLATES[i].b >= TEMPLATES[i - 1].b);
  for (const t of TEMPLATES) {
    assert.deepEqual(Object.keys(t).sort(), ['a', 'b', 'category', 'id', 'nOptions']);
    const cal = CALIBRATION[t.id];
    assert.equal(t.a, cal?.a ?? 1.3);
    if (!cal) assert.equal(t.b, V1.find((x) => x.id === t.id).b);
    assert.equal(t.nOptions, V1.find((x) => x.id === t.id).options.length);
  }
  assert.equal(typeof CALIBRATION, 'object');
});

test('itemSeed: 0 for form seed 0, else a stable non-zero uint32 per template', () => {
  for (const t of TEMPLATES) assert.equal(itemSeed(0, t.id), 0);
  const a = itemSeed(12345, 'M1');
  assert.equal(a, itemSeed(12345, 'M1'));
  assert.notEqual(a, itemSeed(12345, 'M2'));
  assert.notEqual(a, itemSeed(12346, 'M1'));
  for (const s of [1, 99, 2 ** 32 - 1]) {
    const v = itemSeed(s, 'S3');
    assert.ok(Number.isInteger(v) && v > 0 && v < 2 ** 32);
  }
});

test('seed 0 reproduces v1 byte for byte (every template, option order included)', () => {
  for (const v1 of V1) {
    const it = buildItem(v1.id, 0);
    const cal = CALIBRATION[v1.id];
    const expect = cal ? { ...v1, b: cal.b ?? v1.b } : v1;
    assert.equal(JSON.stringify(contract(it)), JSON.stringify(contract(expect)), v1.id);
    assert.equal(it.templateId, v1.id);
    assert.equal(it.seed, 0);
    assert.equal(it.variantSeed, 0);
    assert.equal(it.options[it.answer], v1.options[v1.answer]);
  }
  // also against the live v1 export
  for (const v1 of ITEMS) assert.deepEqual(contract(buildItem(v1.id, 0)), contract(v1));
});

test('buildForm(0) is v1 ITEMS (same order, same items)', () => {
  const form = buildForm(0);
  assert.deepEqual(form.map((i) => i.id), V1.map((i) => i.id));
  assert.deepEqual(form.map(contract), V1.map(contract).map((v, i) => ({ ...v, b: form[i].b })));
  // scoring a v1-style share link: answers by option index still mean the same thing
  const answers = form.map((it) => it.answer);
  const r = score(form, answers);
  assert.equal(r.correct, 30);
});

test('buildForm(seed): 30 items ordered by b, deterministic, a differs from seed 0', () => {
  for (const seed of [1, 42, 2 ** 31, 2 ** 32 - 1, 987654321]) {
    const f = buildForm(seed);
    assert.equal(f.length, 30);
    for (let i = 1; i < 30; i++) assert.ok(f[i].b >= f[i - 1].b);
    assert.deepEqual(f.map((i) => i.id), TEMPLATES.map((t) => t.id));
    assert.deepEqual(buildForm(seed), f, 'deterministic');
    f.forEach((it) => {
      assert.equal(it.seed, seed);
      assert.equal(it.variantSeed, itemSeed(seed, it.id));
    });
  }
  const f0 = buildForm(0).map((i) => JSON.stringify(contract(i)));
  const f1 = buildForm(31337).map((i) => JSON.stringify(contract(i)));
  const same = f0.filter((x, i) => x === f1[i]).length;
  assert.ok(same <= 5, `seed 31337 reproduced ${same} v1 items`);
  // each item is correctly answerable
  for (const it of buildForm(31337)) assert.ok(it.answer >= 0 && it.answer < it.options.length);
});

test('buildItem: unknown template throws; extra fields present', () => {
  assert.throws(() => buildItem('X1', 0));
  const it = buildItem('M2', 5);
  assert.equal(it.templateId, 'M2');
  assert.equal(it.id, 'M2');
  assert.equal(typeof it.explanation, 'string');
  assert.equal(it.a, 1.3);
  assert.equal(it.seed, 5);
});

for (const t of TEMPLATES) {
  test(`${t.id}: 200 seeds of the engine API satisfy the item contract and markup rules`, () => {
    const seen = new Set();
    for (const seed of SEEDS) {
      const it = buildItem(t.id, seed);
      const where = `${t.id}@${seed}`;
      assert.equal(it.id, t.id);
      assert.equal(it.category, t.category);
      assert.equal(it.b, t.b);
      assert.equal(it.options.length, t.nOptions, where);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length);
      assert.equal(new Set(it.options).size, it.options.length, where + ': options distinct');
      assert.ok(Number.isInteger(it.optionCols) && it.optionCols > 0);
      assert.equal(typeof it.prompt, 'string');
      assert.equal(typeof it.stem, 'string');
      assert.ok(it.explanation.length > 20);
      checkItemMarkup(it, where);
      seen.add(JSON.stringify(contract(it)));
    }
    assert.ok(seen.size >= (t.id === 'S2' ? 6 : 8), `${t.id}: ${seen.size} distinct items over 200 seeds`);
  });
}

// ---- practice ----

const LEVEL_RANGE = { easy: [-Infinity, -0.5], medium: [-0.5, 0.6], hard: [0.6, Infinity] };

test('practiceItem: category and level map to templates and b ranges', () => {
  for (const category of ['matrix', 'spatial', 'series']) {
    for (const level of ['easy', 'medium', 'hard']) {
      const [lo, hi] = LEVEL_RANGE[level];
      const ids = new Set();
      for (let seed = 0; seed < 60; seed++) {
        const it = practiceItem(seed, { category, level });
        assert.equal(it.category, category);
        assert.ok(it.b >= lo && it.b < hi, `${category}/${level}: b=${it.b}`);
        assert.equal(it.seed, seed);
        checkItemMarkup(it, `practice ${category} ${level} ${seed}`);
        ids.add(it.id);
      }
      assert.ok(ids.size >= 2, `${category}/${level} only ${[...ids]}`);
    }
  }
});

test('practiceItem: deterministic; mixed covers all categories; default level easy', () => {
  assert.deepEqual(practiceItem(7, { category: 'matrix', level: 'medium' }), practiceItem(7, { category: 'matrix', level: 'medium' }));
  const cats = new Set();
  for (let seed = 0; seed < 80; seed++) cats.add(practiceItem(seed, {}).category);
  assert.deepEqual([...cats].sort(), ['matrix', 'series', 'spatial']);
  const cats2 = new Set();
  for (let seed = 0; seed < 80; seed++) cats2.add(practiceItem(seed, { category: 'mixed', level: 'hard' }).category);
  assert.equal(cats2.size, 3);
  assert.ok(practiceItem(3).b < -0.5);
  assert.throws(() => practiceItem(1, { category: 'nope' }));
  // different seeds give different items for the same template
  const m = new Set();
  for (let seed = 1; seed < 40; seed++) m.add(practiceItem(seed, { category: 'series', level: 'easy' }).stem);
  assert.ok(m.size > 5);
});
