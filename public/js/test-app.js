// /test: mode select -> warm-up carousel -> focus-mode runner -> review -> finish.
// Vanilla ES module. Engine access only through engine.js, cat.js and scoring.js.
import { buildItem, buildForm, practiceItem, CATEGORY_LABELS } from './engine.js';
import { createCat, catFromJSON } from './cat.js';
import { score } from './scoring.js';
import { encodeShare } from './share.js';
import {
  newState, newSeed, loadState, saveState, clearState, toPayload, remainingSecs,
  QUICK_LENGTH, SEEN_KEY, readKey, writeKey,
} from './state.js';
import { postResult, postResponses, track } from './api.js';
import { ringMarkup, ringOffset } from './charts.js';
import {
  $, $$, esc, fmtClock, optionsMarkup, ICON, announce, animateIn, reducedMotion, isTyping, trapTab,
} from './ui.js';

const app = $('#main');
const LABELS = CATEGORY_LABELS;
const WARNINGS = [
  [300, '5 minutes left'],
  [120, '2 minutes left'],
  [60, '1 minute left'],
  [30, '30 seconds left'],
];

// ---------------- state ----------------
let S = null; // persisted state (see state.js)
let items = []; // Item[] aligned with S.tids
let cat = null; // adaptive test (quick mode)
let view = 'setup';
let timerId = null;
let lastShownSecs = -1;
const warned = new Set();
let finishing = false;
let panelOpen = false;
let panelReturnFocus = null;

const total = () => (S.mode === 'quick' ? QUICK_LENGTH : S.tids.length);
const answeredCount = () => S.answers.filter((a) => a >= 0).length;
const save = () => S && saveState(S);

function rebuildItems() {
  items = S.tids.map((t) => buildItem(t, S.seed));
}

// ---------------- boot ----------------
function boot() {
  document.title = 'Take the free IQ test | Unlocked IQ';
  showSetup();
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && view !== 'setup' && view !== 'warm') tick();
  });
}

function setView(v) {
  view = v;
  document.body.dataset.view = v;
  window.scrollTo(0, 0);
}

// ---------------- setup ----------------
function savedForResume() {
  const s = loadState();
  if (!s) return null;
  if (s.done) return { kind: 'done', s };
  try {
    if (s.mode === 'standard') {
      s.tids.forEach((t, i) => {
        const it = buildItem(t, s.seed);
        if (s.answers[i] >= it.options.length) throw new Error('bad answer');
      });
    } else if (!s.cat) {
      return null;
    }
  } catch {
    return null;
  }
  return { kind: remainingSecs(s) > 0 ? 'live' : 'expired', s };
}

