// Series items N1..N8. Pure: builds markup strings.
import { placeOptions, rng } from './rng.js';

const letter = (n) => String.fromCharCode(65 + n); // 0 -> 'A'

// Each rule gives term(i) for i = 0.. ; the stem shows `shown` terms, then "?".
// The answer is term(shown). Distractors are plain strings.
const SPECS = [
  { id: 'N1', b: -2.0, shown: 4, term: (i) => 3 + 4 * i, distractors: [17, 18, 20, 21] },
  { id: 'N2', b: -1.3, shown: 4, term: (i) => 2 * 3 ** i, distractors: [108, 72, 158, 216] },
  { id: 'N3', b: -0.8, shown: 5, term: (i) => (i + 1) ** 2, distractors: [30, 34, 35, 49] },
  { id: 'N4', b: -0.4, shown: 4, term: (i) => letter(1 + 3 * i), distractors: ['L', 'M', 'O', 'P'] },
  {
    id: 'N5',
    b: 0.1,
    shown: 5,
    term: (i) => {
      let x = 2;
      for (let k = 0; k < i; k++) x = 2 * x + 1;
      return x;
    },
    distractors: [71, 93, 94, 96],
  },
  {
    id: 'N6',
    b: 0.5,
    shown: 6,
    // interleaved: +5, -2, +5, -2, ...
    term: (i) => (i % 2 === 0 ? 4 + 3 * (i / 2) : 9 + 3 * ((i - 1) / 2)),
    distractors: [12, 17, 18, 20],
  },
  {
    id: 'N7',
    b: 0.9,
    shown: 5,
    // gaps grow by one: +2, +3, +4, +5, +6
    term: (i) => letter((i * (i + 3)) / 2),
    distractors: ['S', 'T', 'V', 'W'],
  },
  {
    id: 'N8',
    b: 1.3,
    shown: 6,
    // gaps double: +1, +2, +4, ...
    term: (i) => 2 ** i + 1,
    distractors: [49, 57, 64, 66],
  },
];

export const seriesItems = SPECS.map(({ id, b, shown, term, distractors }) => {
  const terms = Array.from({ length: shown }, (_, i) => term(i));
  const answer = term(shown);
  const stem = `<div class="series">${terms.join(', ')}, <span class="q">?</span></div>`;
  const placed = placeOptions(id, String(answer), distractors.map(String));
  return {
    id,
    category: 'series',
    b,
    prompt: 'Which number or letter comes next in the sequence?',
    stem,
    options: placed.options,
    answer: placed.answer,
    optionCols: 5,
  };
});

// ==========================================================================
// Variants. `seriesVariant(id, seed)` returns { item, meta }. Seed 0 uses the
// v1 parameters and reproduces the v1 item exactly. Other seeds change the
// start / step / multiplier while keeping the rule, with distractors built from
// the same "plausible wrong rule" recipe as v1.
// ==========================================================================

const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pickOf = (r, arr) => arr[Math.floor(r() * arr.length)];

const V1_PARAMS = {
  N1: { a: 3, d: 4 },
  N2: { a: 2, m: 3 },
  N3: { k: 1 },
  N4: { s: 1, step: 3 },
  N5: { a: 2, c: 1 },
  N6: { a: 4, p: 5, q: 2 },
  N7: { s: 0, g: 2 },
  N8: { a: 2, g0: 1 },
};

const DRAW_PARAMS = {
  N1: (r) => ({ a: ri(r, 1, 12), d: ri(r, 3, 9) }),
  N2: (r) => ({ a: ri(r, 1, 3), m: pickOf(r, [3, 4, 5]) }),
  N3: (r) => ({ k: ri(r, 1, 9) }),
  N4: (r) => {
    const step = pickOf(r, [3, 4]);
    return { s: ri(r, 0, 23 - 4 * step), step };
  },
  N5: (r) => ({ a: ri(r, 1, 4), c: ri(r, 1, 3) }),
  N6: (r) => {
    const q = ri(r, 1, 3);
    return { a: ri(r, 3, 9), p: ri(r, q + 2, 6), q };
  },
  N7: (r) => {
    const g = pickOf(r, [1, 2]);
    return { s: ri(r, 0, g === 1 ? 8 : 3), g };
  },
  N8: (r) => {
    let g0 = ri(r, 1, 3);
    let a = ri(r, 2, 9);
    if (a === g0) a += 1; // a == g0 would give plain doubling (a different rule)
    return { a, g0 };
  },
};

