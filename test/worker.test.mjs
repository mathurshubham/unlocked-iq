// Pure-helper tests for the Worker (src/validate.js, src/headers.js, scripts/calibrate.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequest,
  KNOWN_TIDS,
  cardName,
  cleanName,
  descriptionFor,
  newId,
  ordinal,
  percentileLabel,
  scorePayload,
  titleFor,
  validateResponses,
  validateResult,
} from '../src/validate.js';
import { CSP, SECURITY_HEADERS } from '../src/headers.js';
import { buildItem } from '../public/js/engine.js';
import { calibrate, estimateB, render } from '../scripts/calibrate.mjs';
import { readFileSync } from 'node:fs';

const tids = [...KNOWN_TIDS].slice(0, 30);
const correctAnswers = (ids, seed) => ids.map((id) => buildItem(id, seed).answer);
const standard = (over = {}) => ({ v: 2, mode: 'standard', seed: 0, tids, a: correctAnswers(tids, 0), secs: 600, ...over });
const quick = (over = {}) => {
  const ids = tids.slice(0, 8);
  return { v: 2, mode: 'quick', seed: 42, tids: ids, a: correctAnswers(ids, 42), secs: 120, ...over };
};
const rejects = (fn, re) => assert.throws(fn, (e) => e instanceof BadRequest && (!re || re.test(e.message)));

test('valid standard and quick payloads validate and score', () => {
  const r = validateResult(standard({ n: '  Richa  ' }));
  assert.equal(r.payload.n, 'Richa');
  assert.equal(r.items.length, tids.length);
  const { s } = scorePayload(r.payload);
  assert.ok(s.iq >= 55 && s.iq <= 145);
  assert.equal(s.correct, tids.length);
  const q = validateResult(quick());
  assert.equal(q.mode, 'quick');
  assert.equal(scorePayload(q.payload).s.total, 8);
});

test('unanswered (-1) is accepted', () => {
  const a = correctAnswers(tids, 0);
  a[0] = -1;
  assert.equal(validateResult(standard({ a })).payload.a[0], -1);
});

test('malformed payloads are rejected', () => {
  rejects(() => validateResult(null), /object/);
  rejects(() => validateResult([]), /object/);
  rejects(() => validateResult({ v: 9 }), /version/);
  rejects(() => validateResult(standard({ mode: 'blitz' })), /mode/);
  rejects(() => validateResult(standard({ seed: -1 })), /seed/);
  rejects(() => validateResult(standard({ seed: 2 ** 32 })), /seed/);
  rejects(() => validateResult(standard({ seed: 1.5 })), /seed/);
  rejects(() => validateResult(standard({ tids: tids.slice(0, 10), a: correctAnswers(tids.slice(0, 10), 0) })), /standard/);
  rejects(() => validateResult(quick({ tids: ['M1', 'M1', 'N1', 'N2', 'S1'], a: [0, 0, 0, 0, 0] })), /duplicate/);
  rejects(() => validateResult(quick({ tids: ['M1', 'N1', 'N2', 'S1', 'nope'], a: [0, 0, 0, 0, 0] })), /unknown/);
  rejects(() => validateResult(quick({ a: [0, 0] })), /length/);
  rejects(() => validateResult(quick({ a: Array(8).fill(99) })), /range/);
  rejects(() => validateResult(quick({ a: Array(8).fill(-2) })), /range/);
  rejects(() => validateResult(quick({ a: Array(8).fill(0.5) })), /range/);
  rejects(() => validateResult(quick({ secs: -1 })), /secs/);
  rejects(() => validateResult(quick({ secs: 'x' })), /secs/);
  rejects(() => validateResult(quick({ n: 5 })), /string/);
  rejects(() => validateResult(quick({ tids: tids.slice(0, 2), a: [0, 0] })), /at least/);
});

test('v1 payloads rebuild the fixed 30-item bank', () => {
  const r = validateResult({ v: 1, n: 'Old', a: Array(30).fill(0), t: 900 });
  assert.equal(r.items.length, 30);
  assert.deepEqual(Object.keys(r.payload).sort(), ['a', 'n', 't', 'v']);
  rejects(() => validateResult({ v: 1, a: [0], t: 1 }), /30/);
});

test('names: trimmed, controls stripped, capped at 40 code points', () => {
  assert.equal(cleanName('a\u0000b\n c'), 'a b c');
  assert.equal(cleanName('x'.repeat(100)).length, 40);
  assert.equal(cleanName(''), '');
  assert.equal(cleanName(undefined), '');
  assert.equal(cardName('Riçha हिन्दी 😀'), 'Riçha');
  const stored = validateResult(quick({ n: '<b>"hi"</b>' })).payload.n;
  assert.equal(stored, '<b>"hi"</b>'); // kept verbatim; escaped at output time
});

