// Item engine: 30 templates, each able to produce isomorphic variants from a seed.
// Pure: no DOM. Seed 0 reproduces the v1 items exactly (old share links keep working).
//
// NOTE: pools and parameter draws are indexed by seed. Once share links exist,
// do not change the variant generators, or old results will rebuild differently.
import { hashSeed, rng } from './rng.js';
import { ITEMS, CATEGORIES } from './items.js';
import { CALIBRATION } from './calibration.js';
import { DISCRIMINATION } from './scoring.js';
import { matrixVariant } from './items-matrix.js';
import { spatialVariant } from './items-spatial.js';
import { seriesVariant } from './items-series.js';
import { explain } from './explain.js';

export const CATEGORY_LABELS = CATEGORIES;

const byBThenId = (x, y) => x.b - y.b || x.id.localeCompare(y.id);

// Templates after calibration overrides, ordered by difficulty (same order as v1 ITEMS when uncalibrated).
// `nOptions` (answer options per item) is an extra field used by the CAT for guessing floors.
export const TEMPLATES = ITEMS.map((it) => {
  const cal = CALIBRATION[it.id];
  return {
    id: it.id,
    category: it.category,
    b: typeof cal?.b === 'number' ? cal.b : it.b,
    a: typeof cal?.a === 'number' && cal.a > 0 ? cal.a : DISCRIMINATION,
    nOptions: it.options.length,
  };
}).sort(byBThenId);

const BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// Seed for one template inside a form. Form seed 0 is the v1 form, so it maps to 0 for every template.
export function itemSeed(formSeed, templateId) {
  const f = formSeed >>> 0;
  if (f === 0) return 0;
  return hashSeed(`${f}:${templateId}`) || 1;
}

function variantOf(templateId, seed) {
  switch (templateId[0]) {
    case 'M': return matrixVariant(templateId, seed);
    case 'S': return spatialVariant(templateId, seed);
    default: return seriesVariant(templateId, seed);
  }
}

// Build one item. `formSeed` is the uint32 stored in the result payload.
// Extra fields on top of the v1 item contract: a, templateId, seed (the form seed),
// variantSeed (what the template actually used) and explanation.
export function buildItem(templateId, formSeed = 0) {
  const t = BY_ID[templateId];
  if (!t) throw new Error(`unknown template ${templateId}`);
  const variantSeed = itemSeed(formSeed, templateId);
  const { item, meta } = variantOf(templateId, variantSeed);
  return {
    ...item,
    b: t.b,
    a: t.a,
    templateId,
    seed: formSeed >>> 0,
    variantSeed,
    explanation: explain(templateId, meta),
  };
}

// The 30-item standard form, ordered by difficulty. Form seed 0 equals v1 ITEMS.
export function buildForm(formSeed = 0) {
  return TEMPLATES.map((t) => buildItem(t.id, formSeed));
}

// Difficulty bands for practice (logit b): easy < -0.5 <= medium < 0.6 <= hard.
const LEVELS = { easy: [-Infinity, -0.5], medium: [-0.5, 0.6], hard: [0.6, Infinity] };

// One practice item. category: 'matrix' | 'spatial' | 'series' | undefined/'mixed'; level: easy|medium|hard.
export function practiceItem(seed, { category, level = 'easy' } = {}) {
  const cat = category && category !== 'mixed' && category !== 'all' ? category : null;
  if (cat && !CATEGORY_LABELS[cat]) throw new Error(`unknown category ${category}`);
  const [lo, hi] = LEVELS[level] || LEVELS.easy;
  const pool = TEMPLATES.filter((t) => (!cat || t.category === cat));
  let cands = pool.filter((t) => t.b >= lo && t.b < hi);
  if (!cands.length) {
    // Calibration emptied the band: take the closest templates to the band's middle.
    const mid = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : Number.isFinite(lo) ? lo + 1 : hi - 1;
    cands = pool.slice().sort((x, y) => Math.abs(x.b - mid) - Math.abs(y.b - mid)).slice(0, 3);
  }
  const r = rng(`practice:${seed >>> 0}:${cat || 'mixed'}:${level}`);
  const t = cands[Math.floor(r() * cands.length)];
  return buildItem(t.id, seed >>> 0);
}
