// Especificação OpenAPI 3.1 da API do CRM — fonte única.
// Servida em GET /openapi.json; gera docs/openapi.yaml e docs/grok-tools.json
// (npm run docs:api). Cada operação com "x-ferramenta" vira uma ferramenta do Grok.

type Esquema = Record<string, unknown>
type Param = { name: string; in: 'query' | 'path'; required?: boolean; description: string; schema: Esquema }

export const VERSAO_API = '1.0.0'

const ESTAGIOS = ['novo', 'abordado', 'respondeu', 'auditoria_enviada', 'proposta_enviada', 'negociacao', 'ganho', 'perdido', 'sem_resposta']
const ref = (nome: string) => ({ $ref: `#/components/schemas/${nome}` })
const texto = (description: string, extra: Esquema = {}) => ({ type: 'string', description, ...extra })
const uuid = (description: string) => ({ type: 'string', format: 'uuid', description })
const dataHora = (description: string) => ({ type: 'string', format: 'date-time', description })
const anulavel = (s: Esquema) => ({ ...s, type: [s.type as string, 'null'] })
const pathId = (description = 'Id do lead (uuid).'): Param => ({ name: 'id', in: 'path', required: true, description, schema: { type: 'string', format: 'uuid' } })
const q = (name: string, description: string, schema: Esquema = { type: 'string' }): Param => ({ name, in: 'query', description, schema })
const paginacao = [
  q('limite', 'Itens por página (1 a 200, padrão 50).', { type: 'integer', minimum: 1, maximum: 200 }),
  q('cursor', 'Valor de "proximo_cursor" da página anterior.'),
]
const lista = (item: string) => ({
  type: 'object',
  required: ['dados', 'proximo_cursor'],
  properties: { dados: { type: 'array', items: ref(item) }, proximo_cursor: anulavel({ type: 'string', description: 'Null quando não há mais páginas.' }) },
})
const corpoJson = (schema: Esquema, obrigatorio = true) => ({ required: obrigatorio, content: { 'application/json': { schema } } })
const resp = (description: string, schema?: Esquema) => (schema ? { description, content: { 'application/json': { schema } } } : { description })

const ERROS_COMUNS = {
  '401': { $ref: '#/components/responses/NaoAutenticado' },
  '403': { $ref: '#/components/responses/Proibido' },
  '429': { $ref: '#/components/responses/Limite' },
}
const ERROS_ESCRITA = { ...ERROS_COMUNS, '422': { $ref: '#/components/responses/Invalido' }, '503': { $ref: '#/components/responses/Pausado' } }

type Op = {
  summary: string
  description?: string
  tags: string[]
  escopo: string | null
  parameters?: Param[]
  requestBody?: Esquema
  responses: Record<string, unknown>
  ferramenta?: { nome: string; descricao: string }
}

function op(o: Op) {
  const { escopo, ferramenta, parameters, requestBody, ...resto } = o
  const params: unknown[] = [...(parameters ?? [])]
  if (requestBody) params.push({ $ref: '#/components/parameters/IdempotencyKey' })
  return {
    ...resto,
    ...(params.length ? { parameters: params } : {}),
    ...(requestBody ? { requestBody } : {}),
    ...(escopo ? { security: [{ chaveApi: [] }], 'x-escopo': escopo } : { security: [] }),
    ...(ferramenta ? { 'x-ferramenta': ferramenta } : {}),
  }
}

const LEAD_ENTRADA: Esquema = {
  type: 'object',
  properties: {
    empresa: texto('Nome da empresa.'),
    whatsapp: texto('WhatsApp em qualquer formato; o servidor normaliza para 55DDDNUMERO.', { examples: ['(19) 99999-9999'] }),
    contato_nome: anulavel(texto('Nome do contato.')),
    cidade: texto('Cidade.'),
    uf: anulavel(texto('Sigla do estado.', { examples: ['SP'] })),
    segmento: anulavel(texto('Segmento (ex.: Ótica, Estética automotiva).')),
    origem: { type: 'string', enum: ['prospeccao_ativa', 'indicacao', 'instagram', 'site', 'importacao', 'agente'], description: 'Padrão: agente.' },
    link_google: anulavel(texto('Link do Perfil do Google / Maps.')),
    site_atual: anulavel(texto('Site atual.')),
    instagram: anulavel(texto('Instagram (@perfil ou link).')),
    nota_auditoria: anulavel({ type: 'integer', minimum: 0, maximum: 100, description: 'Nota da auditoria do Perfil do Google.' }),
    servico_interesse: anulavel(uuid('Id de um serviço de GET /servicos.')),
    valor_estimado: anulavel({ type: 'number', minimum: 0, description: 'Valor em reais, como número (549.9).' }),
    proxima_acao: anulavel(texto('Próxima ação (texto curto).')),
    proxima_acao_em: anulavel(dataHora('Quando fazer a próxima ação.')),
    tags: { type: 'array', items: { type: 'string' } },
    observacoes: anulavel(texto('Observações livres.')),
    opt_out: { type: 'boolean', const: true, description: 'Só aceita true (marcar opt-out). Nunca reativa.' },
  },
  additionalProperties: false,
}