function showSetup(notice = '') {
  teardownRun();
  setView('setup');
  const resume = savedForResume();
  const params = new URLSearchParams(location.search);
  const preMode = params.get('mode') === 'quick' ? 'quick' : 'standard';
  let resumeHtml = '';
  if (resume) {
    const { kind, s } = resume;
    const answered = s.answers.filter((a) => a >= 0).length;
    const modeName = s.mode === 'quick' ? 'Quick' : 'Standard';
    if (kind === 'live') {
      resumeHtml = `<div class="card t-resume fade-in" role="region" aria-label="Resume your test">
        <div><p class="t-resume-t"><strong>You have a ${modeName.toLowerCase()} test in progress.</strong></p>
        <p class="small muted">${answered} answered, ${fmtClock(remainingSecs(s))} left on the clock.</p></div>
        <div class="cluster"><button type="button" class="btn btn-primary" id="resume-btn">Resume</button>
        <button type="button" class="btn btn-ghost" id="discard-btn">Discard</button></div></div>`;
    } else if (kind === 'expired') {
      resumeHtml = `<div class="card t-resume fade-in" role="region" aria-label="Unfinished test">
        <div><p class="t-resume-t"><strong>Time ran out on your last test.</strong></p>
        <p class="small muted">${answered} answers were saved. Want to see how you did?</p></div>
        <div class="cluster"><button type="button" class="btn btn-primary" id="resume-btn">See my results</button>
        <button type="button" class="btn btn-ghost" id="discard-btn">Discard</button></div></div>`;
    } else {
      const href = s.resultId ? `/r/${s.resultId}` : '/results';
      resumeHtml = `<div class="card t-resume fade-in" role="region" aria-label="Your last result">
        <div><p class="t-resume-t"><strong>Your last result is still here.</strong></p>
        <p class="small muted">Saved in this browser${s.resultId ? ' and online' : ''}.</p></div>
        <div class="cluster"><a class="btn btn-primary" href="${href}">View result</a>
        <button type="button" class="btn btn-ghost" id="discard-btn">Clear</button></div></div>`;
    }
  }

  app.innerHTML = `
    <section class="t-setup container-text" aria-labelledby="setup-h">
      <a class="t-back small" href="/">&larr; Back to home</a>
      <p class="eyebrow">Free, start to finish</p>
      <h1 class="h1" id="setup-h" tabindex="-1">Take the free IQ test</h1>
      <p class="lede">Pick a format. Both give you the full results page: no email, no paywall.</p>
      ${notice ? `<div class="t-notice" role="status">${esc(notice)}</div>` : ''}
      ${resumeHtml}
      <form id="start-form" class="stack t-form" autocomplete="off">
        <fieldset class="t-modes">
          <legend class="visually-hidden">Test format</legend>
          <label class="mode-card${preMode === 'standard' ? ' is-on' : ''}">
            <input type="radio" name="mode" value="standard"${preMode === 'standard' ? ' checked' : ''}>
            <span class="mode-body">
              <span class="mode-top"><strong class="mode-name">Standard</strong><span class="badge">Most precise</span></span>
              <span class="mode-meta">30 questions &middot; 25 minutes</span>
              <span class="mode-desc">Go back, flag tricky ones and review before you finish.</span>
            </span>
          </label>
          <label class="mode-card${preMode === 'quick' ? ' is-on' : ''}">
            <input type="radio" name="mode" value="quick"${preMode === 'quick' ? ' checked' : ''}>
            <span class="mode-body">
              <span class="mode-top"><strong class="mode-name">Quick</strong><span class="badge">Adaptive</span></span>
              <span class="mode-meta">${QUICK_LENGTH} questions &middot; about 10 minutes</span>
              <span class="mode-desc">Questions adapt to you as you go. No going back.</span>
            </span>
          </label>
        </fieldset>

        <div class="t-field">
          <label for="name" class="t-label">Your name <span class="muted">(optional, shown on your results)</span></label>
          <input id="name" name="name" type="text" maxlength="40" placeholder="e.g. Priya" autocomplete="given-name">
        </div>

        <label class="t-check">
          <input type="checkbox" id="consent" name="consent">
          <span>Help improve the test: share my anonymous answers (no name).</span>
        </label>

        <div class="t-start">
          <button type="submit" class="btn btn-primary btn-lg" id="start-btn">Start the test</button>
          <button type="button" class="btn btn-ghost" id="warm-btn">Try 3 warm-up puzzles first</button>
        </div>
        <p class="small muted">The timer starts when the first question appears. Progress is saved in this browser, so a reload will not reset it.</p>
      </form>
    </section>`;

  const form = $('#start-form');
  const nameInput = $('#name');
  if (resume?.s.name) nameInput.value = resume.s.name;
  $$('input[name="mode"]', form).forEach((r) =>
    r.addEventListener('change', () => $$('.mode-card', form).forEach((c) => c.classList.toggle('is-on', $('input', c).checked))),
  );
  const begin = (forceWarm) => {
    const mode = form.elements.mode.value === 'quick' ? 'quick' : 'standard';
    const cfg = { mode, name: nameInput.value, consent: $('#consent').checked };
    const seen = readKey(SEEN_KEY) === '1';
    if (forceWarm || !seen) showWarm(cfg);
    else startTest(cfg);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    begin(false);
  });
  $('#warm-btn').addEventListener('click', () => begin(true));
  $('#resume-btn')?.addEventListener('click', () => resumeTest(resume));
  $('#discard-btn')?.addEventListener('click', () => {
    clearState();
    showSetup();
    $('#setup-h')?.focus({ preventScroll: true });
  });
}

