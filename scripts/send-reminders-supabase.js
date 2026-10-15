// Body Tracker — enviador de lembretes push (versão SUPABASE)
// Roda no GitHub Actions (a cada 15 min). Lê push_subs do Supabase com a SERVICE ROLE
// (bypassa RLS) e envia web-push nos horários locais de cada usuário (com minutos).
// Dedup por aparelho/dia via push_subs.last_sent (schema-04) — 1 aviso por slot por dia.
// Sem dependência do Supabase SDK: usa a REST API via fetch (Node 20+ tem fetch global).
//
// INDIVIDUALIDADE: cada usuário recebe nos SEUS horários (profiles.settings.reminders,
// editados na aba ⏰ Lembretes do app). Quem ainda não personalizou cai no SLOTS padrão.

// Horários padrão por HORA LOCAL (0–23) — usados só p/ quem não configurou lembretes.
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

// Janela de captura: o cron roda a cada 15 min; 20 min dá folga p/ atrasos do GitHub Actions.
// A deduplicação (push_subs.last_sent) garante que cada slot avisa só 1x por dia.
const WINDOW_MIN = 20;

// Minuto local do dia (0..1439) a partir do fuso (offset em minutos, ex.: Brasil=180).
function localNowFor(tzOffsetMin) {
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const off = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 180; // padrão UTC-3 (Brasil)
  return (((utcMin - off) % 1440) + 1440) % 1440;
}
function localHourFor(tzOffsetMin) { return Math.floor(localNowFor(tzOffsetMin) / 60); }

// Data local do usuário (YYYY-MM-DD) — chave do dia p/ deduplicar envios.
function localDayKeyFor(tzOffsetMin) {
  const off = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 180;
  return new Date(Date.now() - off * 60000).toISOString().slice(0, 10);
}

// Slots do dia (minuto do dia + mensagem) a partir dos lembretes do usuário.
// Sem config → SLOTS padrão. prio: refeição(2) > água(1) p/ desempate no mesmo minuto.
function slotsFor(reminders) {
  const out = [];
  const hasCustom = reminders && (Array.isArray(reminders.meals) || reminders.water);
  if (hasCustom) {
    (Array.isArray(reminders.meals) ? reminders.meals : []).forEach(m => {
      if (m && Number.isFinite(+m.hour)) {
        const min = Number.isFinite(+m.min) ? +m.min : 0;
        out.push({ key: 'm' + (+m.hour) + ':' + min, mod: (+m.hour) * 60 + min, prio: 2,
          title: (m.icon || '🍽️') + ' ' + (m.meal || 'Refeição'), body: 'Hora da refeição — confira seu plano alimentar. 💪' });
      }
    });
    const w = reminders.water;
    if (w) {
      const every = Math.max(1, parseInt(w.every) || 1);
      const start = parseInt(w.start), end = parseInt(w.end);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let h = start; h <= end; h += every) {
          out.push({ key: 'w' + h, mod: h * 60, prio: 1, title: '💧 Hora da água', body: 'Bora manter a meta de água de hoje! 💧' });
        }
      }
    }
  } else {
    Object.keys(SLOTS).forEach(h => { out.push({ key: 's' + h, mod: (+h) * 60, prio: 1, title: SLOTS[h].title, body: SLOTS[h].body }); });
  }
  return out;
}

// Slot "vencido" agora: minuto do slot dentro de (nowMod - janela, nowMod]. Pega o mais recente;
// empate no mesmo minuto → refeição ganha da água. null se nada no intervalo.
function dueSlotFor(reminders, nowMod, windowMin) {
  const win = windowMin || WINDOW_MIN;
  const cand = slotsFor(reminders).filter(s => s.mod <= nowMod && (nowMod - s.mod) < win);
  if (!cand.length) return null;
  cand.sort((a, b) => (b.mod - a.mod) || (b.prio - a.prio));
  return cand[0];
}

module.exports = { SLOTS, WINDOW_MIN, localNowFor, localHourFor, localDayKeyFor, slotsFor, dueSlotFor };

// ── Execução (só quando rodado direto: node send-reminders-supabase.js) ──
if (require.main === module) {
  const webpush = require('web-push');

  const SUPABASE_URL  = process.env.SUPABASE_URL;            // https://diztwwgccioldwwngaea.supabase.co
  const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE;  // chave service_role (SEGREDO)
  const VAPID_PUBLIC  = process.env.VAPID_PUBLIC;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:samdouglas1208@gmail.com';

  // Enquanto os secrets nao estiverem configurados, sai com SUCESSO (nao envia email de falha).
  if (!SUPABASE_URL || !SERVICE_ROLE || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.log('Secrets ainda nao configurados (SUPABASE_URL/SUPABASE_SERVICE_ROLE/VAPID_PUBLIC/VAPID_PRIVATE). Robo em espera.');
    process.exit(0);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Modo teste (disparo manual com input test=true): envia uma notificação agora,
  // pra todos os inscritos, ignorando o horário dos lembretes.
  const TEST = process.env.TEST_PUSH === 'true' || process.env.TEST_PUSH === '1';
  const H = { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE };

  (async () => {
    console.log('Execução às', new Date().toISOString());
    const res = await fetch(SUPABASE_URL + '/rest/v1/push_subs?disabled=eq.false&select=*', { headers: H });
    const subs = await res.json();
    if (!Array.isArray(subs)) { console.error('Resposta inesperada do Supabase:', subs); process.exit(1); }

    // Lê os horários personalizados de cada usuário (profiles.settings.reminders).
    // Se falhar, segue com o padrão (SLOTS) — nunca deixa de enviar por causa disso.
    const remindersByUser = {};
    if (!TEST) {
      try {
        const ids = [...new Set(subs.map(s => s.user_id).filter(Boolean))];
        if (ids.length) {
          const inList = ids.map(encodeURIComponent).join(',');
          const pr = await fetch(SUPABASE_URL + '/rest/v1/profiles?user_id=in.(' + inList + ')&select=user_id,settings', { headers: H });
          const rows = await pr.json();
          if (Array.isArray(rows)) rows.forEach(r => { if (r && r.user_id && r.settings && r.settings.reminders) remindersByUser[r.user_id] = r.settings.reminders; });
        }
      } catch (e) { console.warn('Falha ao ler horários personalizados (usando padrão):', e.message); }
    }

    let sent = 0, expired = 0, skipped = 0, deduped = 0;
    for (const s of subs) {
      if (!s || !s.endpoint || !s.keys) { skipped++; continue; }
      let slot, dedupeKey = null;
      if (TEST) { slot = { title: '🔔 Body Tracker', body: 'Teste de notificação — funcionou! 🎉' }; }
      else {
        const due = dueSlotFor(remindersByUser[s.user_id], localNowFor(s.tz_offset));
        if (!due) { skipped++; continue; }
        dedupeKey = localDayKeyFor(s.tz_offset) + ':' + due.key;
        if (s.last_sent === dedupeKey) { deduped++; continue; } // já avisou esse slot hoje
        slot = due;
      }
      const payload = JSON.stringify({ title: slot.title, body: slot.body, tag: 'reminder', url: './' });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        sent++;
        if (dedupeKey) {
          await fetch(SUPABASE_URL + '/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(s.endpoint), {
            method: 'PATCH',
            headers: Object.assign({ 'content-type': 'application/json' }, H),
            body: JSON.stringify({ last_sent: dedupeKey }),
          }).catch(() => {});
        }
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
    console.log(`Enviados: ${sent} · expirados: ${expired} · pulados: ${skipped} · dedupe: ${deduped}`);
  })().catch(e => { console.error(e); process.exit(1); });
}
