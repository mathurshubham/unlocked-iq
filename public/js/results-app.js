// /results and /r/:id: load a result (API id, #r= hash or local state), then render the full free analysis.
import { buildItem, buildForm, CATEGORY_LABELS } from './engine.js';
import { score } from './scoring.js';
import { ITEMS as V1_ITEMS } from './items.js';
import { categoryProfile, overallProfile, rangeTraits, strengths } from './profile.js';
import { encodeShare, decodeShare, validatePayload } from './share.js';
import { loadState, saveState, toPayload, isMine } from './state.js';
import { getResult, postResult, fetchCardBlob, track } from './api.js';
import { bellSvg, barsSvg, attachTooltips } from './charts.js';
import { renderCard, downloadBlob } from './card.js';
import { $, $$, esc, fmtDuration, reducedMotion, announce, copyText, ICON } from './ui.js';

const app = $('#main');
const LABELS = CATEGORY_LABELS;
const ORDER = ['matrix', 'spatial', 'series'];

// ---------------- helpers ----------------
const itemCache = new Map();
function itemFor(tid, seed) {
  const key = `${tid}:${seed}`;
  if (!itemCache.has(key)) itemCache.set(key, buildItem(tid, seed));
  return itemCache.get(key);
}
const optionCount = (tid, seed) => {
  try {
    return itemFor(tid, seed).options.length;
  } catch {
    return NaN;
  }
};
// v1 links index answers by the frozen v1 order (not buildForm(0), which calibration can reorder).
const v1Tids = () => V1_ITEMS.map((it) => it.id);

function view(html, title) {
  app.innerHTML = html;
  if (title) document.title = title;
  window.scrollTo(0, 0);
}

function messageView({ eyebrow, title, text, actions = '' }) {
  view(
    `<section class="res-msg card" aria-labelledby="res-h">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1 class="h2" id="res-h" tabindex="-1">${esc(title)}</h1>
      <p class="muted">${esc(text)}</p>
      <div class="cluster">${actions}</div>
    </section>`,
    `${title} | Unlocked IQ`,
  );
  $('#res-h')?.focus({ preventScroll: true });
}

// ---------------- loading ----------------
async function load() {
  const metaId = document.querySelector('meta[name="result-id"]')?.getAttribute('content')?.trim() || '';
  const local = loadState();

  if (metaId) {
    if (local?.done && local.resultId === metaId) {
      return { payload: toPayload(local), id: metaId, mine: true, local };
    }
    const r = await getResult(metaId);
    if (r.status === 'ok') {
      const payload = validatePayload(r.payload);
      if (!payload) return { error: 'invalid' };
      return { payload, id: metaId, mine: isMine(local, payload, metaId), local };
    }
    return { error: r.status === 'missing' ? 'missing' : 'network', id: metaId };
  }

  if (/^#r=/.test(location.hash)) {
    const payload = decodeShare(location.hash, { v1Tids: v1Tids(), optionCount });
    if (!payload) return { error: 'invalid' };
    return { payload, id: null, mine: isMine(local, payload), local };
  }

  if (local?.done) {
    return { payload: toPayload(local), id: local.resultId, mine: true, local };
  }
  return { error: 'empty' };
}

// ---------------- main ----------------
async function main() {
  const res = await load();
  if (res.error) return showError(res);

  let items;
  try {
    items = res.payload.tids.map((t) => itemFor(t, res.payload.seed));
    if (!res.payload.a.every((a, i) => a < items[i].options.length)) throw new Error('range');
  } catch {
    return showError({ error: 'invalid' });
  }
  render({ ...res, items });
}

