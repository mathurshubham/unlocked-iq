// Integration tests for the v3 item pool: back-compat, form assembly, variety.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEMPLATES, LEGACY_TEMPLATES, FORM_QUOTA, buildItem, buildForm, pickForm, practiceItem } from '../public/js/engine.js';
import { ITEMS } from '../public/js/items.js';
import { createCat, catFromJSON } from '../public/js/cat.js';

const snap = JSON.parse(readFileSync(new URL('./fixtures/v2-items.json', import.meta.url)));

test('existing share links rebuild byte-for-byte (v2 snapshot)', () => {
  for (const [key, want] of Object.entries(snap)) {
    const [tid, seed] = key.split('@');
    const it = buildItem(tid, Number(seed));
    assert.equal(it.stem, want.stem, key);
    assert.deepEqual(it.options, want.options, key);
    assert.equal(it.answer, want.answer, key);
    assert.equal(it.prompt, want.prompt, key);
    assert.equal(it.explanation, want.explanation, key);
  }
});

test('buildForm(0) is still the v1 form', () => {
  assert.deepEqual(buildForm(0).map((i) => i.id), ITEMS.map((i) => i.id));
});

test('pool is much larger than the v1 set, per category', () => {
  assert.ok(TEMPLATES.length >= LEGACY_TEMPLATES.length * 2.5, `pool ${TEMPLATES.length}`);
  for (const [cat, q] of Object.entries(FORM_QUOTA)) {
    const n = TEMPLATES.filter((t) => t.category === cat).length;
    assert.ok(n >= q * 2, `${cat}: ${n} templates for quota ${q}`);
  }
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test('every template builds a valid item at many seeds', () => {
  for (const t of TEMPLATES) {
    for (const s of [0, 1, 2, 99, 12345, 0xfffffffe]) {
      const it = buildItem(t.id, s);
      assert.equal(it.id, t.id);
      assert.equal(it.category, t.category);
      assert.ok(it.options.length >= 4 && it.options.length <= 6, `${t.id}: ${it.options.length} options`);
      assert.equal(it.options.length, t.nOptions, `${t.id} option count stable`);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length);
      assert.equal(new Set(it.options).size, it.options.length, `${t.id}@${s} duplicate option markup`);
      assert.ok(typeof it.explanation === 'string' && it.explanation.length > 10, `${t.id} explanation`);
      assert.ok(typeof it.prompt === 'string' && it.prompt.length > 5);
      for (const m of [it.stem, ...it.options]) assert.doesNotMatch(String(m), /\sid=|<defs|url\(#/, t.id);
    }
  }
});

test('standard forms: 30 unique, category quotas, easy-to-hard spread, deterministic', () => {
  for (let s = 1; s <= 60; s++) {
    const form = buildForm(s);
    const ids = form.map((i) => i.id);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    for (const [cat, q] of Object.entries(FORM_QUOTA)) assert.equal(form.filter((i) => i.category === cat).length, q);
    for (let i = 1; i < form.length; i++) assert.ok(form[i - 1].b <= form[i].b, 'ordered by difficulty');
    assert.ok(form[0].b < -0.8 && form[29].b > 0.8, `spread ${form[0].b}..${form[29].b}`);
    assert.deepEqual(buildForm(s).map((i) => i.id), ids);
  }
});

test('forms mix question families (no family dominates a category)', () => {
  for (let s = 1; s <= 60; s++) {
    const ids = pickForm(s);
    for (const [cat, q] of Object.entries(FORM_QUOTA)) {
      const fam = {};
      for (const id of ids) {
        const t = TEMPLATES.find((x) => x.id === id);
        if (t.category === cat) fam[t.family] = (fam[t.family] || 0) + 1;
      }
      assert.ok(Object.keys(fam).length >= 3, `${cat} families ${JSON.stringify(fam)}`);
      assert.ok(Math.max(...Object.values(fam)) <= Math.ceil(q * 0.4) + 1, `${cat} cap ${JSON.stringify(fam)}`);
    }
  }
});

test('retakes avoid seen questions', () => {
  let seen = new Set();
  const overlaps = [];
  for (let take = 1; take <= 3; take++) {
    const ids = pickForm(1000 + take, { avoid: seen });
    overlaps.push(ids.filter((id) => seen.has(id)).length);
    ids.forEach((id) => seen.add(id));
  }
  assert.equal(overlaps[0], 0);
  assert.ok(overlaps[1] <= 3, `second take repeats ${overlaps[1]} templates`);
  // Even without history, two random forms share few templates.
  const a = new Set(pickForm(7)), b = pickForm(8);
  assert.ok(b.filter((id) => a.has(id)).length <= 18);
});

test('practice draws from the whole pool', () => {
  const ids = new Set();
  for (let s = 1; s <= 400; s++) for (const level of ['easy', 'medium', 'hard']) ids.add(practiceItem(s, { level }).id);
  assert.ok(ids.size >= TEMPLATES.length * 0.7, `practice saw ${ids.size}/${TEMPLATES.length}`);
});

test('quick test: randomesque + avoid vary questions, resume is stable', () => {
  const run = (seed, opts) => {
    const cat = createCat({ formSeed: seed, length: 15, ...opts });
    while (!cat.done) {
      const it = cat.next();
      cat.answer(it.answer);
    }
    return cat;
  };
  const a = run(5, { randomesque: 3 }).tids;
  const b = run(6, { randomesque: 3 }).tids;
  assert.notDeepEqual(a, b);
  const c = run(6, { randomesque: 3, avoid: new Set(a) }).tids;
  assert.ok(c.filter((id) => a.includes(id)).length <= 3);
  // Resume mid-test keeps the same randomesque behaviour.
  const live = createCat({ formSeed: 9, length: 15, randomesque: 3 });
  for (let i = 0; i < 5; i++) live.answer(live.next().answer);
  const resumed = catFromJSON(JSON.parse(JSON.stringify(live.toJSON())));
  assert.equal(resumed.next().id, live.next().id);
});
