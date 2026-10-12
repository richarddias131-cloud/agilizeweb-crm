-- =============================================================================
-- fila_hoje: ações pendentes passam a trazer o lead completo (a aprovação de
-- uma mensagem registra o envio com a cadência, que precisa de todos os campos).
-- =============================================================================
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
          'lead', case when l.id is null then null else to_jsonb(l) end,
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

