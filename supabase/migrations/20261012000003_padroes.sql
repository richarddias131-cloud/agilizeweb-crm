-- =============================================================================
-- Padrões do usuário: catálogo, templates e configuração.
-- inicializar_usuario() é idempotente: só cria o que ainda não existe.
-- O front chama no primeiro login; o seed.sql chama para o primeiro usuário.
-- =============================================================================
create or replace function public.inicializar_usuario(p_user uuid default null)
returns void
language plpgsql
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if v_user is null or (auth.uid() is not null and v_user <> auth.uid()) then
    raise exception 'usuario_invalido' using errcode = '42501';
  end if;

  insert into public.config (user_id, assinatura)
  values (v_user, 'Richard | AgilizeWeb')
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.servicos where user_id = v_user) then
    insert into public.servicos (user_id, nome, preco, recorrente, preco_mensal, ordem) values
      (v_user, 'Placa de avaliação (QR code)', 79.90, false, null, 1),
      (v_user, 'Otimização do Perfil do Google', 179.90, false, null, 2),
      (v_user, 'Bio site para o Google', 399.00, false, null, 3),
      (v_user, 'Kit Comércio no Mapa', 549.90, false, null, 4),
      (v_user, 'Cardápio digital', 499.90, true, 49.90, 5),
      (v_user, 'Site de uma página', 599.90, true, 49.90, 6);
  end if;

  if not exists (select 1 from public.templates where user_id = v_user) then
    insert into public.templates (user_id, chave, nome, estagio_alvo, corpo, ordem) values
      (v_user, 'abordagem', 'Abordagem', 'novo',
       'Olá, {{nome}}! Sou o Richard, da AgilizeWeb. Vi o perfil da {{empresa}} no Google aqui em {{cidade}} e notei alguns pontos que fazem vocês aparecerem menos do que poderiam nas buscas. Posso te mandar uma auditoria grátis do perfil? É rápida de ler e sem compromisso.',
       1),
      (v_user, 'followup1', 'Follow-up 1', 'abordado',
       'Oi, {{nome}}! Passando para saber se posso te enviar a auditoria do perfil da {{empresa}}. É grátis e mostra exatamente o que ajustar.',
       2),
      (v_user, 'followup2', 'Follow-up 2', 'abordado',
       '{{nome}}, quem procura {{segmento}} em {{cidade}} hoje encontra primeiro quem está com o perfil completo no Google. Quer ver como está o da {{empresa}}?',
       3),
      (v_user, 'ultima', 'Última mensagem', 'abordado',
       '{{nome}}, não quero tomar seu tempo, então essa é minha última mensagem. Se quiser a auditoria grátis da {{empresa}} mais para frente, é só me chamar aqui. Sucesso!',
       4),
      (v_user, 'auditoria', 'Envio da auditoria', 'respondeu',
       'Pronto, {{nome}}! O perfil da {{empresa}} ficou com nota {{nota}}/100. Separei os pontos que mais pesam para o cliente encontrar e escolher vocês. Posso te explicar em 2 minutos o que dá para melhorar?',
       5),
      (v_user, 'proposta_kit', 'Proposta do kit', 'auditoria_enviada',
       '{{nome}}, para resolver o que apareceu na auditoria, o caminho mais completo é o Kit Comércio no Mapa: otimização do perfil, bio site e placa de avaliação, por R$ 549,90 (separado sairia R$ 658,70). Pagamento único, sem mensalidade. Quer que eu comece?',
       6),
      (v_user, 'pos_venda', 'Pós-venda', 'ganho',
       '{{nome}}, tudo no ar! Obrigado pela confiança. Se puder, deixa uma avaliação para a AgilizeWeb, e se conhecer alguém que precise aparecer no Google, vou adorar ajudar.',
       7);
  end if;
end;
$$;
