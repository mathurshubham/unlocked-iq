// Positive, strengths-based insights. Pure: no DOM access.
// Tone: warm and specific, never flattering nonsense, never discouraging.
// Lower bands are framed as "room to grow" with a concrete tip, not as weakness.

// pct = percent correct, 0..100
export function band(pct) {
  if (pct >= 75) return 'high';
  if (pct >= 40) return 'mid';
  return 'developing';
}

const CATEGORY_TEXT = {
  matrix: {
    high: 'Pattern reasoning is a real strength. You spot what changes from cell to cell (shape, count, shading, direction) and hold several rules in mind at once. That is the core of what researchers call fluid intelligence: solving problems you have never seen before.',
    mid: 'Pattern reasoning is solid. You catch single rules quickly and handled a good share of the layered ones too. Your next level is the puzzles where two or three rules overlap: naming each rule ("rows change shape, columns change count") unlocks them fast.',
    developing:
      'Pattern reasoning is your biggest growth area, and it is the one that responds best to practice. Check one feature at a time (shape, count, fill, rotation) along a row, then confirm it down a column. Most people jump noticeably after just a few rounds.',
  },
  spatial: {
    high: 'Spatial reasoning is a standout. Rotating shapes and folding nets in your head is demanding, and you did it accurately. This skill shows up in design, engineering, navigation, and in being the person who can always fit everything into the car boot.',
    mid: 'Spatial reasoning is solid. Flips and rotations went well, and cube-folding is where even strong reasoners slow down. A trick to keep: in a cube net, two faces separated by exactly one square in a straight row always end up opposite each other.',
    developing:
      'Spatial reasoning has the most room to grow, which makes it the most fun to train. Spatial skill is famously trainable: cut out one paper cube net and fold it, and the next ten puzzles feel completely different.',
  },
  series: {
    high: 'Number and letter sequences are a strength. You find the rule behind a series even when it changes as it goes (growing gaps, alternating steps, doubling plus one). That is the same instinct that spots trends in data.',
    mid: 'Sequences are solid. The steady-step and multiplier patterns were comfortable, and the trickier ones hide a second rule. When stuck, write the gaps between terms, then the gaps between those gaps.',
    developing:
      'Sequences have room to grow, and there is a simple system for them: write the differences between neighbours; if they are not constant, look at the differences of the differences, or check for a multiplier. Letters work the same way once A = 1, B = 2.',
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
    'Your estimate lands in the top few percent. Very few people solve this many of the hard puzzles. With 30 questions the error bar is wide, so read it as "exceptionally strong reasoning" rather than a precise number.',
  high: 'Your estimate is comfortably above average. You solved puzzles most people find genuinely hard, and your accuracy held up as the difficulty climbed. That combination is the hallmark of strong reasoning.',
  'above-average':
    'Your estimate is above the middle of the range. You were reliable on the core puzzles and took a good share of the tougher ones, which is exactly the shape a healthy, capable reasoning profile has.',
  average:
    'Your estimate sits in the broad middle of the range, where most capable, successful people land. A 30-question test has a wide margin of error, and on a different day your score could easily sit higher.',
  developing:
    'Every puzzle you solved here was a genuine reasoning win. A single 25-minute session is shaped by sleep, mood and how familiar these puzzle types are, as much as by ability, and these puzzles reward practice. A second attempt on a fresh day usually tells a brighter story.',
};

export function overallProfile(iq) {
  return OVERALL_TEXT[iqBand(iq)];
}

// "What people in this range often enjoy": tendencies, not promises.
const RANGE_TRAITS = {
  'very-high': [
    'Picking up complex new systems (a language, a codebase, a game) unusually fast',
    'Seeing the underlying structure of a problem before the details',
    'Enjoying puzzles and ideas for their own sake',
  ],
  high: [
    'Learning new skills quickly and connecting ideas across fields',
    'Spotting the flaw in an argument or plan early',
    'Staying calm when a problem gets harder rather than easier',
  ],
  'above-average': [
    'Working things out independently without needing a step-by-step guide',
    'Balancing quick intuition with careful checking',
    'Explaining tricky ideas clearly to other people',
  ],
  average: [
    'Practical, grounded problem-solving that works in the real world',
    'Steady improvement: reasoning skills grow a lot with practice',
    'Strengths that a 25-minute test does not measure, like creativity, judgement and people skills',
  ],
  developing: [
    'Lots of headroom: these puzzle types improve fast with a little practice',
    'Strengths a timed test cannot see, like creativity, empathy and practical sense',
    'A fresh mind on a second attempt often makes a big difference',
  ],
};

export function rangeTraits(iq) {
  return RANGE_TRAITS[iqBand(iq)];
}

// Strength cards derived from the pattern of answers. Always returns 3–5 positive cards.
// items: ITEMS order; answers: option index or -1 per item; seconds: time taken;
// labels: category id -> display name.
export function strengths(items, answers, seconds, labels) {
  const cats = {};
  let correct = 0;
  let answered = 0;
  let hardCorrect = 0;
  let hardTotal = 0;
  items.forEach((it, i) => {
    const c = (cats[it.category] ||= { correct: 0, total: 0 });
    c.total++;
    const ok = answers[i] === it.answer;
    if (answers[i] >= 0) answered++;
    if (ok) {
      c.correct++;
      correct++;
    }
    if (it.b >= 1.0) {
      hardTotal++;
      if (ok) hardCorrect++;
    }
  });
  const pcts = Object.entries(cats).map(([k, c]) => [k, c.total ? (c.correct / c.total) * 100 : 0]);
  pcts.sort((a, b) => b[1] - a[1]);
  const [topKey, topPct] = pcts[0];
  const spread = pcts[0][1] - pcts[pcts.length - 1][1];
  const accuracy = answered ? correct / answered : 0;
  const mins = seconds / 60;
  const out = [];

  // Very few answers: no pattern to read yet, so keep it encouraging and honest.
  if (correct < 3) {
    return [
      { title: 'Fresh perspective', text: 'These puzzle types are unusual, and the first encounter is always the hardest. Your next attempt starts with that experience already banked.' },
      { title: 'Plenty of headroom', text: 'Matrix, spatial and sequence puzzles all improve quickly with practice. A second run on a fresh day usually shows a big jump.' },
      { title: 'Beyond the test', text: 'Creativity, judgement, empathy and practical sense matter as much as puzzle speed, and no 25-minute test can see them.' },
    ];
  }

  // 1. Signature strength
  if (spread <= 10 && topPct >= 50) {
    out.push({
      title: 'All-rounder',
      text: 'Your scores were remarkably even across patterns, space and sequences. You do not lean on one trick; you reason well whatever form the problem takes.',
    });
  } else {
    out.push({
      title: `Signature strength: ${labels[topKey]}`,
      text: {
        matrix: 'Abstract patterns are where you shine. Finding hidden rules in unfamiliar material is the purest measure of fluid reasoning.',
        spatial: 'You think well in shapes and space. Mentally rotating and folding objects is a skill many people find hardest of all.',
        series: 'You read sequences well. Finding the rule behind a run of numbers is the same instinct that spots trends and forecasts.',
      }[topKey],
    });
  }

  // 2. Balance vs depth
  if (!(spread <= 10 && topPct >= 50)) {
    out.push(
      spread <= 25
        ? { title: 'Balanced thinker', text: 'Every part of your profile pulls its weight. Your categories sit close together, which makes you adaptable across very different kinds of problems.' }
        : { title: 'Specialist edge', text: `Your ${labels[topKey].toLowerCase()} result clearly stands out. A distinct peak like this often points to a natural way of thinking worth leaning into.` },
    );
  }

  // 3. Hard puzzles
  if (hardCorrect >= 2) {
    out.push({ title: 'Rises to a challenge', text: `You solved ${hardCorrect} of the ${hardTotal} hardest puzzles, the ones built from three overlapping rules or tricky cube folds. Most people stall on these.` });
  } else if (hardCorrect === 1) {
    out.push({ title: 'Cracked a tough one', text: 'You solved one of the hardest puzzles in the set, the kind built from several overlapping rules. That takes real persistence.' });
  } else if (correct > 0) {
    out.push({ title: 'Strong foundations', text: `You solved ${correct} puzzles, building on the core rules each puzzle family uses. Those are the building blocks every harder puzzle is made of.` });
  }

  // 4. Pace
  if (mins < 12 && accuracy >= 0.6) {
    out.push({ title: 'Quick and accurate', text: `You finished in about ${Math.max(1, Math.round(mins))} minutes and still got most answers right. Speed with accuracy is a rare pairing.` });
  } else if (mins < 12) {
    out.push({ title: 'Decisive', text: 'You moved through the test quickly and trusted your instincts. Decisiveness is an underrated strength.' });
  } else if (mins > 20) {
    out.push({ title: 'Careful and thorough', text: 'You took your time and used the clock well. Checking your work before committing is exactly how strong problem-solvers operate.' });
  } else {
    out.push({ title: 'Steady under the clock', text: 'You paced yourself evenly across the test, without rushing and without getting stuck. Good time management is a skill in itself.' });
  }

  // 5. Persistence
  if (answered === items.length) {
    out.push({ title: 'Sees it through', text: 'You gave an answer to every single question, including the hard ones at the end. Persistence like that matters more than most scores.' });
  }

  return out.slice(0, 5);
}
