// UI driver: intro -> test -> results. Vanilla ES module, no dependencies.
import { ITEMS, CATEGORIES, ITEMS_VERSION } from './items.js';
import { score } from './scoring.js';
import { categoryProfile, overallProfile, rangeTraits, strengths } from './profile.js';
import { encodeShare, decodeShare } from './share.js';

const TIME_LIMIT = 25 * 60; // seconds
const WARN_AT = 120;
const STORAGE_KEY = 'iqtest:state';
const TOTAL = ITEMS.length;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- state + storage ----------
// state = { v, name, answers[], current, startedAt (ms), done, endedAt (ms|null) }
let state = null;
let current = 0;
let timerId = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== ITEMS_VERSION) return null;
    if (!Array.isArray(s.answers) || s.answers.length !== TOTAL) return null;
    if (!s.answers.every((a, i) => Number.isInteger(a) && a >= -1 && a < ITEMS[i].options.length)) return null;
    if (typeof s.startedAt !== 'number') return null;
    return {
      v: ITEMS_VERSION,
      name: typeof s.name === 'string' ? s.name.slice(0, 40) : '',
      answers: s.answers,
      current: Number.isInteger(s.current) ? Math.min(TOTAL - 1, Math.max(0, s.current)) : 0,
      startedAt: s.startedAt,
      done: !!s.done,
      endedAt: typeof s.endedAt === 'number' ? s.endedAt : null,
    };
  } catch {
    return null;
  }
}
function saveState() {
  if (!state) return;
  state.current = current;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the test still works, it just will not resume */
  }
}
function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- screens ----------
function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  window.scrollTo(0, 0);
}
function focusHeading(el) {
  if (el) el.focus({ preventScroll: true });
}

const fmtClock = (secs) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtDuration = (secs) => {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
};
const remainingSecs = () => TIME_LIMIT - (Date.now() - state.startedAt) / 1000;

// ---------- intro ----------
function showIntro(noticeText) {
  stopTimer();
  show('intro');
  const notice = $('#notice');
  notice.hidden = !noticeText;
  notice.textContent = noticeText || '';

  const saved = loadState();
  const box = $('#resume-box');
  if (saved) {
    state = saved;
    if (!saved.done && remainingSecs() <= 0) {
      saved.done = true;
      saved.endedAt = saved.startedAt + TIME_LIMIT * 1000;
      saveState();
    }
    const answered = saved.answers.filter((a) => a >= 0).length;
    box.hidden = false;
    if (saved.done) {
      $('#resume-text').textContent = 'You have a finished test saved in this browser.';
      $('#resume-btn').hidden = true;
      $('#results-btn').hidden = false;
    } else {
      $('#resume-text').textContent = `You have a test in progress: ${answered} of ${TOTAL} answered, ${fmtClock(remainingSecs())} left.`;
      $('#resume-btn').hidden = false;
      $('#results-btn').hidden = true;
    }
    if (saved.name && !$('#name').value) $('#name').value = saved.name;
  } else {
    state = null;
    box.hidden = true;
  }
}

function startNew(name) {
  state = {
    v: ITEMS_VERSION,
    name: name.trim().slice(0, 40),
    answers: ITEMS.map(() => -1),
    current: 0,
    startedAt: Date.now(),
    done: false,
    endedAt: null,
  };
  current = 0;
  saveState();
  enterTest();
}

// ---------- test ----------
function buildPalette() {
  $('#palette').innerHTML = ITEMS.map(
    (_, i) => `<button type="button" class="pal" data-i="${i}" aria-label="Go to question ${i + 1}">${i + 1}</button>`,
  ).join('');
}

function enterTest() {
  show('test');
  buildPalette();
  $('#finish-confirm').hidden = true;
  renderQuestion();
  startTimer();
}

function renderQuestion() {
  const it = ITEMS[current];
  $('#q-count').textContent = `Question ${current + 1} of ${TOTAL}`;
  $('#q-cat').textContent = CATEGORIES[it.category] || '';
  $('#q-prompt').textContent = it.prompt;
  const stem = $('#q-stem');
  stem.innerHTML = it.stem || '';
  stem.hidden = !it.stem;

  const cols = it.optionCols || 3;
  const grid = $('#q-options');
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--cols-m', Math.min(cols, 3));
  const textual = it.category === 'series';
  grid.innerHTML = it.options
    .map(
      (o, i) =>
        `<button type="button" class="opt${textual ? ' opt-text' : ''}" data-i="${i}" aria-pressed="false">` +
        `<span class="opt-n" aria-hidden="true">${i + 1}</span><span class="sr">Option ${i + 1}: </span>` +
        `<span class="opt-fig">${o}</span></button>`,
    )
    .join('');
  refreshChrome();
}

