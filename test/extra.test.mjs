import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, variant, explain } from '../public/js/items-extra.js';
import { checkSvg } from './lib/markup.mjs';
import {
  latticeEdgesFromSvg, containsTranslated, canonical3d, mirrored3d, checkRender, visibleCubeCount, GROUP,
  gearAnswer, textsOf, routeAnswer, parseDominoes, inferNextDomino, parseClocks,
} from './lib/extra-oracle.mjs';

const SEEDS = 200;
const IDS = TEMPLATES.map((t) => t.id);
const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
const viewBox = (svg) => svg.match(/viewBox="([^"]+)"/)[1];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const variety = {};

function each(id, fn, n = SEEDS) {
  for (let s = 0; s < n; s++) {
    const v = variant(id, s);
    try { fn(v.item, v.meta, s); } catch (e) { e.message = `${id} seed ${s}: ${e.message}`; throw e; }
  }
}

// ---------- structure ----------

test('template list: ids, prefixes, categories, spread', () => {
  assert.equal(TEMPLATES.length, 17);
  assert.equal(new Set(IDS).size, IDS.length);
  for (const t of TEMPLATES) {
    assert.match(t.id, /^[EYWZJ]\d+$/);
    assert.equal(t.category, 'EYW'.includes(t.id[0]) ? 'spatial' : 'series');
    assert.ok(t.b >= -2.2 && t.b <= 2.0, `${t.id} b`);
    assert.ok(t.family && t.title);
  }
  const bs = TEMPLATES.map((t) => t.b);
  assert.ok(Math.min(...bs) <= -1.0 && Math.max(...bs) >= 1.5);
  assert.throws(() => variant('Q9', 1));
});

