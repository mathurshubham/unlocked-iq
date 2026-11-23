// Unlocked IQ Worker: API + result pages + share cards. Everything else is static assets.
import { Hono } from 'hono';
import { cache as ogCache } from '@cf-wasm/og/workerd';
import { withSecurityHeaders } from './headers.js';
import { renderCard, FORMATS } from './og.js';
import {
  MAX_BODY,
  BadRequest,
  ID_RE,
  newId,
  cardName,
  cleanName,
  validateResult,
  validateResponses,
  scorePayload,
  titleFor,
  descriptionFor,
} from './validate.js';

// Canonical public origin for og:url / og:image / canonical links (never the request host).
const SITE = 'https://iq-test.shubhammathur.in';

const app = new Hono();

// ---------- helpers ----------
const now = () => Math.floor(Date.now() / 1000);
const jsonHeaders = { 'Cache-Control': 'no-store' };
const err = (c, status, message) => c.json({ error: message }, status, jsonHeaders);

// Security headers on every Worker response.
app.use('*', async (c, next) => {
  await next();
  c.res = withSecurityHeaders(c.res);
});

// Same-origin only: no CORS headers are ever sent; also refuse cross-origin writes outright.
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin');
  if (origin && origin !== new URL(c.req.url).origin) return err(c, 403, 'cross-origin requests are not allowed');
  await next();
});

// Workers Rate Limiting binding, keyed by IP (never stored). Skipped when binding is absent.
async function rateLimited(c, binding) {
  const rl = c.env[binding];
  if (!rl || typeof rl.limit !== 'function') return false;
  try {
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const { success } = await rl.limit({ key: `${binding}:${ip}` });
    return !success;
  } catch {
    return false;
  }
}

// Read JSON body with a hard byte cap. Throws BadRequest(413-ish) via status property.
class TooLarge extends Error {}
async function readJson(c, max = MAX_BODY) {
  const len = Number(c.req.header('content-length'));
  if (Number.isFinite(len) && len > max) throw new TooLarge();
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > max) throw new TooLarge();
  if (buf.byteLength === 0) throw new BadRequest('empty body');
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new BadRequest('invalid JSON');
  }
}

// Cache API wrapper for GET responses that are expensive to build.
async function cached(c, key, ttl, produce) {
  const cache = caches.default;
  const req = new Request(key);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await produce();
  if (res.ok) {
    res.headers.set('Cache-Control', `public, max-age=${ttl}`);
    c.executionCtx.waitUntil(cache.put(req, res.clone()));
  }
  return res;
}

async function getRow(c, id) {
  if (!ID_RE.test(id)) return null;
  return c.env.DB.prepare('SELECT payload, iq, mode, created_at FROM results WHERE id = ?').bind(id).first();
}