function refreshChrome() {
  const a = state.answers[current];
  document.querySelectorAll('#q-options .opt').forEach((b, i) => b.setAttribute('aria-pressed', String(i === a)));
  document.querySelectorAll('#palette .pal').forEach((b, i) => {
    b.classList.toggle('done', state.answers[i] >= 0);
    b.classList.toggle('cur', i === current);
    b.setAttribute('aria-current', i === current ? 'true' : 'false');
  });
  const answered = state.answers.filter((x) => x >= 0).length;
  $('#answered-count').textContent = `${answered} of ${TOTAL} answered`;
  $('#prev-btn').disabled = current === 0;
  $('#next-btn').disabled = current === TOTAL - 1;
  $('#progress-fill').style.width = `${((current + 1) / TOTAL) * 100}%`;
  const pb = $('#progress');
  pb.setAttribute('aria-valuenow', String(current + 1));
  pb.setAttribute('aria-valuemax', String(TOTAL));
}

function select(i) {
  if (i < 0 || i >= ITEMS[current].options.length) return;
  state.answers[current] = state.answers[current] === i ? -1 : i; // click again to clear
  saveState();
  refreshChrome();
}
function go(i) {
  if (i < 0 || i >= TOTAL || i === current) return;
  current = i;
  $('#finish-confirm').hidden = true;
  saveState();
  renderQuestion();
}

function startTimer() {
  stopTimer();
  tick();
  timerId = setInterval(tick, 250);
}
function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}
function tick() {
  if (!state || state.done) return;
  const left = remainingSecs();
  const t = $('#timer');
  t.textContent = fmtClock(left);
  t.classList.toggle('warn', left <= WARN_AT);
  if (left <= 0) finish();
}

function finish() {
  if (!state || state.done) return;
  stopTimer();
  state.done = true;
  state.endedAt = Math.min(Date.now(), state.startedAt + TIME_LIMIT * 1000);
  saveState();
  showOwnResults();
}

function showOwnResults() {
  const seconds = Math.round(((state.endedAt ?? Date.now()) - state.startedAt) / 1000);
  renderResults({ name: state.name, answers: state.answers, seconds, readonly: false });
}

