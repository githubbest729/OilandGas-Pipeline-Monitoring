/* Service Worker: Oil & Gas Pipeline Monitoring SCADA Field Guide
   Cache-first for static assets, network-then-cache for other same-origin GETs,
   offline.html fallback for navigations. */
const CACHE_NAME = 'og-scada-pwa-v1.0.0';
const BUILD_TIMESTAMP = 'dev'; // replaced by build.js so every release changes this file's bytes
const RUNTIME_CACHE = CACHE_NAME + '-runtime';
const PRECACHE = [
  './',
  'index.html',
  'offline.html',
  'css/styles.css',
  'js/app.js',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.svg',
  'icons/icon-512.svg',
  'icons/icon-maskable.svg',
  'icons/apple-touch-icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'assets/og-image.svg'
];
const CDN_ALLOW = ['https://cdn.jsdelivr.net/npm/three@'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((url) =>
        // 'reload' bypasses the HTTP cache so a new release never precaches stale files
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.indexOf('og-scada-pwa-') === 0 && k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isCdnAllowed(url) {
  return CDN_ALLOW.some((p) => url.indexOf(p) === 0);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isCdnAllowed(req.url)) return;

  // Navigations: cache first, then network, then offline page
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match('index.html'))
        .then((hit) => hit || fetch(req))
        .catch(() => caches.match('offline.html'))
    );
    return;
  }

  // Static assets: cache first, refresh in background when online
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // background refresh for runtime/CDN entries only
        if (!sameOrigin) return hit;
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      }).catch(() => {
        if (req.destination === 'document') return caches.match('offline.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