function showError({ error, id }) {
  const take = '<a class="btn btn-primary" href="/test">Take the test</a>';
  if (error === 'empty') {
    return messageView({
      eyebrow: 'Results',
      title: 'No result to show yet',
      text: 'Finish the test to see your estimate, strengths and a full explained review. It is all free.',
      actions: `${take}<a class="btn btn-ghost" href="/practice">Practice first</a>`,
    });
  }
  if (error === 'missing') {
    return messageView({
      eyebrow: 'Results',
      title: 'We could not find that result',
      text: 'The link may be mistyped, or the result was never saved. You can take the test and get your own in about 25 minutes.',
      actions: take,
    });
  }
  if (error === 'network') {
    messageView({
      eyebrow: 'Results',
      title: 'Could not load this result',
      text: 'The connection dropped or the server is busy. Your result is safe. Try again in a moment.',
      actions: `<button type="button" class="btn btn-primary" id="retry">Try again</button>${take}`,
    });
    $('#retry').addEventListener('click', () => {
      view('<div class="res-loading" role="status">Loading your results&hellip;</div>');
      main();
    });
    void id;
    return;
  }
  messageView({
    eyebrow: 'Results',
    title: 'This results link cannot be shown',
    text: 'It looks damaged or incomplete. Ask the sender to share it again, or take the test yourself.',
    actions: take,
  });
}

