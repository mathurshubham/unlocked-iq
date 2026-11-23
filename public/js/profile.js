// Profile text by category band and IQ band. Pure: no DOM access.

// pct = percent correct, 0..100
export function band(pct) {
  if (pct >= 75) return 'high';
  if (pct >= 40) return 'mid';
  return 'developing';
}

const CATEGORY_TEXT = {
  matrix: {
    high: 'Pattern reasoning was a real strength. You spot what changes from cell to cell (shape, count, shading, direction) and keep several rules in your head at once. That is the core skill these matrix puzzles measure.',
    mid: 'Pattern reasoning was solid but uneven. You catch a single rule quickly; the misses were most likely puzzles where two or three rules overlap. A useful habit: name each rule out loud, such as "rows change shape, columns change count".',
    developing:
      'Pattern reasoning was the tougher part this time. Matrices reward slow, systematic looking: check one feature at a time (shape, count, fill, rotation) along a row, then test it down a column. It improves with a few practice rounds, and 12 puzzles is a small sample.',
  },
  spatial: {
    high: 'Spatial reasoning was a strength. Rotating shapes and folding nets in your head is hard work, and you did it accurately. People who do well here often find maps, assembly instructions and packing a car boot easy.',
    mid: 'Spatial reasoning was decent. Simple flips and rotations went well; the harder cube-folding puzzles are where most people slip. Trick worth knowing: in a cube net, faces separated by exactly one square in a straight row end up opposite each other.',
    developing:
      'Spatial reasoning was the harder part this time. Mentally rotating and folding is a skill most people only develop with practice. Cut a cube net out of paper once and fold it; the next ones get much easier.',
  },
  series: {
    high: 'Number and letter sequences were a strength. You find the rule behind a series, even when it changes as it goes along (differences that grow, alternating steps, doubling plus one).',
    mid: 'Sequences were solid. The straightforward ones (a steady step, a repeated multiplier) were fine; the harder ones hide a second rule. When stuck, write the gaps between terms, then the gaps between those gaps.',
    developing:
      'Sequences were the tougher part this time. Try this: write the differences between neighbours; if they are not constant, write the differences of the differences, or check whether each term is the previous one times something. Letters work the same way once you turn them into numbers (A = 1, B = 2, ...).',
  },
};

export function categoryProfile(category, pct) {
  const set = CATEGORY_TEXT[category];
  if (!set) return '';
  return set[band(pct)];
}

export function iqBand(iq) {
  if (iq >= 130) return 'very-high';
  if (iq >= 115) return 'high';
  if (iq >= 100) return 'above-average';
  if (iq >= 85) return 'average';
  return 'developing';
}

const OVERALL_TEXT = {
  'very-high':
    'Your estimate lands in the top few percent. Very few people get this many of the hard puzzles right. With only 30 questions the error bar is wide, so read it as "clearly strong reasoning" rather than a precise number.',
  high: 'Your estimate is comfortably above average. You handled puzzles that most people find genuinely hard, and your accuracy held up as the difficulty climbed.',
  'above-average':
    'Your estimate is slightly above the middle of the range. You got the comfortable questions and a good share of the tougher ones, which is exactly the shape a healthy reasoning profile has.',
  average:
    'Your estimate sits in the broad average range, where most people land. This is a short test with a built-in margin of error, and a single session says little about how you reason on a good day.',
  developing:
    'Your estimate is below the middle of the range this time. A single 25-minute session is affected by sleep, mood, nerves and unfamiliar puzzle types as much as by ability. If you want a fairer picture, try again on another day.',
};

export function overallProfile(iq) {
  return OVERALL_TEXT[iqBand(iq)];
}
