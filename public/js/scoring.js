// 3PL IRT scoring with EAP estimation. Pure: no DOM access.

export const DISCRIMINATION = 1.3;
const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.02;

// Probability of a correct answer at ability theta.
export function p3pl(theta, b, nOptions, a = DISCRIMINATION) {
  const c = 1 / nOptions;
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

// Fisher information of a 3PL item at ability theta.
export function fisherInfo(theta, b, nOptions, a = DISCRIMINATION) {
  const c = 1 / nOptions;
  const p = p3pl(theta, b, nOptions, a);
  const q = 1 - p;
  const pStar = (p - c) / (1 - c);
  return (a * a * q * pStar * pStar) / p;
}

// Per-item discrimination: the item's own `a` if present, else the default.
export const itemA = (it) => (typeof it.a === 'number' && it.a > 0 ? it.a : DISCRIMINATION);

// Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7).
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? y : -y));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function score(items, answers) {
  const n = items.length;
  const correctFlags = items.map((it, i) => answers[i] === it.answer);

  // Posterior over the theta grid (log space for stability).
  const steps = Math.round((GRID_MAX - GRID_MIN) / GRID_STEP);
  const thetas = new Array(steps + 1);
  const logw = new Array(steps + 1);
  let maxLog = -Infinity;
  for (let g = 0; g <= steps; g++) {
    const th = GRID_MIN + g * GRID_STEP;
    thetas[g] = th;
    let lw = (-th * th) / 2; // N(0,1) prior, constant dropped
    for (let i = 0; i < n; i++) {
      const p = p3pl(th, items[i].b, items[i].options.length, itemA(items[i]));
      lw += Math.log(correctFlags[i] ? p : 1 - p);
    }
    logw[g] = lw;
    if (lw > maxLog) maxLog = lw;
  }
  let sumW = 0;
  let sumWT = 0;
  const w = logw.map((lw) => Math.exp(lw - maxLog));
  for (let g = 0; g < w.length; g++) {
    sumW += w[g];
    sumWT += w[g] * thetas[g];
  }
  const theta = sumWT / sumW;
  let varSum = 0;
  for (let g = 0; g < w.length; g++) varSum += w[g] * (thetas[g] - theta) ** 2;
  const se = Math.sqrt(varSum / sumW);

  const iq = clamp(Math.round(100 + 15 * theta), 55, 145);
  const half = Math.round(1.645 * 15 * se);
  const percentile = normCdf(theta) * 100;

  const byCategory = {};
  let correct = 0;
  items.forEach((it, i) => {
    const cat = (byCategory[it.category] ||= { correct: 0, total: 0 });
    cat.total++;
    if (correctFlags[i]) {
      cat.correct++;
      correct++;
    }
  });

  const hardest = items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => correctFlags[i])
    .sort((x, y) => y.it.b - x.it.b)
    .slice(0, 3)
    .map(({ it, i }) => ({ id: it.id, index: i + 1, pAvg: p3pl(0, it.b, it.options.length, itemA(it)) }));

  return {
    theta,
    se,
    iq,
    low: Math.max(55, iq - half),
    high: Math.min(145, iq + half),
    percentile,
    correct,
    total: n,
    byCategory,
    hardest,
  };
}
