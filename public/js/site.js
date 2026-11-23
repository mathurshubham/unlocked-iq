// Site chrome: header, footer, theme toggle, service worker registration.
// Loaded on every page as <script type="module" src="/js/site.js">.
// Contract: pages have <div id="site-header"></div> and <div id="site-footer"></div>.
// <body class="focus"> renders a logo-only header and no footer.

const THEME_KEY = 'unlocked:theme';
const MODES = ['system', 'light', 'dark'];

function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return MODES.includes(v) ? v : 'system';
  } catch { return 'system'; }
}
function writeTheme(mode) {
  try {
    if (mode === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch { /* storage blocked: theme applies for this page only */ }
}
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#0E0E1C' : '#FBFAF7';
  document.head.appendChild(meta);
}

// Apply as early as possible (module scripts run after parse, before first paint in most cases).
let mode = readTheme();
applyTheme(mode);
document.documentElement.classList.add('js');

const LOGO_MARK = (() => {
  // 3x3 grid of rounded squares; bottom-right is an open (dashed) outline: the missing piece.
  const cells = [];
  const size = 7.6;
  const gap = 2.7;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = 1 + c * (size + gap);
      const y = 1 + r * (size + gap);
      if (r === 2 && c === 2) {
        cells.push(`<rect class="lm-open" x="${x + 1.2}" y="${y + 1.2}" width="${size - 2.4}" height="${size - 2.4}" rx="1.8"/>`);
      } else {
        const cls = (r === 1 && c === 1) ? 'lm-accent' : 'lm-on';
        cells.push(`<rect class="${cls}" x="${x}" y="${y}" width="${size}" height="${size}" rx="2.2"/>`);
      }
    }
  }
  return `<svg class="logo-mark" viewBox="0 0 30 30" aria-hidden="true" focusable="false">${cells.join('')}</svg>`;
})();

const ICON = {
  system: '<svg class="ti ti-system" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg class="ti ti-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  dark: '<svg class="ti ti-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  menu: '<svg class="mi-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><svg class="mi-close" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
};

const NAV = [
  { href: '/practice', label: 'Practice' },
  { href: '/science', label: 'How it works' },
  { href: '/faq', label: 'FAQ' },
];

function pathNow() {
  const p = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return p.length > 1 ? p.replace(/\/$/, '') : p;
}

function logoHTML() {
  return `<a class="logo" href="/" aria-label="Unlocked IQ, home">${LOGO_MARK}<span class="logo-word">Unlocked<span> IQ</span></span></a>`;
}

function themeLabel(m) {
  const next = MODES[(MODES.indexOf(m) + 1) % MODES.length];
  return `Theme: ${m}. Switch to ${next}.`;
}

function renderHeader(host, focus) {
  const here = pathNow();
  const cur = (href) => (here === href ? ' aria-current="page"' : '');
  const links = NAV.map((n) => `<a href="${n.href}"${cur(n.href)}>${n.label}</a>`).join('');
  const toggle = `<button type="button" class="icon-btn theme-toggle" data-mode="${mode}" aria-label="${themeLabel(mode)}" title="Change theme">${ICON.system}${ICON.light}${ICON.dark}</button>`;
  const body = document.body;

  if (focus) {
    host.innerHTML = `<header class="site-header site-header--focus"><div class="container site-header-inner">${logoHTML()}<div class="header-actions">${toggle}</div></div></header>`;
  } else {
    host.innerHTML = `
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container site-header-inner">
    ${logoHTML()}
    <nav class="site-nav" aria-label="Main">${links}<a class="btn btn-primary btn-sm" href="/test"${cur('/test')}>Take the test</a></nav>
    <div class="header-actions">
      ${toggle}
      <button type="button" class="icon-btn menu-btn" aria-expanded="false" aria-controls="mobile-nav" aria-label="Menu">${ICON.menu}</button>
    </div>
  </div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="Main (mobile)" hidden>
    <ul>${NAV.map((n) => `<li><a href="${n.href}"${cur(n.href)}>${n.label}</a></li>`).join('')}</ul>
    <a class="btn btn-primary btn-lg" href="/test">Take the free test</a>
  </nav>
</header>`;
  }
  if (focus) body.classList.add('focus');

  const header = host.querySelector('.site-header');
  const btn = host.querySelector('.theme-toggle');
  btn.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    writeTheme(mode);
    applyTheme(mode);
    btn.dataset.mode = mode;
    btn.setAttribute('aria-label', themeLabel(mode));
  });

  const menu = host.querySelector('.menu-btn');
  const panel = host.querySelector('#mobile-nav');
  if (menu && panel) {
    const setOpen = (open) => {
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
      panel.hidden = !open;
    };
    menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { setOpen(false); menu.focus(); }
    });
    matchMedia('(min-width: 820px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  if (!focus && header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }
}

function renderFooter(host) {
  const year = new Date().getFullYear();
  host.innerHTML = `
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        ${logoHTML()}
        <p>The IQ test with nothing locked. Full results, explained, for free.</p>
      </div>
      <ul class="footer-nav" role="list">
        <li><a href="/about">About</a></li>
        <li><a href="/science">Science</a></li>
        <li><a href="/faq">FAQ</a></li>
        <li><a href="/privacy">Privacy</a></li>
        <li><a href="/practice">Practice</a></li>
      </ul>
      <div><span class="footer-promise">${ICON.lock} No paywall. Ever.</span></div>
    </div>
    <div class="footer-legal">
      <span>&copy; ${year} Unlocked IQ. A score here is an estimate for fun, not a clinical assessment.</span>
      <span>No cookies. No ads. Anonymous usage counts only.</span>
    </div>
  </div>
</footer>`;
}

function init() {
  const focus = document.body.classList.contains('focus');
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main';
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

  const h = document.getElementById('site-header');
  if (h) renderHeader(h, focus);
  const f = document.getElementById('site-footer');
  if (f && !focus) renderFooter(f);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Follow the OS theme live while in "system" mode (updates theme-color meta).
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (mode === 'system') applyTheme('system'); });

// Offline app shell.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* optional */ });
  });
}
