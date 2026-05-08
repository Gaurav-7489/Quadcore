self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Required to pass PWA install criteria, but we just pass through to network
  // since the app relies on online APIs anyway.
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