test('responses: one row per item, no name kept', () => {
  const { rows } = validateResponses({ ...quick(), n: 'Secret', theta: 0.4321 });
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => r.correct === 1 && r.mode === 'quick' && r.seed === 42 && r.theta === 0.432));
  assert.ok(rows.every((r) => !('n' in r) && !('name' in r)));
  const bad = quick();
  bad.a[0] = (buildItem(bad.tids[0], 42).answer + 1) % buildItem(bad.tids[0], 42).options.length;
  assert.equal(validateResponses(bad).rows[0].correct, 0);
  rejects(() => validateResponses({ ...quick(), theta: 99 }), /theta/);
  assert.equal(validateResponses(quick()).rows[0].theta, null);
});

test('ids: 8-char base62, unbiased sampler skips bytes >= 248', () => {
  for (let i = 0; i < 50; i++) assert.match(newId(), /^[0-9A-Za-z]{8}$/);
  const seq = [255, 250, 0, 1, 2, 3, 4, 5, 6, 7];
  const id = newId((a) => {
    a.set(seq.concat(Array(6).fill(61)));
    return a;
  });
  assert.equal(id, '01234567');
});

test('share copy', () => {
  assert.equal(titleFor('Richa', 118), 'Richa scored 118 on Unlocked IQ');
  assert.equal(titleFor('', 118), 'An Unlocked IQ result');
  assert.match(descriptionFor({ iq: 118, low: 109, high: 127, percentile: 88.2 }), /118.*109.*127.*88th percentile/);
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(12), '12th');
  assert.equal(ordinal(22), '22nd');
  assert.equal(percentileLabel(99.9), '99th percentile');
  assert.equal(percentileLabel(0.1), '1st percentile');
});

test('CSP matches the spec and public/_headers', () => {
  assert.equal(
    CSP,
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  );
  const file = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.ok(file.includes(`${k}: ${v}`), `${k} missing from _headers`);
});

test('calibration: recovers b and respects the minimum count', () => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bins = {};
  for (let i = 0; i < 6000; i++) {
    const th = Math.round(Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()) * 10) / 10;
    const p = 0.2 + 0.8 / (1 + Math.exp(-1.3 * (th - 0.8)));
    const y = rnd() < p ? 1 : 0;
    const k = `${th}_${y}`;
    (bins[k] ||= { t: th, correct: y, n: 0 }).n++;
  }
  const { b } = estimateB(Object.values(bins), { b0: 0 });
  assert.ok(Math.abs(b - 0.8) < 0.15, `b=${b}`);

  const binned = [
    ...Object.values(bins).map((r) => ({ template_id: 'T1', ...r })),
    { template_id: 'T2', t: 0, correct: 1, n: 10 },
  ];
  const tpl = { T1: { b0: 0, a: 1.3, c: 0.2 }, T2: { b0: 0, a: 1.3, c: 0.2 } };
  const { calibration, report } = calibrate(binned, { min: 50, templates: tpl, existing: { T3: { b: 1, a: 1.3, n: 80 } } });
  assert.ok(calibration.T1 && calibration.T1.n === 6000);
  assert.ok(!calibration.T2);
  assert.ok(calibration.T3);
  assert.ok(report.find((r) => r.tid === 'T2').skipped);
  assert.match(render(calibration), /^\/\/ Generated[\s\S]*export const CALIBRATION = \{/);
});

test('calibrate: rows carry their own guessing floor from n_options', () => {
  // Same data seen as 4-option (c = 0.25) vs 6-option (c = 1/6): a higher floor explains more
  // lucky guesses, so the same success rate implies a harder item.
  const bins = [{ template_id: 'T9', t: 0, correct: 1, n: 60 }, { template_id: 'T9', t: 0, correct: 0, n: 40 }];
  const tpl = { T9: { b0: 0, a: 1.3, c: 0.2 } };
  const four = calibrate(bins.map((r) => ({ ...r, n_options: 4 })), { min: 50, templates: tpl }).calibration.T9.b;
  const six = calibrate(bins.map((r) => ({ ...r, n_options: 6 })), { min: 50, templates: tpl }).calibration.T9.b;
  const legacy = calibrate(bins, { min: 50, templates: tpl }).calibration.T9.b;
  assert.ok(four > six, `${four} > ${six}`);
  assert.ok(legacy > six && legacy < four);
});
