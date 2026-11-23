import test from 'node:test';
import assert from 'node:assert/strict';
import { bellSvg, barsSvg, ringOffset, ringFraction, RING_C, ringMarkup, iqPercentile, normCdf, esc } from '../public/js/charts.js';

const labels = { matrix: 'Pattern reasoning', spatial: 'Spatial reasoning', series: 'Numerical & sequence' };

test('bell chart: marker, range, label and a11y text; no ids/defs/url()', () => {
  const svg = bellSvg({ iq: 118, low: 108, high: 128 });
  assert.match(svg, /^<svg[^>]+viewBox="0 0 360 200"/);
  assert.match(svg, />IQ 118</);
  assert.match(svg, /108&#8211;128 likely/);
  assert.match(svg, /aria-label="[^"]*118[^"]*108 to 128/);
  assert.doesNotMatch(svg, /\sid=|<defs|url\(#/);
  assert.match(svg, /data-bell=/);
  assert.equal((svg.match(/<svg/g) || []).length, 1);
});

test('bell chart: extreme IQ stays inside the viewBox', () => {
  for (const iq of [55, 145]) {
    const svg = bellSvg({ iq, low: 55, high: 145 });
    const xs = [...svg.matchAll(/<text class="ch-label" x="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(xs[0] >= 14 && xs[0] <= 346, String(xs));
  }
});

test('bars chart: one row per category with value labels, zero bars omitted, escaped text', () => {
  const svg = barsSvg(
    { matrix: { correct: 9, total: 12 }, spatial: { correct: 0, total: 10 }, series: { correct: 4, total: 8 } },
    { ...labels, series: 'A & <B>' },
  );
  assert.equal((svg.match(/class="ch-row"/g) || []).length, 3);
  assert.equal((svg.match(/class="ch-bar"/g) || []).length, 2);
  assert.match(svg, />75%</);
  assert.match(svg, />0%</);
  assert.match(svg, />50%</);
  assert.match(svg, /A &amp; &lt;B&gt;/);
  assert.match(svg, /data-tip="Pattern reasoning: 9 of 12 correct"/);
  assert.doesNotMatch(svg, /legend/i);
});

test('bars chart: skips categories without data', () => {
  const svg = barsSvg({ matrix: { correct: 1, total: 2 } }, labels);
  assert.equal((svg.match(/class="ch-row"/g) || []).length, 1);
});

test('ring maths', () => {
  assert.equal(ringFraction(750, 1500), 0.5);
  assert.equal(ringFraction(-5, 1500), 0);
  assert.equal(ringFraction(9999, 1500), 1);
  assert.equal(ringFraction(5, 0), 0);
  assert.ok(Math.abs(ringOffset(750, 1500) - RING_C / 2) < 1e-9);
  assert.equal(ringOffset(1500, 1500), 0);
  assert.match(ringMarkup(), /role="timer"/);
});

test('percentile helpers', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6);
  assert.equal(iqPercentile(100), 50);
  assert.equal(iqPercentile(115), 84);
  assert.equal(iqPercentile(145), 99);
  assert.equal(iqPercentile(55), 1);
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});