// ---------------- warm-up carousel ----------------
const WARM = [
  { category: 'matrix', blurb: 'A grid with one piece missing. Look for what changes along each row and down each column.' },
  { category: 'spatial', blurb: 'Shapes that turn, flip and fold. Picture moving them in your head.' },
  { category: 'series', blurb: 'Numbers or letters in a sequence. Find the rule, then give the next one.' },
];

function showWarm(cfg) {
  setView('warm');
  const base = newSeed();
  const puzzles = WARM.map((w, i) => ({ ...w, item: practiceItem((base + i * 7919) >>> 0, { category: w.category, level: 'easy' }) }));
  let step = 0;
  let answered = false;

  const finishWarm = () => {
    writeKey(SEEN_KEY, '1');
    startTest(cfg);
  };

  const render = () => {
    const { item, category, blurb } = puzzles[step];
    answered = false;
    const last = step === puzzles.length - 1;
    app.innerHTML = `
      <section class="t-warm container-text" aria-labelledby="warm-h">
        <div class="t-warm-top">
          <p class="eyebrow">Warm-up ${step + 1} of ${puzzles.length}</p>
          <button type="button" class="btn btn-ghost btn-sm" id="skip-warm">Skip warm-up</button>
        </div>
        <div class="t-dots" aria-hidden="true">${puzzles.map((_, i) => `<span class="${i === step ? 'on' : i < step ? 'done' : ''}"></span>`).join('')}</div>
        <h1 class="h2" id="warm-h" tabindex="-1">${esc(LABELS[category])}</h1>
        <p class="muted">${esc(blurb)}</p>
        <article class="q-card" id="warm-card">
          <h2 class="q-prompt">${esc(item.prompt)}</h2>
          ${item.stem ? `<div class="q-stem">${item.stem}</div>` : ''}
          ${optionsMarkup(item)}
          <div class="fb" id="warm-fb" role="status" aria-live="polite"></div>
        </article>
        <div class="t-actions t-actions-static">
          <button type="button" class="btn btn-primary btn-lg" id="warm-next">${last ? 'Start the test' : 'Next puzzle'}</button>
        </div>
      </section>`;
    $('#skip-warm').addEventListener('click', finishWarm);
    $('#warm-next').addEventListener('click', () => {
      if (last) return finishWarm();
      step++;
      render();
      animateIn($('#warm-card'), 1);
    });
    $('#warm-card .opts').addEventListener('click', (e) => {
      const b = e.target.closest('.opt');
      if (!b || answered) return;
      answered = true;
      const pick = Number(b.dataset.i);
      const ok = pick === item.answer;
      $$('.opt', app).forEach((o, i) => {
        o.disabled = true;
        o.classList.toggle('is-correct', i === item.answer);
        o.classList.toggle('is-wrong', i === pick && !ok);
      });
      $('#warm-fb').innerHTML = `<p class="fb-line ${ok ? 'good' : 'bad'}"><strong>${ok ? 'Correct.' : 'Not quite.'}</strong> ${esc(item.explanation || '')}</p>`;
      $('#warm-next').focus({ preventScroll: true });
    });
    $('#warm-h').focus({ preventScroll: true });
  };
  render();
}

// ---------------- start / resume ----------------
function startTest(cfg) {
  const seed = newSeed();
  if (cfg.mode === 'quick') {
    cat = createCat({ formSeed: seed, length: QUICK_LENGTH });
    const first = cat.next();
    S = newState({ ...cfg, seed, tids: [first.id] });
    items = [first];
    S.cat = cat.toJSON();
  } else {
    const form = buildForm(seed);
    S = newState({ ...cfg, seed, tids: form.map((it) => it.id) });
    items = form;
  }
  warned.clear();
  finishing = false;
  save();
  track('test_start', { mode: S.mode });
  enterRun();
}

