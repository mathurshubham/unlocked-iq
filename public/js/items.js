// Combines all item banks and orders them by estimated difficulty.
import { matrixItems } from './items-matrix.js';
import { spatialItems } from './items-spatial.js';
import { seriesItems } from './items-series.js';

export const CATEGORIES = {
  matrix: 'Pattern reasoning',
  spatial: 'Spatial reasoning',
  series: 'Numerical & sequence reasoning',
};

export const ITEMS = [...matrixItems, ...spatialItems, ...seriesItems]
  .slice()
  .sort((a, b) => a.b - b.b || a.id.localeCompare(b.id));

// Bump when items/option order change, so old share links are rejected.
export const ITEMS_VERSION = 1;
