import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCard, fitText, CARD_W, CARD_H } from '../public/js/card.js';

function stubCtx() {
  const texts = [];
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy(
    { texts, calls },
    {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'measureText') return (s) => ({ width: String(s).length * 20 });
        if (k === 'createLinearGradient') return () => grad;
        if (k === 'fillText') return (s, x, y) => texts.push([String(s), x, y]);
        return (...a) => calls.push([k, a]);
      },
      set(t, k, v) { t[k] = v; return true; },
    },
  );
  return ctx;
}

test('fitText truncates with an ellipsis', () => {
  const ctx = stubCtx();
  assert.equal(fitText(ctx, 'short', 500), 'short');
  const t = fitText(ctx, 'a very long name indeed', 200);
  assert.ok(t.endsWith('…'));
  assert.ok(t.length * 20 <= 220);
});

test('drawCard writes IQ, range, percentile, bars and the site', () => {
  const ctx = stubCtx();
  drawCard(ctx, {
    name: 'Richa', iq: 118, low: 108, high: 128, percentile: 88,
    byCategory: { matrix: { correct: 9, total: 12 }, spatial: { correct: 5, total: 10 }, series: { correct: 0, total: 8 } },
    labels: { matrix: 'Pattern reasoning', spatial: 'Spatial reasoning', series: 'Sequences' },
  });
  const all = ctx.texts.map((t) => t[0]);
  assert.ok(all.includes('118'));
  assert.ok(all.some((t) => t.includes('Richa')));
  assert.ok(all.some((t) => t.includes('108') && t.includes('128')));
  assert.ok(all.some((t) => t.includes('88%')));
  assert.ok(all.includes('75%') && all.includes('50%') && all.includes('0%'));
  assert.ok(all.some((t) => t.includes('unlocked-iq.shubhammathur.in')));
  for (const [, x, y] of ctx.texts) assert.ok(x >= 0 && x <= CARD_W && y >= 0 && y <= CARD_H);
});

test('drawCard works without a name', () => {
  const ctx = stubCtx();
  drawCard(ctx, { iq: 100, low: 90, high: 110, percentile: 50, byCategory: {}, labels: {} });
  assert.ok(ctx.texts.some((t) => t[0] === 'My result'));
});
