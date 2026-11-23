// Plain-language explanations generated from a variant's actual parameters.
// Pure: no DOM. `explain(templateId, meta)` where `meta` is what the item
// modules return next to the item (matrixVariant / spatialVariant / seriesVariant).
import { specFromMeta, segIds } from './items-matrix.js';
import { hasBlock2x2, longestRun, netFamily, oppositeOf } from './cube.js';

const FILL_ADJ = { none: 'empty', grey: 'grey', solid: 'solid' };
const SIZE_ADJ = { xs: 'tiny', s: 'small', m: 'medium', l: 'large' };
const ARROW_DIRS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const DOT_POS = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];
const SEG_NAME = {
  h: 'horizontal middle line',
  v: 'vertical middle line',
  d1: 'top-left to bottom-right diagonal',
  d2: 'top-right to bottom-left diagonal',
  t: 'top edge',
  b: 'bottom edge',
  l: 'left edge',
  r: 'right edge',
};

const fillAdj = (f) => FILL_ADJ[f];
const art = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plural = (shape) => `${shape}s`;
const times = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "3 empty diamonds" / "an empty circle"
function shapePhrase(shape, fill, n = 1, size = null) {
  const sz = size ? `${SIZE_ADJ[size]} ` : '';
  const adj = `${sz}${fillAdj(fill)}`;
  return n === 1 ? `${art(adj)} ${adj} ${shape}` : `${n} ${adj} ${plural(shape)}`;
}

// Row/column wording; a transposed variant swaps the two axes.
function vocab(t) {
  const v = { R: 'row', C: 'column', across: 'across', down: 'down', lastR: 'bottom row', lastC: 'right-hand column', ltr: 'left to right', ttb: 'top to bottom' };
  if (!t) return v;
  return { R: v.C, C: v.R, across: v.down, down: v.across, lastR: v.lastC, lastC: v.lastR, ltr: v.ttb, ttb: v.ltr };
}

const segList = (ids) => list(ids.map((i) => SEG_NAME[i]));

// ---- matrix ----

