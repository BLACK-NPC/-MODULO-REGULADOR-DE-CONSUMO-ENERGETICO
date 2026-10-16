// Service worker minimo para poder instalar la PWA.
// No intercepta fetch: si lo hace y la red falla, Chrome muestra
// "This page couldn't load" al abrir pantallas como Monitoreo.
const CACHE_NAME = 'vientodux-v4'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((clave) => clave !== CACHE_NAME).map((clave) => caches.delete(clave))),
    ).then(() => self.clients.claim()),
  )
})
