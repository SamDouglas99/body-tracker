// Body Tracker Pro — Service Worker v2
const CACHE_NAME = 'bodytracker-v7';

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

function swDbOpen() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('bt-sync', 2);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true }); if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
// Enfileira um registro rápido no IndexedDB (o app aplica ao abrir / ao receber 'bt-drain')
function swQueueAdd(item) {
  return swDbOpen().then(db => new Promise(res => { try { const tx = db.transaction('queue', 'readwrite'); tx.objectStore('queue').add(Object.assign({ ts: Date.now() }, item)); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } })).catch(() => false);
}
function swKvGet(k) {
  return swDbOpen().then(db => new Promise(res => { try { const g = db.transaction('kv', 'readonly').objectStore('kv').get(k); g.onsuccess = () => res(g.result && g.result.v); g.onerror = () => res(null); } catch (e) { res(null); } })).catch(() => null);
}
// Fase 2: grava DIRETO no Supabase (RPC), usando a sessão que o app salvou no kv. Retorna true se gravou.
async function swRestWrite(item) {
  try {
    const auth = await swKvGet('auth');
    if (!auth || !auth.url || !auth.token) return false;
    const n = new Date();
    const today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    let fn, body;
    if (item.type === 'water') { fn = 'bt_add_water'; body = { p_day: today, p_ml: (parseInt(item.ml) || 0) }; }
    else if (item.type === 'meal') { if (typeof item.idx !== 'number' || item.idx < 0) return false; fn = 'bt_set_meal'; body = { p_day: today, p_key: 'meal_' + item.idx }; }
    else return false;
    const r = await fetch(auth.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'apikey': auth.anon, 'Authorization': 'Bearer ' + auth.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok;
  } catch (e) { return false; }
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
  // Botões de registro rápido → grava no banco (app fechado); reserva: enfileira p/ aplicar ao abrir
  if (act && (act.indexOf('water+') === 0 || act === 'meal-done')) {
    event.waitUntil((async () => {
      let item, confirmBody;
      if (act.indexOf('water+') === 0) { const ml = parseInt(act.split('+')[1]) || 0; item = { type: 'water', ml }; confirmBody = '+' + ml + ' ml de água registrados'; }
      else { item = { type: 'meal', idx: (typeof d.mealIdx === 'number' ? d.mealIdx : null) }; confirmBody = 'Refeição marcada como feita'; }
      const wrote = await swRestWrite(item);      // Fase 2: grava direto no banco
      if (!wrote) await swQueueAdd(item);          // reserva: app aplica ao abrir
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(c => { try { c.postMessage({ type: 'bt-drain' }); } catch (e) {} }); // fila vazia se já gravou (no-op)
      try { await self.registration.showNotification('✓ Registrado', { body: confirmBody, tag: 'bt-confirm', icon: ICON, badge: ICON }); } catch (e) {}
    })());
    return;
  }
  // Toque no corpo (ou iOS, sem botões) → abre/foca o app JÁ registrando
  const intent = d.type === 'water' ? 'water' : (d.type === 'meal' ? ('meal:' + (typeof d.mealIdx === 'number' ? d.mealIdx : '')) : '');
  const url = (d.url || './') + (intent ? ('?btreg=' + encodeURIComponent(intent)) : '');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const c = list.find(x => x.focused) || list[0];
      if (c) { try { if (intent) c.postMessage({ type: 'btreg', intent }); } catch (e) {} return c.focus(); }
      return clients.openWindow(url);
    })
  );
});
