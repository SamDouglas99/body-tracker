-- ============================================================
-- Body Tracker — Migração 05: cron CONFIÁVEL de lembretes (Supabase pg_cron)
-- Dispara o endpoint /api/send-reminders na Vercel a cada 15 min, de DENTRO do
-- Postgres do Supabase — bem mais confiável que o cron do GitHub Actions.
-- O dedup (schema-04) garante que rodar junto com o GitHub NÃO duplica avisos.
--
-- PRÉ-REQUISITOS (uma vez, no painel do Supabase):
--   1) Database → Extensions → habilite "pg_cron" e "pg_net".
--   2) Publique o endpoint na Vercel com as env vars:
--      SUPABASE_URL, SUPABASE_SERVICE_ROLE, VAPID_PUBLIC, VAPID_PRIVATE,
--      VAPID_SUBJECT, CRON_SECRET.
--
-- TROQUE abaixo:
--   <SUA_URL_VERCEL>  → ex.: https://body-tracker-samdouglas99.vercel.app
--   <SEU_CRON_SECRET> → o MESMO valor que você pôs em CRON_SECRET na Vercel
-- ============================================================

-- Se você JÁ tinha agendado a cada 15 min, remova o antigo primeiro:
-- select cron.unschedule('bt-reminders-15min');

-- A cada 5 min = menos espera e mais chances de pegar cada horário (o dedup evita repetir).
select cron.schedule(
  'bt-reminders-5min',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := '<SUA_URL_VERCEL>/api/send-reminders',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', '<SEU_CRON_SECRET>'
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $$
);

-- Conferir agendamentos:   select jobid, schedule, jobname from cron.job;
-- Ver execuções recentes:  select * from cron.job_run_details order by start_time desc limit 20;
-- Respostas HTTP do pg_net: select * from net._http_response order by created desc limit 20;
