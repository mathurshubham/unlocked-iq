// Share-link encode/decode. Pure: no DOM access, no imports.
// Token = base64url(JSON { v, n, a, t }).

export const MAX_NAME = 40;
const MAX_TOKEN_LEN = 4000;
const MAX_SECONDS = 24 * 60 * 60;

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

// { version, name, answers, seconds } -> token string
export function encodeShare({ version, name = '', answers, seconds = 0 }) {
  const n = Array.from(String(name).trim()).slice(0, MAX_NAME).join('');
  const t = Math.min(MAX_SECONDS, Math.max(0, Math.round(Number(seconds) || 0)));
  return toBase64Url(JSON.stringify({ v: version, n, a: answers, t }));
}

// Accepts "#r=<token>", "r=<token>" or "<token>". Returns the token or null.
export function extractToken(hash) {
  if (typeof hash !== 'string') return null;
  const m = /^#?r=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1] : null;
}

// token -> { name, answers, seconds } or null.
// opts: { version, count, optionCounts } where optionCounts[i] = number of options of item i.
export function decodeShare(input, { version, count, optionCounts } = {}) {
  try {
    if (typeof input !== 'string') return null;
    const token = extractToken(input) || input;
    if (!token || token.length > MAX_TOKEN_LEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const obj = JSON.parse(fromBase64Url(token));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (obj.v !== version) return null;
    if (typeof obj.n !== 'string' || Array.from(obj.n).length > MAX_NAME) return null;
    if (!Array.isArray(obj.a)) return null;
    if (count !== undefined && obj.a.length !== count) return null;
    for (let i = 0; i < obj.a.length; i++) {
      const v = obj.a[i];
      if (!Number.isInteger(v) || v < -1) return null;
      const max = optionCounts ? optionCounts[i] : Infinity;
      if (v >= max) return null;
    }
    if (typeof obj.t !== 'number' || !Number.isFinite(obj.t) || obj.t < 0 || obj.t > MAX_SECONDS) {
      return null;
    }
    return { name: obj.n.trim(), answers: obj.a.slice(), seconds: Math.round(obj.t) };
  } catch {
    return null;
  }
}
