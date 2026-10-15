-- ============================================================
-- Body Tracker — Migração 02: guarda o id original do app (client_id)
-- Rode DEPOIS do schema.sql, no SQL Editor do Supabase.
-- Motivo: o app identifica medidas/treinos pelo id dele (Date.now()); guardamos
-- esse id em client_id pra não quebrar a deduplicação/merge do app.
-- ============================================================
alter table public.entries  add column if not exists client_id text;
alter table public.workouts add column if not exists client_id text;
alter table public.expenses add column if not exists client_id text;

create index if not exists entries_client  on public.entries(user_id, client_id);
create index if not exists workouts_client on public.workouts(user_id, client_id);
create index if not exists expenses_client on public.expenses(user_id, client_id);