function resumeTest(resume) {
  S = resume.s;
  try {
    if (S.mode === 'quick') {
      cat = catFromJSON(S.cat);
      // next() is idempotent: it returns the pending question, or picks one if none is pending.
      if (!cat.done) cat.next();
      const pendingPick = S.answers[cat.answers.length] ?? -1;
      S.tids = cat.tids;
      S.answers = [...cat.answers, ...(cat.items.length > cat.answers.length ? [pendingPick] : [])];
      S.flags = S.tids.map(() => false);
      S.current = S.tids.length - 1;
      S.cat = cat.toJSON();
    }
    rebuildItems();
  } catch {
    clearState();
    showSetup('Sorry, that saved test could not be restored.');
    return;
  }
  warned.clear();
  finishing = false;
  if (remainingSecs(S) <= 0) return finish(true);
  enterRun();
}

// ---------------- runner ----------------
function enterRun() {
  setView('run');
  const q = S.mode === 'quick';
  const n = total();
  app.innerHTML = `
    <div class="t-run" data-mode="${S.mode}">
      <header class="t-top">
        <div class="t-top-l">
          <span class="chip" id="t-chip"></span>
          <span class="t-count" id="t-count" aria-live="off"></span>
        </div>
        <div class="t-top-r">
          ${q ? '' : `<button type="button" class="btn btn-sm t-qbtn" id="t-open-panel" aria-controls="t-panel" aria-expanded="false">${ICON.grid}<span id="t-qbtn-n">0/${n}</span><span class="visually-hidden"> Open question list</span></button>`}
          ${ringMarkup('Time remaining')}
        </div>
      </header>
      <div class="t-prog" id="t-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="1" aria-label="Progress"><div class="t-prog-fill" id="t-prog-fill"></div></div>
      <div class="t-body" id="t-body"></div>
    </div>
    <div class="t-toast" id="t-toast" role="status" aria-live="polite" hidden></div>`;
  $('#t-body').addEventListener('click', onBodyClick);
  $('#t-open-panel')?.addEventListener('click', () => openPanel());
  warned.clear();
  for (const [t] of WARNINGS) if (remainingSecs(S) < t) warned.add(t);
  startTimer();
  showQuestion(S.mode === 'quick' ? S.tids.length - 1 : S.current, 0, true);
}

function teardownRun() {
  stopTimer();
  closePanel(true);
  document.documentElement.classList.remove('t-lock');
}

function startTimer() {
  stopTimer();
  lastShownSecs = -1;
  tick();
  timerId = setInterval(tick, 250);
}
function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function tick() {
  if (!S || S.done || finishing) return;
  const left = remainingSecs(S);
  const ring = $('.ring');
  if (ring) {
    const secs = Math.max(0, Math.ceil(left));
    if (secs !== lastShownSecs) {
      lastShownSecs = secs;
      $('.ring-text', ring).textContent = fmtClock(left);
      ring.setAttribute('aria-label', `Time remaining: ${Math.floor(secs / 60)} minutes ${secs % 60} seconds`);
      ring.classList.toggle('warn', left <= 120);
      ring.classList.toggle('crit', left <= 30);
      for (const [t, msg] of WARNINGS) {
        if (left <= t && !warned.has(t)) {
          warned.add(t);
          toast(msg, t <= 60);
        }
      }
    }
    $('.ring-prog', ring).setAttribute('stroke-dashoffset', ringOffset(left, S.limit).toFixed(2));
  }
  if (left <= 0) finish(true);
}

let toastTimer = null;
function toast(msg, assertive) {
  const el = $('#t-toast');
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('urgent', !!assertive);
  announce(msg, assertive ? 'assertive' : 'polite');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}

// ---- question screen ----
function paletteMarkup() {
  return S.tids
    .map((_, i) => {
      const a = S.answers[i] >= 0;
      const f = S.flags[i];
      const label = `Question ${i + 1}${a ? ', answered' : ', not answered'}${f ? ', flagged' : ''}`;
      return `<button type="button" class="pal${a ? ' done' : ''}${f ? ' flag' : ''}${i === S.current ? ' cur' : ''}" data-i="${i}" aria-label="${label}"${i === S.current ? ' aria-current="step"' : ''}>${i + 1}</button>`;
    })
    .join('');
}

