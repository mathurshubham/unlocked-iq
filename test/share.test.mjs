import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, extractToken, validatePayload, MAX_NAME } from '../public/js/share.js';

// 30 fake template ids; 12 with 6 options, the rest with 5 (4 for odd spatial ones).
const v1Tids = Array.from({ length: 30 }, (_, i) => (i < 12 ? `M${i + 1}` : i < 22 ? `S${i - 11}` : `N${i - 21}`));
const counts = Object.fromEntries(v1Tids.map((t, i) => [t, i < 12 ? 6 : i < 22 ? (i % 2 ? 4 : 5) : 5]));
const optionCount = (tid) => counts[tid] ?? NaN;
const opts = { v1Tids, optionCount };
const answers = v1Tids.map((t, i) => (i % 4 === 0 ? -1 : (i * 7) % counts[t]));
const base = { mode: 'standard', seed: 424242, tids: v1Tids, a: answers, secs: 1234, n: 'Ada' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

test('v2 round-trip', () => {
  const tok = encodeShare(base);
  assert.match(tok, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(tok, opts), { v: 2, ...base });
});

test('v2 quick mode with a subset of template ids', () => {
  const tids = ['M3', 'S2', 'N4', 'M9'];
  const a = [0, -1, 2, 1];
  const tok = encodeShare({ mode: 'quick', seed: 7, tids, a, secs: 300 });
  const out = decodeShare(tok, opts);
  assert.equal(out.mode, 'quick');
  assert.deepEqual(out.tids, tids);
  assert.deepEqual(out.a, a);
  assert.equal(out.n, '');
});

test('v2 round-trip with unicode name and emoji', () => {
  for (const n of ['Zoë Ñandú', 'प्रिया', '李小龍', 'Sam 🎉🧠', "O'Brien <b>&\"x\"</b>"]) {
    assert.equal(decodeShare(encodeShare({ ...base, n }), opts).n, n);
  }
});

test('accepts #r= prefix', () => {
  const tok = encodeShare(base);
  assert.equal(extractToken('#r=' + tok), tok);
  assert.equal(extractToken('#x=' + tok), null);
  assert.equal(extractToken(''), null);
  assert.deepEqual(decodeShare('#r=' + tok, opts).a, answers);
});

test('name is truncated to 40 code points on encode', () => {
  const out = decodeShare(encodeShare({ ...base, n: '😀'.repeat(60) }), opts);
  assert.equal(Array.from(out.n).length, MAX_NAME);
});

test('seconds are rounded and clamped; seed is coerced to uint32', () => {
  assert.equal(decodeShare(encodeShare({ ...base, secs: 99.6 }), opts).secs, 100);
  assert.equal(decodeShare(encodeShare({ ...base, secs: -5 }), opts).secs, 0);
  assert.equal(decodeShare(encodeShare({ ...base, secs: 1e9 }), opts).secs, 86400);
  assert.equal(decodeShare(encodeShare({ ...base, seed: 2 ** 32 + 5 }), opts).seed, 5);
});

test('v1 links decode as standard mode, seed 0, v1 tids', () => {
  const tok = b64({ v: 1, n: 'Old', a: answers, t: 600 });
  const out = decodeShare('#r=' + tok, opts);
  assert.deepEqual(out, { v: 2, mode: 'standard', seed: 0, tids: v1Tids, a: answers, secs: 600, n: 'Old' });
});

test('v1 links need the v1 tid list and the right answer count', () => {
  const tok = b64({ v: 1, n: '', a: answers, t: 1 });
  assert.equal(decodeShare(tok, { optionCount }), null);
  assert.equal(decodeShare(b64({ v: 1, n: '', a: answers.slice(1), t: 1 }), opts), null);
  assert.equal(decodeShare(b64({ v: 1, n: '', a: answers.map((v, i) => (i === 3 ? 6 : v)), t: 1 }), opts), null);
  assert.equal(decodeShare(b64({ v: 1, n: 5, a: answers, t: 1 }), opts), null);
  assert.equal(decodeShare(b64({ v: 1, n: '', a: answers, t: -1 }), opts), null);
});

test('unknown versions give null', () => {
  assert.equal(decodeShare(b64({ ...base, v: 3 }), opts), null);
  assert.equal(decodeShare(b64({ ...base, v: undefined }), opts), null);
});

test('garbage input gives null', () => {
  const garbage = [
    '', 'x', '!!!!', 'not base64 at all', '####', '====', null, undefined, 42, {}, [], '#r=',
    'e30', // {}
    'W10', // []
    'bnVsbA', // null
    '/////', 'AAAA', '%E0%A4%A', 'a'.repeat(9000),
  ];
  for (const g of garbage) assert.equal(decodeShare(g, opts), null, String(g));
});

test('truncated or corrupted tokens never throw', () => {
  const tok = encodeShare(base);
  assert.equal(decodeShare(tok.slice(0, tok.length - 9), opts), null);
  assert.equal(decodeShare(tok.slice(5), opts), null);
  assert.equal(decodeShare(tok + '$', opts), null);
  assert.equal(decodeShare(tok.replace(/./, '*'), opts), null);
});

test('invalid v2 shapes give null', () => {
  const good = { v: 2, ...base };
  const t = (o) => decodeShare(b64(o), opts);
  assert.ok(t(good));
  assert.equal(t({ ...good, mode: 'turbo' }), null);
  assert.equal(t({ ...good, seed: -1 }), null);
  assert.equal(t({ ...good, seed: 1.5 }), null);
  assert.equal(t({ ...good, seed: 2 ** 32 }), null);
  assert.equal(t({ ...good, tids: 'M1' }), null);
  assert.equal(t({ ...good, tids: [] , a: []}), null);
  assert.equal(t({ ...good, tids: good.tids.map((x, i) => (i === 0 ? '<b>' : x)) }), null);
  assert.equal(t({ ...good, tids: good.tids.map((x, i) => (i === 1 ? good.tids[0] : x)) }), null); // duplicate
  assert.equal(t({ ...good, tids: good.tids.map((x, i) => (i === 1 ? 'ZZ99' : x)) }), null); // unknown template
  assert.equal(t({ ...good, a: 'abc' }), null);
  assert.equal(t({ ...good, a: answers.slice(1) }), null);
  assert.equal(t({ ...good, a: [...answers, 0] }), null);
  assert.equal(t({ ...good, a: answers.map((v, i) => (i === 3 ? 6 : v)) }), null);
  assert.equal(t({ ...good, a: answers.map((v, i) => (i === 20 ? 5 : v)) }), null); // max 4 for that item
  assert.equal(t({ ...good, a: answers.map((v, i) => (i === 3 ? -2 : v)) }), null);
  assert.equal(t({ ...good, a: answers.map((v, i) => (i === 3 ? 1.5 : v)) }), null);
  assert.equal(t({ ...good, a: answers.map((v, i) => (i === 3 ? '1' : v)) }), null);
  assert.equal(t({ ...good, secs: -1 }), null);
  assert.equal(t({ ...good, secs: 'x' }), null);
  assert.equal(t({ ...good, secs: 1e9 }), null);
  assert.equal(t({ ...good, n: 5 }), null);
  assert.equal(t({ ...good, n: 'x'.repeat(41) }), null);
  assert.equal(t([good]), null);
});

test('payload without a name is valid; without optionCount only shape is checked', () => {
  const { n, ...noName } = { v: 2, ...base };
  assert.equal(validatePayload(noName, opts).n, '');
  assert.ok(validatePayload({ ...noName, tids: ['Q1', 'Q2'], a: [0, 3] }));
  assert.equal(validatePayload({ ...noName, tids: ['Q1', 'Q2'], a: [0, 3] }, opts), null);
});

test('invalid UTF-8 gives null', () => {
  const b = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]).toString('base64url');
  assert.equal(decodeShare(b, opts), null);
});
