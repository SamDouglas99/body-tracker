// Body Tracker Pro — Service Worker v2
const CACHE_NAME = 'bodytracker-v6';

const STATIC_ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap',
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

  // index.html — network first, SEM cache HTTP (no-store) p/ nunca servir versão velha; fallback cache offline
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/body-tracker/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match(event.request)))
    );
    return;
  }
});

const ICON = 'https://em-content.zobj.net/source/apple/354/flexed-biceps_1f4aa.png';

// Enfileira um registro rápido no IndexedDB (o app aplica ao abrir / ao receber 'bt-drain')
function swQueueAdd(item) {
  return new Promise(res => {
    try {
      const r = indexedDB.open('bt-sync', 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = () => { try { const db = r.result; const tx = db.transaction('queue', 'readwrite'); tx.objectStore('queue').add(Object.assign({ ts: Date.now() }, item)); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } };
      r.onerror = () => res(false);
    } catch (e) { res(false); }
  });
}

// ── PUSH (servidor) — com botões de ação p/ registrar água/refeição sem abrir o app ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const actions = [];
  if (data.type === 'water') actions.push({ action: 'water+250', title: '+250 ml' }, { action: 'water+500', title: '+500 ml' });
  else if (data.type === 'meal') actions.push({ action: 'meal-done', title: 'Marcar feita' });
  event.waitUntil(
    self.registration.showNotification(data.title || '💪 Body Tracker', {
      body: data.body || '',
      icon: ICON,
      badge: ICON,
      tag: data.tag || 'bodytracker',
      renotify: true,
      actions,
      data: { url: data.url || './', type: data.type || null, mealIdx: (typeof data.mealIdx === 'number' ? data.mealIdx : null) }
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  const act = event.action;
  const d = event.notification.data || {};
  event.notification.close();
  // Botões de registro rápido → enfileira + confirma, SEM abrir o app
  if (act && (act.indexOf('water+') === 0 || act === 'meal-done')) {
    event.waitUntil((async () => {
      let item, confirmBody;
      if (act.indexOf('water+') === 0) { const ml = parseInt(act.split('+')[1]) || 0; item = { type: 'water', ml }; confirmBody = '+' + ml + ' ml de água registrados'; }
      else { item = { type: 'meal', idx: (typeof d.mealIdx === 'number' ? d.mealIdx : null) }; confirmBody = 'Refeição marcada como feita'; }
      await swQueueAdd(item);
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(c => { try { c.postMessage({ type: 'bt-drain' }); } catch (e) {} });
      try { await self.registration.showNotification('✓ Registrado', { body: confirmBody, tag: 'bt-confirm', icon: ICON, badge: ICON }); } catch (e) {}
    })());
    return;
  }
  // Toque normal → abre/foca o app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const focused = list.find(c => c.focused);
      if (focused) return focused.focus();
      if (list.length > 0) return list[0].focus();
      return clients.openWindow(d.url || './');
    })
  );
});