function bodyMarkup() {
  const q = S.mode === 'quick';
  return `
    <div class="t-layout${q ? ' t-solo' : ''}">
      <section class="t-main" aria-label="Question">
        <article class="q-card" id="q-card">
          <div class="q-head">
            <h2 class="q-prompt" id="q-prompt" tabindex="-1"></h2>
            ${q ? '' : `<button type="button" class="flag-btn" id="flag-btn" aria-pressed="false"><span class="flag-ic"></span><span class="flag-t">Flag</span></button>`}
          </div>
          <div class="q-stem" id="q-stem"></div>
          <div id="q-opts"></div>
        </article>
        ${q ? '<p class="small muted t-note">Quick test: answers are final once you continue. Skipping counts as wrong.</p>' : ''}
        <div class="t-actions" id="t-actions"></div>
      </section>
      ${
        q
          ? ''
          : `<div class="t-scrim" id="t-scrim" hidden></div>
      <aside class="t-panel" id="t-panel" aria-label="Question list">
        <div class="t-panel-grip" aria-hidden="true"></div>
        <div class="t-panel-head">
          <h2 class="h3" id="t-panel-h">Questions</h2>
          <button type="button" class="btn btn-ghost btn-sm t-panel-close" id="t-panel-close" aria-label="Close question list">${ICON.close}</button>
        </div>
        <p class="small muted" id="t-panel-sum"></p>
        <div class="palette" id="palette"></div>
        <ul class="pal-legend small muted" aria-hidden="true">
          <li><i class="pal-sw done"></i>Answered</li><li><i class="pal-sw"></i>Not yet</li><li><i class="pal-sw flag"></i>Flagged</li>
        </ul>
        <button type="button" class="btn btn-primary t-panel-review" id="panel-review">Review &amp; finish</button>
      </aside>`
      }
    </div>`;
}

