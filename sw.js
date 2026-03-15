// Body Tracker Pro — Service Worker v2
const CACHE_NAME = 'bodytracker-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err =>
        console.warn('SW: alguns assets não cacheados:', err)
      )
    )
  );
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase — sempre network, nunca cachear
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('identitytoolkit') ||
    event.request.method !== 'GET'
  ) return;

  // Fonts + CDN — cache first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => cached ||
        fetch(event.request).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          return res;
        })
      )
    );
    return;
  }

  // index.html — network first, fallback cache
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/body-tracker/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
});

// ── PUSH (server-side push, futuro) ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || '💪 Body Tracker', {
      body: data.body || '',
      icon: 'https://em-content.zobj.net/source/apple/354/flexed-biceps_1f4aa.png',
      badge: 'https://em-content.zobj.net/source/apple/354/flexed-biceps_1f4aa.png',
      tag: data.tag || 'bodytracker',
      renotify: true,
      data: { url: data.url || './' }
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const focused = list.find(c => c.focused);
      if (focused) return focused.focus();
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});
