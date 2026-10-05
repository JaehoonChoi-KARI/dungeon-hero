// Offline support: serve from cache right away, refresh the cache in the background.
// A game update shows up on the launch after the one that downloaded it.

const CACHE = 'dungeon-hero-1.0.0'; // keep in sync with VERSION in js/data.js
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/data.js',
  './js/input.js',
  './js/audio.js',
  './js/save.js',
  './js/sprites.js',
  './js/hero.js',
  './js/keyboard-view.js',
  './js/battle.js',
  './js/hud.js',
  './js/touch.js',
  './js/screens.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  // 'reload' skips the browser's HTTP cache so a new version never caches old files
  const requests = ASSETS.map(url => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const network = fetch(req);
  event.waitUntil(
    network
      .then(res => (res.ok ? caches.open(CACHE).then(c => c.put(req, res.clone())) : null))
      .catch(() => {}),
  );
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => cached || network.then(res => res.clone())),
  );
});
