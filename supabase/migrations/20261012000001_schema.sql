-- =============================================================================
-- CRM AgilizeWeb — schema principal
-- Todas as tabelas: id uuid, user_id (default auth.uid()), created_at, updated_at,
-- RLS ligado com política auth.uid() = user_id.
-- =============================================================================

-- ---------- Tipos ----------
create type public.estagio_lead as enum (
  'novo', 'abordado', 'respondeu', 'auditoria_enviada', 'proposta_enviada',
  'negociacao', 'ganho', 'perdido', 'sem_resposta'
);

create type public.tipo_interacao as enum (
  'whatsapp_enviado', 'whatsapp_recebido', 'ligacao', 'nota', 'auditoria',
  'proposta', 'mudanca_estagio'
);

create type public.ator_tipo as enum ('richard', 'agente', 'bridge');

-- ---------- Funções utilitárias ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Quem está escrevendo (para a linha do tempo). As funções RPC chamadas pela
-- API definem app.ator / app.ator_nome na mesma transação; sem isso, é o Richard.
create or replace function public.ator_atual()
returns public.ator_tipo
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.ator', true), ''), 'richard')::public.ator_tipo;
$$;

create or replace function public.ator_nome_atual()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.ator_nome', true), '');
$$;

-- Ordem dos estágios (para "avançar só se fizer sentido").
create or replace function public.estagio_ordem(e public.estagio_lead)
returns int
language sql
immutable
as $$
  select case e
    when 'novo' then 0 when 'abordado' then 1 when 'sem_resposta' then 1
    when 'respondeu' then 2 when 'auditoria_enviada' then 3
    when 'proposta_enviada' then 4 when 'negociacao' then 5
    when 'ganho' then 6 when 'perdido' then 6
  end;
$$;

-- ---------- servicos ----------
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  preco numeric(10, 2) not null check (preco >= 0),
  recorrente boolean not null default false,
  preco_mensal numeric(10, 2) check (preco_mensal is null or preco_mensal >= 0),
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index servicos_user_idx on public.servicos (user_id, ordem);

-- ---------- leads ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  empresa text not null check (length(trim(empresa)) > 0),
  contato_nome text,
  whatsapp text not null check (whatsapp ~ '^55[1-9][0-9][0-9]{8,9}$'),
  cidade text not null default '',
  uf char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  segmento text,
  origem text not null default 'prospeccao_ativa'
    check (origem in ('prospeccao_ativa', 'indicacao', 'instagram', 'site', 'importacao', 'agente')),
  link_google text,
  site_atual text,
  instagram text,
  nota_auditoria smallint check (nota_auditoria between 0 and 100),
  servico_interesse uuid references public.servicos (id) on delete set null,
  valor_estimado numeric(10, 2) check (valor_estimado is null or valor_estimado >= 0),
  estagio public.estagio_lead not null default 'novo',
  motivo_perda text,
  proxima_acao text,
  proxima_acao_em timestamptz,
  ultimo_contato_em timestamptz,
  -- Última vez que o lead respondeu. Nulo = nunca respondeu (prospecção fria).
  ultima_resposta_em timestamptz,
  tentativas_sem_resposta int not null default 0 check (tentativas_sem_resposta >= 0),
  opt_out boolean not null default false,
  arquivado boolean not null default false,
  tags text[] not null default '{}',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_whatsapp_unico unique (user_id, whatsapp),
  constraint leads_motivo_perda check (estagio <> 'perdido' or motivo_perda is not null)
);
create index leads_user_estagio_idx on public.leads (user_id, estagio) where not arquivado;
create index leads_user_proxima_idx on public.leads (user_id, proxima_acao_em) where not arquivado;
create index leads_user_updated_idx on public.leads (user_id, updated_at);
create index leads_tags_idx on public.leads using gin (tags);

-- ---------- templates ----------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Identificador estável usado pela cadência (abordagem, followup1...). Opcional.
  chave text,
  nome text not null check (length(trim(nome)) > 0),
  estagio_alvo public.estagio_lead,
  corpo text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_chave_unica unique (user_id, chave)
);

