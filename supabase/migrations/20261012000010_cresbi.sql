-- =============================================================================
-- Nova identidade: CRESBI.
-- 1. inicializar_usuario passa a criar assinatura, catálogo (5 frentes) e
--    templates na voz CRESBI para usuários novos.
-- 2. Webhooks com headers X-Cresbi-* e user agent novo.
-- 3. Usuários existentes: atualiza a assinatura e os templates que ainda estão
--    no texto padrão antigo (textos editados ficam como estão) e acrescenta os
--    serviços com valor por proposta (preço 0). Nada é apagado.
-- =============================================================================
create or replace function public.inicializar_usuario(p_user uuid default null)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if v_user is null or (auth.uid() is not null and v_user <> auth.uid()) then
    raise exception 'usuario_invalido' using errcode = '42501';
  end if;

  insert into public.config (user_id, assinatura)
  values (v_user, 'Richard | CRESBI')
  on conflict (user_id) do nothing;

  -- Preço 0 = valor por proposta (definido na hora da venda).
  if not exists (select 1 from public.servicos where user_id = v_user) then
    insert into public.servicos (user_id, nome, preco, recorrente, preco_mensal, ordem) values
      (v_user, 'Sistemas sob medida', 0.00, false, null, 1),
      (v_user, 'Site de uma página', 599.90, true, 49.90, 2),
      (v_user, 'Cardápio digital', 499.90, true, 49.90, 3),
      (v_user, 'Otimização do Perfil do Google', 179.90, false, null, 4),
      (v_user, 'Bio site para o Google', 399.00, false, null, 5),
      (v_user, 'Placa de avaliação (QR code)', 79.90, false, null, 6),
      (v_user, 'Kit Comércio no Mapa', 549.90, false, null, 7),
      (v_user, 'Dados e BI', 0.00, false, null, 8),
      (v_user, 'Cresbi Analyzer', 0.00, false, null, 9),
      (v_user, 'Automações', 0.00, false, null, 10);
  end if;

  if not exists (select 1 from public.templates where user_id = v_user) then
    insert into public.templates (user_id, chave, nome, estagio_alvo, corpo, ordem) values
      (v_user, 'abordagem', 'Abordagem', 'novo',
       'Olá, {{nome}}. Aqui é o Richard, da CRESBI. Analisei o perfil da {{empresa}} no Google aqui em {{cidade}} e encontrei pontos que fazem vocês aparecerem menos nas buscas do que poderiam. Posso enviar uma auditoria gratuita do perfil? É rápida de ler e não tem compromisso.',
       1),
      (v_user, 'followup1', 'Follow-up 1', 'abordado',
       'Oi, {{nome}}. Retomo a mensagem sobre a auditoria do perfil da {{empresa}} no Google. Ela é gratuita e mostra exatamente o que ajustar para aparecer mais. Posso enviar?',
       2),
      (v_user, 'followup2', 'Follow-up 2', 'abordado',
       '{{nome}}, quem procura {{segmento}} em {{cidade}} encontra primeiro as empresas com o perfil completo no Google. Quer ver em que posição a {{empresa}} está hoje?',
       3),
      (v_user, 'ultima', 'Última mensagem', 'abordado',
       '{{nome}}, esta é a minha última mensagem sobre o assunto. Se quiser a auditoria gratuita da {{empresa}} mais para frente, é só responder aqui. Sucesso nos negócios.',
       4),
      (v_user, 'auditoria', 'Envio da auditoria', 'respondeu',
       'Pronto, {{nome}}. O perfil da {{empresa}} ficou com nota {{nota}}/100. Separei os pontos que mais pesam para o cliente encontrar e escolher vocês. Posso explicar em 2 minutos o que dá para melhorar?',
       5),
      (v_user, 'proposta_kit', 'Proposta do kit', 'auditoria_enviada',
       '{{nome}}, para resolver o que apareceu na auditoria, o caminho mais completo é o Kit Comércio no Mapa: otimização do perfil, bio site e placa de avaliação, por R$ 549,90 (separados, sairiam R$ 658,70). Pagamento único, sem mensalidade. Podemos começar?',
       6),
      (v_user, 'pos_venda', 'Pós-venda', 'ganho',
       '{{nome}}, está tudo no ar. Obrigado pela confiança na CRESBI. Se puder, deixe uma avaliação para nós, e se conhecer alguém que precise aparecer no Google, vamos gostar de ajudar.',
       7);
  end if;
end;
$$;

create or replace function public.webhook_enviar(p_entrega uuid, p_forcar boolean default false)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.webhook_entregas;
  w public.webhooks;
  v_corpo text;
  v_req bigint;
begin
  select * into e from public.webhook_entregas where id = p_entrega for update;
  select * into w from public.webhooks where id = e.webhook_id;
  if not found or (not w.ativo and not p_forcar) then
    update public.webhook_entregas set status = 'falhou', ultimo_erro = 'webhook inativo' where id = p_entrega;
    return;
  end if;

  -- O pg_net envia o jsonb como texto (jsonb::text); a assinatura é sobre esses mesmos bytes.
  v_corpo := e.corpo::text;
  select net.http_post(
    url := w.url,
    body := e.corpo,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'CRESBI-CRM-Webhooks/1.0',
      'X-Cresbi-Evento', e.evento,
      'X-Cresbi-Entrega', e.id::text,
      'X-Cresbi-Assinatura', 'sha256=' || encode(extensions.hmac(convert_to(v_corpo, 'UTF8'), convert_to(w.segredo, 'UTF8'), 'sha256'), 'hex')
    ),
    timeout_milliseconds := 8000
  ) into v_req;

  update public.webhook_entregas
  set status = 'enviando', request_id = v_req, enviado_em = now(), tentativas = tentativas + 1
  where id = p_entrega;
