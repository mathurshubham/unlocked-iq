import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, normalizeState, loadState, saveState, clearState, toPayload, isMine, remainingSecs,
  elapsedSecs, itemsFromPayload, newSeed, emptyPractice, recordPractice, loadPractice, savePractice,
  normalizePractice, accuracy, LIMITS, STATE_KEY,
} from '../public/js/state.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const tids = ['M1', 'M2', 'S1', 'N1'];

test('newState defaults and limits', () => {
  const s = newState({ mode: 'standard', seed: 5, name: '  Ada  ', consent: 1, tids, now: 1000 });
  assert.equal(s.limit, LIMITS.standard);
  assert.equal(s.name, 'Ada');
  assert.equal(s.consent, true);
  assert.deepEqual(s.answers, [-1, -1, -1, -1]);
  assert.deepEqual(s.flags, [false, false, false, false]);
  assert.equal(newState({ mode: 'weird', seed: 1 }).mode, 'standard');
  assert.equal(newState({ mode: 'quick', seed: 1 }).limit, LIMITS.quick);
});

test('save / load round trip and clear', () => {
  const st = mem();
  const s = newState({ mode: 'standard', seed: 99, tids });
  s.answers[1] = 3;
  s.flags[2] = true;
  assert.ok(saveState(s, st));
  const out = loadState(st);
  assert.deepEqual(out.answers, s.answers);
  assert.deepEqual(out.flags, s.flags);
  clearState(st);
  assert.equal(loadState(st), null);
});

test('storage failures never throw', () => {
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  assert.equal(loadState(bad), null);
  assert.equal(saveState(newState({ mode: 'quick', seed: 1 }), bad), false);
  clearState(bad);
  assert.equal(loadState(null), null);
  assert.deepEqual(loadPractice(bad).streak, 0);
});

test('normalizeState rejects bad shapes', () => {
  const good = newState({ mode: 'standard', seed: 1, tids });
  assert.ok(normalizeState(JSON.parse(JSON.stringify(good))));
  for (const mut of [
    { v: 1 }, { mode: 'x' }, { seed: -1 }, { seed: 1.5 }, { tids: 'M1' }, { answers: [0] }, { answers: [0, 0, 0, 'x'] },
    { answers: [0, 0, 0, 99] }, { startedAt: 'now' }, { tids: [] , answers: [] },
  ]) assert.equal(normalizeState({ ...good, ...mut }), null, JSON.stringify(mut));
  assert.equal(normalizeState(null), null);
  const st = mem();
  st.setItem(STATE_KEY, '{not json');
  assert.equal(loadState(st), null);
});

test('normalizeState repairs soft fields', () => {
  const good = newState({ mode: 'standard', seed: 1, tids });
  const s = normalizeState({ ...good, flags: [true], current: 99, limit: -4, resultId: '<x>', name: 'x'.repeat(100) });
  assert.deepEqual(s.flags, [false, false, false, false]);
  assert.equal(s.current, 3);
  assert.equal(s.limit, LIMITS.standard);
  assert.equal(s.resultId, null);
  assert.equal(s.name.length, 40);
});

test('quick state may start with no tids', () => {
  const s = newState({ mode: 'quick', seed: 3 });
  assert.ok(normalizeState(JSON.parse(JSON.stringify(s))));
});

test('timing and payload', () => {
  const s = newState({ mode: 'standard', seed: 7, name: 'Zed', tids, now: 0 });
  s.answers = [1, -1, 2, 0];
  assert.equal(remainingSecs(s, 60_000), LIMITS.standard - 60);
  assert.equal(elapsedSecs(s, 90_000), 90);
  s.endedAt = 120_000;
  const p = toPayload(s, 999_999);
  assert.deepEqual(p, { v: 2, mode: 'standard', seed: 7, tids, a: [1, -1, 2, 0], secs: 120, n: 'Zed' });
  s.endedAt = 99 * 3600 * 1000;
  assert.equal(toPayload(s).secs, LIMITS.standard);
  assert.equal('n' in toPayload({ ...s, name: '' }), false);
});

test('isMine', () => {
  const s = newState({ mode: 'standard', seed: 7, tids, now: 0 });
  s.done = true;
  s.answers = [1, 2, 3, 0];
  const p = toPayload(s);
  assert.equal(isMine(s, p), true);
  assert.equal(isMine(s, { ...p, a: [1, 2, 3, 1] }), false);
  assert.equal(isMine(s, { ...p, seed: 8 }), false);
  s.resultId = 'abcd1234';
  assert.equal(isMine(s, { ...p, a: [0, 0, 0, 0] }, 'abcd1234'), true);
  assert.equal(isMine({ ...s, done: false }, p), false);
  assert.equal(isMine(null, p), false);
});

test('itemsFromPayload uses buildItem(tid, seed)', () => {
  const calls = [];
  const out = itemsFromPayload({ tids: ['A', 'B'], seed: 9 }, (t, s) => (calls.push([t, s]), { id: t }));
  assert.deepEqual(calls, [['A', 9], ['B', 9]]);
  assert.deepEqual(out, [{ id: 'A' }, { id: 'B' }]);
});

test('newSeed is a uint32 >= 1', () => {
  for (let i = 0; i < 50; i++) {
    const s = newSeed();
    assert.ok(Number.isInteger(s) && s >= 1 && s <= 0xffffffff);
  }
});

test('practice stats', () => {
  let p = emptyPractice(0);
  p = recordPractice(p, true, 10);
  p = recordPractice(p, true, 20);
  p = recordPractice(p, false, 30);
  p = recordPractice(p, true, 40);
  assert.deepEqual([p.streak, p.best, p.answered, p.correct], [1, 2, 4, 3]);
  assert.equal(accuracy(p), 75);
  assert.equal(accuracy(emptyPractice()), 0);
  const st = mem();
  savePractice(p, st);
  assert.deepEqual(loadPractice(st, 50), p);
  // new session after a long gap keeps only the best streak
  const later = loadPractice(st, 40 + 31 * 60 * 1000);
  assert.deepEqual([later.streak, later.best, later.answered], [0, 2, 0]);
  const n = normalizePractice({ streak: 'x', answered: 2, correct: 9, best: -1 });
  assert.deepEqual([n.streak, n.answered, n.correct, n.best], [0, 2, 2, 0]);
});