const SCHEMAS: Record<string, Esquema> = {
  Erro: {
    type: 'object',
    required: ['erro'],
    properties: {
      erro: {
        type: 'object',
        required: ['codigo', 'mensagem', 'detalhes'],
        properties: { codigo: texto('Código estável (ex.: lead_opt_out).'), mensagem: texto('O que corrigir, em português.'), detalhes: { type: 'object' } },
      },
    },
  },
  Lead: {
    type: 'object',
    properties: {
      id: uuid('Id do lead.'),
      empresa: { type: 'string' },
      contato_nome: anulavel({ type: 'string' }),
      whatsapp: texto('Normalizado: 55DDDNUMERO.'),
      cidade: { type: 'string' },
      uf: anulavel({ type: 'string' }),
      segmento: anulavel({ type: 'string' }),
      origem: { type: 'string' },
      link_google: anulavel({ type: 'string' }),
      site_atual: anulavel({ type: 'string' }),
      instagram: anulavel({ type: 'string' }),
      nota_auditoria: anulavel({ type: 'integer' }),
      servico_interesse: anulavel({ type: 'string', format: 'uuid' }),
      valor_estimado: anulavel({ type: 'number' }),
      estagio: { type: 'string', enum: ESTAGIOS },
      motivo_perda: anulavel({ type: 'string' }),
      proxima_acao: anulavel({ type: 'string' }),
      proxima_acao_em: anulavel({ type: 'string', format: 'date-time' }),
      ultimo_contato_em: anulavel({ type: 'string', format: 'date-time' }),
      ultima_resposta_em: anulavel({ type: 'string', format: 'date-time', description: 'Null = nunca respondeu (prospecção fria).' }),
      tentativas_sem_resposta: { type: 'integer' },
      opt_out: { type: 'boolean' },
      arquivado: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string' } },
      observacoes: anulavel({ type: 'string' }),
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  LeadEntrada: LEAD_ENTRADA,
  Interacao: {
    type: 'object',
    properties: {
      id: uuid(''),
      lead_id: uuid(''),
      tipo: { type: 'string', enum: ['whatsapp_enviado', 'whatsapp_recebido', 'ligacao', 'nota', 'auditoria', 'proposta', 'mudanca_estagio'] },
      conteudo: anulavel({ type: 'string' }),
      ocorreu_em: { type: 'string', format: 'date-time' },
      ator: { type: 'string', enum: ['richard', 'agente', 'bridge'] },
      ator_nome: anulavel({ type: 'string' }),
    },
  },
  Tarefa: {
    type: 'object',
    properties: {
      id: uuid(''),
      lead_id: anulavel({ type: 'string', format: 'uuid' }),
      titulo: { type: 'string' },
      vence_em: { type: 'string', format: 'date-time' },
      concluida_em: anulavel({ type: 'string', format: 'date-time' }),
      origem: { type: 'string', enum: ['manual', 'cadencia', 'agente'] },
    },
  },
  Template: {
    type: 'object',
    properties: {
      id: uuid(''),
      chave: anulavel(texto('Identificador fixo (abordagem, followup1, followup2, ultima, auditoria, proposta_kit, pos_venda).')),
      nome: { type: 'string' },
      estagio_alvo: anulavel({ type: 'string', enum: ESTAGIOS }),
      corpo: texto('Texto com variáveis {{nome}}, {{empresa}}, {{cidade}}, {{segmento}}, {{nota}}, {{servico}}, {{preco}}, {{assinatura}}.'),
    },
  },
  Servico: {
    type: 'object',
    properties: {
      id: uuid(''),
      nome: { type: 'string' },
      preco: { type: 'number' },
      recorrente: { type: 'boolean' },
      preco_mensal: anulavel({ type: 'number' }),
      ativo: { type: 'boolean' },
    },
  },
  AcaoPendente: {
    type: 'object',
    properties: {
      id: uuid(''),
      tipo: { type: 'string', enum: ['enviar_mensagem', 'mudar_estagio', 'criar_venda', 'outro'] },
      lead_id: anulavel({ type: 'string', format: 'uuid' }),
      payload: { type: 'object' },
      justificativa: anulavel({ type: 'string' }),
      status: { type: 'string', enum: ['pendente', 'aprovada', 'rejeitada', 'expirada'] },
      decidida_em: anulavel({ type: 'string', format: 'date-time' }),
      expira_em: { type: 'string', format: 'date-time' },
    },
  },
  MensagemPreparada: {
    type: 'object',
    properties: {
      lead_id: uuid(''),
      template_id: anulavel({ type: 'string', format: 'uuid' }),
      texto: texto('Mensagem final renderizada.'),
      faltando: { type: 'array', items: { type: 'string' }, description: 'Variáveis sem valor no lead.' },
      link_wa_me: { type: 'string' },
      link_whatsapp_web: { type: 'string' },
      prospeccao_fria: { type: 'boolean', description: 'true = o lead nunca respondeu; envio direto é proibido.' },
    },
  },
  ItemFila: {
    type: 'object',
    properties: {
      bloco: { type: 'string', enum: ['responderam', 'followups', 'novos'] },
      lead: ref('Lead'),
      acao_sugerida: texto('Ex.: Abordar, Follow-up 2, Enviar auditoria.'),
      tipo_acao: { type: 'string', enum: ['mensagem', 'abrir'] },
      template: anulavel({ type: 'object', properties: { id: { type: 'string' }, chave: { type: 'string' }, nome: { type: 'string' } } }),
      mensagem_sugerida: anulavel(texto('Template indicado já renderizado.')),
      prospeccao_fria: { type: 'boolean' },
    },
  },
  Venda: {
    type: 'object',
    properties: {
      id: uuid(''),
      lead_id: uuid(''),
      itens: { type: 'array', items: { type: 'object', properties: { servico_id: { type: 'string' }, nome: { type: 'string' }, qtd: { type: 'integer' }, preco: { type: 'number' } } } },
      valor_total: { type: 'number' },
      forma_pagamento: anulavel({ type: 'string' }),
      status: { type: 'string', enum: ['aguardando', 'pago', 'cancelado'] },
      manutencao_mensal: { type: 'boolean' },
      valor_mensal: { type: 'number' },
      fechada_em: { type: 'string', format: 'date-time' },
    },
  },
}

const erroResp = (description: string) => ({ description, content: { 'application/json': { schema: ref('Erro') } } })

export function especificacaoOpenApi(servidor = 'https://SEU-PROJETO.supabase.co/functions/v1/api/v1') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'API do CRM CRESBI',
      version: VERSAO_API,
      description:
        'API para o Grok Bot (ou outro agente/automação) operar o CRM com segurança. JSON com campos em português; datas ISO 8601; valores como número. ' +
        'Erros sempre em { erro: { codigo, mensagem, detalhes } }. Todo POST aceita Idempotency-Key (24 h). Limite: 60 requisições/min por chave. Não existe DELETE.',
    },
    servers: [{ url: servidor }],
    tags: [
      { name: 'Leads' },
      { name: 'Fila' },
      { name: 'Mensagens' },
      { name: 'Aprovação' },
      { name: 'Tarefas' },
      { name: 'Catálogo' },
      { name: 'Vendas e métricas' },
      { name: 'Sistema' },
    ],
    paths: {
      '/health': {
        get: op({ summary: 'Status da API', tags: ['Sistema'], escopo: null, responses: { '200': resp('OK', { type: 'object', properties: { status: { type: 'string' }, versao: { type: 'string' } } }) } }),
      },
      '/openapi.json': {
        get: op({ summary: 'Esta especificação', tags: ['Sistema'], escopo: null, responses: { '200': resp('OpenAPI 3.1') } }),
      },
      '/leads': {
        get: op({
          summary: 'Listar leads',
          tags: ['Leads'],
          escopo: 'leitura',
          parameters: [
            q('estagio', 'Filtra por estágio.', { type: 'string', enum: ESTAGIOS }),
            q('cidade', 'Cidade exata.'),
            q('segmento', 'Segmento exato.'),
            q('tag', 'Leads que têm esta tag.'),
            q('busca', 'Busca em empresa, contato, cidade e telefone.'),
            q('sem_contato_ha_dias', 'Sem contato há pelo menos N dias (inclui nunca contatados).', { type: 'integer', minimum: 0 }),
            q('atualizado_desde', 'Só leads alterados desde esta data (ISO 8601).', { type: 'string', format: 'date-time' }),
            q('incluir_arquivados', 'true para incluir arquivados.', { type: 'boolean' }),
            ...paginacao,
          ],
          responses: { '200': resp('Página de leads (mais recentes primeiro).', lista('Lead')), ...ERROS_COMUNS },
          ferramenta: { nome: 'listar_leads', descricao: 'Lista leads do CRM com filtros (estágio, cidade, segmento, tag, busca, sem contato há N dias). Use para encontrar leads para enriquecer ou acompanhar.' },
        }),
        post: op({
          summary: 'Criar ou atualizar lead (upsert pelo WhatsApp)',
          description: 'Se o WhatsApp já existir, atualiza só os campos enviados e responde criado: false. Nunca reativa opt-out.',
          tags: ['Leads'],
          escopo: 'escrita',
          requestBody: corpoJson({ ...LEAD_ENTRADA, required: ['empresa', 'whatsapp'] }),
          responses: {
            '201': resp('Criado.', { type: 'object', properties: { criado: { const: true }, lead: ref('Lead') } }),
            '200': resp('Já existia; atualizado.', { type: 'object', properties: { criado: { const: false }, lead: ref('Lead') } }),
            ...ERROS_ESCRITA,
          },
          ferramenta: { nome: 'criar_ou_atualizar_lead', descricao: 'Cadastra um lead novo ou atualiza um existente pelo WhatsApp (upsert). Obrigatórios: empresa e whatsapp. Use também para enriquecer um lead com segmento, links, nota da auditoria etc.' },
        }),
      },
      '/leads/lote': {
        post: op({
          summary: 'Criar vários leads de uma vez (até 500)',
          description: 'Mesmo relatório da importação CSV. Duplicados (no lote ou já cadastrados) e telefones inválidos são descartados, com o motivo.',
          tags: ['Leads'],
          escopo: 'escrita',
          requestBody: corpoJson({
            type: 'object',
            required: ['leads'],
            properties: {
              leads: { type: 'array', maxItems: 500, items: { ...LEAD_ENTRADA, required: ['empresa', 'whatsapp'] } },
              tag: texto('Tag aplicada a todos (ex.: nome da campanha).'),
            },
          }),
          responses: {
            '200': resp('Relatório.', {
              type: 'object',
              properties: {
                importados: { type: 'integer' },
                duplicados: { type: 'integer' },
                invalidos: { type: 'integer' },
                ids: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, whatsapp: { type: 'string' } } } },
                detalhes: { type: 'object', description: 'duplicados e invalidos: [{ linha, empresa, whatsapp, motivo }]' },
              },
            }),
            ...ERROS_ESCRITA,
          },
          ferramenta: { nome: 'criar_leads_em_lote', descricao: 'Cadastra até 500 leads de uma vez (ex.: uma lista de prospecção). Devolve quantos entraram, quantos eram duplicados e quais telefones estavam inválidos.' },
        }),
      },
      '/eventos': {
        get: op({
          summary: 'O que mudou desde um momento (sincronização por polling)',
          description: 'Use proximo_desde da resposta na próxima chamada. Para receber em tempo real, peça ao Richard um webhook.',
          tags: ['Sistema'],
          escopo: 'leitura',
          parameters: [q('desde', 'Obrigatório. Data ISO 8601.', { type: 'string', format: 'date-time' }), q('limite', '1 a 500 (padrão 200).', { type: 'integer', minimum: 1, maximum: 500 })],
          responses: {
            '200': resp('Eventos em ordem cronológica.', {
              type: 'object',
              properties: {
                dados: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      tipo: { type: 'string', enum: ['lead_criado', 'lead_atualizado', 'interacao', 'acao_decidida', 'venda_criada'] },
                      ocorreu_em: { type: 'string', format: 'date-time' },
                      lead_id: anulavel({ type: 'string', format: 'uuid' }),
                      dados: { type: 'object' },
                    },
                  },
                },
                proximo_desde: { type: 'string', format: 'date-time' },
                tem_mais: { type: 'boolean' },
              },
            }),
            ...ERROS_COMUNS,
          },
          ferramenta: { nome: 'eventos_desde', descricao: 'Lista o que mudou no CRM desde um momento (leads criados/alterados, interações, propostas decididas, vendas). Use para saber o que o Richard fez desde a sua última rodada.' },
        }),
      },
      '/leads/{id}': {
        get: op({
          summary: 'Lead completo com últimas 20 interações e tarefas abertas',
          tags: ['Leads'],
          escopo: 'leitura',
          parameters: [pathId()],
          responses: {
            '200': resp('OK', { type: 'object', properties: { lead: ref('Lead'), interacoes: { type: 'array', items: ref('Interacao') }, tarefas: { type: 'array', items: ref('Tarefa') } } }),
            '404': erroResp('lead_nao_encontrado'),
            ...ERROS_COMUNS,
          },
          ferramenta: { nome: 'obter_lead', descricao: 'Traz um lead completo, com as últimas 20 interações (linha do tempo) e tarefas abertas. Use antes de escrever uma mensagem para entender o contexto.' },
        }),
        patch: op({
          summary: 'Editar campos do lead',
          tags: ['Leads'],
          escopo: 'escrita',
          parameters: [pathId()],
          requestBody: corpoJson(LEAD_ENTRADA),
          responses: { '200': resp('Lead atualizado.', ref('Lead')), '404': erroResp('lead_nao_encontrado'), '409': erroResp('whatsapp_duplicado'), ...ERROS_ESCRITA },
          ferramenta: { nome: 'editar_lead', descricao: 'Edita campos de um lead (enriquecimento). Não muda estágio nem arquiva; opt_out só pode ser marcado como true.' },
        }),
      },
      '/leads/por-whatsapp/{numero}': {
        get: op({
          summary: 'Buscar lead pelo WhatsApp',
          tags: ['Leads'],
          escopo: 'leitura',
          parameters: [{ name: 'numero', in: 'path', required: true, description: 'Número em qualquer formato.', schema: { type: 'string' } }],
          responses: { '200': resp('OK', ref('Lead')), '404': erroResp('lead_nao_encontrado'), ...ERROS_COMUNS },
          ferramenta: { nome: 'buscar_lead_por_whatsapp', descricao: 'Encontra o lead dono de um número de WhatsApp (qualquer formato). Use antes de cadastrar para evitar duplicados.' },
        }),
      },
      '/leads/{id}/estagio': {
        post: op({
          summary: 'Mudar estágio',
          description: 'motivo_perda é obrigatório em perdido. Mudar para ganho vira ação pendente (202) para o Richard aprovar.',
          tags: ['Leads'],
          escopo: 'escrita',
          parameters: [pathId()],
          requestBody: corpoJson({
            type: 'object',
            required: ['estagio'],
            properties: { estagio: { type: 'string', enum: ESTAGIOS }, motivo_perda: texto('Obrigatório para perdido.'), justificativa: texto('Usada quando vira ação pendente (ganho).') },
          }),
          responses: {
            '200': resp('Aplicado.', { type: 'object', properties: { aplicado: { const: true }, lead: ref('Lead') } }),
            '202': resp('Virou ação pendente (ganho).', { type: 'object', properties: { aplicado: { const: false }, acao_pendente: ref('AcaoPendente') } }),
            '404': erroResp('lead_nao_encontrado'),
            ...ERROS_ESCRITA,
          },
          ferramenta: { nome: 'mudar_estagio', descricao: 'Move o lead no funil. Perdido exige motivo_perda. Ganho não é aplicado direto: vira proposta para o Richard aprovar.' },
        }),
      },
      '/leads/{id}/arquivar': {
        post: op({
          summary: 'Arquivar lead (não existe exclusão)',
          tags: ['Leads'],
          escopo: 'escrita',
          parameters: [pathId()],
          responses: { '200': resp('Arquivado.', ref('Lead')), '404': erroResp('lead_nao_encontrado'), ...ERROS_ESCRITA },
          ferramenta: { nome: 'arquivar_lead', descricao: 'Arquiva um lead (duplicado, fora do perfil). Nada é apagado.' },
        }),
      },
      '/leads/{id}/interacoes': {
        post: op({
          summary: 'Registrar interação',
          description: 'whatsapp_enviado aplica a cadência (como o "Enviei"); whatsapp_recebido tem o mesmo efeito do "Respondeu".',
          tags: ['Leads'],
          escopo: 'escrita',
          parameters: [pathId()],
          requestBody: corpoJson({
            type: 'object',
            required: ['tipo'],
            properties: {
              tipo: { type: 'string', enum: ['nota', 'ligacao', 'auditoria', 'proposta', 'whatsapp_enviado', 'whatsapp_recebido'] },
              conteudo: texto('Texto da interação.'),
              ocorreu_em: dataHora('Padrão: agora.'),
            },
          }),
          responses: { '201': resp('Registrada.'), '404': erroResp('lead_nao_encontrado'), ...ERROS_ESCRITA },
          ferramenta: { nome: 'registrar_interacao', descricao: 'Anota algo na linha do tempo do lead (nota, ligação, auditoria, proposta) ou registra mensagem enviada/recebida fora do CRM.' },
        }),
      },
      '/leads/{id}/respondeu': {
        post: op({
          summary: 'Lead respondeu',
          description: 'Mesmo efeito do botão "Respondeu": estágio respondeu, zera tentativas, cancela follow-ups e cria a tarefa "Responder {empresa}".',
          tags: ['Leads'],
          escopo: 'escrita',
          parameters: [pathId()],
          requestBody: corpoJson({ type: 'object', properties: { conteudo: texto('Texto recebido (opcional).') } }, false),
          responses: { '200': resp('OK'), '404': erroResp('lead_nao_encontrado'), ...ERROS_ESCRITA },
          ferramenta: { nome: 'marcar_respondeu', descricao: 'Registra que o lead respondeu: interrompe a cadência e cria a tarefa "Responder" para o Richard.' },
        }),
      },
      '/fila/hoje': {
        get: op({
          summary: 'Fila do dia (a mesma da tela Hoje)',
          tags: ['Fila'],
          escopo: 'leitura',
          responses: {
            '200': resp('Fila ordenada com ação sugerida e template indicado.', {
              type: 'object',
              properties: {
                progresso: { type: 'object', properties: { feitas: { type: 'integer' }, meta: { type: 'integer' } } },
                para_aprovar: { type: 'array', items: ref('AcaoPendente') },
                responderam: { type: 'array', items: ref('ItemFila') },
                followups: { type: 'array', items: ref('ItemFila') },
                novos: { type: 'array', items: ref('ItemFila') },
                tarefas: { type: 'array', items: ref('Tarefa') },
              },
            }),
            ...ERROS_COMUNS,
          },
          ferramenta: { nome: 'fila_de_hoje', descricao: 'Fila do dia: quem respondeu, follow-ups vencidos, leads novos até a meta e tarefas — com ação sugerida e mensagem já renderizada. Comece o dia por aqui.' },
        }),
      },
      '/templates': {
        get: op({ summary: 'Templates ativos', tags: ['Catálogo'], escopo: 'leitura', responses: { '200': resp('OK', lista('Template')), ...ERROS_COMUNS }, ferramenta: { nome: 'listar_templates', descricao: 'Lista os templates de mensagem ativos (id, chave, nome e corpo com variáveis).' } }),
      },
      '/servicos': {
        get: op({ summary: 'Catálogo e preços (somente leitura)', tags: ['Catálogo'], escopo: 'leitura', responses: { '200': resp('OK', lista('Servico')), ...ERROS_COMUNS }, ferramenta: { nome: 'listar_servicos', descricao: 'Catálogo de serviços e preços da CRESBI. O agente nunca altera preços.' } }),
      },
      '/mensagens/preparar': {
        post: op({
          summary: 'Preparar mensagem (não envia)',
          tags: ['Mensagens'],
          escopo: 'leitura',
          requestBody: corpoJson({
            type: 'object',
            required: ['lead_id'],
            properties: { lead_id: uuid('Lead.'), template_id: uuid('Template (ou use template_chave).'), template_chave: texto('Ex.: abordagem, followup1, auditoria.'), texto: texto('Texto livre com variáveis (em vez de template).') },
          }),
          responses: { ...ERROS_COMUNS, '200': resp('Mensagem renderizada e links.', ref('MensagemPreparada')), '403': erroResp('lead_opt_out'), '404': erroResp('lead_nao_encontrado') },
          ferramenta: { nome: 'preparar_mensagem', descricao: 'Renderiza a mensagem para um lead a partir de um template (ou texto livre) e devolve o texto final e os links do WhatsApp. Não envia nada.' },
        }),
      },
      '/mensagens/enviar': {
        post: op({
          summary: 'Enviar mensagem (ou propor para aprovação)',
          description:
            'Envia pelo wa-bridge só se: a chave tem o escopo envio, o lead já respondeu antes, o Richard ligou "permitir envio direto após resposta" e o bridge está online. ' +
            'Em qualquer outro caso (incluindo toda prospecção fria) cria uma ação pendente e responde 202.',
          tags: ['Mensagens'],
          escopo: 'escrita',
          requestBody: corpoJson({
            type: 'object',
            required: ['lead_id'],
            properties: {
              lead_id: uuid('Lead.'),
              template_id: uuid('Template.'),
              template_chave: texto('Chave do template.'),
              texto: texto('Texto final (em vez de template).'),
              justificativa: texto('Por que enviar agora (aparece para o Richard).'),
            },
          }),
          responses: {
            ...ERROS_ESCRITA,
            '201': resp('Enviado pelo bridge.'),
            '202': resp('Virou ação pendente.', { type: 'object', properties: { enviado: { const: false }, motivo: { type: 'string', enum: ['prospeccao_fria', 'sem_escopo_envio', 'envio_direto_desligado', 'bridge_offline'] }, acao_pendente: ref('AcaoPendente') } }),
            '403': erroResp('lead_opt_out'),
            '404': erroResp('lead_nao_encontrado'),
          },
          ferramenta: { nome: 'enviar_mensagem', descricao: 'Pede o envio de uma mensagem ao lead. Prospecção fria nunca sai direto: vira proposta na fila "Para aprovar" do Richard (resposta 202). Sempre inclua uma justificativa.' },
        }),
      },
      '/acoes-pendentes': {
        post: op({
          summary: 'Propor ação para o Richard aprovar',
          tags: ['Aprovação'],
          escopo: 'escrita',
          requestBody: corpoJson({
            type: 'object',
            required: ['tipo', 'justificativa'],
            properties: {
              tipo: { type: 'string', enum: ['enviar_mensagem', 'mudar_estagio', 'criar_venda', 'outro'] },
              lead_id: uuid('Obrigatório exceto para "outro".'),
              payload: { type: 'object', description: 'enviar_mensagem: { texto }; mudar_estagio: { estagio, motivo_perda? }; criar_venda: { itens, forma_pagamento? }.' },
              justificativa: texto('Por que o Richard deveria aprovar.'),
              expira_em_horas: { type: 'number', minimum: 1, maximum: 168, description: 'Padrão 48.' },
            },
          }),
          responses: { '201': resp('Proposta criada.', ref('AcaoPendente')), ...ERROS_ESCRITA },
          ferramenta: { nome: 'propor_acao', descricao: 'Propõe uma ação para o Richard aprovar em 1 toque (mensagem, mudança de estágio, venda ou outra). Sempre explique a justificativa.' },
        }),
      },
      '/acoes-pendentes/{id}': {
        get: op({
          summary: 'Status de uma proposta',
          tags: ['Aprovação'],
          escopo: 'leitura',
          parameters: [pathId('Id da ação pendente.')],
          responses: { '200': resp('OK', ref('AcaoPendente')), '404': erroResp('acao_nao_encontrado'), ...ERROS_COMUNS },
          ferramenta: { nome: 'status_da_proposta', descricao: 'Consulta se uma proposta foi aprovada, rejeitada, expirou ou ainda está pendente.' },
        }),
      },
      '/tarefas': {
        get: op({
          summary: 'Listar tarefas',
          tags: ['Tarefas'],
          escopo: 'leitura',
          parameters: [q('lead_id', 'Só de um lead.', { type: 'string', format: 'uuid' }), q('abertas', 'false para incluir concluídas (padrão true).', { type: 'boolean' }), ...paginacao],
          responses: { '200': resp('OK', lista('Tarefa')), ...ERROS_COMUNS },
          ferramenta: { nome: 'listar_tarefas', descricao: 'Lista tarefas (abertas por padrão), opcionalmente de um lead.' },
        }),
        post: op({
          summary: 'Criar tarefa',
          tags: ['Tarefas'],
          escopo: 'escrita',
          requestBody: corpoJson({ type: 'object', required: ['titulo'], properties: { titulo: texto('O que fazer.'), vence_em: dataHora('Padrão: agora.'), lead_id: uuid('Lead (opcional).') } }),
          responses: { '201': resp('Criada.', ref('Tarefa')), ...ERROS_ESCRITA },
          ferramenta: { nome: 'criar_tarefa', descricao: 'Cria uma tarefa para o Richard (ex.: ligar, conferir algo), com vencimento.' },
        }),
      },
      '/tarefas/{id}': {
        patch: op({
          summary: 'Editar ou concluir tarefa',
          tags: ['Tarefas'],
          escopo: 'escrita',
          parameters: [pathId('Id da tarefa.')],
          requestBody: corpoJson({ type: 'object', properties: { titulo: { type: 'string' }, vence_em: dataHora(''), concluida: { type: 'boolean' } } }),
          responses: { '200': resp('OK', ref('Tarefa')), '404': erroResp('tarefa_nao_encontrado'), ...ERROS_ESCRITA },
          ferramenta: { nome: 'atualizar_tarefa', descricao: 'Edita título/vencimento ou marca uma tarefa como concluída (concluida: true).' },
        }),
      },
      '/vendas': {
        get: op({
          summary: 'Vendas por período e status',
          tags: ['Vendas e métricas'],
          escopo: 'leitura',
          parameters: [q('de', 'Início (ISO 8601).', { type: 'string', format: 'date-time' }), q('ate', 'Fim (ISO 8601).', { type: 'string', format: 'date-time' }), q('status', 'aguardando, pago ou cancelado.', { type: 'string', enum: ['aguardando', 'pago', 'cancelado'] }), ...paginacao],
          responses: { '200': resp('OK', lista('Venda')), ...ERROS_COMUNS },
          ferramenta: { nome: 'listar_vendas', descricao: 'Lista vendas por período e status.' },
        }),
      },
      '/metricas/resumo': {
        get: op({
          summary: 'Resumo de métricas',
          tags: ['Vendas e métricas'],
          escopo: 'relatorios',
          parameters: [q('de', 'Início (ISO 8601). Padrão: início do mês.', { type: 'string', format: 'date-time' }), q('ate', 'Fim (ISO 8601). Padrão: agora.', { type: 'string', format: 'date-time' })],
          responses: { '200': resp('Funil, taxa de resposta, abordagens por dia, receitas, motivos de perda e segmentos.'), ...ERROS_COMUNS },
          ferramenta: { nome: 'resumo_de_metricas', descricao: 'Números do período: funil, taxa de resposta, abordagens por dia, receita do mês, receita recorrente, motivos de perda e segmentos que mais respondem. Use para o resumo do dia.' },
        }),
      },
    },
    components: {
      securitySchemes: {
        chaveApi: { type: 'http', scheme: 'bearer', bearerFormat: 'crb_<chave>', description: 'Chave gerada em Configurações → API e agente.' },
      },
      parameters: {
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Mesma chave em até 24 h devolve a mesma resposta sem duplicar nada. Use um UUID por operação.',
          schema: { type: 'string', maxLength: 200 },
        },
      },
      responses: {
        NaoAutenticado: erroResp('nao_autenticado / chave_invalida'),
        Proibido: erroResp('escopo_insuficiente / lead_opt_out'),
        Invalido: erroResp('dados_invalidos (veja detalhes.campos)'),
        Limite: { ...erroResp('limite_requisicoes / limite_diario (header Retry-After)'), headers: { 'Retry-After': { schema: { type: 'integer' } } } },
        Pausado: erroResp('agente_pausado'),
      },
      schemas: SCHEMAS,
    },
  }
}
