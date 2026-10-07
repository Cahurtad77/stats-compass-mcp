// Service worker: cachea la app para usarla sin conexión. Subir VERSION al publicar cambios.
const VERSION = 'bitacora-v1';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest',
  'core/app.js', 'core/db.js', 'core/ui.js', 'modules/finanzas/finanzas.js', 'modules/finanzas/ledger.js'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Red primero (para ver cambios al desarrollar), caché si no hay conexión.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
