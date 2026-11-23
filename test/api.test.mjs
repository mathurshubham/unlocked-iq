import test from 'node:test';
import assert from 'node:assert/strict';
import { postResult, getResult, postResponses, getStats, track, fetchCardBlob } from '../public/js/api.js';

const json = (data, status = 200) => async () => ({ ok: status < 400, status, json: async () => data });
const boom = async () => { throw new Error('network'); };
const hang = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('abort'))));

test('postResult returns the id, or null on any failure', async () => {
  assert.equal(await postResult({}, { fetchImpl: json({ id: 'abCD1234' }) }), 'abCD1234');
  assert.equal(await postResult({}, { fetchImpl: json({ id: '../../x' }) }), null);
  assert.equal(await postResult({}, { fetchImpl: json({ error: 'x' }, 400) }), null);
  assert.equal(await postResult({}, { fetchImpl: boom }), null);
  assert.equal(await postResult({}, { fetchImpl: hang, timeout: 20 }), null);
});

test('postResult sends JSON', async () => {
  let seen;
  await postResult({ v: 2 }, { fetchImpl: async (u, o) => ((seen = [u, o]), { ok: true, status: 200, json: async () => ({ id: 'abcd1234' }) }) });
  assert.equal(seen[0], '/api/results');
  assert.equal(seen[1].method, 'POST');
  assert.equal(seen[1].headers['content-type'], 'application/json');
  assert.equal(seen[1].body, '{"v":2}');
});

test('getResult distinguishes ok, missing and error', async () => {
  const payload = { v: 2 };
  assert.deepEqual(await getResult('abcd1234', { fetchImpl: json(payload) }), { status: 'ok', payload });
  assert.deepEqual(await getResult('abcd1234', { fetchImpl: json({}, 404) }), { status: 'missing' });
  assert.deepEqual(await getResult('abcd1234', { fetchImpl: json({}, 500) }), { status: 'error' });
  assert.deepEqual(await getResult('abcd1234', { fetchImpl: boom }), { status: 'error' });
  assert.deepEqual(await getResult('a/b', { fetchImpl: json(payload) }), { status: 'missing' });
});

test('postResponses, getStats', async () => {
  assert.equal(await postResponses({}, { fetchImpl: json({ ok: true }) }), true);
  assert.equal(await postResponses({}, { fetchImpl: boom }), false);
  assert.deepEqual(await getStats({ fetchImpl: json({ takers: 42 }) }), { takers: 42 });
  assert.equal(await getStats({ fetchImpl: json({ takers: 'x' }) }), null);
  assert.equal(await getStats({ fetchImpl: boom }), null);
});

test('track never throws and swallows failures', async () => {
  track('test_start', { mode: 'quick' }, { fetchImpl: boom });
  track('x', undefined, { fetchImpl: () => { throw new Error('sync'); } });
  await new Promise((r) => setTimeout(r, 10));
});

test('fetchCardBlob', async () => {
  const blob = { size: 10, type: 'image/png' };
  const ok = async () => ({ ok: true, blob: async () => blob });
  assert.equal(await fetchCardBlob('abcd1234', { fetchImpl: ok }), blob);
  assert.equal(await fetchCardBlob('abcd1234', { fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await fetchCardBlob('abcd1234', { fetchImpl: async () => ({ ok: true, blob: async () => ({ size: 0, type: 'image/png' }) }) }), null);
  assert.equal(await fetchCardBlob('abcd1234', { fetchImpl: boom }), null);
  assert.equal(await fetchCardBlob('bad id', { fetchImpl: ok }), null);
});
