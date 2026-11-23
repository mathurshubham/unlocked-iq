// Series items N1..N8. Pure: builds markup strings.
import { placeOptions } from './rng.js';

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