end;
$$;

-- ---------- Dados dos usuários existentes ----------
update public.config set assinatura = 'Richard | CRESBI'
where assinatura = 'Richard | AgilizeWeb';

update public.templates set corpo = 'Olá, {{nome}}. Aqui é o Richard, da CRESBI. Analisei o perfil da {{empresa}} no Google aqui em {{cidade}} e encontrei pontos que fazem vocês aparecerem menos nas buscas do que poderiam. Posso enviar uma auditoria gratuita do perfil? É rápida de ler e não tem compromisso.'
where chave = 'abordagem' and corpo = 'Olá, {{nome}}! Sou o Richard, da AgilizeWeb. Vi o perfil da {{empresa}} no Google aqui em {{cidade}} e notei alguns pontos que fazem vocês aparecerem menos do que poderiam nas buscas. Posso te mandar uma auditoria grátis do perfil? É rápida de ler e sem compromisso.';
update public.templates set corpo = 'Oi, {{nome}}. Retomo a mensagem sobre a auditoria do perfil da {{empresa}} no Google. Ela é gratuita e mostra exatamente o que ajustar para aparecer mais. Posso enviar?'
where chave = 'followup1' and corpo = 'Oi, {{nome}}! Passando para saber se posso te enviar a auditoria do perfil da {{empresa}}. É grátis e mostra exatamente o que ajustar.';
update public.templates set corpo = '{{nome}}, quem procura {{segmento}} em {{cidade}} encontra primeiro as empresas com o perfil completo no Google. Quer ver em que posição a {{empresa}} está hoje?'
where chave = 'followup2' and corpo = '{{nome}}, quem procura {{segmento}} em {{cidade}} hoje encontra primeiro quem está com o perfil completo no Google. Quer ver como está o da {{empresa}}?';
update public.templates set corpo = '{{nome}}, esta é a minha última mensagem sobre o assunto. Se quiser a auditoria gratuita da {{empresa}} mais para frente, é só responder aqui. Sucesso nos negócios.'
where chave = 'ultima' and corpo = '{{nome}}, não quero tomar seu tempo, então essa é minha última mensagem. Se quiser a auditoria grátis da {{empresa}} mais para frente, é só me chamar aqui. Sucesso!';
update public.templates set corpo = 'Pronto, {{nome}}. O perfil da {{empresa}} ficou com nota {{nota}}/100. Separei os pontos que mais pesam para o cliente encontrar e escolher vocês. Posso explicar em 2 minutos o que dá para melhorar?'
where chave = 'auditoria' and corpo = 'Pronto, {{nome}}! O perfil da {{empresa}} ficou com nota {{nota}}/100. Separei os pontos que mais pesam para o cliente encontrar e escolher vocês. Posso te explicar em 2 minutos o que dá para melhorar?';
update public.templates set corpo = '{{nome}}, para resolver o que apareceu na auditoria, o caminho mais completo é o Kit Comércio no Mapa: otimização do perfil, bio site e placa de avaliação, por R$ 549,90 (separados, sairiam R$ 658,70). Pagamento único, sem mensalidade. Podemos começar?'
where chave = 'proposta_kit' and corpo = '{{nome}}, para resolver o que apareceu na auditoria, o caminho mais completo é o Kit Comércio no Mapa: otimização do perfil, bio site e placa de avaliação, por R$ 549,90 (separado sairia R$ 658,70). Pagamento único, sem mensalidade. Quer que eu comece?';
update public.templates set corpo = '{{nome}}, está tudo no ar. Obrigado pela confiança na CRESBI. Se puder, deixe uma avaliação para nós, e se conhecer alguém que precise aparecer no Google, vamos gostar de ajudar.'
where chave = 'pos_venda' and corpo = '{{nome}}, tudo no ar! Obrigado pela confiança. Se puder, deixa uma avaliação para a AgilizeWeb, e se conhecer alguém que precise aparecer no Google, vou adorar ajudar.';

insert into public.servicos (user_id, nome, preco, recorrente, preco_mensal, ordem)
select u.user_id, n.nome, 0, false, null, n.ordem
from (select distinct user_id from public.servicos) u
cross join (values
  ('Sistemas sob medida', 1),
  ('Dados e BI', 8),
  ('Cresbi Analyzer', 9),
  ('Automações', 10)
) as n (nome, ordem)
where not exists (select 1 from public.servicos s where s.user_id = u.user_id and s.nome = n.nome);

update public.servicos s set ordem = o.ordem
from (values
  ('Sistemas sob medida', 1),
  ('Site de uma página', 2),
  ('Cardápio digital', 3),
  ('Otimização do Perfil do Google', 4),
  ('Bio site para o Google', 5),
  ('Placa de avaliação (QR code)', 6),
  ('Kit Comércio no Mapa', 7),
  ('Dados e BI', 8),
  ('Cresbi Analyzer', 9),
  ('Automações', 10)
) as o (nome, ordem)
where s.nome = o.nome;