function explainMatrix(id, m) {
  const V = vocab(m.transpose);
  const spec = specFromMeta(id, m);
  const ans = spec.answer;
  switch (id) {
    case 'M1': {
      const [s0, s1, s2] = m.shapes;
      return (
        `Each ${V.R} uses one shape (${plural(s0)}, then ${plural(s1)}, then ${plural(s2)} going ${V.ttb}), and the number of shapes goes up by one ${V.across} the ${V.R}: 1, 2, 3. ` +
        `The ${V.lastR} is all ${plural(s2)} and the last cell of a ${V.R} has 3, so the missing cell holds ${shapePhrase(s2, m.fill, 3)}.`
      );
    }
    case 'M2': {
      const [t0, t1, t2] = m.shapes;
      const [f0, f1, f2] = m.fills;
      return (
        `Each ${V.R} has its own shading (${fillAdj(f0)}, then ${fillAdj(f1)}, then ${fillAdj(f2)} going ${V.ttb}), and each ${V.R} shows the ${plural(t0)}, ${plural(t1)} and ${plural(t2)} shifted one place along. ` +
        `The ${V.lastR} is ${fillAdj(f2)}, and its first two cells hold a ${t2} and a ${t0}, so the missing shape is the ${t1}: ${shapePhrase(t1, f2)}.`
      );
    }
    case 'M3': {
      const dir = m.sign > 0 ? 'clockwise' : 'anticlockwise';
      const across = m.transpose ? 90 : 45;
      const down = m.transpose ? 45 : 90;
      const rot = ans[0].rot;
      return (
        `The arrow turns ${across}° ${dir} for each step across and ${down}° ${dir} for each step down. ` +
        `The top-left arrow points ${ARROW_DIRS[m.off / 45]} (${m.off}° clockwise from straight up); the bottom-right cell is two steps across and two down, ` +
        `so its arrow points ${ARROW_DIRS[rot / 45]} (${rot}° clockwise from straight up).`
      );
    }
    case 'M4': {
      const [t0, t1, t2] = m.shapes;
      const [z0, z1, z2] = m.sizes;
      return (
        `The size depends on the ${V.C}: ${SIZE_ADJ[z0]}, ${SIZE_ADJ[z1]}, then ${SIZE_ADJ[z2]} going ${V.ltr}. ` +
        `Every ${V.R} and ${V.C} also holds each of the ${plural(t0)}, ${plural(t1)} and ${plural(t2)} once; the ${V.lastR} already has ${plural(t1)} and ${plural(t2)}, ` +
        `so the missing cell is ${shapePhrase(t0, m.fill, 1, z2)}.`
      );
    }
    case 'M5': case 'M8': case 'M11': {
      const how = {
        M5: 'it shows every line that appears in either of them',
        M8: 'it shows the lines that appear in exactly one of them (a line that appears in both cancels out)',
        M11: 'it shows only the lines that appear in both of them',
      }[id];
      const end = m.transpose ? 'bottom cell' : 'right-hand cell';
      const before = m.transpose ? 'two cells above it' : 'two cells to its left';
      const [pa, pb] = m.transpose ? [spec.rule(0, 2), spec.rule(1, 2)] : [spec.rule(2, 0), spec.rule(2, 1)];
      const na = segIds(pa).length;
      const nb = segIds(pb).length;
      const ids = segIds(ans);
      return (
        `In every ${V.R} the ${end} combines the ${before}: ${how}. ` +
        `The first two cells of the ${V.lastR} show ${na} and ${nb} lines, so the missing cell shows the ${segList(ids)}.`
      );
    }
    case 'M6': {
      const [t0, t1, t2] = m.shapes;
      return (
        `The number of shapes goes up by one with every step across or down (1 in the top-left cell), and the ${plural(t0)}, ${plural(t1)} and ${plural(t2)} repeat along the diagonals, always ${fillAdj(m.fill)}. ` +
        `The bottom-right cell is four steps from the corner, so it holds ${shapePhrase(t1, m.fill, 5)}.`
      );
    }
    case 'M7': {
      const [t0, t1, t2] = m.shapes;
      const k = ans.find((e) => e.t === 'dot').k;
      const across = m.transpose ? 2 : 1;
      const down = m.transpose ? 1 : 2;
      return (
        `The dot moves ${m.dotSign > 0 ? 'clockwise' : 'anticlockwise'} round the ring, ${times(across, 'position')} for each step across and ${times(down, 'position')} for each step down (a position is 45°), starting from the ${DOT_POS[m.dotOff]} position in the top-left cell. ` +
        `The centre shapes (${plural(t0)}, ${plural(t1)}, ${plural(t2)}) appear once in each ${V.R} and ${V.C}, so the missing cell has ${shapePhrase(t0, 'none')} with its dot at the ${DOT_POS[k]}.`
      );
    }
    case 'M9': {
      const [o0, o1, o2] = m.outer;
      const [i0, i1, i2] = m.inner;
      return (
        `Every cell has a large empty outer shape with a small ${fillAdj(m.innerFill)} shape inside, and each set of shapes appears once in every ${V.R} and ${V.C}. ` +
        `The ${V.lastR} already has the ${o2} and ${o0} outside and the ${i1} and ${i2} inside, so the missing cell is a large ${o1} containing a small ${fillAdj(m.innerFill)} ${i0}.`
      );
    }
    case 'M10': {
      const [t0, t1, t2] = m.shapes;
      const [n0, n1, n2] = m.counts;
      const [f0, f1, f2] = m.fills;
      return (
        `Three things change independently: the shape (${plural(t0)}, ${plural(t1)}, ${plural(t2)}), the shading (${fillAdj(f0)}, ${fillAdj(f1)}, ${fillAdj(f2)}) and the number of shapes (${n0}, ${n1}, ${n2}). Each takes every value once in every ${V.R} and ${V.C}. ` +
        `The ${V.lastR} already has ${plural(t2)} and ${plural(t0)}, ${fillAdj(f1)} and ${fillAdj(f2)} shading, and ${n2} and ${n1} shapes, which leaves ${shapePhrase(t1, f0, n0)}.`
      );
    }
    case 'M12': {
      const [t0, t1, t2] = m.shapes;
      const [f0, f1, f2] = m.fills;
      const [a0, b0] = m.pairs[0];
      const [a2, b2] = m.pairs[2];
      return (
        `In every ${V.R} the ${m.transpose ? 'bottom' : 'right-hand'} cell holds as many shapes as the other two cells added together (for example ${a0} + ${b0} = ${a0 + b0} in the first ${V.R}). ` +
        `The ${V.lastR} has ${a2} + ${b2} = ${a2 + b2} shapes, and its first two cells show ${plural(t2)} and ${plural(t0)} with ${fillAdj(f2)} and ${fillAdj(f1)} shading, so the missing cell is ${shapePhrase(t1, f0, a2 + b2)}.`
      );
    }
    default:
      throw new Error('no explanation for ' + id);
  }
}

// ---- spatial ----

const FAMILY_DESC = {
  '1-4-1': 'a strip of four squares with one square on each side',
  '2-3-1': 'rows of 2, 3 and 1 squares',
  '2-2-2': 'a staircase of three rows of 2 squares',
  '3-3': 'two rows of 3 squares, offset',
};

const sortedLetters = (ls) => ls.slice().sort();

