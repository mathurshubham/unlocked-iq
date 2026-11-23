import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, extractToken, MAX_NAME } from '../public/js/share.js';

const V = 1;
const counts = Array.from({ length: 30 }, (_, i) => (i < 12 ? 6 : 5));
const opts = { version: V, count: 30, optionCounts: counts };
const answers = counts.map((n, i) => (i % 4 === 0 ? -1 : (i * 7) % n));

test('round-trip', () => {
  const tok = encodeShare({ version: V, name: 'Ada', answers, seconds: 1234 });
  assert.match(tok, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(tok, opts), { name: 'Ada', answers, seconds: 1234 });
});

test('round-trip with unicode name and emoji', () => {
  for (const name of ['Zoë Ñandú', 'प्रिया', '李小龍', 'Sam 🎉🧠', "O'Brien <b>&\"x\"</b>"]) {
    const tok = encodeShare({ version: V, name, answers, seconds: 5 });
    assert.equal(decodeShare(tok, opts).name, name);
  }
});

test('accepts #r= prefix', () => {
  const tok = encodeShare({ version: V, name: 'A', answers, seconds: 1 });
  assert.equal(extractToken('#r=' + tok), tok);
  assert.equal(extractToken('#x=' + tok), null);
  assert.equal(extractToken(''), null);
  assert.deepEqual(decodeShare('#r=' + tok, opts).answers, answers);
});

test('name is truncated to 40 characters on encode (by code point)', () => {
  const tok = encodeShare({ version: V, name: '😀'.repeat(60), answers, seconds: 1 });
  const out = decodeShare(tok, opts);
  assert.equal(Array.from(out.name).length, MAX_NAME);
});

test('seconds are rounded and clamped', () => {
  assert.equal(decodeShare(encodeShare({ version: V, answers, seconds: 99.6 }), opts).seconds, 100);
  assert.equal(decodeShare(encodeShare({ version: V, answers, seconds: -5 }), opts).seconds, 0);
  assert.equal(decodeShare(encodeShare({ version: V, answers, seconds: 1e9 }), opts).seconds, 86400);
});

test('wrong version gives null', () => {
  const tok = encodeShare({ version: V + 1, name: 'A', answers, seconds: 1 });
  assert.equal(decodeShare(tok, opts), null);
  assert.equal(decodeShare(encodeShare({ version: V, answers, seconds: 1 }), { ...opts, version: 2 }), null);
});

test('garbage input gives null', () => {
  const garbage = [
    '', 'x', '!!!!', 'not base64 at all', '####', '====', null, undefined, 42, {}, [], '#r=',
    'e30', // {}
    'W10', // []
    'bnVsbA', // null
    '/////', 'AAAA', '%E0%A4%A', 'a'.repeat(5000),
  ];
  for (const g of garbage) assert.equal(decodeShare(g, opts), null, String(g));
});

test('truncated or corrupted tokens give null or a different valid result, never throw', () => {
  const tok = encodeShare({ version: V, name: 'Ada', answers, seconds: 60 });
  assert.equal(decodeShare(tok.slice(0, tok.length - 9), opts), null);
  assert.equal(decodeShare(tok.slice(5), opts), null);
  assert.equal(decodeShare(tok + '$', opts), null);
  assert.equal(decodeShare(tok.replace(/./, '*'), opts), null);
});

test('invalid shapes give null', () => {
  const enc = (o) => {
    const b = Buffer.from(JSON.stringify(o)).toString('base64url');
    return decodeShare(b, opts);
  };
  const good = { v: V, n: 'A', a: answers, t: 10 };
  assert.ok(enc(good));
  assert.equal(enc({ ...good, v: undefined }), null);
  assert.equal(enc({ ...good, n: 5 }), null);
  assert.equal(enc({ ...good, n: 'x'.repeat(41) }), null);
  assert.equal(enc({ ...good, a: 'abc' }), null);
  assert.equal(enc({ ...good, a: answers.slice(1) }), null); // wrong length
  assert.equal(enc({ ...good, a: [...answers, 0] }), null);
  assert.equal(enc({ ...good, a: answers.map((v, i) => (i === 3 ? 6 : v)) }), null); // >= options
  assert.equal(enc({ ...good, a: answers.map((v, i) => (i === 20 ? 5 : v)) }), null); // 5 options -> max 4
  assert.equal(enc({ ...good, a: answers.map((v, i) => (i === 3 ? -2 : v)) }), null);
  assert.equal(enc({ ...good, a: answers.map((v, i) => (i === 3 ? 1.5 : v)) }), null);
  assert.equal(enc({ ...good, a: answers.map((v, i) => (i === 3 ? '1' : v)) }), null);
  assert.equal(enc({ ...good, t: -1 }), null);
  assert.equal(enc({ ...good, t: 'x' }), null);
  assert.equal(enc({ ...good, t: 1e9 }), null);
  assert.equal(enc([good]), null);
});

test('invalid UTF-8 gives null', () => {
  const b = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]).toString('base64url');
  assert.equal(decodeShare(b, opts), null);
});
