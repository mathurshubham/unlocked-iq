// Share-card PNG renderer (satori + resvg-wasm via @cf-wasm/og, which runs on Workers).
// Layout is plain satori element objects (no JSX, no build step).
import { ImageResponse } from '@cf-wasm/og/workerd';
import { CAT_SHORT, percentileLabel } from './validate.js';

export const FORMATS = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
};

const FONT_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';
const FONT_SPECS = [
  { name: 'Space Grotesk', weight: 700, url: `${FONT_CDN}/space-grotesk@5.2.10/files/space-grotesk-latin-700-normal.woff` },
  { name: 'Inter', weight: 400, url: `${FONT_CDN}/inter@5.2.8/files/inter-latin-400-normal.woff` },
  { name: 'Inter', weight: 600, url: `${FONT_CDN}/inter@5.2.8/files/inter-latin-600-normal.woff` },
];

const C = {
  bg1: '#1B1B3A',
  bg2: '#0E0F20',
  ink: '#F5F5FB',
  muted: '#A9ABC9',
  accent: '#8B8CF8',
  accentSoft: '#2B2C55',
  highlight: '#F5B94A',
  track: '#2A2B4A',
};

// ---- fonts: module cache (per isolate) + Cache API (per colo). Failure -> null (caller falls back). ----
let fontPromise = null;

async function loadFontData(spec, ctx) {
  const key = new Request(spec.url);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  try {
    const hit = cache ? await cache.match(key) : null;
    if (hit) return await hit.arrayBuffer();
  } catch {
    /* ignore cache errors */
  }
  const res = await fetch(spec.url, { cf: { cacheEverything: true, cacheTtl: 31536000 } });
  if (!res.ok) throw new Error(`font ${spec.url} -> ${res.status}`);
  const data = await res.arrayBuffer();
  if (data.byteLength < 1000) throw new Error('font too small');
  if (cache) {
    const put = cache
      .put(key, new Response(data, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }))
      .catch(() => {});
    ctx?.waitUntil?.(put);
  }
  return data;
}

// Resolves to Font[] or null if any font could not be loaded (then satori uses bundled Noto Sans).
export function getFonts(ctx) {
  if (!fontPromise) {
    fontPromise = Promise.all(
      FONT_SPECS.map(async (s) => ({ name: s.name, weight: s.weight, style: 'normal', data: await loadFontData(s, ctx) })),
    ).catch((err) => {
      console.warn('og fonts unavailable, using fallback:', err && err.message);
      fontPromise = null; // retry on next request
      return null;
    });
  }
  return fontPromise;
}

// ---- element helpers ----
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});
const box = (style, ...children) => h('div', { display: 'flex', ...style }, ...children);
const txt = (style, text) => h('div', { display: 'flex', ...style }, String(text));

function logoMark(cell, gap) {
  const radius = Math.round(cell * 0.28);
  const row = (r) =>
    box(
      { gap: `${gap}px` },
      ...[0, 1, 2].map((c) =>
        box(
          r === 2 && c === 2
            ? { width: cell, height: cell, borderRadius: radius, border: `${Math.max(2, Math.round(cell / 7))}px solid ${C.highlight}` }
            : { width: cell, height: cell, borderRadius: radius, background: C.accent },
        ),
      ),
    );
  return box({ flexDirection: 'column', gap: `${gap}px` }, row(0), row(1), row(2));
}

function brand(scale) {
  return box(
    { alignItems: 'center', gap: `${Math.round(20 * scale)}px` },
    logoMark(Math.round(14 * scale), Math.round(5 * scale)),
    txt({ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: Math.round(36 * scale), color: C.ink }, 'Unlocked IQ'),
  );
}

