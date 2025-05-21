// Service worker básico sin caché para evitar problemas de actualización
self.addEventListener('install', event => {
  // Activación inmediata
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Tomar control de las páginas inmediatamente
  event.waitUntil(self.clients.claim());
});
