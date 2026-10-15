-- ============================================================
-- Body Tracker — Migração 03: VÁRIOS aparelhos por usuário (push)
-- Rode DEPOIS do schema.sql, no SQL Editor do Supabase.
--
-- Problema que isto corrige:
--   Antes, push_subs tinha user_id como PRIMARY KEY → cabia só 1 inscrição
--   por conta. Quando o notebook se inscrevia, SOBRESCREVIA a do celular,
--   então só o último aparelho recebia notificação (o celular parava).
--
-- Solução: o ENDPOINT (único por aparelho) vira a chave. Assim cada aparelho
--   tem a sua própria linha e o robô envia para todos.
-- ============================================================

-- 1) Remove a PK antiga (user_id)
alter table public.push_subs drop constraint if exists push_subs_pkey;

-- 2) Remove duplicatas de endpoint (se houver), mantendo a linha mais recente
delete from public.push_subs a
  using public.push_subs b
  where a.endpoint = b.endpoint
    and a.ctid < b.ctid;

-- 3) endpoint passa a ser a chave (único por aparelho) — é o onConflict do app
alter table public.push_subs add primary key (endpoint);

-- 4) Índice por usuário (o robô e as policies filtram por user_id)
create index if not exists push_subs_user_idx on public.push_subs(user_id);

-- A policy "own push" (auth.uid() = user_id) continua valendo:
-- a coluna user_id permanece, só deixou de ser a chave primária.
