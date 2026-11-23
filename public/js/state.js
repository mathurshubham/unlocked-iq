// Local state: the in-progress / finished test (resume) and practice stats.
// Pure apart from the optional `storage` argument (defaults to localStorage, always wrapped in try/catch).

import { cleanName } from './share.js';

export const STATE_KEY = 'unlocked:state';
export const PRACTICE_KEY = 'unlocked:practice';
export const SEEN_KEY = 'unlocked:warmup-seen';
export const STATE_V = 2;
export const LIMITS = { standard: 25 * 60, quick: 15 * 60 };
export const QUICK_LENGTH = 15;

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readKey(key, storage = defaultStorage()) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}
export function writeKey(key, value, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function removeKey(key, storage = defaultStorage()) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

// uint32 >= 1 (seed 0 is reserved for the v1 form).
export function newSeed() {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] || 1;
  } catch {
    return (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0;
  }
}

export function newState({ mode, seed, name = '', consent = false, tids = [], now = Date.now() }) {
  const m = mode === 'quick' ? 'quick' : 'standard';
  return {
    v: STATE_V,
    mode: m,
    seed: seed >>> 0,
    name: cleanName(name),
    consent: !!consent,
    tids: tids.slice(),
    answers: tids.map(() => -1),
    flags: tids.map(() => false),
    current: 0,
    startedAt: now,
    limit: LIMITS[m],
    done: false,
    endedAt: null,
    resultId: null,
    cat: null,
    // Clock only runs while the test is on screen: time spent away is added to pausedMs.
    pausedMs: 0,
    hiddenAt: null,
    // Set when time ran out and the user chose to answer the rest untimed.
    overtime: false,
    timedAnswered: null,
  };
}

// Returns a normalised state or null. Option-index range is not checked here (needs the engine).
export function normalizeState(s) {
  try {
    if (!s || typeof s !== 'object' || s.v !== STATE_V) return null;
    if (s.mode !== 'standard' && s.mode !== 'quick') return null;
    if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff) return null;
    if (!Array.isArray(s.tids) || s.tids.length > 60 || !s.tids.every((t) => typeof t === 'string')) return null;
    if (!Array.isArray(s.answers) || s.answers.length !== s.tids.length) return null;
    if (!s.answers.every((a) => Number.isInteger(a) && a >= -1 && a < 20)) return null;
    if (typeof s.startedAt !== 'number' || !Number.isFinite(s.startedAt)) return null;
    if (s.mode === 'standard' && s.tids.length < 1) return null;
    const flags = Array.isArray(s.flags) && s.flags.length === s.tids.length ? s.flags.map(Boolean) : s.tids.map(() => false);
    const limit = Number.isFinite(s.limit) && s.limit > 0 && s.limit <= 4 * 3600 ? s.limit : LIMITS[s.mode];
    return {
      v: STATE_V,
      mode: s.mode,
      seed: s.seed,
      name: typeof s.name === 'string' ? cleanName(s.name) : '',
      consent: !!s.consent,
      tids: s.tids.slice(),
      answers: s.answers.slice(),
      flags,
      current: Number.isInteger(s.current) ? Math.min(Math.max(0, s.tids.length - 1), Math.max(0, s.current)) : 0,
      startedAt: s.startedAt,
      limit,
      done: !!s.done,
      endedAt: typeof s.endedAt === 'number' ? s.endedAt : null,
      resultId: typeof s.resultId === 'string' && /^[A-Za-z0-9]{4,32}$/.test(s.resultId) ? s.resultId : null,
      cat: s.cat && typeof s.cat === 'object' ? s.cat : null,
      pausedMs: Number.isFinite(s.pausedMs) && s.pausedMs >= 0 ? s.pausedMs : 0,
      hiddenAt: Number.isFinite(s.hiddenAt) ? s.hiddenAt : null,
      overtime: !!s.overtime,
      timedAnswered: Number.isInteger(s.timedAnswered) && s.timedAnswered >= 0 ? s.timedAnswered : null,
    };
  } catch {
    return null;
  }
}

