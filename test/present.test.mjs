// Presentation layer (format v4): 4 options, clear prompts, fraction stems for number analogies.
// The legacy format must stay exactly as before (test/fixtures guard the bytes; here we also
// check that v4 is a strict re-presentation of the legacy item).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, buildItem, buildForm, practiceItem, itemSeed } from '../public/js/engine.js';
import { PROMPTS, formatFromField, fieldFromFormat, normalizeFormat } from '../public/js/present.js';
import { createCat, catFromJSON } from '../public/js/cat.js';
import { score } from '../public/js/scoring.js';
import { encodeShare, decodeShare, validatePayload } from '../public/js/share.js';
import { newState, normalizeState, toPayload, itemsFromPayload, isMine } from '../public/js/state.js';
import { optionsMarkup, promptMarkup, tileName } from '../public/js/ui.js';
import { validateResult, validateResponses, rebuildItems, BadRequest, KNOWN_TIDS } from '../src/validate.js';

const V4 = { format: 'v4' };
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761 + 12345) >>> 0 || 1);
const IDS = TEMPLATES.map((t) => t.id);
const textOf = (html) => String(html).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
const optKey = (o) => String(o);

test('every template has exactly one prompt entry, and none are stray', () => {
  assert.equal(IDS.length, 110);
  assert.deepEqual(Object.keys(PROMPTS).sort(), [...IDS].sort());
});

test('format helpers', () => {
  assert.equal(normalizeFormat('v4'), 'v4');
  assert.equal(normalizeFormat(4), 'v4');
  assert.equal(normalizeFormat(undefined), 'legacy');
  assert.equal(normalizeFormat('legacy'), 'legacy');
  assert.equal(normalizeFormat('nonsense'), 'legacy');
  assert.equal(formatFromField(4), 'v4');
  assert.equal(formatFromField(undefined), 'legacy');
  assert.equal(formatFromField(3), 'legacy');
  assert.equal(fieldFromFormat('v4'), 4);
  assert.equal(fieldFromFormat('legacy'), undefined);
  assert.equal(fieldFromFormat(undefined), undefined);
});

test('legacy format: no option and format "legacy" are identical to each other', () => {
  for (const id of IDS) {
    for (const s of SEEDS.slice(0, 3)) {
      const a = buildItem(id, s);
      assert.deepEqual(buildItem(id, s, {}), a);
      assert.deepEqual(buildItem(id, s, { format: 'legacy' }), a);
      assert.equal('format' in a, false, 'legacy items carry no format field');
    }
  }
});

test('v4: every template, 200 seeds: 4 distinct options, same answer, distractors from the legacy set', () => {
  for (const id of IDS) {
    for (const s of SEEDS) {
      const leg = buildItem(id, s);
      const v4 = buildItem(id, s, V4);
      assert.equal(v4.options.length, 4, `${id}@${s}: 4 options`);
      assert.equal(new Set(v4.options.map(optKey)).size, 4, `${id}@${s}: options distinct`);
      assert.ok(Number.isInteger(v4.answer) && v4.answer >= 0 && v4.answer < 4);
      assert.equal(v4.options[v4.answer], leg.options[leg.answer], `${id}@${s}: answer is the same option`);
      const legDis = new Set(leg.options.filter((_, i) => i !== leg.answer).map(optKey));
      v4.options.forEach((o, i) => {
        if (i !== v4.answer) assert.ok(legDis.has(optKey(o)), `${id}@${s}: distractor comes from the legacy distractors`);
      });
      // everything else about the item is unchanged
      assert.equal(v4.templateId, id);
      assert.equal(v4.b, leg.b);
      assert.equal(v4.a, leg.a);
      assert.equal(v4.seed, leg.seed);
      assert.equal(v4.variantSeed, leg.variantSeed);
      assert.equal(v4.category, leg.category);
      assert.equal(v4.format, 'v4');
      assert.ok(v4.optionCols === 2 || v4.optionCols === 4, `${id}: optionCols is 2 or 4`);
      if (id[0] !== 'Q') assert.equal(v4.stem, leg.stem, `${id}@${s}: stem untouched`);
    }
  }
});

test('v4 is deterministic', () => {
  for (const id of IDS) {
    for (const s of SEEDS.slice(0, 20)) assert.deepEqual(buildItem(id, s, V4), buildItem(id, s, V4));
  }
});