// Term generator, shown count, answer and distractors for each template.
function seriesData(id, p) {
  const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  switch (id) {
    case 'N1': {
      const shown = seq(4, (i) => p.a + p.d * i);
      const ans = p.a + p.d * 4;
      return { shown, ans, dis: [ans - 2, ans - 1, ans + 1, ans + 2] };
    }
    case 'N2': {
      const shown = seq(4, (i) => p.a * p.m ** i);
      const last = shown[3];
      const ans = last * p.m;
      return { shown, ans, dis: [last * (p.m - 1), last + shown[2], ans - 4, last * (p.m + 1)] };
    }
    case 'N3': {
      const shown = seq(5, (i) => (p.k + i) ** 2);
      const ans = (p.k + 5) ** 2;
      return { shown, ans, dis: [ans - 6, ans - 2, ans - 1, (p.k + 6) ** 2] };
    }
    case 'N4': {
      const shown = seq(4, (i) => letter(p.s + p.step * i));
      const a = p.s + p.step * 4;
      return { shown, ans: letter(a), dis: [a - 2, a - 1, a + 1, a + 2].map(letter) };
    }
    case 'N5': {
      const shown = [p.a];
      for (let i = 1; i < 5; i++) shown.push(2 * shown[i - 1] + p.c);
      const last = shown[4];
      const ans = 2 * last + p.c;
      return { shown, ans, dis: [last + (last - shown[3]), ans - 2, ans - 1, ans + 1] };
    }
    case 'N6': {
      const shown = [p.a];
      for (let i = 1; i < 6; i++) shown.push(shown[i - 1] + (i % 2 ? p.p : -p.q));
      const last = shown[5];
      const ans = last - p.q;
      return { shown, ans, dis: [ans - 1, last + p.q, last + p.q + 1, last + p.p] };
    }
    case 'N7': {
      const shown = [p.s];
      for (let i = 1; i < 5; i++) shown.push(shown[i - 1] + p.g + i - 1);
      const a = shown[4] + p.g + 4;
      return { shown: shown.map(letter), ans: letter(a), dis: [a - 2, a - 1, a + 1, a + 2].map(letter) };
    }
    case 'N8': {
      const shown = [p.a];
      for (let i = 1; i < 6; i++) shown.push(shown[i - 1] + p.g0 * 2 ** (i - 1));
      const last = shown[5];
      const ans = last + p.g0 * 32;
      return { shown, ans, dis: [last + p.g0 * 16, last + p.g0 * 24, ans - 1, ans + 1] };
    }
    default:
      throw new Error('unknown series template ' + id);
  }
}

const validTerm = (t) => (typeof t === 'number' ? t >= 1 && t <= 9999 : /^[A-Z]$/.test(t));
const letterOk = (n) => n >= 0 && n <= 25;

function usable(d) {
  const all = [...d.dis, d.ans];
  if (new Set(all.map(String)).size !== all.length) return false;
  return all.every(validTerm) && d.shown.every(validTerm);
}

export function seriesMeta(id, seed) {
  if (!V1_PARAMS[id]) throw new Error('unknown series template ' + id);
  if (!seed) return { params: { ...V1_PARAMS[id] } };
  const r = rng(`series:${id}:${seed}`);
  for (let i = 0; i < 1000; i++) {
    const params = DRAW_PARAMS[id](r);
    let d;
    try { d = seriesData(id, params); } catch { continue; }
    // letters out of range become NaN-ish strings; usable() rejects them.
    if (usable(d)) return { params };
  }
  throw new Error('no series params for ' + id);
}

export function seriesVariant(id, seed = 0) {
  const { params } = seriesMeta(id, seed);
  const d = seriesData(id, params);
  const meta = { params, shown: d.shown.map(String), answer: String(d.ans), distractors: d.dis.map(String) };
  const optId = seed ? `${id}#${seed}` : id;
  const stem = `<div class="series">${meta.shown.join(', ')}, <span class="q">?</span></div>`;
  const placed = placeOptions(optId, meta.answer, meta.distractors);
  const item = {
    id,
    category: 'series',
    b: SPECS.find((s) => s.id === id).b,
    prompt: 'Which number or letter comes next in the sequence?',
    stem,
    options: placed.options,
    answer: placed.answer,
    optionCols: 5,
  };
  return { item, meta };
}

export const SERIES_IDS = SPECS.map((s) => s.id);
