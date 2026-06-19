// Service worker PWA de Antigravity Presupuestos.
//
// Estrategia NETWORK-FIRST: si hay internet, siempre sirve la última versión
// desde la red (y la guarda en caché). Si no hay internet, sirve la copia
// cacheada. Así la app es instalable y funciona offline, pero NUNCA se queda
// "pegada" en una versión vieja como pasaba antes.
//
// IMPORTANTE: este SW solo cachea archivos de la app. NO toca localStorage,
// por lo que los presupuestos guardados ('antigravity_historial') se conservan
// intactos en cada actualización.
//
// Para forzar un refresco limpio en una nueva versión, subir el número de CACHE.

const CACHE = 'antigravity-v1781827616449'; // auto-bumpeado por dev.js — no editar a mano
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './app.legacy.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    // Borra cachés de versiones anteriores (incluida la PWA vieja).
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        // Guarda una copia fresca en caché para uso offline.
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      })
      .catch(function () {
        // Sin internet: sirve desde caché; para navegación, cae a index.html.
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