test('v4: prompt, stem and explanation are non-empty and never use "::"', () => {
  for (const id of IDS) {
    for (const s of SEEDS) {
      const it = buildItem(id, s, V4);
      assert.ok(typeof it.prompt === 'string' && it.prompt.trim().length > 10, `${id}: prompt`);
      assert.ok(typeof it.explanation === 'string' && it.explanation.trim().length > 10, `${id}: explanation`);
      assert.ok(!it.prompt.includes('::'), `${id}: prompt has "::"`);
      assert.ok(!String(it.stem).includes('::'), `${id}: stem has "::"`);
      assert.ok(!it.explanation.includes('::'), `${id}: explanation has "::"`);
      assert.ok(!/ : /.test(textOf(it.stem)), `${id}: stem has an analogy colon`);
      assert.ok(!/\b(five|six) (options|figures|nets|pairs)\b/i.test(it.explanation), `${id}: explanation counts removed options`);
    }
  }
});

test('v4 prompts: static ones are the PROMPTS text, and none still carry the old vague wording', () => {
  for (const id of IDS) {
    const it = buildItem(id, 99, V4);
    if (typeof PROMPTS[id] === 'string') assert.equal(it.prompt, PROMPTS[id], id);
    assert.ok(!/which option completes the pattern/i.test(it.prompt), id);
    assert.ok(!/is to the second as the third is to/i.test(it.prompt), id);
  }
});

test('v4 dynamic prompts keep their variant values', () => {
  for (const s of SEEDS.slice(0, 60)) {
    assert.equal(buildItem('J2', s, V4).prompt, buildItem('J2', s).prompt, 'J2 wording is already plain');
    const j4 = buildItem('J4', s, V4).prompt;
    const t = /(\d+:\d+)/.exec(buildItem('J4', s).prompt)[1];
    assert.ok(j4.includes(`shows ${t}.`) && /smaller angle/.test(j4), j4);
    const w3 = buildItem('W3', s, V4).prompt;
    const w3legacy = buildItem('W3', s).prompt;
    assert.ok(w3.startsWith(w3legacy.replace(/ Where are you now.*$/, '')), 'W3 keeps the route');
    assert.match(w3, /your own point of view/);
    for (const id of ['S8', 'S9']) {
      const letter = /opposite (\w)\?/.exec(buildItem(id, s).prompt)[1];
      assert.match(buildItem(id, s, V4).prompt, new RegExp(`^Fold the net into a cube\\. Which letter is on the face opposite ${letter}\\?$`));
    }
    for (const id of ['W1', 'W2']) {
      const legacy = buildItem(id, s).prompt;
      const dir = /turn (clockwise|anticlockwise)\?/.exec(legacy)[1];
      const gear1 = /^Gear (\d+) turns (clockwise|anticlockwise)/.exec(legacy);
      const p = buildItem(id, s, V4).prompt;
      assert.ok(p.startsWith(`Gear ${gear1[1]} turns ${gear1[2]}`), 'start of the gear prompt kept');
      assert.ok(p.endsWith(`Which option lists every gear that turns ${dir}, and no others?`), p);
    }
  }
});

test('v4: the answer slot is roughly uniform over the 4 positions', () => {
  const total = [0, 0, 0, 0];
  for (const id of IDS) {
    const per = [0, 0, 0, 0];
    for (const s of SEEDS) per[buildItem(id, s, V4).answer]++;
    per.forEach((n, i) => {
      total[i] += n;
      assert.ok(n >= 22 && n <= 82, `${id}: slot ${i} holds the answer ${n}/200 times`);
    });
  }
  const all = IDS.length * SEEDS.length;
  total.forEach((n, i) => assert.ok(Math.abs(n / all - 0.25) < 0.015, `slot ${i}: ${(n / all).toFixed(3)}`));
});

test('v4 numeric options keep the two closest distractors', () => {
  for (const id of ['N1', 'N2', 'N3', 'N5', 'X1', 'X2', 'X4', 'K1', 'G1', 'Q1', 'Q2', 'Q3']) {
    for (const s of SEEDS.slice(0, 60)) {
      const leg = buildItem(id, s);
      const v4 = buildItem(id, s, V4);
      const ans = Number(leg.options[leg.answer]);
      const dis = leg.options.filter((_, i) => i !== leg.answer).map(Number);
      const closestTwo = dis.map((d) => ({ d, g: Math.abs(d - ans) })).sort((x, y) => x.g - y.g).slice(0, 2);
      const kept = new Set(v4.options.map(Number));
      const maxKept = Math.max(...closestTwo.map((c) => c.g));
      // every legacy distractor strictly closer than the 2nd closest must have been kept
      for (const { d, g } of dis.map((d) => ({ d, g: Math.abs(d - ans) }))) {
        if (g < maxKept) assert.ok(kept.has(d), `${id}@${s}: kept the near miss ${d}`);
      }
    }
  }
});

