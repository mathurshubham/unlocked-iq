// Computerized adaptive test ("Quick test"). Pure: no DOM, no Math.random.
//
// Picks, at each step, the unused template with the largest 3PL Fisher
// information at the current EAP ability estimate, subject to category balance
// (each category stays within +-1 of its target share of the items given so far).
import { TEMPLATES, buildItem } from './engine.js';
import { score, fisherInfo } from './scoring.js';

export const CATEGORY_TARGETS = { matrix: 0.4, spatial: 0.33, series: 0.27 };
const CATS = Object.keys(CATEGORY_TARGETS);
export const DEFAULT_LENGTH = 15;

const clampLength = (n) => Math.max(1, Math.min(TEMPLATES.length, Math.floor(n)));

// Choose the next template id given what has been asked and answered.
// `answered` are the built items already answered (same order as `answers`).
export function chooseNext(tids, answered, answers) {
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
  let best = null;
  let bestInfo = -Infinity;
  for (const t of TEMPLATES) {
    if (used.has(t.id) || !eligible.includes(t.category)) continue;
    const info = fisherInfo(theta, t.b, t.nOptions, t.a);
    if (info > bestInfo + 1e-12) {
      best = t;
      bestInfo = info;
    }
  }
  return best ? best.id : null;
}

function makeCat({ formSeed, length, tids, answers }) {
  const items = tids.map((id) => buildItem(id, formSeed));
  const state = { items, answers: answers.slice() };

  const cat = {
    formSeed,
    length,
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
      const id = chooseNext(state.items.map((i) => i.templateId), answered, state.answers);
      if (!id) return null;
      const item = buildItem(id, formSeed);
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
      return { v: 1, formSeed, length, tids: state.items.map((i) => i.templateId), answers: state.answers.slice() };
    },
  };
  return cat;
}

export function createCat({ formSeed = 0, length = DEFAULT_LENGTH } = {}) {
  return makeCat({ formSeed: formSeed >>> 0, length: clampLength(length), tids: [], answers: [] });
}

// Restore from toJSON() output (object or JSON string). Throws on bad input.
export function catFromJSON(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const ids = new Set(TEMPLATES.map((t) => t.id));
  const ok =
    j && j.v === 1 && Number.isInteger(j.formSeed) && j.formSeed >= 0 && Number.isInteger(j.length) &&
    Array.isArray(j.tids) && Array.isArray(j.answers) &&
    j.tids.length <= j.length && j.answers.length <= j.tids.length &&
    j.answers.length >= j.tids.length - 1 &&
    j.tids.every((t) => ids.has(t)) && new Set(j.tids).size === j.tids.length;
  if (!ok) throw new Error('bad cat state');
  const cat = makeCat({ formSeed: j.formSeed >>> 0, length: clampLength(j.length), tids: j.tids, answers: j.answers });
  cat.items.forEach((it, i) => {
    if (i < j.answers.length && !(Number.isInteger(j.answers[i]) && j.answers[i] >= -1 && j.answers[i] < it.options.length)) {
      throw new Error('bad cat state');
    }
  });
  return cat;
}
