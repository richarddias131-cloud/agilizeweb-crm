-- =============================================================================
-- Webhooks (CRM → agente), disparados por trigger no banco.
--
-- Fluxo: trigger → enfileirar_webhook() grava em webhook_entregas e envia na
-- hora via pg_net (corpo assinado com HMAC-SHA256). O job "agz-webhooks" (pg_cron,
-- a cada minuto) confere as respostas, agenda novas tentativas (1, 5 e 15 min)
-- e desativa o webhook depois de 10 falhas seguidas.
--
-- Corpo: { "evento": "...", "ocorreu_em": "...", "dados": {...} }
-- Headers: X-Agilize-Assinatura: sha256=<hex>, X-Agilize-Evento, X-Agilize-Entrega
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.webhook_entregas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  evento text not null,
  corpo jsonb not null,
  status text not null default 'aguardando' check (status in ('aguardando', 'enviando', 'entregue', 'falhou')),
  tentativas int not null default 0,
  request_id bigint,
  enviado_em timestamptz,
  proxima_tentativa_em timestamptz not null default now(),
  ultimo_status int,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index webhook_entregas_fila_idx on public.webhook_entregas (status, proxima_tentativa_em);
create index webhook_entregas_webhook_idx on public.webhook_entregas (webhook_id, created_at desc);

create trigger webhook_entregas_updated_at before update on public.webhook_entregas
for each row execute function public.set_updated_at();

alter table public.webhook_entregas enable row level security;
create policy webhook_entregas_dono on public.webhook_entregas for select to authenticated using (auth.uid() = user_id);

alter table public.webhooks
  add constraint webhooks_eventos_validos check (
    eventos <@ array['lead.criado', 'lead.respondeu', 'lead.estagio_alterado', 'mensagem.recebida',
                     'acao.aprovada', 'acao.rejeitada', 'venda.criada']::text[]
  );

-- ---------------------------------------------------------------------------
-- Envio de uma entrega (via pg_net). SECURITY DEFINER: o usuário não acessa
-- o schema net diretamente; a função só envia entregas que já existem.
-- ---------------------------------------------------------------------------
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
      'User-Agent', 'AgilizeWeb-CRM-Webhooks/1.0',
      'X-Agilize-Evento', e.evento,
      'X-Agilize-Entrega', e.id::text,
      'X-Agilize-Assinatura', 'sha256=' || encode(extensions.hmac(convert_to(v_corpo, 'UTF8'), convert_to(w.segredo, 'UTF8'), 'sha256'), 'hex')
    ),
    timeout_milliseconds := 8000
  ) into v_req;

  update public.webhook_entregas
  set status = 'enviando', request_id = v_req, enviado_em = now(), tentativas = tentativas + 1
  where id = p_entrega;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enfileira um evento para todos os webhooks ativos do usuário que o assinam.