test('Q family: stacked fractions, top to bottom wording, no ":" notation', () => {
  for (const id of ['Q1', 'Q2', 'Q3']) {
    for (const s of SEEDS) {
      const leg = buildItem(id, s);
      const v4 = buildItem(id, s, V4);
      assert.match(leg.stem, / :: /, 'legacy stem is untouched');
      assert.equal((v4.stem.match(/class="frac"/g) || []).length, 3, 'three fractions');
      assert.equal((v4.stem.match(/class="frac-top"/g) || []).length, 3);
      assert.equal((v4.stem.match(/class="frac-bot"/g) || []).length, 3);
      assert.match(v4.stem, /<span class="frac-bot"><span class="q">\?<\/span><\/span>/, '? sits on the bottom of the last fraction');
      assert.ok(!/ : |::/.test(textOf(v4.stem)));
      // the numbers are the legacy numbers, tops and bottoms in the same order
      const legNums = textOf(leg.stem).replace(/[:?]/g, ' ').trim().split(/\s+/);
      const tops = [...v4.stem.matchAll(/class="frac-top">(\d+)</g)].map((m) => m[1]);
      const bots = [...v4.stem.matchAll(/class="frac-bot">(\d+)</g)].map((m) => m[1]);
      assert.deepEqual([tops[0], bots[0], tops[1], bots[1], tops[2]], legNums);
      assert.match(v4.prompt, /top number/);
      assert.match(v4.prompt, /bottom number/);
      assert.match(v4.prompt, /not division/);
      assert.match(v4.explanation, /top to bottom/);
      assert.match(v4.explanation, /→/);
      assert.ok(v4.explanation.includes(`= ${v4.options[v4.answer]}`), `${id}: explanation reaches the answer`);
      assert.match(v4.stem, /aria-label="[^"]*top number over a bottom number[^"]*"/);
    }
  }
});

test('v4 explanations that count the other options were reworded', () => {
  for (const s of SEEDS.slice(0, 60)) {
    for (const id of ['O1', 'O2', 'O3', 'O4']) assert.ok(!/\bFour (of the )?figures\b/.test(buildItem(id, s, V4).explanation), id);
    assert.ok(!/other four/.test(buildItem('S7', s, V4).explanation));
    assert.match(buildItem('S7', s, V4).explanation, /other three are genuine cube nets/);
    assert.ok(!/contain a \d×\d block/.test(buildItem('S6', s, V4).explanation));
  }
});

test('odd-one-out v4: the kept figures never let a different figure stand out', () => {
  // answer is the odd one; with 3 matching figures none of them may differ from the other two by fill
  for (const id of ['O1', 'O2', 'O3', 'O4']) {
    for (const s of SEEDS) {
      const it = buildItem(id, s, V4);
      const fills = it.options.map((o) => [...new Set(o.match(/class="(f-[a-z]+)"/g) || [])].sort().join(','));
      const others = fills.filter((_, i) => i !== it.answer);
      assert.equal(new Set(others).size, 1, `${id}@${s}: matching figures share a fill`);
    }
  }
});

test('buildForm v4: 30 items with 4 options; legacy form unchanged; seed 0 works too', () => {
  for (const seed of [0, 7, 424242]) {
    const form = buildForm(seed, V4);
    assert.equal(form.length, 30);
    assert.ok(form.every((it) => it.options.length === 4 && it.format === 'v4'));
    const legacy = buildForm(seed);
    assert.deepEqual(form.map((i) => i.id), legacy.map((i) => i.id), 'same template ids and order');
    assert.ok(legacy.some((it) => it.options.length > 4), 'legacy forms still have 5/6-option items');
  }
});

