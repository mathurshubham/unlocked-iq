// Pure helpers: payload validation, item rebuilding, ids, name cleaning.
// No Workers APIs here so node tests can import it.
import { buildItem, TEMPLATES } from '../public/js/engine.js';
import { ITEMS } from '../public/js/items.js';
import { score } from '../public/js/scoring.js';

export const MAX_BODY = 8192;
export const MAX_NAME = 40;
export const MAX_SECS = 86400;
export const KNOWN_TIDS = new Set(TEMPLATES.map((t) => t.id));
const MIN_QUICK = 5;
const MIN_STANDARD = 20;

export class BadRequest extends Error {}
// Control/format chars plus the Unicode line and paragraph separators (built from code points on purpose).
const CTRL_RE = new RegExp('[\\p{Cc}\\p{Cf}' + String.fromCharCode(0x2028, 0x2029) + ']', 'gu');
// Anything outside printable ASCII, Latin-1 and Latin Extended-A/B, plus curly quotes and dashes, is dropped from OG cards.
const CARD_BAD_RE = new RegExp(
  '[^\\x20-\\x7E\\xA0-\\xFF' + String.fromCharCode(0x100) + '-' + String.fromCharCode(0x24f, 0x2018, 0x2019, 0x2013, 0x2014) + ']',
  'g',
);
const bad = (msg) => {
  throw new BadRequest(msg);
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Display name: string, control chars stripped, whitespace collapsed, <= 40 code points.
export function cleanName(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') bad('n must be a string');
  const s = v.normalize('NFC').replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, MAX_NAME).join('');
}

// Name used on the OG card: only glyphs our Latin font subsets can draw.
export function cardName(v) {
  return cleanName(v).replace(CARD_BAD_RE, '').trim();
}

function parseSeed(v) {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) bad('seed must be a uint32');
  return v;
}

function parseSecs(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_SECS) bad('secs out of range');
  return Math.round(v);
}

function parseTids(mode, tids) {
  if (!Array.isArray(tids) || tids.length === 0 || tids.length > 60) bad('tids must be a non-empty array');
  const seen = new Set();
  for (const t of tids) {
    if (typeof t !== 'string' || !KNOWN_TIDS.has(t)) bad('unknown template id');
    if (seen.has(t)) bad('duplicate template id');
    seen.add(t);
  }
  if (mode === 'standard' && tids.length < MIN_STANDARD) bad('standard mode needs at least ' + MIN_STANDARD + ' items');
  if (mode === 'quick' && tids.length < MIN_QUICK) bad('quick mode needs at least ' + MIN_QUICK + ' items');
  return tids.slice();
}

function parseAnswers(a, items) {
  if (!Array.isArray(a) || a.length !== items.length) bad('answers length must match items');
  return a.map((x, i) => {
    if (!Number.isInteger(x) || x < -1 || x >= items[i].options.length) bad('answer index out of range at ' + i);
    return x;
  });
}

// Rebuild the exact items a payload refers to. v1 = fixed 30-item bank, v2 = tids + seed.
export function rebuildItems(p) {
  if (p.v === 1) return ITEMS;
  return p.tids.map((id) => buildItem(id, p.seed));
}

// Validate a result payload (POST /api/results and anything stored). Returns normalized payload + items.
export function validateResult(body) {
  if (!isObj(body)) bad('body must be a JSON object');
  const n = cleanName(body.n);
  if (body.v === 1) {
    if (!Array.isArray(body.a) || body.a.length !== ITEMS.length) bad('v1 needs 30 answers');
    const a = parseAnswers(body.a, ITEMS);
    const payload = { v: 1, a, t: parseSecs(body.t) };
    if (n) payload.n = n;
    return { payload, items: ITEMS, mode: 'standard' };
  }
  if (body.v !== 2) bad('unsupported payload version');
  if (body.mode !== 'standard' && body.mode !== 'quick') bad('mode must be standard or quick');
  const seed = parseSeed(body.seed);
  const tids = parseTids(body.mode, body.tids);
  const items = tids.map((id) => buildItem(id, seed));
  const a = parseAnswers(body.a, items);
  const payload = { v: 2, mode: body.mode, seed, tids, a, secs: parseSecs(body.secs) };
  if (n) payload.n = n;
  return { payload, items, mode: body.mode };
}

// Validate a /api/responses body: { mode, seed, tids, a, secs, theta }. No name accepted or kept.
export function validateResponses(body) {
  if (!isObj(body)) bad('body must be a JSON object');
  if (body.mode !== 'standard' && body.mode !== 'quick') bad('mode must be standard or quick');
  const seed = parseSeed(body.seed);
  const tids = parseTids(body.mode, body.tids);
  const items = tids.map((id) => buildItem(id, seed));
  const a = parseAnswers(body.a, items);
  let theta = null;
  if (body.theta !== undefined && body.theta !== null) {
    if (typeof body.theta !== 'number' || !Number.isFinite(body.theta) || Math.abs(body.theta) > 6) bad('theta out of range');
    theta = Math.round(body.theta * 1000) / 1000;
  }
  const rows = tids.map((id, i) => ({ template_id: id, seed, correct: a[i] === items[i].answer ? 1 : 0, mode: body.mode, theta }));
  return { rows };
}

// Score a stored/validated payload.
export function scorePayload(p) {
  const items = rebuildItems(p);
  const answers = p.a;
  return { items, s: score(items, answers) };
}

export const CAT_SHORT = { matrix: 'Pattern', spatial: 'Spatial', series: 'Numerical' };

export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

export function percentileLabel(percentile) {
  const p = Math.min(99, Math.max(1, Math.round(percentile)));
  return ordinal(p) + ' percentile';
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const ID_RE = /^[0-9A-Za-z]{8}$/;

// 8-char base62 id; rejection sampling keeps it unbiased.
export function newId(getRandom = (a) => crypto.getRandomValues(a)) {
  let out = '';
  while (out.length < 8) {
    const buf = getRandom(new Uint8Array(16));
    for (const b of buf) {
      if (b < 248 && out.length < 8) out += B62[b % 62];
    }
  }
  return out;
}

export function titleFor(name, iq) {
  return name ? `${name} scored ${iq} on Unlocked IQ` : 'An Unlocked IQ result';
}

export function descriptionFor(s) {
  return `Estimated IQ ${s.iq} (90% range ${s.low}–${s.high}), ${percentileLabel(s.percentile)}. Free and complete: no email, no paywall. Try the test yourself.`;
}
