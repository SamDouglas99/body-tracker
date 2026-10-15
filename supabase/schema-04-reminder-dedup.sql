-- ============================================================
-- Body Tracker — Migração 04: deduplicação de lembretes push
-- Rode DEPOIS do schema.sql, no SQL Editor do Supabase.
--
-- Por quê: o robô agora roda a cada 15 min e casa horários com MINUTOS
-- (ex.: refeição 09:10, água a cada hora). Para não avisar o mesmo horário
-- mais de uma vez no dia, guardamos em cada inscrição a última "chave de slot"
-- enviada (ex.: "2026-10-16:m9:10"). O robô pula se já enviou aquele slot hoje.
-- ============================================================
alter table public.push_subs add column if not exists last_sent text;
