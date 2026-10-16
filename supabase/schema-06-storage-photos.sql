-- ============================================================
-- Body Tracker — Migração 06: fotos privadas no Supabase Storage
-- Rode no SQL Editor DEPOIS de criar o bucket 'photos' (Private).
--
-- Segurança: cada usuário só acessa a SUA pasta (<uid>/...). As fotos ficam
-- no bucket privado; o app gera URLs assinadas temporárias pra exibir.
-- (O path das fotos é "<uid>/<id>.jpg", então foldername[1] = o uid do dono.)
-- ============================================================

create policy "photos own read" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos own insert" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos own update" on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos own delete" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Conferir:  select policyname from pg_policies where tablename = 'objects' and schemaname = 'storage';