function bars(cats, trackW, s) {
  return box(
    { flexDirection: 'column', gap: `${Math.round(28 * s)}px`, width: trackW },
    ...cats.map((c) => {
      const pct = c.total ? c.correct / c.total : 0;
      const fillW = Math.max(c.correct ? Math.round(14 * s) : 0, Math.round(trackW * pct));
      return box(
        { flexDirection: 'column', gap: `${Math.round(10 * s)}px`, width: trackW },
        box(
          { justifyContent: 'space-between', alignItems: 'baseline', width: trackW },
          txt({ fontFamily: 'Inter', fontWeight: 600, fontSize: Math.round(26 * s), color: C.ink }, c.label),
          txt({ fontFamily: 'Inter', fontWeight: 400, fontSize: Math.round(24 * s), color: C.muted }, `${c.correct}/${c.total}`),
        ),
        box(
          { width: trackW, height: Math.round(18 * s), borderRadius: 999, background: C.track },
          box({ width: fillW, height: Math.round(18 * s), borderRadius: 999, background: C.accent }),
        ),
      );
    }),
  );
}

function categoriesOf(s) {
  return ['matrix', 'spatial', 'series']
    .map((k) => ({ key: k, label: CAT_SHORT[k], ...(s.byCategory[k] || { correct: 0, total: 0 }) }))
    .filter((c) => c.total > 0);
}

function cardTree(format, { name, s }) {
  const cats = categoriesOf(s);
  const title = name ? `${name}'s result` : 'An Unlocked IQ result';
  const range = `90% range ${s.low}–${s.high}`;
  const pct = percentileLabel(s.percentile);
  const url = 'iq-test.shubhammathur.in';
  const bg = `linear-gradient(135deg, ${C.bg1} 0%, ${C.bg2} 100%)`;

  if (format === 'story') {
    const W = 1080;
    const pad = 96;
    const trackW = W - pad * 2;
    return box(
      { width: W, height: 1920, flexDirection: 'column', justifyContent: 'space-between', padding: `${pad + 24}px ${pad}px`, background: bg },
      brand(1.5),
      box(
        { flexDirection: 'column', gap: '8px' },
        txt({ fontFamily: 'Inter', fontWeight: 600, fontSize: 52, color: C.muted, maxWidth: trackW }, title),
        txt({ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 560, lineHeight: 1, color: C.accent, marginTop: '16px' }, s.iq),
        txt({ fontFamily: 'Inter', fontWeight: 600, fontSize: 56, color: C.ink, marginTop: '8px' }, pct),
        txt({ fontFamily: 'Inter', fontWeight: 400, fontSize: 40, color: C.muted, marginTop: '12px' }, `Estimated IQ · ${range}`),
      ),
      bars(cats, trackW, 1.5),
      box(
        { flexDirection: 'column', gap: '10px' },
        txt({ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 44, color: C.highlight }, url),
        txt({ fontFamily: 'Inter', fontWeight: 400, fontSize: 32, color: C.muted }, 'The IQ test with nothing locked.'),
      ),
    );
  }

  // 1200x630 landscape
  return box(
    { width: 1200, height: 630, flexDirection: 'column', justifyContent: 'space-between', padding: '56px 72px', background: bg },
    brand(1),
    box(
      { alignItems: 'center', justifyContent: 'space-between', width: 1056 },
      box(
        { flexDirection: 'column' },
        txt({ fontFamily: 'Inter', fontWeight: 600, fontSize: 34, color: C.muted, maxWidth: 560 }, title),
        txt({ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 250, lineHeight: 1, color: C.accent, marginTop: '4px' }, s.iq),
        txt({ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, color: C.ink, marginTop: '6px' }, `${pct} · ${range}`),
      ),
      bars(cats, 380, 1),
    ),
    box(
      { justifyContent: 'space-between', alignItems: 'center', width: 1056 },
      txt({ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 30, color: C.highlight }, url),
      txt({ fontFamily: 'Inter', fontWeight: 400, fontSize: 26, color: C.muted }, 'Free. No email. No paywall.'),
    ),
  );
}

// Returns { response, degraded }. degraded = fonts fell back to bundled Noto Sans.
export async function renderCard(format, data, ctx) {
  const dims = FORMATS[format] || FORMATS.og;
  const fonts = await getFonts(ctx);
  const tree = cardTree(format, data);
  const response = await ImageResponse.async(tree, {
    ...dims,
    ...(fonts ? { fonts } : {}),
    format: 'png',
  });
  return { response, degraded: !fonts };
}