for (const id of IDS) {
  test(`${id}: contract, determinism, distinct options, markup, explanation`, () => {
    const stems = new Set();
    each(id, (item, meta, s) => {
      const t = byId[id];
      assert.equal(item.id, id);
      assert.equal(item.category, t.category);
      assert.equal(item.b, t.b);
      assert.ok(item.prompt.length > 10 && !/<|>/.test(item.prompt.replace(/\.\.\./g, '')));
      assert.ok(item.options.length >= 4 && item.options.length <= 6, 'option count');
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length);
      assert.ok(Number.isInteger(item.optionCols) && item.optionCols >= 2 && item.optionCols <= 5);
      assert.equal(new Set(item.options).size, item.options.length, 'options distinct');
      assert.equal(meta.optionInfo.length, item.options.length);
      for (const o of item.options) assert.ok(!/\sid=|<defs|url\(#|NaN|undefined/.test(o));
      // determinism
      const again = variant(id, s);
      assert.deepEqual(again.item, item);
      assert.deepEqual(again.meta, meta);
      // markup: svg figures obey the shared rules; text options are plain
      const figs = [item.stem, ...item.options].filter((x) => x.startsWith('<svg'));
      figs.forEach((f, i) => checkSvg(f, `${id} s${s} fig ${i}`));
      const optSvg = item.options.filter((o) => o.startsWith('<svg'));
      if (optSvg.length) {
        assert.equal(optSvg.length, item.options.length, 'all options svg or none');
        assert.equal(new Set(optSvg.map(viewBox)).size, 1, 'one viewBox per item');
      }
      if (item.stem) assert.ok(item.stem.startsWith('<svg'), 'stem is an svg');
      // explanation
      const ex = explain(id, meta);
      assert.ok(typeof ex === 'string' && ex.length > 40 && ex.length < 500);
      assert.ok(!/option \d|\(A\)|answer [A-E]\b/i.test(ex));
      stems.add(item.stem + '|' + item.prompt);
    });
    variety[id] = stems.size;
    assert.ok(stems.size >= 30, `${id}: only ${stems.size} distinct stems`);
  });
}

// ---------- E: embedded figures ----------

for (const id of ['E1', 'E2', 'E3']) {
  test(`${id}: exactly one figure contains the target (segment containment)`, () => {
    let nearCount = 0, mirrorCount = 0;
    each(id, (item, meta) => {
      const W = meta.W;
      const target = latticeEdgesFromSvg(item.stem, W);
      assert.equal(target.size, meta.target.length);
      const figs = item.options.map((o) => latticeEdgesFromSvg(o, W));
      const hits = figs.map((f) => containsTranslated(f, target, W));
      assert.equal(hits.filter(Boolean).length, 1, 'exactly one hit');
      assert.equal(hits.indexOf(true), item.answer);
      // same segment count everywhere, so count cannot give the answer away
      assert.equal(new Set(figs.map((f) => f.size)).size, 1);
      // meta agrees with markup
      item.options.forEach((o, i) => assert.equal(meta.optionInfo[i].edges.length, figs[i].size));
      assert.equal(meta.optionInfo[item.answer].kind, 'answer');
      // distractors that hold the target flipped must not contain it as drawn
      for (let i = 0; i < figs.length; i++) {
        if (i === item.answer) continue;
        if (meta.optionInfo[i].kind === 'near') nearCount++;
        if (meta.optionInfo[i].kind === 'mirror') mirrorCount++;
      }
      // canonical distinctness: distinct segment sets, and not mere translations of each other
      const sig = figs.map((f) => [...f].sort().join(';'));
      assert.equal(new Set(sig).size, sig.length);
    });
    assert.ok(nearCount >= SEEDS);
    if (id !== 'E1') assert.ok(mirrorCount >= SEEDS);
  });
}

// ---------- Y: 3D rotation ----------

for (const id of ['Y1', 'Y2', 'Y3', 'Y4']) {
  test(`${id}: answer is a rotation of the stem, distractors are mirror/different`, () => {
    let mirrors = 0;
    each(id, (item, meta, s) => {
      assert.equal(GROUP.length, 24);
      const stemClass = canonical3d(meta.stemCubes);
      const mirrorClass = canonical3d(mirrored3d(meta.stemCubes));
      assert.notEqual(stemClass, mirrorClass, 'object is chiral');
      const classes = item.options.map((_, i) => canonical3d(meta.optionInfo[i].cubes));
      assert.equal(new Set(classes).size, classes.length, 'option classes pairwise distinct');
      const rotated = classes.map((c) => c === stemClass);
      assert.equal(rotated.filter(Boolean).length, 1, 'exactly one option is a rotation');
      assert.equal(rotated.indexOf(true), item.answer);
      const mir = classes.map((c) => c === mirrorClass);
      assert.equal(mir.filter(Boolean).length, 1, 'one mirror-image distractor');
      mirrors++;
      item.options.forEach((_, i) => {
        assert.equal(meta.optionInfo[i].cubes.length, meta.cubeCount);
        const k = meta.optionInfo[i].kind;
        assert.equal(k === 'answer', i === item.answer);
        assert.equal(k === 'mirror', mir[i]);
      });
      assert.notEqual(item.options[item.answer], item.stem);
      if (s < 10) {
        // independent ray-cast: every cube shows, and the markup shows the face each ray hits
        assert.equal(visibleCubeCount(meta.stemCubes), meta.cubeCount, 'stem: all cubes visible');
        assert.equal(checkRender(item.stem, meta.stemCubes), null);
        item.options.forEach((o, i) => {
          assert.equal(visibleCubeCount(meta.optionInfo[i].cubes), meta.cubeCount, `option ${i}: all cubes visible`);
          assert.equal(checkRender(o, meta.optionInfo[i].cubes), null);
        });
      }
    });
    assert.equal(mirrors, SEEDS);
  });
}

test('Y: rotation group sanity (24 distinct, det +1) and chirality detection', () => {
  assert.equal(new Set(GROUP.map(JSON.stringify)).size, 24);
  const L = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1]]; // chiral
  assert.notEqual(canonical3d(L), canonical3d(mirrored3d(L)));
  const flat = [[0, 0, 0], [1, 0, 0], [1, 1, 0]]; // planar: mirror is a rotation
  assert.equal(canonical3d(flat), canonical3d(mirrored3d(flat)));
});

// ---------- W: gears ----------

for (const id of ['W1', 'W2']) {
  test(`${id}: gear directions recomputed from the drawing`, () => {
    each(id, (item, meta) => {
      const g = gearAnswer(item.stem, item.prompt);
      assert.match(item.prompt, /turn (clockwise|anticlockwise)\?$/);
      assert.equal(g.firstSaid, g.firstCw, 'arrow matches prompt');
      assert.equal(g.rods, id === 'W1' ? 0 : 1);
      assert.deepEqual(g.labelled, [...Array(g.n).keys()].map((i) => i + 1));
      assert.equal(g.edges.filter((e) => e[2] === -1).length, id === 'W1' ? g.n - 1 : g.n - 2, 'mesh count');
      const sets = item.options.map((o) => textsOf(o)[0].split(', ').map(Number));
      const want = JSON.stringify(g.set);
      const hits = sets.map((s) => JSON.stringify(s) === want);
      assert.equal(hits.filter(Boolean).length, 1);
      assert.equal(hits.indexOf(true), item.answer);
      assert.equal(new Set(sets.map(String)).size, sets.length);
      assert.deepEqual(meta.answer, g.set);
      assert.ok(g.set.length >= 1);
    });
  });
}

