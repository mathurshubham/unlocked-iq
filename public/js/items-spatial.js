// Spatial items S1..S10: mirror, rotation, odd-one-out, cube nets. Pure: builds markup strings.
import { rng, placeOptions } from './rng.js';
import {
  normalize,
  rotate,
  mirror,
  flipY,
  boundingBox,
  oppositeOf,
} from './cube.js';

const SW = 2.5; // stroke width in a 100-unit viewBox

const r2 = (n) => Math.round(n * 100) / 100;

// ---- polyomino rendering ----

// One cell size for a whole item: the largest bounding box fits a vw x vh box with padding.
function fitCell(shapes, vw = 100, vh = 100, pad = 8) {
  let cs = Infinity;
  for (const s of shapes) {
    const { w, h } = boundingBox(s);
    cs = Math.min(cs, (vw - 2 * pad) / w, (vh - 2 * pad) / h);
  }
  return cs;
}

function cellRects(cells, cs, ox, oy) {
  return cells
    .map(
      ([x, y]) =>
        `<rect x="${r2(ox + x * cs)}" y="${r2(oy + y * cs)}" width="${r2(cs)}" height="${r2(cs)}" ` +
        `class="f-grey" stroke="currentColor" stroke-width="${SW}" stroke-linejoin="round"/>`
    )
    .join('');
}

// A shape centered in a 100x100 viewBox at cell size cs.
function polySvg(cells, cs, label, style = '') {
  const n = normalize(cells);
  const { w, h } = boundingBox(n);
  const ox = (100 - w * cs) / 2;
  const oy = (100 - h * cs) / 2;
  return (
    `<svg viewBox="0 0 100 100" width="100%" role="img" aria-label="${label}"${style ? ` style="${style}"` : ''}>` +
    cellRects(n, cs, ox, oy) +
    '</svg>'
  );
}

const STEM_STYLE = 'max-width:12rem;display:block;margin:0 auto';
const NET_STEM_STYLE = 'max-width:22rem;display:block;margin:0 auto';