// ---------- charts ----------
function bellSvg(iq, low, high) {
  const W = 360, H = 190, L = 12, R = 348, base = 150, top = 48;
  const XMIN = 40, XMAX = 160;
  const X = (v) => L + ((v - XMIN) / (XMAX - XMIN)) * (R - L);
  const pdf = (v) => Math.exp(-0.5 * ((v - 100) / 15) ** 2);
  const Y = (v) => base - pdf(v) * (base - top);
  const pts = (a, b) => {
    const out = [];
    for (let v = a; v <= b + 1e-9; v += 1) out.push(`${X(v).toFixed(1)},${Y(v).toFixed(1)}`);
    return out;
  };
  const lo = Math.max(XMIN, low), hi = Math.min(XMAX, high);
  const curve = 'M' + pts(XMIN, XMAX).join(' L');
  const band = `M${X(lo).toFixed(1)},${base} L` + pts(lo, hi).join(' L') + ` L${X(hi).toFixed(1)},${base} Z`;
  const ticks = [55, 70, 85, 100, 115, 130, 145]
    .map(
      (v) =>
        `<line class="axis" x1="${X(v)}" x2="${X(v)}" y1="${base}" y2="${base + 4}"/>` +
        `<text class="t-muted" x="${X(v)}" y="${base + 18}" font-size="11" text-anchor="middle">${v}</text>`,
    )
    .join('');
  const mx = X(iq);
  const lx = Math.min(R - 22, Math.max(L + 22, mx));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bell curve with mean 100 and standard deviation 15. Your estimate of ${iq} is marked, with a 90 percent range from ${low} to ${high}.">
    <path class="band" d="${band}"/>
    <path class="curve" d="${curve}"/>
    <line class="axis" x1="${L}" x2="${R}" y1="${base}" y2="${base}"/>
    ${ticks}
    <line class="marker" x1="${mx}" x2="${mx}" y1="${base}" y2="${top - 12}"/>
    <circle class="dot" cx="${mx}" cy="${Y(iq).toFixed(1)}" r="5"/>
    <text x="${lx}" y="${top - 20}" font-size="14" font-weight="700" text-anchor="middle">IQ ${iq}</text>
  </svg>`;
}

function barsSvg(byCategory) {
  const rows = Object.keys(CATEGORIES).filter((k) => byCategory[k]);
  const rowH = 54, W = 360, trackW = 308, barH = 14;
  const H = rows.length * rowH;
  const body = rows
    .map((k, i) => {
      const { correct, total } = byCategory[k];
      const pct = total ? (correct / total) * 100 : 0;
      const y = i * rowH;
      const w = Math.max(pct > 0 ? 6 : 0, (pct / 100) * trackW);
      const tip = `${CATEGORIES[k]}: ${correct} of ${total} correct`;
      return `<g class="row-g" tabindex="0" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}">
        <rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
        <text x="0" y="${y + 16}" font-size="13" font-weight="600">${esc(CATEGORIES[k])}</text>
        <rect class="track" x="0" y="${y + 26}" width="${trackW}" height="${barH}" rx="4"/>
        ${w > 0 ? `<rect class="bar" x="0" y="${y + 26}" width="${w.toFixed(1)}" height="${barH}" rx="4"/>` : ''}
        <text x="${W}" y="${y + 38}" font-size="14" font-weight="700" text-anchor="end">${Math.round(pct)}%</text>
      </g>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Percent correct by category">${body}</svg>`;
}

