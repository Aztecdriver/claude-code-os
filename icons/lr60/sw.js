// Bump CACHE when shipping changes so phones pick up the new files.
const CACHE = 'lr60-v1';
const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
const SHELL = ['./', 'index.html', 'app.enc.json', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).then(() => c.add(new Request(FONTS, { mode: 'cors' })).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lr60-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates land quickly; fall back to cache when offline.
// Font files are fetched from another origin and cached here the first time they load.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