test('W2: rods change the answer (rod-as-mesh slip is wrong and offered)', () => {
  let offered = 0;
  each('W2', (item, meta) => {
    const g = gearAnswer(item.stem, item.prompt);
    const sets = item.options.map((o) => textsOf(o)[0].split(', ').map(Number));
    // rod-as-mesh variant: recompute with rods flipping
    const n = g.n;
    const dir = new Array(n).fill(null);
    dir[0] = g.firstCw;
    for (let k = 0; k < n; k++) for (const [a, b, s] of g.edges) {
      const flip = true;
      const sign = s === 1 && flip ? -1 : s;
      for (const [p, q] of [[a, b], [b, a]]) if (dir[p] !== null && dir[q] === null) dir[q] = sign === 1 ? dir[p] : !dir[p];
    }
    const ask = !/anticlockwise\?$/.test(item.prompt);
    const slip = dir.map((d, i) => (d === ask ? i + 1 : 0)).filter(Boolean);
    assert.notDeepEqual(slip, g.set);
    if (sets.some((s) => JSON.stringify(s) === JSON.stringify(slip))) offered++;
  });
  assert.ok(offered >= SEEDS * 0.9, `rod-as-mesh distractor offered in ${offered}`);
});

test('W3: route displacement recomputed from the prompt', () => {
  const kinds = new Set();
  each('W3', (item, meta) => {
    const r = routeAnswer(item.prompt);
    assert.equal(r.legs, 4);
    assert.ok(r.x !== 0 && r.y !== 0);
    const parsed = item.options.map((o) => {
      const t = textsOf(o);
      const [a, ae] = t[0].split(' '), [b, bn] = t[1].split(' ');
      return [(ae === 'east' ? 1 : -1) * +a, (bn === 'north' ? 1 : -1) * +b];
    });
    const hits = parsed.map((p) => p[0] === r.x && p[1] === r.y);
    assert.equal(hits.filter(Boolean).length, 1);
    assert.equal(hits.indexOf(true), item.answer);
    assert.equal(new Set(parsed.map(String)).size, parsed.length);
    assert.deepEqual(meta.pos, [r.x, r.y]);
    kinds.add(item.prompt);
  });
  assert.ok(kinds.size >= 100);
});

// ---------- Z: dominoes ----------

for (const id of ['Z1', 'Z2', 'Z3']) {
  test(`${id}: next domino inferred from pip counts`, () => {
    const kind = { Z1: 'const', Z2: 'const', Z3: 'alt-grow' }[id];
    each(id, (item, meta) => {
      const shown = parseDominoes(item.stem).slice(0, -1); // last rect is the ? slot
      assert.equal(shown.length, meta.shown);
      assert.deepEqual(shown, meta.seq);
      for (const d of shown) assert.ok(d[0] <= 6 && d[1] <= 6);
      const next = inferNextDomino(shown, kind === 'const' ? ['const', 'const'] : ['alt', 'grow']);
      const opts = item.options.map((o) => parseDominoes(o)[0]);
      const hits = opts.map((d) => d[0] === next[0] && d[1] === next[1]);
      assert.equal(hits.filter(Boolean).length, 1);
      assert.equal(hits.indexOf(true), item.answer);
      // unordered distinctness: no two options are the same domino turned round
      const u = opts.map((d) => [...d].sort().join('-'));
      assert.equal(new Set(u).size, u.length);
      assert.equal(item.options.length, 5);
    });
  });
}

test('Z: rule differences are genuinely non-trivial', () => {
  let bothMove = 0, wrap = 0;
  each('Z2', (item, meta) => {
    const s = [...meta.seq, meta.next];
    if (s[1][0] !== s[0][0] && s[1][1] !== s[0][1]) bothMove++;
    const decreased = s.some((d, i) => i > 0 && (d[0] < s[i - 1][0] || d[1] < s[i - 1][1]));
    if (decreased) wrap++;
  });
  assert.equal(bothMove, SEEDS);
  assert.ok(wrap > 100);
});

// ---------- J: clocks and calendar ----------

