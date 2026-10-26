/* Service worker: guarda la app en caché para que la versión web abra sin internet. */
const CACHE = 'gym-app-v2';
const SHELL = ['./', 'index.html', 'app.js', 'app.css', 'nocturne.css', 'merge.js', 'mannequin.js', 'config.js', 'icon.svg', 'manifest.webmanifest',
  'vendor/react.production.min.js', 'vendor/react-dom.production.min.js', 'vendor/htm.umd.js', 'vendor/three.min.js',
  'vendor/phosphor/regular/style.css', 'vendor/phosphor/fill/style.css', 'vendor/phosphor/bold/style.css'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Red primero (para recibir actualizaciones) y caché si no hay conexión
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