test('practiceItem passes the format through', () => {
  for (const category of ['matrix', 'spatial', 'series']) {
    for (const level of ['easy', 'medium', 'hard']) {
      const a = practiceItem(31337, { category, level, format: 'v4' });
      assert.equal(a.options.length, 4);
      assert.equal(a.format, 'v4');
      assert.deepEqual(practiceItem(31337, { category, level }), practiceItem(31337, { category, level, format: 'legacy' }));
      assert.equal(a.templateId, practiceItem(31337, { category, level }).templateId, 'same template either way');
    }
  }
});

test('scoring uses 4 options (guess rate 1/4) for v4 items', () => {
  const v4 = buildForm(5, V4);
  const leg = buildForm(5);
  const answersV4 = v4.map((it) => it.answer);
  const answersLeg = leg.map((it) => it.answer);
  const sV4 = score(v4, answersV4);
  const sLeg = score(leg, answersLeg);
  assert.equal(sV4.correct, 30);
  // the same all-correct run is worth a bit less when guessing is easier
  assert.ok(sV4.theta < sLeg.theta, `${sV4.theta} < ${sLeg.theta}`);
});

test('CAT v4: items have 4 options, guessing floor 4 in the selection, TEMPLATES untouched, state round-trips', () => {
  const before = JSON.stringify(TEMPLATES.map((t) => [t.id, t.nOptions]));
  const cat = createCat({ formSeed: 777, length: 15, randomesque: 3, format: 'v4' });
  let n = 0;
  while (!cat.done) {
    const it = cat.next();
    assert.equal(it.options.length, 4);
    assert.equal(it.format, 'v4');
    cat.answer(n % 3 === 0 ? it.answer : (it.answer + 1) % 4);
    n++;
  }
  assert.equal(n, 15);
  assert.equal(JSON.stringify(TEMPLATES.map((t) => [t.id, t.nOptions])), before, 'shared TEMPLATES not mutated');
  const j = cat.toJSON();
  assert.equal(j.f, 4);
  const back = catFromJSON(JSON.stringify(j));
  assert.equal(back.format, 'v4');
  assert.deepEqual(back.items.map((i) => i.options), cat.items.map((i) => i.options));
  assert.deepEqual(back.result().iq, cat.result().iq);
});

test('CAT: state saved without f resumes in the legacy format; no f is written for legacy', () => {
  const legacy = createCat({ formSeed: 777, length: 15, randomesque: 3 });
  for (let i = 0; i < 4; i++) legacy.answer(legacy.next().answer);
  const j = legacy.toJSON();
  assert.equal('f' in j, false);
  const back = catFromJSON(j);
  assert.equal(back.format, 'legacy');
  assert.deepEqual(back.items.map((i) => i.options), legacy.items.map((i) => i.options));
  assert.ok(back.items.some((i) => i.options.length > 4), 'legacy CAT items keep 5/6 options');
});

test('CAT v4 chooses by 4-option information (can differ from legacy picks), still no repeats', () => {
  const a = createCat({ formSeed: 99, length: 15, format: 'v4' });
  const b = createCat({ formSeed: 99, length: 15 });
  const seenA = [];
  const seenB = [];
  for (let i = 0; i < 15; i++) {
    const x = a.next();
    const y = b.next();
    seenA.push(x.templateId);
    seenB.push(y.templateId);
    a.answer(x.answer);
    b.answer(y.answer);
  }
  assert.equal(new Set(seenA).size, 15);
  assert.equal(new Set(seenB).size, 15);
});

// ---------------- share / state / worker plumbing ----------------
const tids = ['M3', 'S2', 'N4', 'M9'];
const sharePayload = { mode: 'quick', seed: 7, tids, a: [0, -1, 2, 1], secs: 300 };
const counts = { M3: 6, S2: 5, N4: 5, M9: 6 };

test('share: f:4 round-trips, absent f stays absent, other values are rejected', () => {
  const tok4 = encodeShare({ ...sharePayload, f: 4 });
  const out4 = decodeShare(tok4);
  assert.equal(out4.f, 4);
  assert.deepEqual({ ...out4, f: undefined }, { ...decodeShare(encodeShare(sharePayload)), f: undefined });
  const out0 = decodeShare(encodeShare(sharePayload));
  assert.equal('f' in out0, false);
  assert.equal('f' in decodeShare(encodeShare({ ...sharePayload, f: 0 })), false);
  const raw = { v: 2, ...sharePayload };
  assert.equal(validatePayload({ ...raw, f: 3 }), null);
  assert.equal(validatePayload({ ...raw, f: '4' }), null);
  assert.equal(validatePayload({ ...raw, f: 4 }).f, 4);
  assert.equal('f' in validatePayload(raw), false);
});

