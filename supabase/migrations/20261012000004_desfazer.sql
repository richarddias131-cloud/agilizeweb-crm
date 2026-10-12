-- =============================================================================
-- Desfazer exato das ações rápidas (Enviei, Respondeu, mudar estágio).
-- Cada RPC devolve um "marco" (o now() da transação). Tudo o que ela gravou
-- tem created_at/concluida_em igual ao marco, então dá para reverter só aquilo.
-- =============================================================================

-- O trigger de mudança de estágio pode ser silenciado durante um desfazer.
create or replace function public.leads_registrar_mudanca_estagio()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.silenciar', true), '') = 'on' then
    return new;
  end if;
  if new.estagio is distinct from old.estagio then
    insert into public.interacoes (user_id, lead_id, tipo, conteudo, dados, ator, ator_nome)
    values (
      new.user_id,
      new.id,
      'mudanca_estagio',
      old.estagio::text || ' → ' || new.estagio::text
        || case when new.estagio = 'perdido' and new.motivo_perda is not null
             then ' (' || new.motivo_perda || ')' else '' end,
      jsonb_build_object('de', old.estagio, 'para', new.estagio, 'motivo_perda', new.motivo_perda),
      public.ator_atual(),
      public.ator_nome_atual()
    );
  end if;
  return new;
end;
$$;

-- registrar_envio e marcar_respondeu passam a devolver { id, marco }.
drop function if exists public.registrar_envio(uuid, text, uuid, public.estagio_lead, int, text, timestamptz, public.ator_tipo, text);
drop function if exists public.marcar_respondeu(uuid, text, public.ator_tipo, text);

create function public.registrar_envio(
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
returns jsonb
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

  insert into public.interacoes (user_id, lead_id, tipo, conteudo, template_id, created_at)
  values (l.user_id, l.id, 'whatsapp_enviado', p_conteudo, p_template, now())
  returning id into v_interacao;

  update public.leads set
    ultimo_contato_em = now(),
    estagio = coalesce(p_estagio, estagio),
    tentativas_sem_resposta = coalesce(p_tentativas, tentativas_sem_resposta),
    proxima_acao = p_proxima_acao,
    proxima_acao_em = p_proxima_acao_em
  where id = p_lead;

  -- Mensagem enviada resolve tarefas automáticas vencidas ("Responder X", "Reativar X").
  update public.tarefas set concluida_em = now()
  where lead_id = p_lead and origem = 'cadencia' and concluida_em is null and vence_em <= public.fim_do_dia();

  return jsonb_build_object('id', v_interacao, 'marco', now());
end;
$$;

create function public.marcar_respondeu(
  p_lead uuid,
  p_conteudo text default null,
  p_ator public.ator_tipo default 'richard',
  p_ator_nome text default null
)
returns jsonb
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

  update public.tarefas set concluida_em = now()
  where lead_id = p_lead and origem = 'cadencia' and concluida_em is null;

  insert into public.tarefas (user_id, lead_id, titulo, vence_em, origem)
  values (l.user_id, l.id, 'Responder ' || l.empresa, now(), 'cadencia')
  returning id into v_tarefa;

  return jsonb_build_object('id', v_tarefa, 'marco', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- desfazer_acao: reverte o que uma RPC gravou no "marco" e restaura os campos
-- do lead a partir do retrato tirado antes da ação.
-- ---------------------------------------------------------------------------
create or replace function public.desfazer_acao(
  p_lead uuid,
  p_marco timestamptz,
  p_anterior jsonb
)
returns void
language plpgsql
as $$
declare
  l public.leads;
begin
  l := public.lead_do_usuario(p_lead);
  perform set_config('app.silenciar', 'on', true);

  delete from public.interacoes where lead_id = p_lead and created_at = p_marco;
  delete from public.tarefas where lead_id = p_lead and created_at = p_marco and origem = 'cadencia';
  update public.tarefas set concluida_em = null where lead_id = p_lead and concluida_em = p_marco;

  update public.leads set
    estagio = coalesce((p_anterior ->> 'estagio')::public.estagio_lead, estagio),
    motivo_perda = case when p_anterior ? 'motivo_perda' then p_anterior ->> 'motivo_perda' else motivo_perda end,
    tentativas_sem_resposta = coalesce((p_anterior ->> 'tentativas_sem_resposta')::int, tentativas_sem_resposta),
    proxima_acao = case when p_anterior ? 'proxima_acao' then p_anterior ->> 'proxima_acao' else proxima_acao end,
    proxima_acao_em = case when p_anterior ? 'proxima_acao_em' then (p_anterior ->> 'proxima_acao_em')::timestamptz else proxima_acao_em end,
    ultimo_contato_em = case when p_anterior ? 'ultimo_contato_em' then (p_anterior ->> 'ultimo_contato_em')::timestamptz else ultimo_contato_em end,
    ultima_resposta_em = case when p_anterior ? 'ultima_resposta_em' then (p_anterior ->> 'ultima_resposta_em')::timestamptz else ultima_resposta_em end
  where id = p_lead;
end;
$$;