function notFoundPage(c) {
  return c.env.ASSETS.fetch(new Request(new URL('/__not_found__', c.req.url))).then((res) => {
    const type = res.headers.get('content-type') || '';
    if (res.status === 404 && type.includes('text/html')) return res;
    return new Response('<!doctype html><title>Not found</title><h1>Not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });
}

// ---------- API ----------
app.post('/api/results', async (c) => {
  if (await rateLimited(c, 'RL_WRITE')) return err(c, 429, 'too many requests');
  const body = await readJson(c);
  const { payload, items, mode } = validateResult(body);
  const iq = scorePayload(payload).s.iq;
  const json = JSON.stringify(payload);
  for (let attempt = 0; attempt < 6; attempt++) {
    const id = newId();
    try {
      await c.env.DB.prepare('INSERT INTO results (id, payload, iq, mode, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, json, iq, mode, now())
        .run();
      return c.json({ id }, 201, jsonHeaders);
    } catch (e) {
      if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e;
    }
  }
  return err(c, 503, 'could not allocate id, try again');
});

app.get('/api/results/:id', async (c) => {
  const row = await getRow(c, c.req.param('id'));
  if (!row) return err(c, 404, 'result not found');
  return new Response(row.payload, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
});

// Consented anonymous answers: one row per item. No name, no IP, no id linking rows.
app.post('/api/responses', async (c) => {
  if (await rateLimited(c, 'RL_WRITE')) return err(c, 429, 'too many requests');
  const { rows } = validateResponses(await readJson(c));
  const t = now();
  const stmt = c.env.DB.prepare(
    'INSERT INTO responses (template_id, seed, correct, mode, theta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  await c.env.DB.batch(rows.map((r) => stmt.bind(r.template_id, r.seed, r.correct, r.mode, r.theta, t)));
  return c.json({ ok: true, n: rows.length }, 201, jsonHeaders);
});

app.get('/api/stats', (c) =>
  cached(c, new URL('/api/stats', c.req.url).toString(), 300, async () => {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM results').first();
    // Consented responses carry no session id (by design), so they cannot be counted as people.
    return c.json({ takers: row ? row.n : 0 }, 200);
  }),
);

const EVENT_NAMES = new Set(['test_start', 'test_finish', 'test_overtime', 'share_click', 'card_download', 'practice_answer']);
// props with these keys fill blob2..blob7 in order; every other numeric prop fills doubles (sorted by key).
const EVENT_BLOB_KEYS = ['mode', 'category', 'level', 'method', 'correct', 'source'];

app.post('/api/events', async (c) => {
  if (await rateLimited(c, 'RL_EVENTS')) return err(c, 429, 'too many requests');
  const body = await readJson(c, 2048);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('body must be a JSON object');
  if (!EVENT_NAMES.has(body.name)) throw new BadRequest('unknown event name');
  const props = body.props && typeof body.props === 'object' && !Array.isArray(body.props) ? body.props : {};
  const blobs = [body.name];
  for (const k of EVENT_BLOB_KEYS) {
    const v = props[k];
    blobs.push(typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' ? String(v).slice(0, 64) : '');
  }
  const doubles = Object.keys(props)
    .filter((k) => !EVENT_BLOB_KEYS.includes(k) && typeof props[k] === 'number' && Number.isFinite(props[k]))
    .sort()
    .slice(0, 8)
    .map((k) => props[k]);
  c.env.EVENTS?.writeDataPoint?.({ indexes: [body.name], blobs, doubles });
  return c.body(null, 204, jsonHeaders);
});

app.all('/api/*', (c) => err(c, 404, 'not found'));

// ---------- /r/:id : results.html with Open Graph meta injected ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function fetchAsset(c, path) {
  let res = await c.env.ASSETS.fetch(new Request(new URL(path, c.req.url)));
  for (let i = 0; i < 2 && res.status >= 300 && res.status < 400 && res.headers.get('location'); i++) {
    res = await c.env.ASSETS.fetch(new Request(new URL(res.headers.get('location'), c.req.url)));
  }
  return res;
}

app.get('/r/:id', async (c) => {
  const id = c.req.param('id');
  const row = await getRow(c, id);
  if (!row) return notFoundPage(c);

  let name = '';
  let title = 'An Unlocked IQ result';
  let description = `Estimated IQ ${row.iq}. Free and complete: no email, no paywall. Try the test yourself.`;
  try {
    const payload = JSON.parse(row.payload);
    name = cleanName(payload.n);
    const { s } = scorePayload(payload);
    title = titleFor(name, s.iq);
    description = descriptionFor(s);
  } catch {
    /* stored payload no longer rebuilds: keep generic copy */
  }

  const url = `${SITE}/r/${id}`;
  const image = `${SITE}/og/${id}.png`;
  const tags = [
    `<meta name="result-id" content="${id}">`,
    `<meta name="robots" content="noindex">`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Unlocked IQ">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
  ].join('\n');

  const page = await fetchAsset(c, '/results');
  if (!page.ok) return notFoundPage(c);

  const rewritten = new HTMLRewriter()
    .on(
      'meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], meta[name="result-id"], meta[name="robots"], link[rel="canonical"]',
      { element: (e) => e.remove() },
    )
    .on('title', { element: (e) => e.setInnerContent(title) })
    .on('head', { element: (e) => e.append(tags, { html: true }) })
    .transform(page);

  const headers = new Headers(rewritten.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=300');
  headers.delete('etag');
  return new Response(rewritten.body, { status: 200, headers });
});

// ---------- /og/:id.png ----------
app.get('/og/:file', async (c) => {
  const m = /^([0-9A-Za-z]{8})\.png$/.exec(c.req.param('file'));
  if (!m) return c.text('Not found', 404);
  const id = m[1];
  const format = c.req.query('format') || 'og';
  if (!Object.hasOwn(FORMATS, format)) return c.text('format must be og or story', 400);

  const origin = new URL(c.req.url).origin;
  const cacheReq = new Request(`${origin}/og/${id}.png?format=${format}`);
  const hit = await caches.default.match(cacheReq);
  if (hit) return hit;

  const row = await getRow(c, id);
  if (!row) return c.text('Not found', 404);
  const payload = JSON.parse(row.payload);
  const { s } = scorePayload(payload);

  ogCache.setExecutionContext(c.executionCtx);
  const { response, degraded } = await renderCard(format, { name: cardName(payload.n), s }, c.executionCtx);
  const png = await response.arrayBuffer();
  const headers = {
    'content-type': 'image/png',
    'Cache-Control': degraded ? 'public, max-age=300' : 'public, max-age=86400',
  };
  if (!degraded) c.executionCtx.waitUntil(caches.default.put(cacheReq, new Response(png.slice(0), { headers })));
  return new Response(png, { headers });
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? err(c, 404, 'not found') : notFoundPage(c)));

app.onError((e, c) => {
  if (e instanceof TooLarge) return err(c, 413, 'body too large');
  if (e instanceof BadRequest) return err(c, 400, e.message);
  console.error('unhandled', e && e.stack ? e.stack : e);
  if (c.req.path.startsWith('/og/')) return c.text('Card unavailable', 500);
  return err(c, 500, 'internal error');
});

export default app;