-- ---------- interacoes ----------
create table public.interacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  tipo public.tipo_interacao not null,
  conteudo text,
  -- Dados estruturados (ex.: mudança de estágio {de, para}).
  dados jsonb not null default '{}',
  template_id uuid references public.templates (id) on delete set null,
  ocorreu_em timestamptz not null default now(),
  ator public.ator_tipo not null default public.ator_atual(),
  ator_nome text default public.ator_nome_atual(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interacoes_lead_idx on public.interacoes (lead_id, ocorreu_em desc);
create index interacoes_user_tipo_idx on public.interacoes (user_id, tipo, ocorreu_em);

-- ---------- tarefas ----------
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  vence_em timestamptz not null default now(),
  concluida_em timestamptz,
  origem text not null default 'manual' check (origem in ('manual', 'cadencia', 'agente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tarefas_user_abertas_idx on public.tarefas (user_id, vence_em) where concluida_em is null;
create index tarefas_lead_idx on public.tarefas (lead_id);

-- ---------- vendas ----------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete restrict,
  -- [{ servico_id, nome, qtd, preco }]
  itens jsonb not null default '[]',
  valor_total numeric(10, 2) not null check (valor_total >= 0),
  forma_pagamento text,
  status text not null default 'aguardando' check (status in ('aguardando', 'pago', 'cancelado')),
  manutencao_mensal boolean not null default false,
  -- Valor da manutenção mensal (quando manutencao_mensal = true).
  valor_mensal numeric(10, 2) not null default 0 check (valor_mensal >= 0),
  fechada_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendas_user_fechada_idx on public.vendas (user_id, fechada_em);

-- ---------- config (uma linha por usuário) ----------
create table public.config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade unique,
  -- Dias entre os passos: abordagem → FU1 → FU2 → Última.
  cadencia_dias int[] not null default '{2,3,5}',
  -- Dias após a última mensagem sem resposta até mover para sem_resposta.
  encerrar_apos_dias int not null default 5 check (encerrar_apos_dias >= 0),
  -- Dias até a tarefa "Reativar".
  reativar_apos_dias int not null default 60 check (reativar_apos_dias >= 0),
  meta_diaria int not null default 20 check (meta_diaria between 0 and 500),
  whatsapp_modo text not null default 'auto' check (whatsapp_modo in ('auto', 'web', 'app', 'perguntar')),
  tema text not null default 'system' check (tema in ('light', 'dark', 'system')),
  assinatura text,
  whatsapp_proprio text,
  -- Agente
  agente_pausado boolean not null default false,
  permitir_envio_direto_apos_resposta boolean not null default false,
  bridge_limite_diario int not null default 40 check (bridge_limite_diario >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- api_chaves ----------
create table public.api_chaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  prefixo text not null,
  hash text not null unique,
  escopos text[] not null default '{leitura}'
    check (escopos <@ array['leitura', 'escrita', 'envio', 'relatorios']::text[]),
  ativa boolean not null default true,
  ultimo_uso_em timestamptz,
  expira_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- api_log (retenção 30 dias) ----------
create table public.api_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chave_id uuid references public.api_chaves (id) on delete set null,
  metodo text not null,
  rota text not null,
  status_http int not null,
  duracao_ms int not null default 0,
  resumo text,
  criado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_log_user_criado_idx on public.api_log (user_id, criado_em desc);
create index api_log_chave_criado_idx on public.api_log (chave_id, criado_em desc);

-- ---------- acoes_pendentes ----------
create table public.acoes_pendentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('enviar_mensagem', 'mudar_estagio', 'criar_venda', 'outro')),
  lead_id uuid references public.leads (id) on delete cascade,
  payload jsonb not null default '{}',
  justificativa text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada', 'expirada')),
  decidida_em timestamptz,
  expira_em timestamptz not null default now() + interval '48 hours',
  criada_por uuid references public.api_chaves (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index acoes_pendentes_user_status_idx on public.acoes_pendentes (user_id, status, created_at);

-- ---------- webhooks ----------
create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null check (url ~ '^https://'),
  eventos text[] not null default '{}',
  segredo text not null,
  ativo boolean not null default true,
  ultimo_status int,
  falhas_seguidas int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- idempotencia (retenção 24 h) ----------
create table public.idempotencia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chave_id uuid not null references public.api_chaves (id) on delete cascade,
  idempotency_key text not null,
  status_http int not null default 200,
  resposta jsonb not null,
  criado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotencia_unica unique (chave_id, idempotency_key)
);

-- ---------- Triggers de updated_at ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'servicos', 'leads', 'templates', 'interacoes', 'tarefas', 'vendas', 'config',
    'api_chaves', 'api_log', 'acoes_pendentes', 'webhooks', 'idempotencia'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ---------- Interação automática a cada mudança de estágio ----------
create or replace function public.leads_registrar_mudanca_estagio()
returns trigger
language plpgsql
as $$
begin
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

create trigger leads_mudanca_estagio
after update of estagio on public.leads
for each row execute function public.leads_registrar_mudanca_estagio();

-- ---------- RLS ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'servicos', 'leads', 'templates', 'interacoes', 'tarefas', 'vendas', 'config',
    'api_chaves', 'api_log', 'acoes_pendentes', 'webhooks', 'idempotencia'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_dono', t
    );
  end loop;
end;
$$;

-- Realtime: o front escuta leads, interações e ações pendentes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.leads, public.interacoes, public.acoes_pendentes;
  end if;
end;
$$;
