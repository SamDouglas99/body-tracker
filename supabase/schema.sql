-- ============================================================
-- Body Tracker — Schema do Supabase (Postgres)
-- Como usar: Supabase → projeto → SQL Editor → New query → cole TUDO → Run.
-- Cada usuário só enxerga os próprios dados (RLS no fim do arquivo).
-- ============================================================

-- 1) PERFIL — 1 linha por usuário (equivale ao doc settings/{uid} do Firebase)
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text,
  height     numeric,
  weight     numeric,                              -- peso base informado
  goal       numeric,                              -- meta de peso
  pace       numeric,                              -- ritmo semanal (kg/sem)
  theme      text,
  program    int  default 1,                       -- programa de treino ativo
  diet       jsonb default '{}'::jsonb,            -- { meals, supps }
  settings   jsonb default '{}'::jsonb,            -- campos extras futuros
  updated_at timestamptz default now()
);

-- 2) MEDIDAS (entries) — cada registro de medidas é uma linha
create table if not exists public.entries (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       timestamptz not null default now(),
  weight     numeric,                              -- promovido p/ consulta/gráfico
  measures   jsonb not null default '{}'::jsonb,   -- chest, waist, glutes, calf_l, ...
  created_at timestamptz default now()
);
create index if not exists entries_user_date on public.entries(user_id, date);

-- 3) TREINOS (workouts)
create table if not exists public.workouts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       timestamptz not null default now(),
  type       text,                                 -- pull/push/a1/lowerA/...
  exercises  jsonb not null default '[]'::jsonb,   -- [{name, sets:[{t,weight,reps,done}]}]
  tonnage    numeric,
  total_sets int,
  duration   int,                                  -- segundos
  created_at timestamptz default now()
);
create index if not exists workouts_user_date on public.workouts(user_id, date);

-- 4) GASTOS (expenses) — recurso novo (hoje só em localStorage)
create table if not exists public.expenses (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       timestamptz not null default now(),
  store      text,
  total      numeric,
  category   text,
  items      jsonb not null default '[]'::jsonb,   -- [{name, qty, price, category}]
  source     text,                                 -- manual / scan / voz
  created_at timestamptz default now()
);
create index if not exists expenses_user_date on public.expenses(user_id, date);

-- 5) INSCRIÇÕES DE PUSH (notificações com app fechado)
--    O robô que envia usa a SERVICE ROLE KEY (bypassa RLS) p/ ler todos.
create table if not exists public.push_subs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null,                       -- { p256dh, auth }
  tz_offset  int,
  disabled   boolean default false,
  updated_at timestamptz default now()
);

-- 6) FOTOS (metadados; o arquivo vai no Storage, bucket 'photos')
create table if not exists public.photos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  path       text not null,                        -- caminho no bucket 'photos'
  category   text,
  weight     numeric,
  date       timestamptz not null default now(),
  meta       jsonb default '{}'::jsonb
);
create index if not exists photos_user_date on public.photos(user_id, date);

-- ============================================================
-- SEGURANÇA — Row Level Security: cada usuário só acessa o que é dele
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.entries   enable row level security;
alter table public.workouts  enable row level security;
alter table public.expenses  enable row level security;
alter table public.push_subs enable row level security;
alter table public.photos    enable row level security;

create policy "own profile"  on public.profiles  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own entries"  on public.entries   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own workouts" on public.workouts  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own expenses" on public.expenses  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push"     on public.push_subs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own photos"   on public.photos    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── STORAGE (fotos) ──
-- Crie o bucket no painel: Storage → New bucket → nome "photos" → Private.
-- Depois rode estas policies (cada usuário só mexe na pasta <uid>/ dele):
-- (descomente após criar o bucket)
-- create policy "own photos read"   on storage.objects for select
--   using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "own photos write"  on storage.objects for insert
--   with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "own photos delete" on storage.objects for delete
--   using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
