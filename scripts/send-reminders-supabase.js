// Body Tracker — enviador de lembretes push (versão SUPABASE)
// Roda no GitHub Actions (de hora em hora). Lê push_subs do Supabase com a SERVICE ROLE
// (bypassa RLS) e envia web-push nos horários locais de cada usuário.
// Sem dependência do Supabase SDK: usa a REST API via fetch (Node 20+ tem fetch global).
const webpush = require('web-push');

const SUPABASE_URL   = process.env.SUPABASE_URL;            // https://diztwwgccioldwwngaea.supabase.co
const SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE;  // chave service_role (SEGREDO)
const VAPID_PUBLIC   = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE  = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT  = process.env.VAPID_SUBJECT || 'mailto:samdouglas1208@gmail.com';

// Enquanto os secrets nao estiverem configurados, sai com SUCESSO (nao envia email de falha).
if (!SUPABASE_URL || !SERVICE_ROLE || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.log('Secrets ainda nao configurados (SUPABASE_URL/SUPABASE_SERVICE_ROLE/VAPID_PUBLIC/VAPID_PRIVATE). Robo em espera.');
  process.exit(0);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Modo teste (disparo manual com input test=true): envia uma notificação agora,
// pra todos os inscritos, ignorando o horário dos lembretes.
const TEST = process.env.TEST_PUSH === 'true' || process.env.TEST_PUSH === '1';

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

const H = { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE };

(async () => {
  console.log('Execução às', new Date().toISOString());
  const res = await fetch(SUPABASE_URL + '/rest/v1/push_subs?disabled=eq.false&select=*', { headers: H });
  const subs = await res.json();
  if (!Array.isArray(subs)) { console.error('Resposta inesperada do Supabase:', subs); process.exit(1); }
  let sent = 0, expired = 0, skipped = 0;
  for (const s of subs) {
    if (!s || !s.endpoint || !s.keys) { skipped++; continue; }
    let slot;
    if (TEST) { slot = { title: '🔔 Body Tracker', body: 'Teste de notificação — funcionou! 🎉' }; }
    else { slot = SLOTS[localHourFor(s.tz_offset)]; if (!slot) { skipped++; continue; } }
    const payload = JSON.stringify({ title: slot.title, body: slot.body, tag: 'reminder', url: './' });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      sent++;
    } catch (err) {
      const code = err.statusCode;
      if (code === 404 || code === 410) {
        // Desativa só ESTE aparelho (endpoint), nunca os outros do mesmo usuário
        await fetch(SUPABASE_URL + '/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(s.endpoint), {
          method: 'PATCH',
          headers: Object.assign({ 'content-type': 'application/json' }, H),
          body: JSON.stringify({ disabled: true }),
        }).catch(() => {});
        expired++;
      } else {
        console.error('Falha ao enviar para', s.user_id, code, (err.body || err.message || '').toString().slice(0, 200));
      }
    }
  }
  console.log(`Enviados: ${sent} · expirados: ${expired} · pulados: ${skipped}`);
})().catch(e => { console.error(e); process.exit(1); });
