// Body Tracker Pro — Service Worker
// Versão do cache — incremente quando fizer deploy novo
const CACHE_NAME = 'bodytracker-v1';

// Arquivos para cachear (offline first)
const STATIC_ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap',
];

// ── INSTALL: cacheia os arquivos estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: alguns assets não foram cacheados:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: remove caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: cache-first para assets, network-first para Firebase ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase e APIs externas — sempre network
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    event.request.method !== 'GET'
  ) {
    return; // deixa passar normalmente
  }

  // Fonts e CDN — cache first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // index.html — network first, fallback to cache
  if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || '💪 Body Tracker';
  const options = {
    body: data.body || 'Hora de agir!',
    icon: 'https://em-content.zobj.net/source/apple/354/flexed-biceps_1f4aa.png',
    badge: 'https://em-content.zobj.net/source/apple/354/flexed-biceps_1f4aa.png',
    tag: data.tag || 'bodytracker',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});
