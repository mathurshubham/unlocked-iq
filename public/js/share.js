// Share-link encode/decode. Pure: no DOM access, no imports.
//
// v2 token = base64url(JSON { v:2, mode, seed, tids, a, secs, n? }) (the result payload from SPEC-v2).
// v1 token = base64url(JSON { v:1, n, a, t }): standard mode, seed 0, tids = buildForm(0) ids.
//
// decodeShare always returns a v2-shaped payload (or null), so callers handle one shape.

export const MAX_NAME = 40;
export const MAX_TIDS = 60;
const MAX_TOKEN_LEN = 8000;
const MAX_SECONDS = 24 * 60 * 60;
const TID_RE = /^[A-Za-z0-9_-]{1,24}$/;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token) {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function cleanName(name) {
  return Array.from(String(name ?? '').trim()).slice(0, MAX_NAME).join('');
}

const clampSecs = (s) => Math.min(MAX_SECONDS, Math.max(0, Math.round(Number(s) || 0)));

// payload { mode, seed, tids, a, secs, n? } -> token string
export function encodeShare({ mode = 'standard', seed = 0, tids, a, secs = 0, n = '', u = 0 }) {
  const obj = { v: 2, mode, seed: seed >>> 0, tids, a, secs: clampSecs(secs) };
  const name = cleanName(n);
  if (name) obj.n = name;
  if (Number.isInteger(u) && u > 0) obj.u = u;
  return toBase64Url(JSON.stringify(obj));
}

// Accepts "#r=<token>", "r=<token>" or "<token>"-style hash. Returns the token or null.
export function extractToken(hash) {
  if (typeof hash !== 'string') return null;
  const m = /^#?r=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1] : null;
}

// Validates and normalises an already-parsed v2 payload (also used for API responses).
// opts.optionCount(tid, seed) -> number of options (optional; enables index range checks and
// rejects unknown template ids by returning a non-finite value / throwing).
export function validatePayload(obj, { optionCount } = {}) {
  try {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.v !== 2) return null;
    if (obj.mode !== 'standard' && obj.mode !== 'quick') return null;
    if (!Number.isInteger(obj.seed) || obj.seed < 0 || obj.seed > 0xffffffff) return null;
    if (!Array.isArray(obj.tids) || obj.tids.length < 1 || obj.tids.length > MAX_TIDS) return null;
    if (!obj.tids.every((t) => typeof t === 'string' && TID_RE.test(t))) return null;
    if (new Set(obj.tids).size !== obj.tids.length) return null;
    if (!Array.isArray(obj.a) || obj.a.length !== obj.tids.length) return null;
    for (let i = 0; i < obj.a.length; i++) {
      const v = obj.a[i];
      if (!Number.isInteger(v) || v < -1) return null;
      if (optionCount) {
        const max = optionCount(obj.tids[i], obj.seed);
        if (!Number.isFinite(max) || v >= max) return null;
      }
    }
    if (typeof obj.secs !== 'number' || !Number.isFinite(obj.secs) || obj.secs < 0 || obj.secs > MAX_SECONDS) {
      return null;
    }
    let n = '';
    if (obj.n !== undefined && obj.n !== null) {
      if (typeof obj.n !== 'string' || Array.from(obj.n).length > MAX_NAME) return null;
      n = obj.n.trim();
    }
    const out = { v: 2, mode: obj.mode, seed: obj.seed, tids: obj.tids.slice(), a: obj.a.slice(), secs: Math.round(obj.secs), n };
    // u: questions answered after the clock ran out (untimed finish).
    if (obj.u !== undefined) {
      if (!Number.isInteger(obj.u) || obj.u < 0 || obj.u > obj.tids.length) return null;
      if (obj.u > 0) out.u = obj.u;
    }
    return out;
  } catch {
    return null;
  }
}

// token -> v2 payload or null.
// opts: { v1Tids: string[] (buildForm(0) ids, needed to decode v1 links), optionCount(tid, seed) }
export function decodeShare(input, opts = {}) {
  try {
    if (typeof input !== 'string') return null;
    const token = extractToken(input) || input;
    if (!token || token.length > MAX_TOKEN_LEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const obj = JSON.parse(fromBase64Url(token));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (obj.v === 2) return validatePayload(obj, opts);
    if (obj.v === 1) {
      const tids = opts.v1Tids;
      if (!Array.isArray(tids) || !tids.length) return null;
      if (typeof obj.n !== 'string' || Array.from(obj.n).length > MAX_NAME) return null;
      if (typeof obj.t !== 'number' || !Number.isFinite(obj.t) || obj.t < 0 || obj.t > MAX_SECONDS) return null;
      if (!Array.isArray(obj.a) || obj.a.length !== tids.length) return null;
      return validatePayload(
        { v: 2, mode: 'standard', seed: 0, tids, a: obj.a, secs: obj.t, n: obj.n },
        opts,
      );
    }
    return null;
  } catch {
    return null;
  }
}