test('share: optionCount receives f, so index ranges follow the format', () => {
  const optionCount = (tid, seed, f) => (f === 4 ? 4 : counts[tid]);
  const hi = { ...sharePayload, a: [5, -1, 4, 1] };
  assert.ok(decodeShare(encodeShare(hi), { optionCount }), 'legacy payload may index 5th/6th options');
  assert.equal(decodeShare(encodeShare({ ...hi, f: 4 }), { optionCount }), null, 'v4 payload may not');
  assert.ok(decodeShare(encodeShare({ ...sharePayload, a: [3, -1, 3, 0], f: 4 }), { optionCount }));
});

test('share links built from real items: v4 and legacy rebuild with the right option counts', () => {
  const ids = ['M3', 'S2', 'N4', 'M9', 'Q1'];
  const optionCount = (tid, seed, f) => buildItem(tid, seed, { format: formatFromField(f) }).options.length;
  const seed = 4242;
  const legacyA = ids.map((id) => buildItem(id, seed).answer);
  const v4A = ids.map((id) => buildItem(id, seed, V4).answer);
  const legacy = decodeShare(encodeShare({ mode: 'quick', seed, tids: ids, a: legacyA, secs: 9 }), { optionCount });
  const v4 = decodeShare(encodeShare({ mode: 'quick', seed, tids: ids, a: v4A, secs: 9, f: 4 }), { optionCount });
  assert.ok(legacy && v4);
  const rebuilt = itemsFromPayload(v4, buildItem);
  assert.ok(rebuilt.every((it, i) => it.answer === v4A[i] && it.options.length === 4));
  const rebuiltLegacy = itemsFromPayload(legacy, buildItem);
  assert.ok(rebuiltLegacy.every((it, i) => it.answer === legacyA[i] && !('format' in it)));
  assert.deepEqual(rebuiltLegacy.map((i) => i.options), ids.map((id) => buildItem(id, seed).options));
});

test('state: v4 flag is stored as f:4, survives normalise and payload; old states stay legacy', () => {
  const s = newState({ mode: 'standard', seed: 9, tids, now: 1000, format: 'v4' });
  assert.equal(s.f, 4);
  assert.equal(normalizeState(JSON.parse(JSON.stringify(s))).f, 4);
  assert.equal(toPayload(s, 2000).f, 4);
  const old = newState({ mode: 'standard', seed: 9, tids, now: 1000 });
  assert.equal('f' in old, false);
  assert.equal('f' in normalizeState(JSON.parse(JSON.stringify(old))), false);
  assert.equal('f' in toPayload(old, 2000), false);
  // a saved state from before this change has no f: it resumes (and is shared) as legacy
  const saved = JSON.parse(JSON.stringify(old));
  delete saved.f;
  assert.equal(normalizeState(saved).f, undefined);
  assert.equal(normalizeState({ ...saved, f: 3 }).f, undefined, 'unknown format values are dropped');
  // isMine tells the two formats apart even with identical answers
  const done = { ...normalizeState(JSON.parse(JSON.stringify(s))), done: true };
  const pay = toPayload(done, 2000);
  assert.ok(isMine(done, pay));
  const { f, ...noF } = pay;
  assert.ok(!isMine(done, noF));
  assert.equal(f, 4);
});

