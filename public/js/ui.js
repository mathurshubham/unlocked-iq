// Small DOM/format helpers shared by the test, results and practice apps.
export { esc } from './charts.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const fmtClock = (secs) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtDuration = (secs) => {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

export function isTyping(target) {
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

// ---- option grid markup (test runner, warm-up, practice) ----
export function optionsMarkup(item, { selected = -1, labelPrefix = 'Option' } = {}) {
  const cols = item.optionCols || 3;
  // Plain-text options (numbers, letters, words) get the big text style; figures keep the figure style.
  const textual = item.options.every((o) => !String(o).trim().startsWith('<'));
  // Detailed figures (3D objects, cube views, folded paper, piece pairs, hidden shapes) need room on phones.
  const tid = String(item.templateId || item.id || '');
  const large = /^[YCPH]\d/.test(tid);
  const twoUp = large || /^E\d/.test(tid);
  const buttons = item.options
    .map(
      (o, i) =>
        `<button type="button" class="opt${textual ? ' opt-text' : ''}" data-i="${i}" aria-pressed="${i === selected}">` +
        `<span class="opt-n" aria-hidden="true">${i + 1}</span>` +
        `<span class="visually-hidden">${labelPrefix} ${i + 1}: </span>` +
        `<span class="opt-fig">${o}</span>` +
        `<span class="opt-mark" aria-hidden="true"></span></button>`,
    )
    .join('');
  const sameScale = /^E\d/.test(tid);
  return `<div class="opts${large ? ' opts-lg' : ''}${sameScale ? ' opts-same' : ''}" style="--cols:${cols};--cols-m:${twoUp ? 2 : Math.min(cols, 3)}" role="group" aria-label="Answer options">${buttons}</div>`;
}

// Inline icons (currentColor).
export const ICON = {
  flag: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 17V3.5M5 4.5h9l-2 3.2 2 3.2H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flagFill: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 17V3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5.5 4.5h8.2l-2 3.2 2 3.2H5.5z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  grid: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="3" width="5.5" height="5.5" rx="1.4"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1.4"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1.4"/><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.4"/></g></svg>',
  arrowL: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M16 10H4.5M9 5l-4.5 5L9 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowR: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 10h11.5M11 5l4.5 5L11 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 12.5V3.5M6.5 6.5L10 3l3.5 3.5M4 10.5v5a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M11.5 8.5a3 3 0 00-4.2 0L4.7 11.1a3 3 0 004.2 4.2l.9-.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 3.5v9M6.5 9.5L10 13l3.5-3.5M4 15.5h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  whatsapp: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 2.8a7.2 7.2 0 00-6.2 10.9L2.8 17.2l3.6-.9A7.2 7.2 0 1010 2.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.4 6.8c.3-.5.7-.4.9 0l.6 1.3c.1.3 0 .5-.2.7l-.4.5c.5 1 1.3 1.8 2.4 2.4l.5-.5c.2-.2.5-.3.7-.1l1.3.7c.4.2.4.6.1 1-.5.7-1.4 1-2.3.6-2.2-.8-4-2.7-4.6-4.8-.2-.6 0-1 .0-1.8z" fill="currentColor"/></svg>',
};

// ---- live regions ----
function liveEl(id, mode) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'visually-hidden';
    el.setAttribute('role', mode === 'assertive' ? 'alert' : 'status');
    el.setAttribute('aria-live', mode);
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  return el;
}
// Re-setting identical text still announces: clear first, then set on the next frame.
export function announce(msg, mode = 'polite') {
  const el = liveEl(mode === 'assertive' ? 'live-assertive' : 'live-polite', mode);
  el.textContent = '';
  setTimeout(() => {
    el.textContent = msg;
  }, 30);
}

// ---- clipboard ----
export async function copyText(text) {
  try {
    // Race a timeout: some browsers leave the promise pending when the page lacks focus.
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
    ]);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch {
      return false;
    }
  }
}

// ---- focus trap for dialogs / drawers ----
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
export function trapTab(container, e) {
  if (e.key !== 'Tab') return;
  const els = $$(FOCUSABLE, container).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

// Slide/fade an element in (Web Animations API), skipped for reduced motion.
export function animateIn(el, dir = 1) {
  if (!el || reducedMotion() || typeof el.animate !== 'function') return;
  el.animate(
    [
      { opacity: 0, transform: `translateX(${dir * 28}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' },
  );
}

export const randomSeed = () => {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] || 1;
  } catch {
    return Math.floor(Math.random() * 0xfffffffe) + 1;
  }
};
