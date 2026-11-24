// Computerized adaptive test ("Quick test"). Pure: no DOM, no Math.random.
//
// Picks, at each step, the unused template with the largest 3PL Fisher
// information at the current EAP ability estimate, subject to category balance
// (each category stays within +-1 of its target share of the items given so far).
import { TEMPLATES, buildItem, formatFromField, fieldFromFormat, V4_OPTIONS } from './engine.js';
import { isV4 } from './present.js';
import { score, fisherInfo } from './scoring.js';
import { rng } from './rng.js';

export const CATEGORY_TARGETS = { matrix: 0.4, spatial: 0.33, series: 0.27 };
const CATS = Object.keys(CATEGORY_TARGETS);
export const DEFAULT_LENGTH = 15;

// Capped at 60: the result payload accepts at most 60 items.
export const MAX_LENGTH = Math.min(60, TEMPLATES.length);
const clampLength = (n) => Math.max(1, Math.min(MAX_LENGTH, Math.floor(n)));

// Choose the next template id given what has been asked and answered.
// `answered` are the built items already answered (same order as `answers`).
// opts.avoid: template ids to skip when possible (seen before).
// opts.randomesque: pick at random (seeded by opts.seed) among the top-N most informative
// templates, so repeat takers see different questions. 1 = pure max information.
// opts.format: 'v4' means every item has exactly 4 options (guessing floor 1/4), whatever the
// template's legacy option count; the shared TEMPLATES objects are not touched.
export function chooseNext(tids, answered, answers, { avoid = null, randomesque = 1, seed = 0, format } = {}) {
  const nOpt = (t) => (isV4(format) ? V4_OPTIONS : t.nOptions);
  const used = new Set(tids);
  const theta = answered.length ? score(answered, answers).theta : 0;
  const counts = Object.fromEntries(CATS.map((c) => [c, 0]));
  for (const id of tids) counts[TEMPLATES.find((t) => t.id === id).category]++;
  const k = tids.length;
  const free = (c) => TEMPLATES.some((t) => t.category === c && !used.has(t.id));
  // Categories whose pick keeps every category within +-1 of target.
  let eligible = CATS.filter((c) => {
    if (!free(c)) return false;
    return CATS.every((d) => {
      const n = counts[d] + (d === c ? 1 : 0);
      return Math.abs(n - CATEGORY_TARGETS[d] * (k + 1)) <= 1 + 1e-9;
    });
  });
  if (!eligible.length) {
    // Cannot satisfy the band (for example a category ran out): most behind its target.
    const open = CATS.filter(free).sort(
      (x, y) => counts[x] - CATEGORY_TARGETS[x] * k - (counts[y] - CATEGORY_TARGETS[y] * k)
    );
    eligible = open.slice(0, 1);
  }
  let cands = TEMPLATES.filter((t) => !used.has(t.id) && eligible.includes(t.category));
  if (avoid && avoid.size) {
    const fresh = cands.filter((t) => !avoid.has(t.id));
    if (fresh.length) cands = fresh;
  }
  const ranked = cands
    .map((t) => ({ t, info: fisherInfo(theta, t.b, nOpt(t), t.a) }))
    .sort((x, y) => y.info - x.info || x.t.id.localeCompare(y.t.id));
  if (!ranked.length) return null;
  const n = Math.max(1, Math.min(ranked.length, Math.floor(randomesque)));
  if (n === 1) return ranked[0].t.id;
  const r = rng(`cat:${seed >>> 0}:${k}`);
  return ranked[Math.floor(r() * n)].t.id;
}

function makeCat({ formSeed, length, tids, answers, avoid = null, randomesque = 1, format }) {
  const items = tids.map((id) => buildItem(id, formSeed, { format }));
  const state = { items, answers: answers.slice() };

  const cat = {
    formSeed,
    length,
    format: isV4(format) ? 'v4' : 'legacy',
    get items() { return state.items; },
    get answers() { return state.answers; },
    get tids() { return state.items.map((i) => i.templateId); },
    get done() { return state.answers.length >= length; },
    get pending() { return state.items.length > state.answers.length ? state.items[state.items.length - 1] : null; },
    // Current EAP ability estimate (0 before any answer).
    get theta() { return state.answers.length ? score(state.items.slice(0, state.answers.length), state.answers).theta : 0; },
    // Item to show now (repeated calls return the same pending item), or null when finished.
    next() {
      if (cat.done) return null;
      if (cat.pending) return cat.pending;
      const answered = state.items.slice(0, state.answers.length);
      const id = chooseNext(state.items.map((i) => i.templateId), answered, state.answers, { avoid, randomesque, seed: formSeed, format });
      if (!id) return null;
      const item = buildItem(id, formSeed, { format });
      state.items.push(item);
      return item;
    },
    // Record the answer to the pending item. Final: no going back. -1 = skipped/timed out.
    answer(optionIndex) {
      const item = cat.next();
      if (!item) throw new Error('quiz is finished');
      if (!Number.isInteger(optionIndex) || optionIndex < -1 || optionIndex >= item.options.length) {
        throw new Error('bad option index');
      }
      state.answers.push(optionIndex);
    },
    // Score of what has been answered so far (same shape as scoring.score).
    result() { return score(state.items.slice(0, state.answers.length), state.answers); },
    toJSON() {
      const j = { v: 1, formSeed, length, tids: state.items.map((i) => i.templateId), answers: state.answers.slice() };
      if (randomesque > 1) j.rq = randomesque;
      if (isV4(format)) j.f = fieldFromFormat(format);
      return j;
    },
  };
  return cat;
}

export function createCat({ formSeed = 0, length = DEFAULT_LENGTH, avoid = null, randomesque = 1, format } = {}) {
  return makeCat({ formSeed: formSeed >>> 0, length: clampLength(length), tids: [], answers: [], avoid, randomesque, format });
}

// Restore from toJSON() output (object or JSON string). Throws on bad input.
// The format comes from the saved state's `f` field (absent = legacy); opts.format overrides it.
export function catFromJSON(json, { avoid = null, format } = {}) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const ids = new Set(TEMPLATES.map((t) => t.id));
  const ok =
    j && j.v === 1 && Number.isInteger(j.formSeed) && j.formSeed >= 0 && Number.isInteger(j.length) &&
    Array.isArray(j.tids) && Array.isArray(j.answers) &&
    j.tids.length <= j.length && j.answers.length <= j.tids.length &&
    j.answers.length >= j.tids.length - 1 &&
    j.tids.every((t) => ids.has(t)) && new Set(j.tids).size === j.tids.length;
  if (!ok) throw new Error('bad cat state');
  const rq = Number.isInteger(j.rq) && j.rq > 1 && j.rq <= 10 ? j.rq : 1;
  const fmt = format !== undefined ? format : formatFromField(j.f);
  const cat = makeCat({ formSeed: j.formSeed >>> 0, length: clampLength(j.length), tids: j.tids, answers: j.answers, avoid, randomesque: rq, format: fmt });
  cat.items.forEach((it, i) => {
    if (i < j.answers.length && !(Number.isInteger(j.answers[i]) && j.answers[i] >= -1 && j.answers[i] < it.options.length)) {
      throw new Error('bad cat state');
    }
  });
  return cat;
}