// ---------- results ----------
async function copyText(text) {
  try {
    // Race a timeout: some browsers leave the promise pending when the page lacks focus.
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

function renderResults({ name, answers, seconds, readonly }) {
  const r = score(ITEMS, answers);
  const title = name ? `${esc(name)}’s results` : 'Your results';
  const pct = Math.min(99, Math.max(1, Math.round(r.percentile)));

  const catProfiles = Object.keys(CATEGORIES)
    .filter((k) => r.byCategory[k])
    .map((k) => {
      const c = r.byCategory[k];
      const p = c.total ? (c.correct / c.total) * 100 : 0;
      return `<h3>${esc(CATEGORIES[k])} &middot; ${c.correct} of ${c.total}</h3><p>${esc(categoryProfile(k, p))}</p>`;
    })
    .join('');

  const hard = r.hardest.length
    ? `<ul class="hard">${r.hardest
        .map((h) => {
          const it = ITEMS.find((x) => x.id === h.id);
          const p = Math.max(1, Math.round(h.pAvg * 100));
          return `<li><span class="pct">Question #${h.index}</span> (${esc(CATEGORIES[it.category])}): about <span class="pct">${p}%</span> of people get this right.</li>`;
        })
        .join('')}</ul>
      <p class="small muted" style="margin-top:12px">Yes, these are the "hardest" ones, and no, nobody is charging you to hear about them.</p>`
    : `<p>None of the hardest questions this time, and that is fine. They are hard on purpose. Everyone gets stuck somewhere.</p>`;

  const review = ITEMS.map((it, i) => {
    const a = answers[i];
    const ok = a === it.answer;
    const tag = ok ? '<span class="tag ok">Correct</span>' : a < 0 ? '<span class="tag skip">Skipped</span>' : '<span class="tag bad">Missed</span>';
    const fig = (idx) => `<div class="box">${it.options[idx]}</div>`;
    const pair = ok
      ? `<div class="rv-opt right"><div class="cap">Your answer (correct)</div>${fig(a)}</div>`
      : `${a >= 0 ? `<div class="rv-opt wrong"><div class="cap">Your answer</div>${fig(a)}</div>` : `<div class="rv-opt"><div class="cap">Your answer</div><div class="box">&ndash;</div></div>`}
         <div class="rv-opt right"><div class="cap">Correct answer</div>${fig(it.answer)}</div>`;
    return `<details class="rv"><summary><span class="rv-sum">Question ${i + 1} ${tag} <span class="muted small">${esc(CATEGORIES[it.category])}</span></span></summary>
      <div class="rv-body"><p class="small">${esc(it.prompt)}</p><div class="rv-stem">${it.stem || ''}</div><div class="rv-pair">${pair}</div></div></details>`;
  }).join('');

  const root = $('#results-body');
  root.innerHTML = `
    <p class="eyebrow">${readonly ? 'Shared results' : 'All done'}</p>
    <h1 class="res-title" id="res-title" tabindex="-1">${title}</h1>
    <p class="lede">${readonly ? 'Someone sent you these. They are read-only.' : 'Here is everything, for free. This is an estimate, not a diagnosis.'}</p>

    <div class="actions">
      ${readonly ? '<button type="button" class="btn primary" id="take-btn">Take the test yourself</button>' : ''}
    </div>

    <section class="card hero" aria-label="Summary">
      <p class="eyebrow">Estimated IQ</p>
      <div class="iq">${r.iq}</div>
      <p class="range">90% range <b>${r.low}&ndash;${r.high}</b></p>
      <dl class="stats">
        <div><dt>Percentile</dt><dd>${pct}</dd></div>
        <div><dt>Correct</dt><dd>${r.correct}/${r.total}</dd></div>
        <div><dt>Time</dt><dd>${fmtDuration(seconds)}</dd></div>
      </dl>
    </section>

    <section class="card" aria-label="Where this falls on the bell curve">
      <h2 class="h3">Where that sits</h2>
      ${bellSvg(r.iq, r.low, r.high)}
      <p class="chart-cap">Average is 100; about two thirds of people fall between 85 and 115. The shaded band is the 90% range.</p>
    </section>

    <section class="card" aria-label="Score by category">
      <h2 class="h3" style="margin-bottom:12px">Percent correct by category</h2>
      ${barsSvg(r.byCategory)}
    </section>

    <section class="card free-banner">
      <h2>Your complete analysis &mdash; free</h2>
      <p>No &ldquo;Question #14 reveals something rare about you&rdquo; emails. No blurred charts, no &ldquo;unlock your full report&rdquo;. Everything we know is on this page.</p>
    </section>

    <section class="card" aria-label="Your strengths">
      <h2 class="h3" style="margin-bottom:12px">Your strengths</h2>
      <div class="strengths">
        ${strengths(ITEMS, answers, seconds, CATEGORIES)
          .map((s) => `<div class="strength"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`)
          .join('')}
      </div>
    </section>

    <section class="card profile" aria-label="Profile">
      <h2 class="h3">What the numbers say</h2>
      <p style="margin-top:8px">${esc(overallProfile(r.iq))}</p>
      ${pct >= 50 ? `<p>Put another way: on puzzles like these, you would likely outscore about <b>${pct} of every 100 people</b>.</p>` : ''}
      <h3>People in your range often enjoy</h3>
      <ul class="traits">${rangeTraits(r.iq).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${catProfiles}
    </section>

    <section class="card" aria-label="Hard questions you cracked">
      <h2 class="h3" style="margin-bottom:10px">Hard ones you cracked</h2>
      ${hard}
    </section>

    <details class="card review">
      <summary>Review every question</summary>
      ${review}
    </details>

    <section class="card share-card" aria-label="Share">
      <h2 class="h3" style="margin-bottom:10px">Share these results</h2>
      <div class="share-row"><button type="button" class="btn primary" id="share-btn">Copy share link</button></div>
      <p class="share-status" id="share-status" role="status"></p>
      <input class="link-input" id="share-link" type="text" readonly hidden aria-label="Share link">
    </section>

    <div class="actions">
      ${readonly ? '<button type="button" class="btn primary" id="take-btn2">Take the test yourself</button>' : '<button type="button" class="btn" id="again-btn">Back to start</button>'}
    </div>

    <section class="about" aria-label="About this test">
      <h2>About this test</h2>
      <p>The 30 questions are original, built from published construction rules: the matrix rules follow those used in the Open Matrices Item Bank and Sandia Matrices research, and the spatial puzzles are standard cube-net and mental-rotation tasks.</p>
      <p>Difficulty is estimated, not normed on a population, so the score is a rough estimate for fun. It is not a clinical assessment and says nothing about your worth, your intelligence in everyday life, or what you can learn next.</p>
    </section>`;

  show('results');
  focusHeading($('#res-title'));

  const link = () =>
    `${location.origin}${location.pathname}#r=${encodeShare({ version: ITEMS_VERSION, name, answers, seconds })}`;
  $('#share-btn').addEventListener('click', async () => {
    const url = link();
    const input = $('#share-link');
    const status = $('#share-status');
    if (await copyText(url)) {
      status.textContent = 'Link copied.';
      input.hidden = true;
    } else {
      status.textContent = 'Copy this link:';
      input.value = url;
      input.hidden = false;
      input.focus();
      input.select();
    }
  });
  const takeIt = () => {
    history.replaceState(null, '', location.pathname + location.search);
    showIntro();
    focusHeading($('#intro-title'));
  };
  for (const id of ['#take-btn', '#take-btn2']) $(id)?.addEventListener('click', takeIt);
  $('#again-btn')?.addEventListener('click', () => {
    showIntro();
    focusHeading($('#intro-title'));
  });
}

