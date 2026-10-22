-- ============================================================
-- Body Tracker — Migração 09: suplementos tomados no dia vão pro banco
-- Adiciona a coluna 'supps' na daily_logs (mesmo esquema de água/refeições).
-- Rode no SQL Editor. Idempotente (add column if not exists).
-- ============================================================

alter table public.daily_logs
  add column if not exists supps jsonb not null default '{}'::jsonb;

-- Conferir:  select day, supps from public.daily_logs order by day desc limit 7;