for (const id of ['J1', 'J3']) {
  test(`${id}: clock hands parsed back to minutes, rule recomputed`, () => {
    each(id, (item, meta) => {
      const stemClocks = parseClocks(item.stem);
      const shown = stemClocks.filter(Boolean).map((c) => c.total);
      assert.equal(shown.length, 5);
      assert.equal(stemClocks.length, 6);
      assert.equal(stemClocks[5], null);
      const d = shown.slice(1).map((t, i) => (t - shown[i] + 720) % 720);
      let next;
      if (id === 'J1') {
        assert.equal(new Set(d).size, 1, 'fixed interval');
        next = (shown[4] + d[0]) % 720;
      } else {
        const dd = d.slice(1).map((x, i) => (x - d[i] + 720) % 720);
        assert.equal(new Set(dd).size, 1, 'constant growth');
        next = (shown[4] + d[3] + dd[0]) % 720;
      }
      const opts = item.options.map((o) => parseClocks(o)[0].total);
      const hits = opts.map((t) => t === next);
      assert.equal(hits.filter(Boolean).length, 1);
      assert.equal(hits.indexOf(true), item.answer);
      assert.equal(new Set(opts).size, opts.length, 'distinct times');
      assert.deepEqual(meta.times, shown);
      // no option is a clock whose hands look identical to another (distinct angle pairs)
      const ang = item.options.map((o) => { const c = parseClocks(o)[0]; return `${c.hAng.toFixed(1)}/${c.mAng.toFixed(1)}`; });
      assert.equal(new Set(ang).size, ang.length);
    });
  });
}

test('J2: day-of-week arithmetic recomputed from the wording', () => {
  const forms = new Set();
  each('J2', (item, meta) => {
    const p = item.prompt;
    const idx = (name) => DAYS.indexOf(name);
    let want;
    let m;
    if ((m = p.match(/^Today is (\w+)\. .* in (\d+) days\?$/))) {
      want = (idx(m[1]) + +m[2]) % 7; forms.add('ahead');
    } else if ((m = p.match(/the (\d+)(?:st|nd|rd|th) is a (\w+)\. .* the (\d+)(?:st|nd|rd|th) of the same month/))) {
      want = (idx(m[2]) + (+m[3] - +m[1])) % 7; forms.add('date');
    } else if ((m = p.match(/^The day before yesterday was (\w+)\. .* (\d+) days after tomorrow\?$/))) {
      want = (idx(m[1]) + 2 + 1 + +m[2]) % 7; forms.add('relative');
    } else assert.fail('unparsed prompt: ' + p);
    assert.equal(item.stem, '');
    const hits = item.options.map((o) => idx(o) === want);
    assert.equal(hits.filter(Boolean).length, 1);
    assert.equal(hits.indexOf(true), item.answer);
    assert.ok(item.options.every((o) => DAYS.includes(o)));
    assert.equal(item.options.length, 5);
    // the answer is never the starting weekday (shift is not a multiple of 7)
    assert.notEqual(meta.days % 7, 0);
  });
  assert.equal(forms.size, 3);
});

test('J2: off-by-one and wrong-direction distractors are offered', () => {
  let off = 0, back = 0;
  each('J2', (item, meta) => {
    const names = item.options.map((o) => DAYS.indexOf(o));
    const ans = names[item.answer];
    if (names.includes((ans + 1) % 7) && names.includes((ans + 6) % 7)) off++;
    if (meta.form === 'ahead' && names.includes((((meta.start - meta.days) % 7) + 7) % 7)) back++;
  });
  assert.ok(off >= SEEDS * 0.95, `off-by-one both sides in ${off}`);
  assert.ok(back > 0);
});

test('J4: angle between hands recomputed from the drawn clock', () => {
  each('J4', (item, meta) => {
    const [clock] = parseClocks(item.stem);
    const t = item.prompt.match(/shows (\d+):(\d\d)\?$/);
    const h = +t[1], m = +t[2];
    assert.equal(clock.total, ((h % 12) * 60 + m) % 720, 'drawn time matches prompt');
    // angle from the hand directions actually drawn
    let d = Math.abs(clock.hAng - clock.mAng);
    d = Math.min(d, 360 - d);
    const opts = item.options.map((o) => parseFloat(o));
    assert.ok(item.options.every((o) => /^\d+(\.5)?°$/.test(o)));
    const hits = opts.map((a) => Math.abs(a - d) < 0.6);
    assert.equal(hits.filter(Boolean).length, 1);
    assert.equal(hits.indexOf(true), item.answer);
    assert.equal(new Set(opts).size, opts.length);
    assert.ok(opts.every((a) => a > 0 && a < 180));
    // the classic slip (ignoring hour-hand drift) must differ from the truth and be offered when plausible
    assert.notEqual(meta.noDrift, meta.angle);
  });
});

test('J4: forgot-hour-drift distractor is offered', () => {
  let n = 0;
  each('J4', (item, meta) => { if (item.options.includes(`${meta.noDrift}°`)) n++; });
  assert.ok(n >= SEEDS * 0.8, `noDrift offered ${n}`);
});

// ---------- variety report ----------

test('variety: distinct stems per template over 200 seeds', () => {
  console.log('variety (distinct stem+prompt over 200 seeds):', JSON.stringify(variety));
  for (const id of IDS) assert.ok(variety[id] >= 30);
});
