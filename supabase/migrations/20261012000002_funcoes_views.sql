-- =============================================================================
-- Funções de negócio (usadas pela tela E pela API) e views do painel.
-- As funções são SECURITY INVOKER: chamadas pelo front, valem as políticas RLS;
-- chamadas pela Edge Function (service_role), a função recebe o user_id
-- explicitamente e a Edge Function só passa leads do dono da chave.
-- =============================================================================

-- Fim do dia de hoje em America/Sao_Paulo.
create or replace function public.fim_do_dia(p_agora timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select (date_trunc('day', p_agora at time zone 'America/Sao_Paulo') + interval '1 day')
         at time zone 'America/Sao_Paulo';
$$;

create or replace function public.inicio_do_dia(p_agora timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', p_agora at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

-- Define o ator da transação atual (lido pelos triggers e defaults).
create or replace function public.definir_ator(p_ator public.ator_tipo, p_ator_nome text)
returns void
language sql
as $$
  select set_config('app.ator', coalesce(p_ator, 'richard')::text, true),
         set_config('app.ator_nome', coalesce(p_ator_nome, ''), true);
$$;

-- Garante que o lead existe e pertence a quem chama (quando há sessão de usuário).
create or replace function public.lead_do_usuario(p_lead uuid)
returns public.leads
language plpgsql
as $$
declare
  l public.leads;
begin
  select * into l from public.leads where id = p_lead for update;
  if not found or (auth.uid() is not null and l.user_id <> auth.uid()) then
    raise exception 'lead_nao_encontrado' using errcode = 'P0002';
  end if;
  return l;
end;
$$;

-- ---------------------------------------------------------------------------
-- mudar_estagio: troca o estágio com regras (motivo obrigatório em perdido).
-- A interação de mudança é gravada pelo trigger, com o ator correto.
-- ---------------------------------------------------------------------------
create or replace function public.mudar_estagio(
  p_lead uuid,
  p_estagio public.estagio_lead,
  p_motivo_perda text default null,
  p_ator public.ator_tipo default 'richard',
  p_ator_nome text default null
)
returns public.leads
language plpgsql
as $$
declare
  l public.leads;
begin
  perform public.definir_ator(p_ator, p_ator_nome);
  l := public.lead_do_usuario(p_lead);

  if p_estagio = 'perdido' and nullif(trim(coalesce(p_motivo_perda, '')), '') is null then
    raise exception 'motivo_perda_obrigatorio' using errcode = '22023';
  end if;

  update public.leads set
    estagio = p_estagio,
    motivo_perda = case when p_estagio = 'perdido' then trim(p_motivo_perda) else motivo_perda end,
    -- Fechou (ganho/perdido): encerra a cadência.
    proxima_acao_em = case when p_estagio in ('ganho', 'perdido') then null else proxima_acao_em end,
    proxima_acao = case when p_estagio in ('ganho', 'perdido') then null else proxima_acao end
  where id = p_lead
  returning * into l;

  if p_estagio in ('ganho', 'perdido') then
    update public.tarefas set concluida_em = now()
    where lead_id = p_lead and origem = 'cadencia' and concluida_em is null;
  end if;

  return l;
end;
$$;

-- ---------------------------------------------------------------------------
-- registrar_envio: o "Enviei". Grava a interação e aplica o próximo passo da
-- cadência, que é calculado em shared/cadencia.ts (front e API usam o mesmo
-- módulo) e passado aqui já pronto.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_envio(
  p_lead uuid,
  p_conteudo text,
  p_template uuid default null,
  p_estagio public.estagio_lead default null,
  p_tentativas int default null,
  p_proxima_acao text default null,
  p_proxima_acao_em timestamptz default null,
  p_ator public.ator_tipo default 'richard',
  p_ator_nome text default null
)
returns uuid
language plpgsql
as $$
declare
  l public.leads;
  v_interacao uuid;
begin
  perform public.definir_ator(p_ator, p_ator_nome);
  l := public.lead_do_usuario(p_lead);

  if l.opt_out then
    raise exception 'lead_opt_out' using errcode = '42501';
  end if;

  insert into public.interacoes (user_id, lead_id, tipo, conteudo, template_id)
  values (l.user_id, l.id, 'whatsapp_enviado', p_conteudo, p_template)
  returning id into v_interacao;

  update public.leads set
    ultimo_contato_em = now(),
    estagio = coalesce(p_estagio, estagio),
    tentativas_sem_resposta = coalesce(p_tentativas, tentativas_sem_resposta),
    proxima_acao = p_proxima_acao,
    proxima_acao_em = p_proxima_acao_em
  where id = p_lead;

  -- Mensagem enviada resolve tarefas automáticas pendentes ("Responder X", "Reativar X").
  update public.tarefas set concluida_em = now()
  where lead_id = p_lead and origem = 'cadencia' and concluida_em is null and vence_em <= public.fim_do_dia();

  return v_interacao;
end;
$$;

-- ---------------------------------------------------------------------------
-- marcar_respondeu: o botão "Respondeu" (e o wa-bridge ao receber mensagem).
-- ---------------------------------------------------------------------------
create or replace function public.marcar_respondeu(
  p_lead uuid,
  p_conteudo text default null,
  p_ator public.ator_tipo default 'richard',
  p_ator_nome text default null
)
returns uuid
language plpgsql
as $$
declare
  l public.leads;
  v_tarefa uuid;
begin
  perform public.definir_ator(p_ator, p_ator_nome);
  l := public.lead_do_usuario(p_lead);

  insert into public.interacoes (user_id, lead_id, tipo, conteudo)
  values (l.user_id, l.id, 'whatsapp_recebido', p_conteudo);

  update public.leads set
    estagio = case when estagio in ('novo', 'abordado', 'sem_resposta', 'perdido') then 'respondeu' else estagio end,
    tentativas_sem_resposta = 0,
    ultima_resposta_em = now(),
    proxima_acao = 'Responder',
    proxima_acao_em = null
  where id = p_lead;

  -- Cancela follow-ups automáticos e cria "Responder {empresa}" para agora.
  update public.tarefas set concluida_em = now()
  where lead_id = p_lead and origem = 'cadencia' and concluida_em is null;

  insert into public.tarefas (user_id, lead_id, titulo, vence_em, origem)
  values (l.user_id, l.id, 'Responder ' || l.empresa, now(), 'cadencia')
  returning id into v_tarefa;

  return v_tarefa;
end;
$$;

-- ---------------------------------------------------------------------------
-- encerrar_cadencia: sem resposta após a última mensagem → sem_resposta +
-- tarefa "Reativar" (a decisão de QUANDO é de shared/cadencia.ts).
-- ---------------------------------------------------------------------------
create or replace function public.encerrar_cadencia(
  p_lead uuid,
  p_reativar_em timestamptz,
  p_ator public.ator_tipo default 'richard',
  p_ator_nome text default null
)
returns void
language plpgsql
as $$
declare
  l public.leads;
begin
  perform public.definir_ator(p_ator, p_ator_nome);
  l := public.lead_do_usuario(p_lead);
  if l.estagio <> 'abordado' then
    return; -- já mudou (respondeu, perdido...): nada a fazer
  end if;

  update public.leads set
    estagio = 'sem_resposta',
    proxima_acao = null,
    proxima_acao_em = null
  where id = p_lead;

  insert into public.tarefas (user_id, lead_id, titulo, vence_em, origem)
  values (l.user_id, l.id, 'Reativar ' || l.empresa, p_reativar_em, 'cadencia');
end;
$$;

-- ---------------------------------------------------------------------------
-- fila_hoje: a fila do dia. Mesma função para a tela Hoje e GET /fila/hoje.
-- Retorna os candidatos de cada bloco; a ação sugerida e o template de cada
-- item são decididos por shared/fila.ts.
-- ---------------------------------------------------------------------------
create or replace function public.fila_hoje(p_user uuid default null)
returns jsonb
language plpgsql
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_fim timestamptz := public.fim_do_dia();
  v_inicio timestamptz := public.inicio_do_dia();
  v_config public.config;
  v_abordagens int;
  v_restante int;
begin
  if v_user is null or (auth.uid() is not null and v_user <> auth.uid()) then
    raise exception 'usuario_invalido' using errcode = '42501';
  end if;

  select * into v_config from public.config where user_id = v_user;

  -- Expira propostas do agente vencidas.
  update public.acoes_pendentes set status = 'expirada'
  where user_id = v_user and status = 'pendente' and expira_em <= now();

  select count(*) into v_abordagens
  from public.interacoes
  where user_id = v_user and tipo = 'mudanca_estagio'
    and dados ->> 'de' = 'novo' and dados ->> 'para' = 'abordado'
    and ocorreu_em >= v_inicio and ocorreu_em < v_fim;

  v_restante := greatest(coalesce(v_config.meta_diaria, 20) - v_abordagens, 0);

  return jsonb_build_object(
    'gerada_em', now(),
    'meta_diaria', coalesce(v_config.meta_diaria, 20),
    'abordagens_hoje', v_abordagens,
    'config', to_jsonb(v_config),

    'para_aprovar', coalesce((
      select jsonb_agg(
        to_jsonb(a) || jsonb_build_object(
          'lead', case when l.id is null then null else jsonb_build_object(
            'id', l.id, 'empresa', l.empresa, 'contato_nome', l.contato_nome,
            'whatsapp', l.whatsapp, 'cidade', l.cidade, 'estagio', l.estagio, 'opt_out', l.opt_out) end,
          'chave_nome', k.nome
        ) order by a.created_at)
      from public.acoes_pendentes a
      left join public.leads l on l.id = a.lead_id
      left join public.api_chaves k on k.id = a.criada_por
      where a.user_id = v_user and a.status = 'pendente'
    ), '[]'::jsonb),

    'responderam', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.ultima_resposta_em)
      from public.leads l
      where l.user_id = v_user and not l.arquivado and not l.opt_out
        and l.ultima_resposta_em is not null
        and l.ultima_resposta_em > coalesce(l.ultimo_contato_em, '-infinity'::timestamptz)
        and l.estagio not in ('ganho', 'perdido')
    ), '[]'::jsonb),

    'followups', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.proxima_acao_em)
      from public.leads l
      where l.user_id = v_user and not l.arquivado and not l.opt_out
        and l.proxima_acao_em is not null and l.proxima_acao_em < v_fim
        and l.estagio not in ('ganho', 'perdido')
        and not (l.ultima_resposta_em is not null
                 and l.ultima_resposta_em > coalesce(l.ultimo_contato_em, '-infinity'::timestamptz))
    ), '[]'::jsonb),

    'novos', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (
        select l.* from public.leads l
        where l.user_id = v_user and not l.arquivado and not l.opt_out
          and l.estagio = 'novo' and l.proxima_acao_em is null
        order by l.created_at desc
        limit v_restante
      ) n
    ), '[]'::jsonb),

    'novos_total', (
      select count(*) from public.leads l
      where l.user_id = v_user and not l.arquivado and not l.opt_out and l.estagio = 'novo'
    ),

    'tarefas', coalesce((
      select jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'lead', case when l.id is null then null else jsonb_build_object(
            'id', l.id, 'empresa', l.empresa, 'contato_nome', l.contato_nome,
            'cidade', l.cidade, 'estagio', l.estagio) end
        ) order by t.vence_em)
      from public.tarefas t
      left join public.leads l on l.id = t.lead_id
      where t.user_id = v_user and t.concluida_em is null and t.vence_em < v_fim
        and (l.id is null or not l.arquivado)
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Views do painel (security_invoker: respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------------
create or replace view public.v_funil
with (security_invoker = true) as
select
  user_id,
  estagio,
  count(*)::int as quantidade,
  coalesce(sum(valor_estimado), 0)::numeric(12, 2) as valor_total
from public.leads
where not arquivado
group by user_id, estagio;

create or replace view public.v_taxa_resposta
with (security_invoker = true) as
select
  user_id,
  count(*) filter (where estagio <> 'novo' or ultimo_contato_em is not null)::int as abordados,
  count(*) filter (where ultima_resposta_em is not null)::int as responderam,
  case
    when count(*) filter (where estagio <> 'novo' or ultimo_contato_em is not null) = 0 then 0
    else round(
      count(*) filter (where ultima_resposta_em is not null)::numeric
      / count(*) filter (where estagio <> 'novo' or ultimo_contato_em is not null), 4)
  end as taxa
from public.leads
where not arquivado
group by user_id;

create or replace view public.v_receita_mes
with (security_invoker = true) as
select
  user_id,
  coalesce(sum(valor_total) filter (where status = 'pago'), 0)::numeric(12, 2) as receita_paga,
  coalesce(sum(valor_total) filter (where status = 'aguardando'), 0)::numeric(12, 2) as receita_aguardando,
  count(*) filter (where status <> 'cancelado')::int as vendas
from public.vendas
where fechada_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
group by user_id;

create or replace view public.v_receita_recorrente
with (security_invoker = true) as
select
  user_id,
  coalesce(sum(valor_mensal), 0)::numeric(12, 2) as receita_recorrente,
  count(*)::int as manutencoes_ativas
from public.vendas
where manutencao_mensal and status <> 'cancelado'
group by user_id;

create or replace view public.v_abordagens_dia
with (security_invoker = true) as
select
  user_id,
  (ocorreu_em at time zone 'America/Sao_Paulo')::date as dia,
  count(*)::int as abordagens
from public.interacoes
where tipo = 'mudanca_estagio' and dados ->> 'de' = 'novo' and dados ->> 'para' = 'abordado'
  and ocorreu_em >= now() - interval '60 days'
group by user_id, (ocorreu_em at time zone 'America/Sao_Paulo')::date;
