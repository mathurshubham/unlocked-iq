import test from 'node:test';
import assert from 'node:assert/strict';
import { createCat, catFromJSON, CATEGORY_TARGETS, DEFAULT_LENGTH } from '../public/js/cat.js';
import { TEMPLATES, buildItem } from '../public/js/engine.js';
import { p3pl, fisherInfo, score } from '../public/js/scoring.js';
import { rng } from '../public/js/rng.js';

// Answer by the 3PL model for a respondent of ability theta (seeded, no Math.random).
function respond(item, theta, r) {
  if (r() < p3pl(theta, item.b, item.options.length, item.a)) return item.answer;
  let w;
  do { w = Math.floor(r() * item.options.length); } while (w === item.answer);
  return w;
}

function run(cat, theta, r) {
  let it;
  while ((it = cat.next())) cat.answer(respond(it, theta, r));
  return cat;
}

test('defaults: length 15, targets 40/33/27%', () => {
  assert.equal(DEFAULT_LENGTH, 15);
  assert.deepEqual(CATEGORY_TARGETS, { matrix: 0.4, spatial: 0.33, series: 0.27 });
  const cat = createCat({ formSeed: 5 });
  assert.equal(cat.length, 15);
  assert.equal(cat.done, false);
  assert.deepEqual(cat.items, []);
  assert.deepEqual(cat.answers, []);
});

test('first item is the max-information template at theta 0', () => {
  const best = TEMPLATES.map((t) => ({ id: t.id, info: fisherInfo(0, t.b, t.nOptions, t.a) }))
    .sort((x, y) => y.info - x.info)[0];
  const cat = createCat({ formSeed: 3 });
  assert.equal(cat.next().id, best.id);
});

test('next() is idempotent until answered; answer() advances; finishes at length', () => {
  const cat = createCat({ formSeed: 9, length: 6 });
  const a = cat.next();
  assert.equal(cat.next(), a);
  assert.equal(cat.items.length, 1);
  assert.equal(cat.answers.length, 0);
  cat.answer(a.answer);
  assert.deepEqual(cat.answers, [a.answer]);
  const b = cat.next();
  assert.notEqual(b.id, a.id);
  for (let i = 1; i < 6; i++) { cat.answer(0); cat.next(); }
  assert.equal(cat.done, true);
  assert.equal(cat.next(), null);
  assert.equal(cat.answers.length, 6);
  assert.equal(cat.items.length, 6);
  assert.throws(() => cat.answer(0));
});

test('answer() without a prior next() serves the next item; bad indices throw; -1 allowed', () => {
  const cat = createCat({ formSeed: 2, length: 3 });
  assert.throws(() => cat.answer(99));
  assert.throws(() => cat.answer(1.5));
  assert.throws(() => cat.answer(-2));
  cat.answer(-1);
  assert.equal(cat.items.length, 1);
  assert.deepEqual(cat.answers, [-1]);
});

test('items are the built form items of the form seed (rebuildable from tids)', () => {
  const cat = run(createCat({ formSeed: 777 }), 0.3, rng('rebuild'));
  assert.equal(cat.items.length, 15);
  cat.items.forEach((it) => assert.deepEqual(it, buildItem(it.templateId, 777)));
});

test('no repeats, terminates at length, over many seeds, thetas and lengths', () => {
  for (const length of [1, 5, 10, 15, 20, 30]) {
    for (let s = 0; s < 40; s++) {
      const r = rng(`len${length}:${s}`);
      const cat = run(createCat({ formSeed: s, length }), r() * 4 - 2, r);
      assert.equal(cat.items.length, length);
      assert.equal(cat.answers.length, length);
      assert.equal(new Set(cat.items.map((i) => i.templateId)).size, length, 'no repeated template');
      assert.equal(cat.done, true);
    }
  }
  assert.equal(createCat({ length: 99 }).length, 30, 'length clamps to the bank');
  assert.equal(createCat({ length: 0 }).length, 1);
});

test('category balance: every prefix stays within +-1 of the 40/33/27% targets', () => {
  for (const length of [6, 10, 15, 20, 30]) {
    for (let s = 0; s < 60; s++) {
      const r = rng(`bal${length}:${s}`);
      const theta = r() * 5 - 2.5;
      const cat = createCat({ formSeed: s + 1, length });
      const counts = { matrix: 0, spatial: 0, series: 0 };
      let k = 0;
      let it;
      while ((it = cat.next())) {
        k++;
        counts[it.category]++;
        for (const c of Object.keys(counts)) {
          assert.ok(Math.abs(counts[c] - CATEGORY_TARGETS[c] * k) <= 1 + 1e-9, `len ${length} seed ${s} step ${k}: ${JSON.stringify(counts)}`);
        }
        cat.answer(respond(it, theta, r));
      }
    }
  }
  // default 15: exactly the rounded shares 6 / 5 / 4
  const cat = run(createCat({ formSeed: 1 }), 0, rng('15'));
  const by = (c) => cat.items.filter((i) => i.category === c).length;
  assert.ok(Math.abs(by('matrix') - 6) <= 1 && Math.abs(by('spatial') - 5) <= 1 && Math.abs(by('series') - 4) <= 1);
});