// ---------------- render ----------------
function render({ payload, id, mine, items, local }) {
  const r = score(items, payload.a);
  const name = payload.n || '';
  const pct = Math.min(99, Math.max(1, Math.round(r.percentile)));
  const secs = payload.secs;
  const quick = payload.mode === 'quick';
  const title = name ? `${esc(name)}’s results` : mine ? 'Your results' : 'Results';
  const possessive = name ? `${name}’s` : 'this';

  document.title = name ? `${name} scored ${r.iq} on Unlocked IQ` : `IQ result: ${r.iq} | Unlocked IQ`;

  const catProfiles = ORDER.filter((k) => r.byCategory[k])
    .map((k) => {
      const c = r.byCategory[k];
      const p = c.total ? (c.correct / c.total) * 100 : 0;
      return `<div class="res-cat"><h4>${esc(LABELS[k])} <span class="muted">&middot; ${c.correct} of ${c.total}</span></h4><p>${esc(categoryProfile(k, p))}</p></div>`;
    })
    .join('');

  const hard = r.hardest.length
    ? `<ul class="res-hard">${r.hardest
        .map((h) => {
          const it = items[h.index - 1];
          const p = Math.max(1, Math.round(h.pAvg * 100));
          return `<li><span class="res-hard-p"><strong>${p}%</strong><span>get it right</span></span>
            <span class="res-hard-t"><strong>Question ${h.index}</strong><span class="muted small">${esc(LABELS[it.category] || '')}</span></span></li>`;
        })
        .join('')}</ul>
      <p class="small muted">Yes, these are the hard ones, and no, nobody is charging you to hear about them.</p>`
    : `<p>None of the hardest questions this time, and that is fine. They are hard on purpose. Everyone gets stuck somewhere.</p>`;

  const strengthCards = strengths(items, payload.a, secs, LABELS)
    .map((s) => `<div class="strength"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`)
    .join('');

  const review = items
    .map((it, i) => {
      const a = payload.a[i];
      const ok = a === it.answer;
      const state = ok ? 'ok' : a < 0 ? 'skip' : 'bad';
      const tag = ok
        ? '<span class="tag ok">Correct</span>'
        : a < 0
          ? '<span class="tag skip">Skipped</span>'
          : '<span class="tag bad">Missed</span>';
      const fig = (idx) => `<div class="box">${it.options[idx]}</div>`;
      const pair = ok
        ? `<div class="rv-opt right"><div class="cap">Your answer (correct)</div>${fig(a)}</div>`
        : `${
            a >= 0
              ? `<div class="rv-opt wrong"><div class="cap">Your answer</div>${fig(a)}</div>`
              : '<div class="rv-opt"><div class="cap">Your answer</div><div class="box box-empty">Skipped</div></div>'
          }
           <div class="rv-opt right"><div class="cap">Correct answer</div>${fig(it.answer)}</div>`;
      return `<details class="rv" data-state="${state}"${ok ? '' : ' open'}>
        <summary><span class="rv-num">Question ${i + 1}</span>${tag}<span class="muted small rv-cat">${esc(LABELS[it.category] || '')}</span></summary>
        <div class="rv-body">
          <p class="small rv-prompt">${esc(it.prompt)}</p>
          ${it.stem ? `<div class="rv-stem">${it.stem}</div>` : ''}
          <div class="rv-pair">${pair}</div>
          ${it.explanation ? `<p class="rv-expl"><strong>Why:</strong> ${esc(it.explanation)}</p>` : ''}
        </div>
      </details>`;
    })
    .join('');
  const missed = items.filter((it, i) => payload.a[i] !== it.answer).length;

  const burst = Array.from({ length: 16 }, (_, i) => {
    const ang = (i / 16) * 360 + (i % 2 ? 8 : -6);
    const dist = 90 + ((i * 37) % 60);
    return `<i class="p p${i % 3}" style="--a:${ang}deg;--r:${dist}px;--dl:${(i % 4) * 30}ms"></i>`;
  }).join('');

  app.innerHTML = `
    ${
      mine
        ? ''
        : `<div class="res-banner" role="note">
        <span>You are viewing ${esc(possessive)} result. It is read-only.</span>
        <a class="btn btn-primary btn-sm" href="/test">Take the test yourself</a>
      </div>`
    }
    <p class="eyebrow">${mine ? 'All done' : 'Shared result'}</p>
    <h1 class="h1 res-title" id="res-h" tabindex="-1">${title}</h1>

    <section class="card res-hero" id="res-hero" aria-label="Summary">
      <div class="res-glow" aria-hidden="true"></div>
      <div class="res-burst" id="res-burst" aria-hidden="true">${burst}</div>
      <p class="eyebrow">Estimated IQ</p>
      <div class="res-iq"><span class="visually-hidden">${r.iq}</span><span id="iq-num" aria-hidden="true">${r.iq}</span></div>
      <p class="res-range">Likely between <strong>${r.low}&ndash;${r.high}</strong> <span class="muted">(90% range)</span></p>
      <p class="res-pct">${pct >= 50 ? `Higher than <strong>${pct}%</strong> of people` : `Percentile <strong>${pct}</strong>`}</p>
      <dl class="res-stats">
        <div><dt>Correct</dt><dd>${r.correct}<span class="muted">/${r.total}</span></dd></div>
        <div><dt>Time</dt><dd>${fmtDuration(secs)}</dd></div>
        <div><dt>Format</dt><dd class="res-mode">${quick ? 'Quick' : 'Standard'}</dd></div>
      </dl>
      <p class="small muted res-note">An estimate for fun, not a diagnosis.${quick ? ' Based on 15 adaptive questions, so the range is wider than the standard test.' : ''} Everything on this page is free: no email, no paywall.</p>
    </section>

    <section class="card res-share" id="share" aria-labelledby="share-h">
      <h2 class="h3" id="share-h">Share this result</h2>
      <div class="share-link">
        <label class="visually-hidden" for="share-input">Share link</label>
        <input id="share-input" type="text" readonly value="">
        <button type="button" class="btn btn-primary" id="copy-btn">${ICON.link}<span>Copy link</span></button>
      </div>
      <div class="cluster share-btns">
        <button type="button" class="btn" id="native-btn" hidden>${ICON.share}<span>Share&hellip;</span></button>
        <a class="btn" id="wa-btn" href="#" target="_blank" rel="noopener noreferrer">${ICON.whatsapp}<span>WhatsApp</span></a>
        <button type="button" class="btn" id="card-btn">${ICON.download}<span>Download card</span></button>
      </div>
      <p class="small share-status" id="share-status" role="status" aria-live="polite"></p>
    </section>

    <section class="card" aria-labelledby="bell-h">
      <h2 class="h3" id="bell-h">Where that sits</h2>
      <div class="reveal" data-reveal>${bellSvg({ iq: r.iq, low: r.low, high: r.high })}</div>
      <p class="chart-cap">Average is 100; about two thirds of people land between 85 and 115. The shaded band is the 90% range. Hover the curve to read it.</p>
    </section>

    <section class="card" aria-labelledby="cat-h">
      <h2 class="h3" id="cat-h">Percent correct by category</h2>
      <div class="reveal" data-reveal>${barsSvg(r.byCategory, LABELS, ORDER)}</div>
    </section>

    <section aria-labelledby="str-h" class="res-block">
      <h2 class="h3" id="str-h">Strengths</h2>
      <div class="strengths">${strengthCards}</div>
    </section>

    <section class="card profile" aria-labelledby="num-h">
      <h2 class="h3" id="num-h">What the numbers say</h2>
      <p>${esc(overallProfile(r.iq))}</p>
      ${pct >= 50 ? `<p>Put another way: on puzzles like these, you would likely outscore about <strong>${pct} of every 100 people</strong>.</p>` : ''}
      <h3 class="res-sub">People in your range often enjoy</h3>
      <ul class="traits">${rangeTraits(r.iq).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${catProfiles}
    </section>

    <section class="card" aria-labelledby="hard-h">
      <h2 class="h3" id="hard-h">Hard ones you cracked</h2>
      ${hard}
    </section>

    <section class="res-review" aria-labelledby="rev-h">
      <div class="res-rev-head">
        <h2 class="h3" id="rev-h">Review, with explanations</h2>
        <div class="seg-group" role="group" aria-label="Filter questions">
          <button type="button" class="seg on" data-f="all" aria-pressed="true">All ${items.length}</button>
          <button type="button" class="seg" data-f="miss" aria-pressed="false">Missed ${missed}</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="toggle-all">Collapse all</button>
      </div>
      <div class="card res-rv-card" id="rv-list">${review}</div>
    </section>

    <section class="card res-cta" aria-label="What next">
      <div>
        <h2 class="h3">${mine ? 'Want another go?' : 'Curious what you would score?'}</h2>
        <p class="muted">${mine ? 'A fresh set of questions with the same rules, so memorising will not help.' : 'It takes about 25 minutes, or 10 with the quick test. Free, and no email needed.'}</p>
      </div>
      <div class="cluster">
        <a class="btn btn-primary" href="/test${mine && quick ? '?mode=quick' : ''}">${mine ? 'Take it again (new questions)' : 'Take the test yourself'}</a>
        <a class="btn" href="/practice">Practice puzzles</a>
      </div>
    </section>

    <section class="about small muted" aria-label="About this test">
      <h2 class="h3">About this test</h2>
      <p>The questions are original, built from published construction rules: matrix rules as in the Open Matrices Item Bank and Sandia Matrices research, plus standard cube-net and mental-rotation tasks. <a href="/science">How scoring works</a>.</p>
      <p>Difficulty is estimated, not normed on a population, so the score is a rough estimate. It is not a clinical assessment and says nothing about your worth, your everyday intelligence, or what you can learn next.</p>
    </section>`;

  $('#res-h').focus({ preventScroll: true });
  attachTooltips(app);
  wireReveal(r, mine, id, payload);
  wireReview();
  wireShare({ payload, id, mine, r, name, local, quick });
}

