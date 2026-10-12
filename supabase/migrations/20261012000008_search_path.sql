-- =============================================================================
-- Segurança: fixa o search_path de todas as funções do schema public que ainda
-- não têm (aviso "function_search_path_mutable" do Supabase). Idempotente.
-- =============================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions', f.assinatura);
  end loop;
end;
$$;
