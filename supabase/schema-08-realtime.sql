-- ============================================================
-- Body Tracker — Migração 08: sincronização em TEMPO REAL
-- Liga o Supabase Realtime nas tabelas de dados, pra um aparelho ver na hora
-- o que o outro registrou (sem recarregar a página). O Realtime respeita o RLS,
-- então cada usuário só recebe as próprias mudanças.
--
-- Rode no SQL Editor. Se alguma linha reclamar que a tabela "já é membro" da
-- publicação, pode ignorar (o DO/exception abaixo já trata isso).
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table public.daily_logs;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when others then null;
end $$;

-- Conferir o que está publicado p/ realtime:
--   select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';