// ---------------- reveal animation ----------------
function wireReveal(r, mine, id, payload) {
  const reduced = reducedMotion();
  const numEl = $('#iq-num');
  const hero = $('#res-hero');
  if (reduced) return;

  // count-up
  const to = r.iq;
  const from = Math.max(40, to - 38);
  const dur = 1500;
  const t0 = performance.now();
  numEl.textContent = String(from);
  hero.classList.add('is-counting');
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    numEl.textContent = String(Math.round(from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(step);
    else land();
  };
  const land = () => {
    hero.classList.remove('is-counting');
    hero.classList.add('is-landed');
    if (!mine) return;
    const key = `unlocked:revealed:${id || payload.seed}:${payload.secs}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === '1';
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    if (!seen) $('#res-burst').classList.add('go');
  };
  setTimeout(() => requestAnimationFrame(step), 250);

  // charts draw in when scrolled into view
  const targets = $$('[data-reveal]');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.35 },
  );
  for (const t of targets) {
    t.classList.add('anim');
    io.observe(t);
  }
}

// ---------------- review filters ----------------
function wireReview() {
  const list = $('#rv-list');
  const all = () => $$('details.rv', list);
  const toggle = $('#toggle-all');
  const syncToggle = () => {
    const visible = all().filter((d) => !d.hidden);
    toggle.textContent = visible.every((d) => d.open) ? 'Collapse all' : 'Expand all';
  };
  list.addEventListener('toggle', syncToggle, true);
  toggle.addEventListener('click', () => {
    const visible = all().filter((d) => !d.hidden);
    const open = !visible.every((d) => d.open);
    visible.forEach((d) => (d.open = open));
    syncToggle();
  });
  $('.res-rev-head .seg-group').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    $$('.res-rev-head [data-f]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', String(on));
    });
    all().forEach((d) => (d.hidden = b.dataset.f === 'miss' && d.dataset.state === 'ok'));
    syncToggle();
  });
}

// ---------------- share ----------------
function wireShare({ payload, id: initialId, mine, r, name, local, quick }) {
  let id = initialId;
  const input = $('#share-input');
  const status = $('#share-status');
  const say = (msg) => {
    status.textContent = msg;
    announce(msg);
  };
  const shareUrl = () =>
    id ? `${location.origin}/r/${id}` : `${location.origin}/results#r=${encodeShare(payload)}`;
  const shareText = () =>
    `${name ? `${name} scored` : 'I scored'} ${r.iq} on Unlocked IQ, the free IQ test with nothing locked.`;
  const refresh = () => {
    input.value = shareUrl();
    $('#wa-btn').href = `https://wa.me/?text=${encodeURIComponent(`${shareText()} ${shareUrl()}`)}`;
  };
  refresh();
  if (typeof navigator.share === 'function') $('#native-btn').hidden = false;

  // Own result without a short link (API was down at finish): try once more in the background.
  if (mine && !id && local) {
    postResult(payload).then((got) => {
      if (!got) return;
      id = got;
      local.resultId = got;
      saveState(local);
      refresh();
      try {
        history.replaceState(null, '', `/r/${got}`);
      } catch {
        /* ignore */
      }
    });
  }

  $('#copy-btn').addEventListener('click', async () => {
    track('share_click', { via: 'copy' });
    if (await copyText(shareUrl())) {
      say('Link copied.');
    } else {
      say('Copy the link from the box.');
      input.focus();
      input.select();
    }
  });
  input.addEventListener('focus', () => input.select());

  $('#native-btn').addEventListener('click', async () => {
    track('share_click', { via: 'native' });
    try {
      await navigator.share({ title: 'My Unlocked IQ result', text: shareText(), url: shareUrl() });
    } catch {
      /* dismissed */
    }
  });
  $('#wa-btn').addEventListener('click', () => track('share_click', { via: 'whatsapp' }));

  const cardBtn = $('#card-btn');
  cardBtn.addEventListener('click', async () => {
    cardBtn.disabled = true;
    const label = $('span', cardBtn);
    const old = label.textContent;
    label.textContent = 'Preparing…';
    say('Preparing your card.');
    let blob = id ? await fetchCardBlob(id) : null;
    let source = 'server';
    if (!blob) {
      source = 'client';
      blob = await renderCard({
        name,
        iq: r.iq,
        low: r.low,
        high: r.high,
        percentile: Math.min(99, Math.max(1, Math.round(r.percentile))),
        byCategory: r.byCategory,
        labels: LABELS,
        order: ORDER,
      });
    }
    if (blob) {
      downloadBlob(blob, `unlocked-iq-${r.iq}.png`);
      say('Card downloaded.');
      track('card_download', { source, mode: payload.mode });
    } else {
      say('Could not make the card. Try copying the link instead.');
    }
    label.textContent = old;
    cardBtn.disabled = false;
  });
  void quick;
}

main();
