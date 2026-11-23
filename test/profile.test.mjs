import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, CATEGORIES } from '../public/js/items.js';
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