function showQuestion(i, dir = 1, first = false) {
  closePanel(true);
  if (view !== 'run') setView('run');
  const body = $('#t-body');
  if (!$('#q-card', body)) {
    body.innerHTML = bodyMarkup();
    wireBody();
  }
  S.current = Math.max(0, Math.min(S.tids.length - 1, i));
  const it = items[S.current];
  const q = S.mode === 'quick';

  $('#q-prompt').textContent = it.prompt;
  const stem = $('#q-stem');
  stem.innerHTML = it.stem || '';
  stem.hidden = !it.stem;
  $('#q-opts').innerHTML = optionsMarkup(it, { selected: S.answers[S.current] });
  $('#t-chip').textContent = LABELS[it.category] || '';
  document.title = `Question ${S.current + 1} of ${total()} | Unlocked IQ`;

  const last = q ? S.current === QUICK_LENGTH - 1 : S.current === S.tids.length - 1;
  $('#t-actions').innerHTML = q
    ? `<button type="button" class="btn btn-ghost" id="skip-btn">Skip</button>
       <button type="button" class="btn btn-primary btn-lg" id="next-btn">${last ? 'Lock in &amp; finish' : 'Lock in &amp; continue'} ${ICON.arrowR}</button>`
    : `<button type="button" class="btn btn-lg" id="prev-btn"${S.current === 0 ? ' disabled' : ''}>${ICON.arrowL}<span>Previous</span></button>
       <button type="button" class="btn btn-primary btn-lg" id="next-btn"><span>${last ? 'Review' : 'Next'}</span>${ICON.arrowR}</button>`;
  $('#next-btn').disabled = q && S.answers[S.current] < 0;

  refreshChrome();
  save();
  if (!first) {
    animateIn($('#q-card'), dir);
    $('#q-prompt').focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function refreshChrome() {
  const n = total();
  const a = S.answers[S.current];
  $$('#q-opts .opt').forEach((b, i) => b.setAttribute('aria-pressed', String(i === a)));
  $('#t-count').textContent = `Question ${S.current + 1} of ${n}`;
  const pct = S.mode === 'quick' ? (S.current / n) * 100 : ((S.current + 1) / n) * 100;
  $('#t-prog-fill').style.width = `${pct}%`;
  const pb = $('#t-prog');
  pb.setAttribute('aria-valuenow', String(S.current + 1));
  pb.setAttribute('aria-valuemax', String(n));
  pb.setAttribute('aria-valuetext', `Question ${S.current + 1} of ${n}`);
  if (S.mode === 'quick') {
    const nb = $('#next-btn');
    if (nb) nb.disabled = a < 0;
    return;
  }
  const ans = answeredCount();
  const flagged = S.flags.filter(Boolean).length;
  $('#palette').innerHTML = paletteMarkup();
  $('#t-qbtn-n').textContent = `${ans}/${n}`;
  $('#t-panel-sum').textContent = `${ans} of ${n} answered${flagged ? `, ${flagged} flagged` : ''}`;
  const fb = $('#flag-btn');
  const flagged1 = S.flags[S.current];
  fb.setAttribute('aria-pressed', String(flagged1));
  $('.flag-ic', fb).innerHTML = flagged1 ? ICON.flagFill : ICON.flag;
  $('.flag-t', fb).textContent = flagged1 ? 'Flagged' : 'Flag';
  fb.setAttribute('aria-label', flagged1 ? 'Remove flag from this question' : 'Flag this question for review');
}

function wireBody() {
  if (S.mode === 'standard') wireSwipe($('#q-card'));
}

// Delegated once per run: #t-body persists while its children are rebuilt.
function onBodyClick(e) {
  if (!S || S.done || finishing) return;
  const t = e.target;
  const opt = t.closest('.opt');
  if (opt && !opt.disabled) return select(Number(opt.dataset.i));
  const pal = t.closest('.pal');
  if (pal) return showQuestion(Number(pal.dataset.i), Number(pal.dataset.i) > S.current ? 1 : -1);
  if (t.closest('#flag-btn')) return toggleFlag();
  if (t.closest('#prev-btn')) return go(S.current - 1);
  if (t.closest('#next-btn')) return next();
  if (t.closest('#skip-btn')) return skipQuick();
  if (t.closest('#panel-review')) return showReview();
  if (t.closest('#t-panel-close') || t.closest('#t-scrim')) return closePanel();
}

function select(i) {
  const it = items[S.current];
  if (i < 0 || i >= it.options.length) return;
  // Standard: tap again to clear. Quick: picking is sticky until you continue.
  S.answers[S.current] = S.mode === 'standard' && S.answers[S.current] === i ? -1 : i;
  save();
  refreshChrome();
}

function toggleFlag() {
  if (S.mode !== 'standard') return;
  S.flags[S.current] = !S.flags[S.current];
  save();
  refreshChrome();
  announce(S.flags[S.current] ? `Question ${S.current + 1} flagged` : `Flag removed from question ${S.current + 1}`);
}

function go(i) {
  if (S.mode !== 'standard' || i < 0 || i >= S.tids.length || i === S.current) return;
  showQuestion(i, i > S.current ? 1 : -1);
}

function next() {
  if (S.mode === 'quick') return lockIn();
  if (S.current >= S.tids.length - 1) return showReview();
  go(S.current + 1);
}

function skipQuick() {
  S.answers[S.current] = -1;
  lockIn(true);
}

// ---- quick mode: answer is final, ask the adaptive engine for the next item ----
function lockIn(skip = false) {
  if (S.mode !== 'quick' || finishing) return;
  const idx = skip ? -1 : S.answers[S.current];
  if (!skip && idx < 0) return;
  try {
    try {
      cat.answer(idx);
    } catch {
      // Engine had no pending question: ask for it first, then answer.
      cat.next();
      cat.answer(idx);
    }
    const nx = cat.done ? null : cat.next();
    S.cat = cat.toJSON();
    if (!nx) {
      save();
      return finish(false);
    }
    items.push(nx);
    S.tids.push(nx.id);
    S.answers.push(-1);
    S.flags.push(false);
    save();
    showQuestion(S.tids.length - 1, 1);
  } catch {
    save();
    finish(false);
  }
}

// ---- swipe (standard mode, touch only) ----
function wireSwipe(el) {
  let sx = 0, sy = 0, active = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    active = true;
    sx = e.clientX;
    sy = e.clientY;
  });
  el.addEventListener('pointerup', (e) => {
    if (!active) return;
    active = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) next();
      else go(S.current - 1);
    }
  });
  el.addEventListener('pointercancel', () => (active = false));
}

