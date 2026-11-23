// Unlocked IQ service worker: offline app shell.
// - Network-first for everything same-origin (so code never goes stale), falling back to cache offline.
// - Never caches /api/*, /og/* or /r/* (always network, never stored).
// - Fonts are cross-origin and skipped.
// Bump CACHE_VERSION whenever the shell changes shape.
const CACHE_VERSION = 'v2';
const CACHE = `unlocked-iq-${CACHE_VERSION}`;

const SHELL = [
  '/', '/test', '/practice', '/results', '/about', '/science', '/faq', '/privacy',
  '/css/base.css', '/css/pages.css', '/css/app.css',
  '/js/site.js', '/js/landing.js',
  '/js/test-app.js', '/js/results-app.js', '/js/practice-app.js',
  '/js/engine.js', '/js/cat.js', '/js/explain.js', '/js/calibration.js', '/js/scoring.js',
  '/js/items.js', '/js/items-matrix.js', '/js/items-spatial.js', '/js/items-series.js',
  '/js/items-figural.js', '/js/items-spatial2.js', '/js/items-numeric.js', '/js/items-extra.js',
  '/js/svg.js', '/js/cube.js', '/js/rng.js',
  '/js/charts.js', '/js/card.js', '/js/share.js', '/js/profile.js', '/js/state.js', '/js/api.js',
  '/favicon.svg', '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Tolerant: a file that does not exist (yet) must not fail the install.
    await Promise.allSettled(SHELL.map(async (url) => {
      const res = await fetch(url, { cache: 'reload' });
      if (res.ok && !res.redirected) await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('unlocked-iq-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function bypass(url) {
  return url.origin !== self.location.origin
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/og/')
    || url.pathname.startsWith('/r/')
    || url.pathname === '/sw.js';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (bypass(url)) return; // default network handling, nothing stored

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && !res.redirected && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = await cache.match('/');
        if (home) return home;
      }
      throw err;
    }
  })());
});
