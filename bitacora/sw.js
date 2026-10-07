// Service worker: (1) uso sin conexión, (2) recibir fotos compartidas desde WhatsApp u otras apps
// (Web Share Target, Android). Subir VERSION al publicar cambios.
const VERSION = 'bitacora-v3';
const COMPARTIDOS = 'bitacora-compartidos'; // la página los mueve a IndexedDB al abrir la Bandeja
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest',
  'core/app.js', 'core/db.js', 'core/ui.js', 'core/zip.js', 'core/xlsx.js',
  'modules/finanzas/finanzas.js', 'modules/finanzas/ledger.js', 'modules/finanzas/secciones.js', 'modules/finanzas/ia.js', 'modules/finanzas/extractos.js'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== COMPARTIDOS).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

async function recibirCompartido(request) {
  const datos = await request.formData();
  const cache = await caches.open(COMPARTIDOS);
  const texto = [datos.get('title'), datos.get('text'), datos.get('url')].filter(Boolean).join('\n');
  const archivos = datos.getAll('archivos').filter((f) => f && typeof f !== 'string' && f.size);
  const clave = () => new URL(`compartido/${Date.now()}-${Math.random().toString(16).slice(2)}`, self.registration.scope).href;
  for (const f of archivos) {
    await cache.put(clave(), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-nombre': encodeURIComponent(f.name || ''), 'x-texto': encodeURIComponent(texto) } }));
  }
  if (!archivos.length && texto) {
    await cache.put(clave(), new Response(texto, { headers: { 'content-type': 'text/plain', 'x-solo-texto': '1', 'x-texto': encodeURIComponent(texto) } }));
  }
  return Response.redirect(new URL('./#/finanzas/bandeja', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/compartir')) {
    e.respondWith(recibirCompartido(e.request));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Red primero (para ver cambios al desarrollar), caché si no hay conexión.
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
