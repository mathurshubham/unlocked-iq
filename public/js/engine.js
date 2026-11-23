// Item engine: the 30 v1 templates plus the v3 item families, each able to produce
// variants from a seed. Standard forms draw 30 templates from the whole pool.
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
// v3 item families. Each module exports TEMPLATES, variant(id, seed) and explain(id, meta).
import * as figural from './items-figural.js';
import * as spatial2 from './items-spatial2.js';
import * as numeric from './items-numeric.js';
import * as extra from './items-extra.js';

const FAMILY_MODULES = [figural, spatial2, numeric, extra];

export const CATEGORY_LABELS = CATEGORIES;

const byBThenId = (x, y) => x.b - y.b || x.id.localeCompare(y.id);

// Templates after calibration overrides, ordered by difficulty (same order as v1 ITEMS when uncalibrated).
// `nOptions` (answer options per item) is an extra field used by the CAT for guessing floors.
const withCalibration = (id, category, b, nOptions, family) => {
  const cal = CALIBRATION[id];
  return {
    id,
    category,
    family,
    b: typeof cal?.b === 'number' ? cal.b : b,
    a: typeof cal?.a === 'number' && cal.a > 0 ? cal.a : DISCRIMINATION,
    nOptions,
  };
};

// The 30 v1 templates. buildForm(0) uses exactly these (v1 share links).
export const LEGACY_TEMPLATES = ITEMS.map((it) => withCalibration(it.id, it.category, it.b, it.options.length, it.id[0])).sort(byBThenId);

const MODULE_OF = {};
const FAMILY_TEMPLATES = FAMILY_MODULES.flatMap((m) =>
  m.TEMPLATES.map((t) => {
    if (MODULE_OF[t.id] || LEGACY_TEMPLATES.some((l) => l.id === t.id)) throw new Error(`duplicate template id ${t.id}`);
    MODULE_OF[t.id] = m;
    const probe = m.variant(t.id, 0).item;
    return withCalibration(t.id, t.category, t.b, probe.options.length, t.id[0]);
  })
);

// Every template, ordered by difficulty.
export const TEMPLATES = [...LEGACY_TEMPLATES, ...FAMILY_TEMPLATES].sort(byBThenId);

const BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// Seed for one template inside a form. Form seed 0 is the v1 form, so it maps to 0 for every template.
export function itemSeed(formSeed, templateId) {
  const f = formSeed >>> 0;
  if (f === 0) return 0;
  return hashSeed(`${f}:${templateId}`) || 1;
}

function variantOf(templateId, seed) {
  const m = MODULE_OF[templateId];
  if (m) {
    const v = m.variant(templateId, seed);
    // Hidden-figure items promise "the same size": draw the target at option size, not full stem width.
    if (templateId[0] === 'E' && typeof v.item.stem === 'string') {
      v.item = { ...v.item, stem: v.item.stem.replace(/^\s*<svg/, '<svg data-scale="option"') };
    }
    return { ...v, explanation: m.explain(templateId, v.meta) };
  }
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
  const { item, meta, explanation } = variantOf(templateId, variantSeed);
  return {
    ...item,
    b: t.b,
    a: t.a,
    templateId,
    seed: formSeed >>> 0,
    variantSeed,
    explanation: explanation ?? explain(templateId, meta),
  };
}

// Questions per category in a standard form.
export const FORM_QUOTA = { matrix: 12, spatial: 10, series: 8 };

// Pick the template ids of a standard form. Each category's pool is sorted by difficulty and cut
// into as many contiguous bands as the category's quota; one template is drawn per band, so every
// form spans easy to hard. Within a band, templates in `avoid` (seen before) and families already
// used a lot in this form are deprioritised; ties are broken by the seed.
export function pickForm(formSeed, { avoid = new Set(), templates = TEMPLATES } = {}) {
  const r = rng(`form:${formSeed >>> 0}`);
  const out = [];
  for (const [cat, quota] of Object.entries(FORM_QUOTA)) {
    const pool = templates.filter((t) => t.category === cat).sort(byBThenId);
    const cap = Math.max(2, Math.ceil(quota * 0.4));
    const famCount = {};
    for (let i = 0; i < quota; i++) {
      const lo = Math.floor((i * pool.length) / quota);
      const hi = Math.max(lo + 1, Math.floor(((i + 1) * pool.length) / quota));
      const band = pool.slice(lo, hi).filter((t) => !out.includes(t.id));
      if (!band.length) continue;
      let best = null;
      let bestScore = Infinity;
      for (const t of band) {
        const s = (avoid.has(t.id) ? 10 : 0) + ((famCount[t.family] || 0) >= cap ? 5 : 0) + r();
        if (s < bestScore) {
          best = t;
          bestScore = s;
        }
      }
      famCount[best.family] = (famCount[best.family] || 0) + 1;
      out.push(best.id);
    }
  }
  return out;
}

// The 30-item standard form, ordered by difficulty. Form seed 0 equals v1 ITEMS.
// opts.avoid: Set of template ids to steer away from (questions this browser has seen).
export function buildForm(formSeed = 0, opts = {}) {
  if ((formSeed >>> 0) === 0) return LEGACY_TEMPLATES.map((t) => buildItem(t.id, 0));
  return pickForm(formSeed, opts)
    .map((id) => BY_ID[id])
    .sort(byBThenId)
    .map((t) => buildItem(t.id, formSeed));
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