// ---- palette drawer (mobile) / side panel (desktop) ----
function openPanel() {
  const panel = $('#t-panel');
  if (!panel) return;
  panelOpen = true;
  panelReturnFocus = document.activeElement;
  panel.classList.add('open');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 't-panel-h');
  $('#t-scrim').hidden = false;
  $('#t-open-panel')?.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('t-lock');
  requestAnimationFrame(() => $('.pal.cur', panel)?.focus());
}
function closePanel(silent = false) {
  const panel = $('#t-panel');
  if (!panel || !panelOpen) return;
  panelOpen = false;
  panel.classList.remove('open');
  panel.removeAttribute('role');
  panel.removeAttribute('aria-modal');
  panel.removeAttribute('aria-labelledby');
  const scrim = $('#t-scrim');
  if (scrim) scrim.hidden = true;
  $('#t-open-panel')?.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('t-lock');
  if (!silent) panelReturnFocus?.focus?.({ preventScroll: true });
}
try {
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => e.matches && closePanel(true));
} catch {
  /* old browsers */
}

// ---------------- review ----------------
function showReview() {
  if (S.mode !== 'standard') return;
  closePanel(true);
  setView('review');
  document.title = 'Review your answers | Unlocked IQ';
  const n = S.tids.length;
  const ans = answeredCount();
  $('#t-chip').textContent = 'Review';
  $('#t-count').textContent = `${ans} of ${n} answered`;
  const unanswered = S.answers.map((a, i) => (a < 0 ? i : -1)).filter((i) => i >= 0);
  const flagged = S.flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  const chips = (list) =>
    list.length
      ? list.map((i) => `<button type="button" class="pal" data-i="${i}" aria-label="Go to question ${i + 1}">${i + 1}</button>`).join('')
      : '<span class="small muted">None</span>';
  $('#t-body').innerHTML = `
    <section class="t-review" aria-labelledby="rv-h">
      <h1 class="h2" id="rv-h" tabindex="-1">Review your answers</h1>
      <p class="muted">Check anything you skipped or flagged. You can still change answers until you finish.</p>
      <dl class="rv-stats">
        <div><dt>Answered</dt><dd>${ans}<span class="muted">/${n}</span></dd></div>
        <div class="${unanswered.length ? 'warn' : ''}"><dt>Unanswered</dt><dd>${unanswered.length}</dd></div>
        <div class="${flagged.length ? 'flagged' : ''}"><dt>Flagged</dt><dd>${flagged.length}</dd></div>
      </dl>
      <div class="card rv-card">
        <h2 class="h3">All questions</h2>
        <div class="palette rv-palette" id="rv-palette">${paletteMarkup()}</div>
        <ul class="pal-legend small muted" aria-hidden="true">
          <li><i class="pal-sw done"></i>Answered</li><li><i class="pal-sw"></i>Not yet</li><li><i class="pal-sw flag"></i>Flagged</li>
        </ul>
      </div>
      <div class="rv-lists">
        <div class="card rv-card"><h2 class="h3">Unanswered</h2><div class="rv-chips">${chips(unanswered)}</div></div>
        <div class="card rv-card"><h2 class="h3">Flagged</h2><div class="rv-chips">${chips(flagged)}</div></div>
      </div>
      <div class="rv-actions" id="rv-actions">
        <button type="button" class="btn btn-lg" id="rv-back">${ICON.arrowL}<span>Back to questions</span></button>
        <button type="button" class="btn btn-primary btn-lg" id="rv-finish">Finish test</button>
      </div>
      <div class="card rv-confirm" id="rv-confirm" role="alertdialog" aria-labelledby="rv-confirm-t" hidden>
        <p id="rv-confirm-t"></p>
        <div class="cluster">
          <button type="button" class="btn btn-primary" id="rv-yes">Yes, finish and show my results</button>
          <button type="button" class="btn btn-ghost" id="rv-no">Keep reviewing</button>
        </div>
      </div>
    </section>`;
  const root = $('.t-review');
  root.addEventListener('click', (e) => {
    if (e.target.closest('#rv-back')) {
      return showQuestion(Math.min(S.current, S.tids.length - 1), -1);
    }
    if (e.target.closest('#rv-finish')) {
      const left = unanswered.length;
      $('#rv-confirm-t').textContent = left
        ? `You have ${left} unanswered question${left === 1 ? '' : 's'}, and unanswered counts as wrong. Finish anyway?`
        : 'Every question is answered. Finish and see your results?';
      $('#rv-confirm').hidden = false;
      $('#rv-yes').focus();
      return;
    }
    if (e.target.closest('#rv-no')) {
      $('#rv-confirm').hidden = true;
      return $('#rv-finish').focus();
    }
    if (e.target.closest('#rv-yes')) finish(false);
  });
  $('#rv-h').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------------- finish ----------------
async function finish(auto) {
  if (!S || finishing) return;
  finishing = true;
  stopTimer();
  closePanel(true);
  S.done = true;
  S.endedAt = Math.min(Date.now(), S.startedAt + S.limit * 1000);
  save();
  setView('finish');
  document.title = 'Scoring your answers | Unlocked IQ';
  app.innerHTML = `
    <section class="t-finish container-text" aria-live="polite">
      <div class="t-spinner" aria-hidden="true"></div>
      <h1 class="h2" id="fin-h" tabindex="-1">${auto ? 'Time is up.' : 'Nice work.'} Scoring your answers&hellip;</h1>
      <p class="muted" id="fin-sub">This takes a moment.</p>
    </section>`;
  $('#fin-h').focus({ preventScroll: true });

  const payload = toPayload(S);
  let theta = 0;
  try {
    theta = score(items.slice(0, payload.tids.length), payload.a).theta;
  } catch {
    /* scoring is shown on the results page; theta only feeds the optional calibration data */
  }
  track('test_finish', { mode: S.mode, auto: !!auto });

  const id = await postResult(payload);
  if (id) {
    S.resultId = id;
    save();
  }
  if (S.consent) {
    postResponses({ mode: payload.mode, seed: payload.seed, tids: payload.tids, a: payload.a, secs: payload.secs, theta });
  }
  if (id) {
    location.assign(`/r/${id}`);
  } else {
    location.assign(`/results#r=${encodeShare(payload)}`);
  }
}

// ---------------- keyboard ----------------
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (view !== 'run' && view !== 'review') return;
  if (!S || S.done) return;
  if (panelOpen) {
    if (e.key === 'Escape') {
      closePanel();
      e.preventDefault();
    } else trapTab($('#t-panel'), e);
    return;
  }
  if (isTyping(e.target)) return;
  if (view === 'review') {
    if (e.key === 'Escape' && !$('#rv-confirm')?.hidden) {
      $('#rv-confirm').hidden = true;
      $('#rv-finish')?.focus();
    }
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    select(Number(e.key) - 1);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    if (S.mode === 'standard') go(S.current + 1);
    e.preventDefault();
  } else if (e.key === 'ArrowLeft') {
    if (S.mode === 'standard') go(S.current - 1);
    e.preventDefault();
  } else if ((e.key === 'f' || e.key === 'F') && S.mode === 'standard') {
    toggleFlag();
    e.preventDefault();
  } else if (
    e.key === 'Enter' &&
    S.mode === 'quick' &&
    S.answers[S.current] >= 0 &&
    (e.target === document.body || e.target === document || e.target.closest?.('.opt'))
  ) {
    lockIn();
    e.preventDefault();
  }
}

boot();
