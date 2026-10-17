// Este archivo solo existe para reemplazar el worker viejo.
// Ese worker interceptaba cada carga y Chrome mostraba
// "This page couldn't load" al abrir Monitoreo.
// Aqui no hay fetch: al activarse se borra solo.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.map((clave) => caches.delete(clave))))
      .then(() => self.registration.unregister()),
  )
})
