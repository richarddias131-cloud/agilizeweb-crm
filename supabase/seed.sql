-- Seed do CRM CRESBI.
-- Rode DEPOIS das migrations e DEPOIS de criar seu usuário em Authentication → Users.
-- Cadastra catálogo de serviços, os 7 templates iniciais e a configuração padrão
-- para cada usuário existente (não duplica se rodar de novo).
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.inicializar_usuario(u.id);
  end loop;
end;
$$;