function explainSpatial(id, m) {
  switch (m.kind) {
    case 'mirror':
      return (
        'A vertical mirror swaps left and right and leaves top and bottom alone, so every part sticking out on the left of the figure appears on the right. ' +
        'The correct option is that reflection; the others are the original, turned round, or flipped upside down.'
      );
    case 'rotation': {
      const turn = { 1: 'a quarter turn clockwise (90°)', 2: 'a half turn (180°)', 3: 'three quarter turns clockwise (270°)' }[m.k];
      return (
        `The correct option is the original shape after ${turn}: it is only rotated, never flipped. ` +
        'The other options are mirror images, and no amount of turning makes a shape match its mirror image.'
      );
    }
    case 'odd':
      return (
        'Three of the options are the same shape turned to different angles. ' +
        'The odd one out is a mirror image of that shape, so no rotation can turn it into the others.'
      );
    case 'validNet': {
      const fam = netFamily(m.answerCells);
      const reasons = [];
      if (m.distractorCells.some((c) => hasBlock2x2(c))) reasons.push('a 2×2 block of squares');
      if (m.distractorCells.some((c) => longestRun(c) >= 5)) reasons.push('a row of five squares');
      return (
        `The correct net is ${FAMILY_DESC[fam]}: when folded, each of its six squares lands on a different face of the cube. ` +
        `The other options contain ${list(reasons)}, which would pile squares onto the same face and leave another face uncovered.`
      );
    }
    case 'invalidNet': {
      const fams = m.distractorCells.map(netFamily);
      return (
        'The correct option is the one that cannot fold into a cube: two of its squares would land on the same face and one face would stay empty. ' +
        `The other four are genuine cube nets (their rows have ${list(fams)} squares).`
      );
    }
    case 'opposite': {
      const ask = m.letters[m.askIdx];
      const ans = m.letters[m.oppositeIdx];
      const touching = sortedLetters(m.letters.filter((l) => l !== ask && l !== ans));
      let out =
        `Fold the net into a cube: ${ask} ends up touching ${list(touching)}, so the one face left, ${ans}, must be the opposite of ${ask}.`;
      const [a, b] = [m.cells[m.askIdx], m.cells[m.oppositeIdx]];
      const sameLine = (a[0] === b[0] && Math.abs(a[1] - b[1]) === 2) || (a[1] === b[1] && Math.abs(a[0] - b[0]) === 2);
      if (sameLine) out += ` (${ask} and ${ans} also sit two squares apart in a straight line, which always folds to opposite faces.)`;
      return out;
    }
    case 'pair': {
      const label = (i, j) => sortedLetters([m.letters[i], m.letters[j]]).join(' & ');
      const opp = [];
      for (let i = 0; i < 6; i++) {
        const j = oppositeOf(m.cells, i);
        if (j > i) opp.push(label(i, j));
      }
      const ans = label(...m.pairs.answer);
      return (
        `Every face of a cube has exactly one opposite, and opposite faces never share an edge. Folding the net shows that ${ans} are opposite faces. ` +
        `The three pairs of opposite faces are ${list(opp.sort())}; every other pair meets along an edge.`
      );
    }
    default:
      throw new Error('no explanation for ' + id);
  }
}

// ---- series ----

function explainSeries(id, m) {
  const { params: p, shown, answer } = m;
  const last = shown[shown.length - 1];
  switch (id) {
    case 'N1':
      return `Each number is ${p.d} more than the one before (${shown.slice(0, 2).join(', ')}, ...), so the next one is ${last} + ${p.d} = ${answer}.`;
    case 'N2':
      return `Each number is ${p.m} times the one before (${shown[0]} × ${p.m} = ${shown[1]}, ${shown[1]} × ${p.m} = ${shown[2]}), so the next one is ${last} × ${p.m} = ${answer}.`;
    case 'N3':
      return `These are square numbers in order: ${shown.map((_, i) => `${p.k + i}²`).join(', ')}. The next one is ${p.k + 5}² = ${answer}.`;
    case 'N4':
      return `Each letter is ${p.step} places after the one before in the alphabet (${shown[0]} to ${shown[1]}, ${shown[1]} to ${shown[2]}), so the letter ${p.step} places after ${last} is ${answer}.`;
    case 'N5':
      return `Each number is double the one before, plus ${p.c} (${shown[0]} × 2 + ${p.c} = ${shown[1]}, ${shown[1]} × 2 + ${p.c} = ${shown[2]}), so the next one is ${last} × 2 + ${p.c} = ${answer}.`;
    case 'N6':
      return `The sequence alternates between adding ${p.p} and subtracting ${p.q}: +${p.p}, -${p.q}, +${p.p}, -${p.q}, +${p.p}. The next step is subtract ${p.q}, so ${last} - ${p.q} = ${answer}.`;
    case 'N7': {
      const gaps = [0, 1, 2, 3].map((i) => `+${p.g + i}`);
      return `The gap between letters grows by one each time (${gaps.join(', ')}). The next gap is +${p.g + 4}, so ${last} moves ${p.g + 4} places on to ${answer}.`;
    }
    case 'N8': {
      const gaps = [1, 2, 4, 8, 16].map((x) => `+${x * p.g0}`);
      return `The differences double each time (${gaps.join(', ')}). The next difference is +${32 * p.g0}, so ${last} + ${32 * p.g0} = ${answer}.`;
    }
    default:
      throw new Error('no explanation for ' + id);
  }
}

export function explain(templateId, meta) {
  const c = templateId[0];
  if (c === 'M') return explainMatrix(templateId, meta);
  if (c === 'S') return explainSpatial(templateId, meta);
  if (c === 'N') return explainSeries(templateId, meta);
  throw new Error('unknown template ' + templateId);
}