-- ---------------------------------------------------------------------------
create or replace function public.enfileirar_webhook(p_user uuid, p_evento text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w record;
  v_id uuid;
begin
  for w in select id from public.webhooks where user_id = p_user and ativo and p_evento = any (eventos) loop
    insert into public.webhook_entregas (user_id, webhook_id, evento, corpo)
    values (p_user, w.id, p_evento, jsonb_build_object('evento', p_evento, 'ocorreu_em', now(), 'dados', p_dados))
    returning id into v_id;
    begin
      perform public.webhook_enviar(v_id);
    exception when others then
      -- Sem pg_net ou falha momentânea: o job tenta de novo.
      update public.webhook_entregas set status = 'aguardando', ultimo_erro = sqlerrm, proxima_tentativa_em = now() + interval '1 minute'
      where id = v_id;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job: confere respostas, agenda novas tentativas e desativa webhooks com falhas.
-- ---------------------------------------------------------------------------
create or replace function public.processar_webhooks()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e record;
  r record;
  v_ok boolean;
  v_status int;
  v_erro text;
  v_esperas int[] := array[1, 5, 15];
begin
  -- 1. Respostas das entregas em andamento
  for e in select * from public.webhook_entregas where status = 'enviando' for update skip locked loop
    select status_code, timed_out, error_msg into r from net._http_response where id = e.request_id;
    if not found then
      if e.enviado_em > now() - interval '2 minutes' then
        continue; -- ainda sem resposta
      end if;
      v_ok := false; v_status := 0; v_erro := 'sem resposta';
    else
      v_status := coalesce(r.status_code, 0);
      v_ok := v_status between 200 and 299 and not coalesce(r.timed_out, false);
      v_erro := case when v_ok then null when r.timed_out then 'tempo esgotado' else coalesce(r.error_msg, 'HTTP ' || v_status) end;
    end if;

    if v_ok then
      update public.webhook_entregas set status = 'entregue', ultimo_status = v_status, ultimo_erro = null where id = e.id;
      update public.webhooks set falhas_seguidas = 0, ultimo_status = v_status where id = e.webhook_id;
    else
      update public.webhook_entregas
      set status = case when e.tentativas <= array_length(v_esperas, 1) then 'aguardando' else 'falhou' end,
          ultimo_status = v_status,
          ultimo_erro = v_erro,
          proxima_tentativa_em = now() + make_interval(mins => coalesce(v_esperas[e.tentativas], 15))
      where id = e.id;
      update public.webhooks
      set falhas_seguidas = falhas_seguidas + 1,
          ultimo_status = v_status,
          ativo = case when falhas_seguidas + 1 >= 10 then false else ativo end
      where id = e.webhook_id;
    end if;
  end loop;

  -- 2. Novas tentativas vencidas
  for e in
    select id from public.webhook_entregas
    where status = 'aguardando' and proxima_tentativa_em <= now()
    order by proxima_tentativa_em
    limit 100
    for update skip locked
  loop
    begin
      perform public.webhook_enviar(e.id);
    exception when others then
      update public.webhook_entregas set ultimo_erro = sqlerrm, proxima_tentativa_em = now() + interval '1 minute' where id = e.id;
    end;
  end loop;

  -- 3. Limpeza: entregas finalizadas com mais de 30 dias
  delete from public.webhook_entregas where status in ('entregue', 'falhou') and created_at < now() - interval '30 days';
end;
$$;

-- "Enviar teste" (Configurações): manda um evento de teste só para este webhook.
create or replace function public.testar_webhook(p_webhook uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w public.webhooks;
  v_id uuid;
begin
  select * into w from public.webhooks where id = p_webhook;
  if not found or w.user_id <> auth.uid() then
    raise exception 'webhook_nao_encontrado' using errcode = 'P0002';
  end if;
  insert into public.webhook_entregas (user_id, webhook_id, evento, corpo)
  values (w.user_id, w.id, 'teste', jsonb_build_object('evento', 'teste', 'ocorreu_em', now(),
          'dados', jsonb_build_object('mensagem', 'Webhook do CRM AgilizeWeb funcionando.')))
  returning id into v_id;
  -- O teste vai mesmo com o webhook desativado (para conferir antes de reativar).
  perform public.webhook_enviar(v_id, true);
  return v_id;
end;
$$;

revoke all on function public.webhook_enviar(uuid, boolean) from public, anon, authenticated;
revoke all on function public.enfileirar_webhook(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.processar_webhooks() from public, anon, authenticated;
grant execute on function public.testar_webhook(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers dos eventos
-- ---------------------------------------------------------------------------
create or replace function public.webhook_dados_lead(l public.leads)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'lead_id', l.id, 'empresa', l.empresa, 'contato_nome', l.contato_nome, 'whatsapp', l.whatsapp,
    'cidade', l.cidade, 'segmento', l.segmento, 'estagio', l.estagio, 'origem', l.origem);
$$;

create or replace function public.webhook_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.silenciar', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.enfileirar_webhook(new.user_id, 'lead.criado', public.webhook_dados_lead(new));
  else
    if new.estagio is distinct from old.estagio then
      perform public.enfileirar_webhook(new.user_id, 'lead.estagio_alterado',
        public.webhook_dados_lead(new) || jsonb_build_object('de', old.estagio, 'para', new.estagio, 'motivo_perda', new.motivo_perda,
                                                             'ator', public.ator_atual(), 'ator_nome', public.ator_nome_atual()));
    end if;
    if new.ultima_resposta_em is not null and new.ultima_resposta_em is distinct from old.ultima_resposta_em then
      perform public.enfileirar_webhook(new.user_id, 'lead.respondeu', public.webhook_dados_lead(new));
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_webhooks
after insert or update of estagio, ultima_resposta_em on public.leads
for each row execute function public.webhook_leads();

create or replace function public.webhook_interacoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'whatsapp_recebido' and new.conteudo is not null then
    perform public.enfileirar_webhook(new.user_id, 'mensagem.recebida',
      jsonb_build_object('lead_id', new.lead_id, 'interacao_id', new.id, 'conteudo', new.conteudo, 'ator', new.ator, 'ocorreu_em', new.ocorreu_em));
  end if;
  return new;
end;
$$;

create trigger interacoes_webhooks
after insert on public.interacoes
for each row execute function public.webhook_interacoes();

create or replace function public.webhook_acoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('aprovada', 'rejeitada') then
    perform public.enfileirar_webhook(new.user_id, 'acao.' || new.status,
      jsonb_build_object('acao_id', new.id, 'tipo', new.tipo, 'lead_id', new.lead_id, 'payload', new.payload, 'decidida_em', new.decidida_em));
  end if;
  return new;
end;
$$;

create trigger acoes_pendentes_webhooks
after update of status on public.acoes_pendentes
for each row execute function public.webhook_acoes();

create or replace function public.webhook_vendas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enfileirar_webhook(new.user_id, 'venda.criada',
    jsonb_build_object('venda_id', new.id, 'lead_id', new.lead_id, 'itens', new.itens, 'valor_total', new.valor_total,
                       'status', new.status, 'manutencao_mensal', new.manutencao_mensal, 'valor_mensal', new.valor_mensal));
  return new;
end;
$$;

create trigger vendas_webhooks
after insert on public.vendas
for each row execute function public.webhook_vendas();

-- ---------------------------------------------------------------------------
-- Agenda o job (a cada minuto). Idempotente.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agz-webhooks') then
    perform cron.unschedule('agz-webhooks');
  end if;
  perform cron.schedule('agz-webhooks', '* * * * *', 'select public.processar_webhooks()');
end;
$$;