// A lettered net, viewBox fitted to the net. Cell size 40, uniform.
function letteredNetSvg(cells, letters) {
  const cs = 40;
  const pad = 4;
  const n = normalize(cells);
  const { w, h } = boundingBox(n);
  const W = w * cs + 2 * pad;
  const H = h * cs + 2 * pad;
  const rects = cellRects(n, cs, pad, pad);
  const texts = n
    .map(
      ([x, y], i) =>
        `<text x="${r2(pad + (x + 0.5) * cs)}" y="${r2(pad + (y + 0.5) * cs)}" font-size="22" font-weight="600" ` +
        `fill="currentColor" font-family="inherit" text-anchor="middle" dominant-baseline="central">${letters[i]}</text>`
    )
    .join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="Cube net with faces labelled ${letters.join(', ')}" style="${NET_STEM_STYLE}">` +
    rects +
    texts +
    '</svg>'
  );
}

// Square SVG holding centered text (letters, "B & E").
function textSvg(text, size, label) {
  return (
    `<svg viewBox="0 0 100 100" width="100%" role="img" aria-label="${label}">` +
    `<text x="50" y="50" font-size="${size}" font-weight="600" fill="currentColor" font-family="inherit" ` +
    `text-anchor="middle" dominant-baseline="central">${text}</text></svg>`
  );
}

// ---- seeded helpers ----

function shuffled(arr, seed) {
  const r = rng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Seeded random orientation (rotation + optional mirror) so nets are not shown in textbook pose.
function randomOrient(cells, seed) {
  const r = rng(seed);
  let out = rotate(cells, Math.floor(r() * 4));
  if (r() < 0.5) out = mirror(out);
  return out;
}

// ---- shape data (exported for tests) ----

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const SHAPES = {
  S1: normalize([[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2], [2, 3]]), // 7 cells
  S2: normalize([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]), // F pentomino
  S3: normalize([[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 3]]), // 6 cells
  S4: normalize([[1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [0, 3]]), // 6 cells
  S5: normalize([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2], [2, 2], [3, 2], [1, 3]]), // 8 cells
};

const NETS = {
  S6: {
    valid: normalize([[0, 1], [1, 1], [2, 1], [3, 1], [1, 0], [2, 2]]), // 1-4-1 with offset ends
    block: normalize([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]), // 2x3 block
    row5: normalize([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [2, 1]]), // 5 in a row + 1
    square: normalize([[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 1]]), // contains a 2x2 block
  },
  S7: {
    cross: normalize([[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]), // 1-4-1
    stairs: normalize([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]]), // 2-2-2
    threeThree: normalize([[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]]), // 3-3
    oneThreeTwo: normalize([[0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2]]), // 1-3-2
    invalid: normalize([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 1]]),
  },
  S8: normalize([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]]), // 2-2-2
  S9: normalize([[0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2]]), // 1-3-2
  S10: normalize([[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]]), // 3-3
};

// ---- builders ----

// Shape item: stem figure + 5 (or 4) orientation options. `answerCells` is the correct option.
function shapeItem({ id, b, prompt, base, answerCells, distractorCells, showStem, optionCols }) {
  const all = [base, answerCells, ...distractorCells];
  const cs = fitCell(all);
  const n = base.length;
  const label = `Shape made of ${n} squares`;
  const opt = (cells) => polySvg(cells, cs, label);
  const placed = placeOptions(id, opt(answerCells), distractorCells.map(opt));
  return {
    id,
    category: 'spatial',
    b,
    prompt,
    stem: showStem ? polySvg(base, cs, label, STEM_STYLE) : '',
    options: placed.options,
    answer: placed.answer,
    optionCols,
  };
}

function mirrorItem(id, b) {
  const s = SHAPES[id];
  return shapeItem({
    id,
    b,
    prompt: 'Which option is the figure reflected in a vertical mirror (left ↔ right)?',
    base: s,
    answerCells: mirror(s),
    distractorCells: [s, rotate(s, 1), rotate(s, 2), flipY(s)],
    showStem: true,
    optionCols: 3,
  });
}

function rotationItem(id, b, k) {
  const s = SHAPES[id];
  return shapeItem({
    id,
    b,
    prompt: 'Which option is the same shape, only rotated?',
    base: s,
    answerCells: rotate(s, k),
    distractorCells: [mirror(s), mirror(rotate(s, 1)), mirror(rotate(s, 2)), mirror(rotate(s, 3))],
    showStem: true,
    optionCols: 3,
  });
}

function oddOneOutItem(id, b) {
  const s = SHAPES[id];
  return shapeItem({
    id,
    b,
    prompt: 'Three of these are the same shape rotated. Which one is different?',
    base: s,
    answerCells: mirror(rotate(s, 3)),
    distractorCells: [rotate(s, 0), rotate(s, 1), rotate(s, 2)],
    showStem: false,
    optionCols: 2,
  });
}

// Net-choice item: blank nets as options, each in a seeded random orientation.
function netChoiceItem({ id, b, prompt, answerNet, distractorNets, optionCols }) {
  const answerCells = randomOrient(answerNet, `${id}:0`);
  const distractorCells = distractorNets.map((c, i) => randomOrient(c, `${id}:${i + 1}`));
  const cs = fitCell([answerCells, ...distractorCells]);
  const opt = (cells) => polySvg(cells, cs, 'Net made of six squares');
  const placed = placeOptions(id, opt(answerCells), distractorCells.map(opt));
  return {
    id,
    category: 'spatial',
    b,
    prompt,
    stem: '',
    options: placed.options,
    answer: placed.answer,
    optionCols,
    _cells: { answer: answerCells, distractors: distractorCells },
  };
}

// Strip the helper field so exported items match the plain contract.
function plain(item) {
  const { _cells, ...rest } = item;
  return rest;
}

// ---- S6, S7: nets as options ----

const s6 = netChoiceItem({
  id: 'S6',
  b: -0.4,
  prompt: 'Which of these can be folded into a cube?',
  answerNet: NETS.S6.valid,
  distractorNets: [NETS.S6.block, NETS.S6.row5, NETS.S6.square],
  optionCols: 2,
});

const s7 = netChoiceItem({
  id: 'S7',
  b: 0.4,
  prompt: 'Which of these can NOT be folded into a cube?',
  answerNet: NETS.S7.invalid,
  distractorNets: [NETS.S7.cross, NETS.S7.stairs, NETS.S7.threeThree, NETS.S7.oneThreeTwo],
  optionCols: 3,
});

// ---- S8, S9: letter opposite a given letter ----

function oppositeLetterItem({ id, b, cells, letters, askIdx }) {
  const ans = oppositeOf(cells, askIdx);
  if (ans < 0) throw new Error(`${id}: net does not fold`);
  const ask = letters[askIdx];
  const answerLetter = letters[ans];
  const others = letters.filter((l) => l !== ask && l !== answerLetter);
  const opt = (l) => textSvg(l, 48, `Letter ${l}`);
  const placed = placeOptions(id, opt(answerLetter), others.map(opt));
  return {
    id,
    category: 'spatial',
    b,
    prompt: `When folded into a cube, which letter is opposite ${ask}?`,
    stem: letteredNetSvg(cells, letters),
    options: placed.options,
    answer: placed.answer,
    optionCols: 5,
  };
}

const s8Letters = LETTERS.slice();
const s8Ask = 0; // A

// S9: letters shuffled over the net; ask about a cell whose opposite is not in line with it.
const s9Letters = shuffled(LETTERS, 'S9:letters');
function pickS9Ask() {
  const cells = NETS.S9;
  for (let i = 0; i < cells.length; i++) {
    const j = oppositeOf(cells, i);
    if (j >= 0 && cells[i][0] !== cells[j][0] && cells[i][1] !== cells[j][1]) return i;
  }
  throw new Error('S9: no cell with off-line opposite');
}
const s9Ask = pickS9Ask();

// ---- S10: opposite pair ----

function buildS10() {
  const cells = NETS.S10;
  const letters = LETTERS.slice();
  const pairKey = (i, j) => (i < j ? [i, j] : [j, i]);
  const opposite = [];
  const adjacentOnCube = []; // not opposite, and not touching in the net (the plausible traps)
  const touching = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const dist = Math.abs(cells[i][0] - cells[j][0]) + Math.abs(cells[i][1] - cells[j][1]);
      if (oppositeOf(cells, i) === j) opposite.push([i, j]);
      else if (dist > 1) adjacentOnCube.push([i, j]);
      else touching.push([i, j]);
    }
  }
  const ans = shuffled(opposite, 'S10:ans')[0];
  const traps = [...shuffled(adjacentOnCube, 'S10:traps'), ...shuffled(touching, 'S10:touch')].slice(0, 3);
  const label = ([i, j]) => `${letters[i]} & ${letters[j]}`;
  const opt = (p) => textSvg(label(p).replace('&', '&amp;'), 28, `Letters ${label(p)}`);
  const placed = placeOptions('S10', opt(ans), traps.map(opt));
  return {
    pairs: { answer: pairKey(...ans), traps: traps.map((p) => pairKey(...p)) },
    item: {
      id: 'S10',
      category: 'spatial',
      b: 1.4,
      prompt: 'When folded into a cube, which two letters end up on opposite faces?',
      stem: letteredNetSvg(cells, letters),
      options: placed.options,
      answer: placed.answer,
      optionCols: 2,
    },
  };
}
const s10 = buildS10();

export const spatialItems = [
  mirrorItem('S1', -1.5),
  rotationItem('S2', -0.8, 1),
  rotationItem('S3', -0.2, 3),
  oddOneOutItem('S4', 0.3),
  rotationItem('S5', 0.7, 2),
  plain(s6),
  plain(s7),
  oppositeLetterItem({ id: 'S8', b: 0.8, cells: NETS.S8, letters: s8Letters, askIdx: s8Ask }),
  oppositeLetterItem({ id: 'S9', b: 1.1, cells: NETS.S9, letters: s9Letters, askIdx: s9Ask }),
  s10.item,
];

// Underlying data, for tests and tooling. Not part of the item contract.
export const spatialData = {
  SHAPES,
  NETS,
  s6Cells: s6._cells,
  s7Cells: s7._cells,
  s8: { cells: NETS.S8, letters: s8Letters, askIdx: s8Ask },
  s9: { cells: NETS.S9, letters: s9Letters, askIdx: s9Ask },
  s10: { cells: NETS.S10, letters: LETTERS, pairs: s10.pairs },
};
