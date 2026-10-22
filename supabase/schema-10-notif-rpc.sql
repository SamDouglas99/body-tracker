-- ============================================================
-- Body Tracker — Migração 10: funções p/ a notificação gravar no banco (Fase 2)
-- O service worker (app fechado) chama estas funções via REST com a SUA sessão,
-- então o registro vai direto pro banco e o Realtime espalha pros aparelhos.
-- security invoker = roda como o próprio usuário (respeita o RLS por auth.uid()).
-- Rode no SQL Editor.
-- ============================================================

create or replace function public.bt_add_water(p_day text, p_ml integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.daily_logs (user_id, day, water_ml)
    values (auth.uid(), p_day, greatest(0, p_ml))
  on conflict (user_id, day) do update
    set water_ml = greatest(0, public.daily_logs.water_ml + p_ml),
        updated_at = now();
end;
$$;

create or replace function public.bt_set_meal(p_day text, p_key text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v jsonb := jsonb_build_object('option', 0, 'ts', (extract(epoch from now()) * 1000)::bigint);
begin
  insert into public.daily_logs (user_id, day, meals)
    values (auth.uid(), p_day, jsonb_build_object(p_key, v))
  on conflict (user_id, day) do update
    set meals = public.daily_logs.meals || jsonb_build_object(p_key, v),
        updated_at = now();
end;
$$;

grant execute on function public.bt_add_water(text, integer) to authenticated;
grant execute on function public.bt_set_meal(text, text) to authenticated;

-- Testar (logado, via app) p/ conferir:
--   select public.bt_add_water(to_char(now(),'YYYY-MM-DD'), 250);
--   select day, water_ml from public.daily_logs order by day desc limit 1;
