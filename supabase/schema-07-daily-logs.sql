-- ============================================================
-- Body Tracker — Migração 07: registros diários no banco (água + refeições)
-- Rode no SQL Editor do Supabase. Depois disso, água e refeições deixam de
-- ficar só no aparelho e passam a viver no banco (fonte da verdade), sincronizando
-- entre todos os aparelhos. O app mantém um cache local só p/ velocidade/offline.
--
-- Uma linha por usuário por dia:
--   water_ml = total de água do dia (ml)
--   meals    = { "meal_0": {option,time,ts}, ... } refeições marcadas no dia
-- ============================================================

create table if not exists public.daily_logs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        text        not null,                 -- 'YYYY-MM-DD' (dia local)
  water_ml   integer     not null default 0,
  meals      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_logs enable row level security;

-- Cada usuário só enxerga/edita as PRÓPRIAS linhas.
drop policy if exists "daily_logs own" on public.daily_logs;
create policy "daily_logs own" on public.daily_logs
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Índice p/ buscar os últimos dias rápido.
create index if not exists daily_logs_user_day_idx on public.daily_logs (user_id, day desc);

-- Conferir:  select day, water_ml, meals from public.daily_logs order by day desc limit 7;
