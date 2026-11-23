// Thin fetch wrappers for the Worker API. Every call has a timeout and none of them throw:
// callers get null / false / a status object so the UI can degrade (hash links, no stats).

const DEFAULT_TIMEOUT = 6000;

async function call(path, { method = 'GET', body, timeout = DEFAULT_TIMEOUT, keepalive = false, fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') return { ok: false, status: 0, data: null };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeout);
  try {
    const res = await f(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl?.signal,
      keepalive,
      credentials: 'same-origin',
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body */
    }
    return { ok: !!res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/results -> id string or null
export async function postResult(payload, opts = {}) {
  const r = await call('/api/results', { method: 'POST', body: payload, ...opts });
  const id = r.ok && r.data && typeof r.data.id === 'string' ? r.data.id : null;
  return id && /^[A-Za-z0-9]{4,32}$/.test(id) ? id : null;
}

// GET /api/results/:id -> { status: 'ok', payload } | { status: 'missing' } | { status: 'error' }
export async function getResult(id, opts = {}) {
  if (!/^[A-Za-z0-9]{4,32}$/.test(String(id))) return { status: 'missing' };
  const r = await call(`/api/results/${encodeURIComponent(id)}`, opts);
  if (r.ok && r.data && typeof r.data === 'object') return { status: 'ok', payload: r.data };
  if (r.status === 404) return { status: 'missing' };
  return { status: 'error' };
}

// POST /api/responses (consented anonymous answers) -> boolean
export async function postResponses(body, opts = {}) {
  const r = await call('/api/responses', { method: 'POST', body, keepalive: true, ...opts });
  return r.ok;
}

// GET /api/stats -> { takers } or null
export async function getStats(opts = {}) {
  const r = await call('/api/stats', { timeout: 4000, ...opts });
  return r.ok && r.data && Number.isFinite(r.data.takers) ? r.data : null;
}

// POST /api/events, fire and forget. Never throws, never awaited by callers.
export function track(name, props, opts = {}) {
  try {
    const p = call('/api/events', { method: 'POST', body: props ? { name, props } : { name }, timeout: 4000, keepalive: true, ...opts });
    p.catch(() => {});
  } catch {
    /* ignore */
  }
}

// Download a story-format PNG for a stored result. Returns a Blob or null.
export async function fetchCardBlob(id, { timeout = 15000, fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function' || !/^[A-Za-z0-9]{4,32}$/.test(String(id))) return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeout);
  try {
    const res = await f(`/og/${encodeURIComponent(id)}.png?format=story`, { signal: ctrl?.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob && blob.size > 0 && /image\/png/.test(blob.type || 'image/png') ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
