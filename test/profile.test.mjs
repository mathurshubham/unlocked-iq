import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, CATEGORIES } from '../public/js/items.js';
import { buildForm, TEMPLATES } from '../public/js/engine.js';
import { strengths, rangeTraits, overallProfile, categoryProfile } from '../public/js/profile.js';

const NEG = /\b(weak|poor|bad|fail|low|below|worse|struggl)/i;

test('strengths: 3-5 cards for every answer pattern', () => {
  const patterns = [
    ITEMS.map(() => -1),
    ITEMS.map((it) => (it.answer + 1) % it.options.length),
    ITEMS.map((it) => it.answer),
    ITEMS.map((it, i) => (i % 2 ? it.answer : -1)),
    ITEMS.map((it) => (it.category === 'spatial' ? it.answer : (it.answer + 1) % it.options.length)),
  ];
  for (const a of patterns) {
    for (const secs of [300, 900, 1400]) {
      const s = strengths(ITEMS, a, secs, CATEGORIES);
      assert.ok(s.length >= 3 && s.length <= 5, `got ${s.length}`);
      for (const c of s) {
        assert.ok(c.title && c.text);
        assert.doesNotMatch(c.title + ' ' + c.text, NEG);
      }
    }
  }
});

test('all profile copy avoids negative wording', () => {
  for (const iq of [60, 90, 105, 120, 140]) {
    assert.doesNotMatch(overallProfile(iq), NEG);
    for (const t of rangeTraits(iq)) assert.doesNotMatch(t, NEG);
  }
  for (const k of Object.keys(CATEGORIES)) for (const p of [10, 50, 90]) assert.doesNotMatch(categoryProfile(k, p), NEG);
});

test('strengths work for seeded forms and partial (quick-mode) item subsets', () => {
  const form = buildForm(987654321);
  const subset = form.filter((_, i) => i % 2 === 0).slice(0, 15);
  for (const items of [form, subset, subset.slice(0, 1)]) {
    for (const mk of [() => -1, (it) => it.answer, (it, i) => (i % 3 ? it.answer : -1)]) {
      const a = items.map((it, i) => mk(it, i));
      const s = strengths(items, a, 600, CATEGORIES);
      assert.ok(s.length >= 3 && s.length <= 5);
      for (const c of s) assert.doesNotMatch(c.title + ' ' + c.text, NEG);
    }
  }
  assert.equal(form.length, 30);
});
