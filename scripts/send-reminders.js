// Body Tracker — enviador de lembretes push
// Roda no GitHub Actions (de hora em hora). Lê as inscrições de push_subs
// (Firebase Admin) e envia notificações web-push nos horários locais de cada usuário.
const admin = require('firebase-admin');
const webpush = require('web-push');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:samdouglas1208@gmail.com';

if (!VAPID_PUBLIC || !VAPID_PRIVATE) { console.error('Faltam os secrets VAPID_PUBLIC / VAPID_PRIVATE'); process.exit(1); }
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Falta o secret FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Lembretes por HORA LOCAL do usuário (0–23). Ajuste à vontade.
const SLOTS = {
  7:  { title: '☀️ Bom dia, campeão!', body: 'Refeição 1 e suplementos da manhã (D3+K2, B12).' },
  10: { title: '💧 Hora da água',      body: 'Meta de 4L hoje — já bebeu água?' },
  12: { title: '🍛 Almoço',            body: 'Refeição 3 — capriche na proteína e no carboidrato.' },
  15: { title: '🥗 Refeição 4',        body: 'Mantenha o ritmo das refeições.' },
  17: { title: '💧 Beba água',         body: 'Faltam algumas horas pra fechar seus 4L.' },
  18: { title: '💪 Hora do treino?',   body: 'Não perca o estímulo de hoje. Bora!' },
  20: { title: '🌙 Jantar',            body: 'Refeição 5 — quase fechando o dia.' },
  22: { title: '😴 Ceia + sono',       body: 'Refeição 6 e os suplementos do sono.' },
};

function localHourFor(tzOffsetMin) {
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const off = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 180; // padrão UTC-3 (Brasil)
  const localMin = (((utcMin - off) % 1440) + 1440) % 1440;
  return Math.floor(localMin / 60);
}

(async () => {
  console.log('Execução às', new Date().toISOString());
  const snap = await db.collection('push_subs').get();
  let sent = 0, expired = 0, skipped = 0;
  for (const docSnap of snap.docs) {
    const s = docSnap.data();
    if (!s || s.disabled || !s.endpoint || !s.keys) { skipped++; continue; }
    const slot = SLOTS[localHourFor(s.tzOffset)];
    if (!slot) { skipped++; continue; }
    const payload = JSON.stringify({ title: slot.title, body: slot.body, tag: 'reminder', url: './' });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      sent++;
    } catch (err) {
      const code = err.statusCode;
      if (code === 404 || code === 410) {
        await docSnap.ref.set({ disabled: true, expiredAt: Date.now() }, { merge: true }).catch(() => {});
        expired++;
      } else {
        console.error('Falha ao enviar para', docSnap.id, code, (err.body || err.message || '').toString().slice(0, 200));
      }
    }
  }
  console.log(`Enviados: ${sent} · expirados: ${expired} · pulados: ${skipped}`);
})().catch(e => { console.error(e); process.exit(1); });
