// Service worker: aplicația merge și fără internet, iar notificările deschid ședința.
// Când modifici fișierele aplicației, crește numărul versiunii de mai jos.

const VERSION = 'agenda-v3';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/bio.js',
  'js/crypto.js',
  'js/github.js',
  'js/model.js',
  'js/parser.js',
  'js/storage.js',
  'js/store.js',
  'js/timer.js',
  'js/ui.js',
  'js/util.js',
  'js/voice.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/badge-96.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      if (req.mode === 'navigate') return cache.match('index.html');
      throw new Error('offline');
    }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const open = e.notification.data?.open || '#/agenda';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === location.origin) {
        await c.focus();
        c.postMessage({ open });
        return;
      }
    }
    await self.clients.openWindow(`./${open}`);
  })());
});
