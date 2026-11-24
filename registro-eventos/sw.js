// Service worker de "Registro de eventos" (PWA instalable).
//
// Estrategia NETWORK-FIRST: si hay conexión sirve la versión más nueva y la
// guarda en caché; sin conexión, sirve la última copia guardada.
// Los datos de usuario están en localStorage y NO se tocan aquí.
//
// Este service worker vive en /registro-eventos/ y tiene su propio caché
// ("registro-eventos-*"), separado de la app de presupuestos del directorio raíz.

const VERSION = 'v1';
const CACHE = `registro-eventos-${VERSION}`;
const PREFIJO = 'registro-eventos-';

// Archivos mínimos para abrir la app sin conexión. El resto se guarda al navegar.
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // Borra solo cachés de esta app de versiones anteriores.
      const claves = await caches.keys();
      await Promise.all(
        claves
          .filter((k) => k.startsWith(PREFIJO) && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  const url = new URL(req.url);

  // Solo GET del mismo origen.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(req)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        const cacheada = await caches.match(req);
        if (cacheada) return cacheada;
        if (req.mode === 'navigate') {
          return (await caches.match('./index.html')) ?? Response.error();
        }
        return Response.error();
      }),
  );
});