test('worker validation: f:4 payloads rebuild as v4; no f rebuilds legacy; other f rejected', () => {
  const ids = [...KNOWN_TIDS].slice(0, 30);
  const seed = 31;
  const v4A = ids.map((id) => buildItem(id, seed, V4).answer);
  const legA = ids.map((id) => buildItem(id, seed).answer);
  const ok4 = validateResult({ v: 2, mode: 'standard', seed, tids: ids, a: v4A, secs: 100, f: 4 });
  assert.equal(ok4.payload.f, 4);
  assert.ok(ok4.items.every((it) => it.options.length === 4));
  assert.equal(rebuildItems(ok4.payload)[0].format, 'v4');
  const okL = validateResult({ v: 2, mode: 'standard', seed, tids: ids, a: legA, secs: 100 });
  assert.equal('f' in okL.payload, false);
  assert.ok(okL.items.some((it) => it.options.length > 4));
  assert.ok(!('format' in rebuildItems(okL.payload)[0]));
  // option index 4 is valid for a 5-option legacy item, never for v4
  const idx = legA.findIndex((_, i) => buildItem(ids[i], seed).options.length >= 5);
  const high = legA.slice();
  high[idx] = 4;
  assert.ok(validateResult({ v: 2, mode: 'standard', seed, tids: ids, a: high, secs: 100 }));
  assert.throws(() => validateResult({ v: 2, mode: 'standard', seed, tids: ids, a: high, secs: 100, f: 4 }), BadRequest);
  assert.throws(() => validateResult({ v: 2, mode: 'standard', seed, tids: ids, a: v4A, secs: 100, f: 3 }), BadRequest);
  const r = validateResponses({ mode: 'standard', seed, tids: ids, a: v4A, secs: 100, theta: 0.2, f: 4 });
  assert.ok(r.rows.every((row) => row.correct === 1));
  assert.throws(() => validateResponses({ mode: 'standard', seed, tids: ids, a: high, secs: 100, theta: 0, f: 4 }), BadRequest);
});

test('options markup: 4 options always 2x2 on phones; v4 columns are 2 or 4', () => {
  const v4 = buildItem('M2', 0, V4);
  const html = optionsMarkup(v4);
  assert.match(html, /--cols-m:2/);
  assert.match(html, new RegExp(`--cols:${v4.optionCols};`));
  assert.equal((html.match(/<button type="button" class="opt/g) || []).length, 4);
  const num = optionsMarkup(buildItem('N1', 0, V4));
  assert.match(num, /--cols:4;--cols-m:2/);
  const big = optionsMarkup(buildItem('Y1', 3, V4));
  assert.match(big, /opts-lg/);
  assert.match(big, /--cols:2;--cols-m:2/);
  assert.match(optionsMarkup(buildItem('E1', 3, V4)), /opts-same/);
  // legacy rendering is unchanged: 6 options keep 3 columns on phones
  assert.match(optionsMarkup(buildItem('M2', 0)), /--cols:3;--cols-m:3/);
});

test('itemSeed is untouched by the format', () => {
  assert.equal(itemSeed(0, 'M1'), 0);
  assert.equal(buildItem('M1', 12345, V4).variantSeed, buildItem('M1', 12345).variantSeed);
});

test('answer tiles: four options get colour and shape, legacy 6 options keep the old grid', () => {
  const html = optionsMarkup(buildItem('N1', 0, V4));
  assert.match(html, /opts-tiles/);
  for (let i = 1; i <= 4; i++) assert.match(html, new RegExp(`tile-${i}`));
  assert.match(html, /aria-label="Option 2, blue diamond: /);
  assert.equal(tileName(0), 'red triangle');
  assert.equal(tileName(2), 'yellow circle');
  assert.equal(tileName(3), 'green square');
  assert.match(optionsMarkup(buildItem('M2', 3, V4)), /aria-label="Option 1, red triangle"/);
  const legacy = optionsMarkup(buildItem('M2', 0));
  assert.doesNotMatch(legacy, /opts-tiles/);
  assert.match(legacy, /Option 1: /);
});

test('promptMarkup: the question sentence is the headline, setup and rules are muted detail', () => {
  assert.equal(promptMarkup('Which number comes next?'), 'Which number comes next?');
  assert.equal(
    promptMarkup('Which tile fits? Look across each row. Then down.'),
    'Which tile fits? <span class="q-sub">Look across each row. Then down.</span>',
  );
  assert.equal(promptMarkup('Gear 1 turns. Which <b>?'), 'Which &lt;b&gt;? <span class="q-sub">Gear 1 turns.</span>');
  assert.equal(promptMarkup('Use A to Z. Which comes next? Hint: 3.5 steps.'), 'Which comes next? <span class="q-sub">Use A to Z. Hint: 3.5 steps.</span>');
  // every real v4 prompt keeps all its words
  for (const t of TEMPLATES) {
    const p = buildItem(t.id, 7, V4).prompt;
    const flat = promptMarkup(p).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    assert.deepEqual(flat.split(/\s+/).sort(), p.split(/\s+/).sort(), t.id);
    assert.match(promptMarkup(p).split('<span')[0], /\?\s*$/, `${t.id}: headline is a question`);
  }
});
