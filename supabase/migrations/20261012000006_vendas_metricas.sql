-- =============================================================================
-- Vendas (registro atômico) e métricas (uma função para o Painel e a API).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- registrar_venda: cria a venda (total calculado aqui) e marca o lead como ganho.
-- p_itens: [{ servico_id, nome, qtd, preco }]
-- ---------------------------------------------------------------------------
create or replace function public.registrar_venda(
  p_lead uuid,
  p_itens jsonb,
  p_forma_pagamento text default null,
  p_status text default 'aguardando',
  p_manutencao_mensal boolean default false,
  p_valor_mensal numeric default 0,
  p_fechada_em timestamptz default null,
  p_ator public.ator_tipo default 'richard',
  p_ator_nome text default null
)
returns public.vendas
language plpgsql
as $$
declare
  l public.leads;
  v public.vendas;
  v_total numeric(10, 2);
begin
  perform public.definir_ator(p_ator, p_ator_nome);
  l := public.lead_do_usuario(p_lead);

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'venda_sem_itens' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
    where coalesce((i ->> 'qtd')::numeric, 0) <= 0 or coalesce((i ->> 'preco')::numeric, -1) < 0
  ) then
    raise exception 'venda_item_invalido' using errcode = '22023';
  end if;

  select coalesce(sum((i ->> 'qtd')::numeric * (i ->> 'preco')::numeric), 0) into v_total
  from jsonb_array_elements(p_itens) i;

  insert into public.vendas (user_id, lead_id, itens, valor_total, forma_pagamento, status, manutencao_mensal, valor_mensal, fechada_em)
  values (
    l.user_id, l.id, p_itens, v_total, nullif(trim(coalesce(p_forma_pagamento, '')), ''),
    coalesce(p_status, 'aguardando'), coalesce(p_manutencao_mensal, false),
    case when coalesce(p_manutencao_mensal, false) then coalesce(p_valor_mensal, 0) else 0 end,
    coalesce(p_fechada_em, now())
  )
  returning * into v;

  if l.estagio <> 'ganho' then
    update public.leads set estagio = 'ganho', proxima_acao = null, proxima_acao_em = null where id = l.id;
    update public.tarefas set concluida_em = now() where lead_id = l.id and origem = 'cadencia' and concluida_em is null;
  end if;

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- metricas_resumo: números do período [p_de, p_ate).
-- ---------------------------------------------------------------------------
create or replace function public.metricas_resumo(
  p_user uuid default null,
  p_de timestamptz default null,
  p_ate timestamptz default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_de timestamptz := coalesce(p_de, v_inicio_mes);
  v_ate timestamptz := coalesce(p_ate, now());
begin
  if v_user is null or (auth.uid() is not null and v_user <> auth.uid()) then
    raise exception 'usuario_invalido' using errcode = '42501';
  end if;
  if v_ate <= v_de then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate),

    -- Retrato atual do funil (não depende do período).
    'funil', coalesce((
      select jsonb_agg(jsonb_build_object('estagio', e.estagio, 'quantidade', coalesce(f.quantidade, 0), 'valor_estimado', coalesce(f.valor, 0))
                       order by public.estagio_ordem(e.estagio), e.estagio)
      from unnest(enum_range(null::public.estagio_lead)) as e(estagio)
      left join (
        select estagio, count(*)::int as quantidade, sum(valor_estimado)::numeric(12, 2) as valor
        from public.leads where user_id = v_user and not arquivado group by estagio
      ) f on f.estagio = e.estagio
    ), '[]'::jsonb),

    -- Leads abordados no período e quantos deles responderam.
    'taxa_resposta', (
      select jsonb_build_object(
        'abordados', count(*)::int,
        'responderam', count(*) filter (where l.ultima_resposta_em is not null)::int,
        'taxa', case when count(*) = 0 then 0
                     else round(count(*) filter (where l.ultima_resposta_em is not null)::numeric / count(*), 4) end)
      from public.leads l
      where l.user_id = v_user and exists (
        select 1 from public.interacoes i
        where i.lead_id = l.id and i.tipo = 'mudanca_estagio'
          and i.dados ->> 'de' = 'novo' and i.dados ->> 'para' = 'abordado'
          and i.ocorreu_em >= v_de and i.ocorreu_em < v_ate)
    ),

    'abordagens_por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia::date, 'quantidade', coalesce(a.qtd, 0)) order by d.dia)
      from generate_series(
        (v_de at time zone 'America/Sao_Paulo')::date,
        ((v_ate - interval '1 microsecond') at time zone 'America/Sao_Paulo')::date,
        interval '1 day') as d(dia)
      left join (
        select (ocorreu_em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as qtd
        from public.interacoes
        where user_id = v_user and tipo = 'mudanca_estagio'
          and dados ->> 'de' = 'novo' and dados ->> 'para' = 'abordado'
          and ocorreu_em >= v_de and ocorreu_em < v_ate
        group by 1
      ) a on a.dia = d.dia::date
    ), '[]'::jsonb),

    'receita_periodo', (
      select jsonb_build_object(
        'paga', coalesce(sum(valor_total) filter (where status = 'pago'), 0),
        'aguardando', coalesce(sum(valor_total) filter (where status = 'aguardando'), 0),
        'vendas', count(*) filter (where status <> 'cancelado')::int)
      from public.vendas where user_id = v_user and fechada_em >= v_de and fechada_em < v_ate
    ),

    'receita_mes', (
      select jsonb_build_object(
        'paga', coalesce(sum(valor_total) filter (where status = 'pago'), 0),
        'aguardando', coalesce(sum(valor_total) filter (where status = 'aguardando'), 0),
        'vendas', count(*) filter (where status <> 'cancelado')::int)
      from public.vendas where user_id = v_user and fechada_em >= v_inicio_mes
    ),

    'receita_recorrente', (
      select jsonb_build_object('mensal', coalesce(sum(valor_mensal), 0), 'manutencoes_ativas', count(*)::int)
      from public.vendas where user_id = v_user and manutencao_mensal and status <> 'cancelado'
    ),

    'motivos_perda', coalesce((
      select jsonb_agg(jsonb_build_object('motivo', motivo, 'quantidade', qtd) order by qtd desc, motivo)
      from (
        select coalesce(nullif(trim(i.dados ->> 'motivo_perda'), ''), 'Sem motivo') as motivo, count(*)::int as qtd
        from public.interacoes i
        where i.user_id = v_user and i.tipo = 'mudanca_estagio' and i.dados ->> 'para' = 'perdido'
          and i.ocorreu_em >= v_de and i.ocorreu_em < v_ate
        group by 1
      ) m
    ), '[]'::jsonb),

    -- Segmentos que mais respondem (leads contatados alguma vez).
    'segmentos', coalesce((
      select jsonb_agg(jsonb_build_object('segmento', segmento, 'abordados', abordados, 'responderam', responderam,
                                          'taxa', round(responderam::numeric / abordados, 4))
                       order by responderam::numeric / abordados desc, abordados desc)
      from (
        select coalesce(nullif(trim(segmento), ''), 'Sem segmento') as segmento,
               count(*)::int as abordados,
               count(*) filter (where ultima_resposta_em is not null)::int as responderam
        from public.leads
        where user_id = v_user and not arquivado and (ultimo_contato_em is not null or estagio <> 'novo')
        group by 1
      ) s
    ), '[]'::jsonb)
  );
end;
$$;
