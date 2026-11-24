// /practice: untimed, endless puzzles with instant feedback and explanations.
import { practiceItem, CATEGORY_LABELS, FORMAT_V4 } from './engine.js';
import { loadPractice, savePractice, recordPractice, emptyPractice, accuracy, readKey, writeKey } from './state.js';
import { track } from './api.js';
import { $, $$, esc, optionsMarkup, promptMarkup, tileName, buzz, ICON, announce, animateIn, isTyping, randomSeed, reducedMotion } from './ui.js';

const app = $('#main');
const PREFS_KEY = 'unlocked:practice-prefs';
const CATS = [
  ['mixed', 'Mixed'],
  ['matrix', 'Patterns'],
  ['spatial', 'Spatial'],
  ['series', 'Sequences'],
];
const LEVELS = [
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
];
const REAL_CATS = ['matrix', 'spatial', 'series'];

let prefs = loadPrefs();
let stats = loadPractice();
let item = null;
let itemCat = 'matrix';
let answered = false;
// Kahoot-style run of correct answers. Memory only: resets on a wrong answer and on reload.
let runStreak = 0;

function loadPrefs() {
  try {
    const p = JSON.parse(readKey(PREFS_KEY) || 'null');
    return {
      category: CATS.some(([k]) => k === p?.category) ? p.category : 'mixed',
      level: LEVELS.some(([k]) => k === p?.level) ? p.level : 'medium',
    };
  } catch {
    return { category: 'mixed', level: 'medium' };
  }
}
const savePrefs = () => writeKey(PREFS_KEY, JSON.stringify(prefs));

function pickItem() {
  itemCat = prefs.category === 'mixed' ? REAL_CATS[Math.floor(Math.random() * REAL_CATS.length)] : prefs.category;
  item = practiceItem(randomSeed(), { category: itemCat, level: prefs.level, format: FORMAT_V4 });
  answered = false;
}

function shell() {
  app.innerHTML = `
    <section class="pr" aria-labelledby="pr-h">
      <p class="eyebrow">Practice</p>
      <h1 class="h1" id="pr-h">Practice puzzles</h1>
      <p class="lede">Untimed and endless. Answer, see why, go again. New puzzles every time.</p>

      <div class="pr-controls">
        <div class="pr-group" role="radiogroup" aria-label="Puzzle type" id="pr-cats"></div>
        <div class="pr-group pr-levels" role="radiogroup" aria-label="Difficulty" id="pr-levels"></div>
      </div>

      <div class="pr-stats" id="pr-stats" aria-label="Your practice stats"></div>

      <article class="q-card pr-card" id="pr-card">
        <div class="q-head">
          <h2 class="q-prompt" id="pr-prompt" tabindex="-1"></h2>
          <span class="chip" id="pr-chip"></span>
        </div>
        <div class="q-stem" id="pr-stem"></div>
        <div id="pr-opts"></div>
        <div class="fb" id="pr-fb" role="status" aria-live="polite"></div>
      </article>
      <div class="t-actions t-actions-static" id="pr-actions"></div>

      <p class="small muted pr-foot">Keys 1&ndash;4 pick an answer, Enter or N for the next puzzle. Ready for the real thing? <a href="/test">Take the full test</a>.</p>
    </section>`;
  $('#pr-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    prefs.category = b.dataset.v;
    savePrefs();
    nextPuzzle(true);
  });
  $('#pr-levels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    prefs.level = b.dataset.v;
    savePrefs();
    nextPuzzle(true);
  });
  $('#pr-opts').addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (b && !b.disabled) {
      buzz();
      answer(Number(b.dataset.i));
    }
  });
  $('#pr-actions').addEventListener('click', (e) => {
    if (e.target.closest('#pr-next')) nextPuzzle();
    else if (e.target.closest('#pr-skip')) nextPuzzle(true);
  });
  $('#pr-stats').addEventListener('click', (e) => {
    if (e.target.closest('#pr-reset')) {
      stats = emptyPractice();
      runStreak = 0;
      savePractice(stats);
      renderStats();
      announce('Practice stats reset');
    }
  });
}

function seg(items, current) {
  return items
    .map(
      ([k, label]) =>
        `<button type="button" class="seg${k === current ? ' on' : ''}" role="radio" aria-checked="${k === current}" data-v="${k}">${label}</button>`,
    )
    .join('');
}

