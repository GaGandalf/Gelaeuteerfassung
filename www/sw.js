// Offline-Cache für die Geläut-Erfassung
// Bei neuen oder umbenannten Dateien die Liste ergänzen und CACHE hochzählen.
const CACHE = 'gelaeut-v18';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'jszip.min.js',
  'js/daten.js', 'js/rechnung.js', 'js/motive.js', 'js/spektrum.js', 'js/aufnahme.js', 'js/app.js', 'js/export.js', 'js/klanganalyse.js', 'js/start.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/glocke.png',
];
// Beim Installieren am Browser-Cache vorbei laden, damit keine veralteten Dateien abgelegt werden
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// Netz zuerst und immer beim Server nachfragen (no-cache), damit Updates sofort ankommen; offline aus dem Cache
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request)),
  );
});
