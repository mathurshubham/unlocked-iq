import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, normalizeState, remainingSecs, pauseClock, resumeClock, toPayload } from '../public/js/state.js';
import { encodeShare, decodeShare, validatePayload } from '../public/js/share.js';
import { validateResult } from '../src/validate.js';
import { buildForm } from '../public/js/engine.js';

const T0 = 1_000_000;
const fresh = () => newState({ mode: 'standard', seed: 7, tids: ['M1', 'M2', 'M3'], now: T0 });

test('time away from the page does not count', () => {
  const s = fresh();
  assert.equal(Math.round(remainingSecs(s, T0 + 60_000)), 25 * 60 - 60);
  pauseClock(s, T0 + 60_000); // phone locked after 1 min
  assert.equal(Math.round(remainingSecs(s, T0 + 3_600_000)), 25 * 60 - 60, 'frozen while away');
  resumeClock(s, T0 + 3_600_000); // back an hour later
  assert.equal(Math.round(remainingSecs(s, T0 + 3_660_000)), 25 * 60 - 120);
});

test('pause/resume are idempotent and survive a reload', () => {
  const s = fresh();
  pauseClock(s, T0 + 10_000);
  pauseClock(s, T0 + 20_000);
  const reloaded = normalizeState(JSON.parse(JSON.stringify(s)));
  resumeClock(reloaded, T0 + 70_000);
  resumeClock(reloaded, T0 + 80_000);
  assert.equal(reloaded.pausedMs, 60_000);
  assert.equal(Math.round(remainingSecs(reloaded, T0 + 70_000)), 25 * 60 - 10);
});

test('untimed finish is recorded as u and capped time', () => {
  const s = fresh();
  s.answers = [0, -1, -1];
  s.overtime = true;
  s.timedAnswered = 1;
  s.answers = [0, 1, 2];
  s.done = true;
  s.endedAt = T0 + 40 * 60_000;
  const p = toPayload(s);
  assert.equal(p.u, 2);
  assert.equal(p.secs, 25 * 60);
  const ns = { ...s, overtime: false };
  assert.equal(toPayload(ns).u, undefined);
});

test('u round-trips through share links and validation', () => {
  const form = buildForm(9);
  const payload = { mode: 'standard', seed: 9, tids: form.map((i) => i.id), a: form.map(() => -1), secs: 1500, u: 5 };
  const back = decodeShare(encodeShare(payload), {});
  assert.equal(back.u, 5);
  assert.equal(validatePayload({ v: 2, ...payload, u: 99 }), null);
  const server = validateResult({ v: 2, ...payload });
  assert.equal(server.payload.u, 5);
  assert.throws(() => validateResult({ v: 2, ...payload, u: -1 }));
});
