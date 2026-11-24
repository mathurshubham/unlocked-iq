// Landing page behaviour: interactive sample puzzle, live takers count, scroll reveals.

const FALLBACK_EXPLANATION =
  'Shapes cycle circle, triangle, square along each diagonal, and the shading goes empty, grey, solid down the rows. So the missing piece is a solid triangle.';

async function loadSampleItem() {
  try {
    const engine = await import('/js/engine.js');
    if (typeof engine.buildItem === 'function') return engine.buildItem('M2', 0, { format: 'v4' });
  } catch { /* engine not available: fall through to the v1 bank */ }
  const { ITEMS } = await import('/js/items.js');
  return ITEMS.find((i) => i.id === 'M2') || ITEMS[0];
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

async function initPuzzle() {
  const root = document.getElementById('sample');
  if (!root) return;
  const stemEl = document.getElementById('sample-stem');
  const optsEl = document.getElementById('sample-options');
  const fbEl = document.getElementById('sample-feedback');
  const promptEl = document.getElementById('sample-prompt');

  let item;
  try { item = await loadSampleItem(); } catch { item = null; }
  if (!item) {
    stemEl.innerHTML = '<div class="puzzle-loading muted small">The sample puzzle could not load. <a href="/practice">Try practice mode</a>.</div>';
    return;
  }

  const explanation = item.explanation || FALLBACK_EXPLANATION;
  const { optionsMarkup, promptMarkup, buzz } = await import('/js/ui.js');
  promptEl.innerHTML = promptMarkup(item.prompt);
  stemEl.innerHTML = item.stem;
  // Four options become answer tiles (2x2); legacy 5-6 option items keep the old grid.
  const tiles = item.options.length === 4;
  optsEl.innerHTML = optionsMarkup(item);
  const buttons = Array.from(optsEl.querySelectorAll('.opt'));

  let done = false;
  function reveal(picked) {
    done = true;
    const right = picked === item.answer;
    buttons.forEach((b, i) => {
      b.disabled = true;
      b.classList.toggle('is-correct', i === item.answer);
      b.classList.toggle('is-wrong', i === picked && !right);
      if (tiles) return;
      if (i === item.answer) b.insertAdjacentHTML('beforeend', `<span class="opt-flag opt-flag--good" aria-hidden="true">${CHECK}</span>`);
      else if (i === picked) b.insertAdjacentHTML('beforeend', `<span class="opt-flag opt-flag--bad" aria-hidden="true">${CROSS}</span>`);
    });
    fbEl.hidden = false;
    fbEl.className = 'puzzle-feedback fade-in ' + (right ? 'is-right' : 'is-miss');
    fbEl.innerHTML = '';
    fbEl.append(
      el('p', 'puzzle-verdict', right ? 'Correct. Nicely spotted.' : `Not quite. The answer is option ${item.answer + 1}.`),
      el('p', 'puzzle-why small', ''),
    );
    fbEl.lastChild.textContent = explanation;
    const row = el('div', 'cluster puzzle-actions');
    row.style.setProperty('--gap', '10px');
    const go = el('a', 'btn btn-primary btn-sm', 'Take the full test');
    go.href = '/test';
    const again = el('button', 'btn btn-ghost btn-sm', 'Try again');
    again.type = 'button';
    again.addEventListener('click', reset);
    row.append(go, again);
    fbEl.appendChild(row);
  }

  function reset() {
    done = false;
    buttons.forEach((b) => {
      b.disabled = false;
      b.classList.remove('is-correct', 'is-wrong');
      b.querySelectorAll('.opt-flag').forEach((f) => f.remove());
    });
    fbEl.hidden = true;
    fbEl.textContent = '';
    buttons[0].focus();
  }

  optsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (!b || done) return;
    buzz();
    reveal(Number(b.dataset.i));
  });
}

async function initTakers() {
  const line = document.getElementById('takers');
  if (!line) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch('/api/stats', { signal: ctl.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json();
    const n = Number(data && data.takers);
    if (!Number.isFinite(n) || n < 20) return;
    line.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = n.toLocaleString('en-US');
    line.append(strong, ' people have taken the test so far.');
    line.hidden = false;
  } catch { /* hide the line on any failure */ }
}

function initReveals() {
  const targets = document.querySelectorAll('.section .section-head, .step, .cat-card, .get-copy, .get-mock-wrap, .compare-wrap, .faq-split, .cta-band');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('reveal-on');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  targets.forEach((t) => { t.classList.add('reveal'); io.observe(t); });
}

initPuzzle();
initTakers();
initReveals();