test('adaptive: each pick maximises information at the current EAP within its category', () => {
  const r = rng('adapt');
  const cat = createCat({ formSeed: 11 });
  let it;
  while ((it = cat.next())) {
    const theta = cat.theta;
    const used = new Set(cat.items.slice(0, -1).map((i) => i.templateId));
    const info = (t) => fisherInfo(theta, t.b, t.nOptions, t.a);
    const mine = TEMPLATES.find((t) => t.id === it.templateId);
    for (const t of TEMPLATES) {
      if (used.has(t.id) || t.category !== mine.category) continue;
      assert.ok(info(mine) >= info(t) - 1e-9, `${it.templateId} vs ${t.id} at theta ${theta}`);
    }
    cat.answer(respond(it, 0.5, r));
  }
});

test('difficulty follows performance: all-correct runs harder than all-wrong', () => {
  const meanB = (cat) => cat.items.reduce((s, i) => s + i.b, 0) / cat.items.length;
  const lastB = (cat) => cat.items.slice(-6).reduce((s, i) => s + i.b, 0) / 6;
  let hi = 0;
  let lo = 0;
  for (let s = 1; s <= 20; s++) {
    const a = createCat({ formSeed: s });
    let it;
    while ((it = a.next())) a.answer(it.answer);
    const b = createCat({ formSeed: s });
    while ((it = b.next())) b.answer((it.answer + 1) % it.options.length);
    hi += lastB(a);
    lo += lastB(b);
    assert.ok(a.result().theta > b.result().theta);
    assert.ok(a.result().iq > b.result().iq);
    assert.ok(meanB(a) > meanB(b));
  }
  assert.ok(hi / 20 > lo / 20 + 0.5);
});

test('toJSON / catFromJSON: round trip mid-test and at the end, identical continuation', () => {
  const r = rng('json');
  const cat = createCat({ formSeed: 4242, length: 12 });
  for (let i = 0; i < 5; i++) cat.answer(respond(cat.next(), 0, r));
  // snapshot with a pending item
  cat.next();
  const wire = JSON.parse(JSON.stringify(cat));
  assert.deepEqual(Object.keys(wire).sort(), ['answers', 'formSeed', 'length', 'tids', 'v']);
  assert.equal(wire.tids.length, 6);
  assert.equal(wire.answers.length, 5);
  const copy = catFromJSON(wire);
  assert.deepEqual(copy.items, cat.items);
  assert.deepEqual(copy.answers, cat.answers);
  assert.equal(copy.next().id, cat.next().id);
  // both continue the same way
  const r1 = rng('cont');
  const r2 = rng('cont');
  run(cat, 0.2, r1);
  run(copy, 0.2, r2);
  assert.deepEqual(copy.toJSON(), cat.toJSON());
  assert.equal(copy.done, true);
  // finished state also round-trips, from a string
  const done = catFromJSON(JSON.stringify(cat));
  assert.equal(done.done, true);
  assert.equal(done.next(), null);
  assert.deepEqual(done.result(), cat.result());
});

test('catFromJSON rejects malformed or inconsistent state', () => {
  const good = { v: 1, formSeed: 1, length: 5, tids: ['M1', 'S1'], answers: [0, 2] };
  assert.doesNotThrow(() => catFromJSON(good));
  const bad = [
    null, {}, { ...good, v: 2 }, { ...good, formSeed: -1 }, { ...good, formSeed: 1.5 },
    { ...good, tids: ['M1', 'M1'] }, { ...good, tids: ['M1', 'ZZ'] }, { ...good, answers: [0, 1, 2] },
    { ...good, answers: [] }, { ...good, tids: [...'123456'].map((_, i) => TEMPLATES[i].id) },
    { ...good, answers: [0, 99] }, { ...good, answers: ['x', 0] }, { ...good, length: 'a' },
  ];
  for (const b of bad) assert.throws(() => catFromJSON(b), undefined, JSON.stringify(b));
  assert.throws(() => catFromJSON('{nope'));
});

test('scoring the finished CAT uses each item\'s own b and a', () => {
  const cat = run(createCat({ formSeed: 8 }), 1, rng('score'));
  const res = cat.result();
  assert.deepEqual(res, score(cat.items, cat.answers));
  assert.equal(res.total, 15);
});

// Convergence: respondents with known theta answer by the 3PL model.
test('convergence: mean EAP is ordered and within 0.6 of the truth (200 simulated respondents each)', () => {
  const means = {};
  for (const theta of [-1.5, 0, 1.5]) {
    let sum = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      const r = rng(`sim:${theta}:${s}`);
      const cat = run(createCat({ formSeed: s + 1 }), theta, r);
      sum += cat.result().theta;
    }
    means[theta] = sum / N;
    assert.ok(Math.abs(means[theta] - theta) < 0.6, `theta ${theta}: mean estimate ${means[theta].toFixed(3)}`);
  }
  assert.ok(means[-1.5] < means[0] && means[0] < means[1.5], JSON.stringify(means));
  assert.ok(means[1.5] - means[-1.5] > 1.8, 'spread of estimates covers the true spread');
});
