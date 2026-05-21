// Service worker "matador" (kill-switch).
// Reemplaza al service worker viejo de la PWA anterior: limpia sus cachés,
// se desregistra solo y recarga las pestañas para servir la versión nueva.
// NO toca localStorage, así que los presupuestos guardados se conservan.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    // 1) Borrar todas las cachés de la versión anterior.
    const keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    // 2) Desregistrar este service worker.
    await self.registration.unregister();
    // 3) Recargar las pestañas abiertas para que tomen la versión nueva desde la red.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(function (c) { c.navigate(c.url); });
  })());
});