function renderControls() {
  $('#pr-cats').innerHTML = seg(CATS, prefs.category);
  $('#pr-levels').innerHTML = seg(LEVELS, prefs.level);
}

function renderStats() {
  $('#pr-stats').innerHTML = `
    <div class="pr-stat"><span class="pr-k">Streak</span><span class="pr-v" id="pr-streak">${stats.streak}</span></div>
    <div class="pr-stat"><span class="pr-k">Best streak</span><span class="pr-v">${stats.best}</span></div>
    <div class="pr-stat"><span class="pr-k">Session accuracy</span><span class="pr-v">${stats.answered ? `${accuracy(stats)}%` : '&ndash;'}<small>${stats.answered ? `${stats.correct}/${stats.answered}` : 'none yet'}</small></span></div>
    <button type="button" class="btn btn-ghost btn-sm" id="pr-reset"${stats.answered || stats.best ? '' : ' disabled'}>Reset</button>`;
}

function renderItem(dir = 0) {
  $('#pr-prompt').innerHTML = promptMarkup(item.prompt);
  $('#pr-chip').textContent = CATEGORY_LABELS[itemCat] || '';
  const stem = $('#pr-stem');
  stem.innerHTML = item.stem || '';
  stem.hidden = !item.stem;
  $('#pr-opts').innerHTML = optionsMarkup(item);
  $('#pr-fb').innerHTML = '';
  $('#pr-actions').innerHTML = `<button type="button" class="btn btn-ghost" id="pr-skip">Skip</button>`;
  if (dir) animateIn($('#pr-card'), dir);
}

function nextPuzzle(fromControl = false) {
  pickItem();
  renderControls();
  renderItem(1);
  if (!fromControl) $('#pr-prompt').focus({ preventScroll: true });
}

function answer(pick) {
  if (answered || pick < 0 || pick >= item.options.length) return;
  answered = true;
  const ok = pick === item.answer;
  stats = recordPractice(stats, ok);
  savePractice(stats);
  $$('#pr-opts .opt').forEach((o, i) => {
    o.disabled = true;
    o.classList.toggle('is-correct', i === item.answer);
    o.classList.toggle('is-wrong', i === pick && !ok);
    o.setAttribute('aria-pressed', String(i === pick));
    const label = o.getAttribute('aria-label');
    if (label && i === item.answer) o.setAttribute('aria-label', `${label}, correct answer`);
    else if (label && i === pick) o.setAttribute('aria-label', `${label}, your answer, not correct`);
  });
  const was = runStreak;
  runStreak = ok ? runStreak + 1 : 0;
  const streakHtml = ok
    ? `<p class="fb-streak${runStreak >= 3 ? ' hot' : ''}"><span class="fb-flame" aria-hidden="true">${ICON.flame}</span>${runStreak} in a row</p>`
    : was > 0
      ? `<p class="fb-streak is-reset">Streak ended at ${was}. A new one starts with the next puzzle.</p>`
      : '';
  const tiles = item.options.length === 4;
  const answerWas = tiles ? `option ${item.answer + 1}, the ${tileName(item.answer)}` : `option ${item.answer + 1}`;
  $('#pr-fb').innerHTML = `
    <div class="fb-box ${ok ? 'good' : 'bad'}">
      <p class="fb-title"><span class="fb-ic" aria-hidden="true">${ok ? ICON.check : ICON.close}</span>
        <strong>${ok ? 'Correct!' : 'Not quite'}</strong></p>
      ${ok ? '' : `<p class="fb-ans">The answer was ${answerWas}.</p>`}
      <p class="fb-text">${esc(item.explanation || '')}</p>
      ${streakHtml}
    </div>`;
  $('#pr-actions').innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="pr-next">Next puzzle ${ICON.arrowR}</button>`;
  $('#pr-next').focus({ preventScroll: true });
  $('#pr-actions').scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  renderStats();
  track('practice_answer', { category: itemCat, level: prefs.level, correct: ok });
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || !item) return;
  if (/^[1-9]$/.test(e.key) && !answered) {
    answer(Number(e.key) - 1);
    e.preventDefault();
  } else if (answered && (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight')) {
    nextPuzzle();
    e.preventDefault();
  } else if (answered && e.key === 'Enter' && !e.target.closest?.('button,a')) {
    nextPuzzle();
    e.preventDefault();
  }
});

document.title = 'Free IQ practice puzzles | Unlocked IQ';
shell();
renderControls();
renderStats();
pickItem();
renderItem(0);
