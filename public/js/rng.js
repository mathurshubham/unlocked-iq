// Deterministic helpers shared by all item modules. Pure: no DOM access.

// FNV-1a string hash -> uint32 seed.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 PRNG.
export function rng(seed) {
  let a = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shuffle [answer, ...distractors] deterministically by item id.
// Returns { options, answer } where answer is the index of the correct option.
export function placeOptions(id, answer, distractors) {
  const all = [answer, ...distractors].map((v, i) => ({ v, correct: i === 0 }));
  const r = rng('opts:' + id);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return { options: all.map((o) => o.v), answer: all.findIndex((o) => o.correct) };
}
