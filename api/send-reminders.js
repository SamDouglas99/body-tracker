// api/send-reminders.js — Endpoint CONFIÁVEL de lembretes do Body Tracker.
// Pensado p/ ser chamado por um cron confiável (Supabase pg_cron ou cron-job.org)
// a cada ~15 min. Reusa o MESMO worker do robô (minutos + dedup), então pode rodar
// junto com o GitHub Actions sem duplicar (o dedup garante 1 aviso por slot/dia).
//
// Proteção: exige o header 'x-cron-secret' (ou ?secret=) igual a CRON_SECRET.
// Variáveis de ambiente na Vercel (Project → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, CRON_SECRET
const webpush = require('web-push');
const { sendDueReminders } = require('../scripts/send-reminders-supabase.js');

module.exports = async function handler(req, res) {
  const SECRET = process.env.CRON_SECRET;
  const given = req.headers['x-cron-secret'] || (req.query && req.query.secret);
  if (!SECRET || given !== SECRET) { res.status(401).json({ error: 'não autorizado' }); return; }

  const SUPABASE_URL  = process.env.SUPABASE_URL;
  const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE;
  const VAPID_PUBLIC  = process.env.VAPID_PUBLIC;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:samdouglas1208@gmail.com';
  if (!SUPABASE_URL || !SERVICE_ROLE || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    res.status(503).json({ error: 'Faltam variáveis de ambiente na Vercel (SUPABASE_URL/SUPABASE_SERVICE_ROLE/VAPID_PUBLIC/VAPID_PRIVATE).' });
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // ?test=1 → dispara 1 notificação de teste pra todos (ignora horário).
  const TEST = !!(req.query && (req.query.test === '1' || req.query.test === 'true'));

  try {
    const out = await sendDueReminders({ webpush, SUPABASE_URL, SERVICE_ROLE, TEST });
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