// ---------- tooltip ----------
function setupTooltip() {
  const tip = $('#tip');
  const place = (x, y) => {
    tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, x + 12))}px`;
    tip.style.top = `${Math.max(8, y - tip.offsetHeight - 12)}px`;
  };
  const showTip = (el, x, y) => {
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    place(x, y);
  };
  const hideTip = () => (tip.hidden = true);
  const results = $('#results');
  results.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) showTip(el, e.clientX, e.clientY);
  });
  results.addEventListener('pointermove', (e) => {
    if (!tip.hidden && e.target.closest('[data-tip]')) place(e.clientX, e.clientY);
  });
  results.addEventListener('pointerout', (e) => {
    if (e.target.closest('[data-tip]')) hideTip();
  });
  results.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) {
      const r = el.getBoundingClientRect();
      showTip(el, r.left + r.width / 2, r.top);
    }
  });
  results.addEventListener('focusout', hideTip);
}

// ---------- wiring ----------
function wire() {
  $('#start-form').addEventListener('submit', (e) => {
    e.preventDefault();
    startNew($('#name').value);
  });
  $('#resume-btn').addEventListener('click', () => {
    if (!state) return;
    current = state.current;
    if (remainingSecs() <= 0) return finish();
    enterTest();
  });
  $('#results-btn').addEventListener('click', () => state && showOwnResults());

  $('#q-options').addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (b) select(Number(b.dataset.i));
  });
  $('#palette').addEventListener('click', (e) => {
    const b = e.target.closest('.pal');
    if (b) go(Number(b.dataset.i));
  });
  $('#prev-btn').addEventListener('click', () => go(current - 1));
  $('#next-btn').addEventListener('click', () => go(current + 1));

  $('#finish-btn').addEventListener('click', () => {
    const left = state.answers.filter((a) => a < 0).length;
    $('#finish-text').textContent = left
      ? `You have ${left} unanswered question${left === 1 ? '' : 's'}, and unanswered counts as wrong. Finish anyway?`
      : 'All questions answered. Finish and see your results?';
    $('#finish-confirm').hidden = false;
    $('#finish-yes').focus();
  });
  $('#finish-no').addEventListener('click', () => ($('#finish-confirm').hidden = true));
  $('#finish-yes').addEventListener('click', finish);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('#test').hidden || !state || state.done) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (/^[1-9]$/.test(e.key)) {
      select(Number(e.key) - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      go(current + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      go(current - 1);
      e.preventDefault();
    }
  });

  // Returning to a backgrounded tab: re-check the clock immediately.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('#test').hidden) tick();
  });
  window.addEventListener('hashchange', route);
  setupTooltip();
}

// ---------- routing ----------
function route() {
  const hash = location.hash;
  if (/^#r=/.test(hash)) {
    const data = decodeShare(hash, {
      version: ITEMS_VERSION,
      count: TOTAL,
      optionCounts: ITEMS.map((it) => it.options.length),
    });
    if (data) {
      stopTimer();
      renderResults({ name: data.name, answers: data.answers, seconds: data.seconds, readonly: true });
      return;
    }
    history.replaceState(null, '', location.pathname + location.search);
    showIntro('That results link is damaged or from an older version of the test, so it cannot be shown.');
    return;
  }
  showIntro();
}

wire();
route();