export function loadState(storage) {
  const raw = readKey(STATE_KEY, storage);
  if (!raw) return null;
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function saveState(state, storage) {
  if (!state) return false;
  return writeKey(STATE_KEY, JSON.stringify(state), storage);
}
export function clearState(storage) {
  removeKey(STATE_KEY, storage);
}

// Seconds the test was actually on screen (wall time minus paused time).
export function activeSecs(state, now = Date.now()) {
  const end = state.endedAt ?? now;
  const paused = (state.pausedMs || 0) + (state.hiddenAt != null ? Math.max(0, end - state.hiddenAt) : 0);
  return Math.max(0, (end - state.startedAt - paused) / 1000);
}
export const elapsedSecs = (state, now = Date.now()) => activeSecs(state, now);
export const remainingSecs = (state, now = Date.now()) => state.limit - activeSecs(state, now);

// Stop the clock (page hidden, app switched, test left). Idempotent.
export function pauseClock(state, now = Date.now()) {
  if (state && !state.done && state.hiddenAt == null) state.hiddenAt = now;
}
// Restart the clock, banking the time spent away. Idempotent.
export function resumeClock(state, now = Date.now()) {
  if (state && state.hiddenAt != null) {
    state.pausedMs = (state.pausedMs || 0) + Math.max(0, now - state.hiddenAt);
    state.hiddenAt = null;
  }
}
export const answeredCount = (state) => state.answers.filter((a) => a >= 0).length;

// Result payload (SPEC-v2) from a state. Time is capped at the limit.
export function toPayload(state, now = Date.now()) {
  const p = {
    v: 2,
    mode: state.mode,
    seed: state.seed,
    tids: state.tids.slice(),
    a: state.answers.slice(),
    secs: Math.round(Math.min(state.limit, elapsedSecs(state, now))),
  };
  if (state.name) p.n = state.name;
  if (state.overtime && state.timedAnswered != null) {
    const late = Math.max(0, answeredCount(state) - state.timedAnswered);
    if (late > 0) p.u = late;
  }
  return p;
}

// Does a result payload belong to this saved (finished) state?
export function isMine(state, payload, resultId = null) {
  if (!state || !state.done || !payload) return false;
  if (resultId && state.resultId === resultId) return true;
  return (
    state.seed === payload.seed &&
    state.mode === payload.mode &&
    state.tids.length === payload.tids.length &&
    state.tids.every((t, i) => t === payload.tids[i]) &&
    state.answers.every((a, i) => a === payload.a[i])
  );
}

// Rebuild Item objects from a payload with the engine's buildItem.
export function itemsFromPayload(payload, buildItem) {
  return payload.tids.map((tid) => buildItem(tid, payload.seed));
}

// ---------- practice stats ----------
const SESSION_GAP_MS = 30 * 60 * 1000;

export function emptyPractice(now = Date.now()) {
  return { streak: 0, best: 0, answered: 0, correct: 0, since: now, last: now };
}
export function normalizePractice(p, now = Date.now()) {
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  if (!p || typeof p !== 'object') return emptyPractice(now);
  const out = {
    streak: num(p.streak),
    best: num(p.best),
    answered: num(p.answered),
    correct: num(p.correct),
    since: Number.isFinite(p.since) ? p.since : now,
    last: Number.isFinite(p.last) ? p.last : now,
  };
  out.correct = Math.min(out.correct, out.answered);
  out.best = Math.max(out.best, out.streak);
  return out;
}
export function loadPractice(storage, now = Date.now()) {
  const raw = readKey(PRACTICE_KEY, storage);
  let p;
  try {
    p = raw ? JSON.parse(raw) : null;
  } catch {
    p = null;
  }
  p = normalizePractice(p, now);
  // A new session after a long gap: keep the best streak, reset the rest.
  if (now - p.last > SESSION_GAP_MS) return { ...emptyPractice(now), best: p.best };
  return p;
}
export function savePractice(p, storage) {
  return writeKey(PRACTICE_KEY, JSON.stringify(p), storage);
}
export function recordPractice(p, ok, now = Date.now()) {
  const streak = ok ? p.streak + 1 : 0;
  return {
    streak,
    best: Math.max(p.best, streak),
    answered: p.answered + 1,
    correct: p.correct + (ok ? 1 : 0),
    since: p.since,
    last: now,
  };
}
export const accuracy = (p) => (p.answered ? Math.round((p.correct / p.answered) * 100) : 0);
