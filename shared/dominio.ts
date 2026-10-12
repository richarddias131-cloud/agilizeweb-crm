// Vocabulário do CRM compartilhado entre front e API.

export const ESTAGIOS = [
  'novo',
  'abordado',
  'respondeu',
  'auditoria_enviada',
  'proposta_enviada',
  'negociacao',
  'ganho',
  'perdido',
  'sem_resposta',
] as const
export type Estagio = (typeof ESTAGIOS)[number]

export const ESTAGIO_ROTULO: Record<Estagio, string> = {
  novo: 'Novo',
  abordado: 'Abordado',
  respondeu: 'Respondeu',
  auditoria_enviada: 'Auditoria enviada',
  proposta_enviada: 'Proposta enviada',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
  sem_resposta: 'Sem resposta',
}

/** Estágios "em andamento" (não finalizados). */
export const ESTAGIOS_ABERTOS: readonly Estagio[] = [
  'novo',
  'abordado',
  'respondeu',
  'auditoria_enviada',
  'proposta_enviada',
  'negociacao',
]

export function ehEstagio(v: unknown): v is Estagio {
  return typeof v === 'string' && (ESTAGIOS as readonly string[]).includes(v)
}

export const ORIGENS = ['prospeccao_ativa', 'indicacao', 'instagram', 'site', 'importacao', 'agente'] as const
export type Origem = (typeof ORIGENS)[number]

export const ORIGEM_ROTULO: Record<Origem, string> = {
  prospeccao_ativa: 'Prospecção ativa',
  indicacao: 'Indicação',
  instagram: 'Instagram',
  site: 'Site',
  importacao: 'Importação',
  agente: 'Agente',
}

export const MOTIVOS_PERDA = ['Sem dinheiro', 'Já tem fornecedor', 'Sem interesse', 'Não respondeu', 'Outro'] as const

export const TIPOS_INTERACAO = [
  'whatsapp_enviado',
  'whatsapp_recebido',
  'ligacao',
  'nota',
  'auditoria',
  'proposta',
  'mudanca_estagio',
] as const
export type TipoInteracao = (typeof TIPOS_INTERACAO)[number]

export const TIPO_INTERACAO_ROTULO: Record<TipoInteracao, string> = {
  whatsapp_enviado: 'WhatsApp enviado',
  whatsapp_recebido: 'WhatsApp recebido',
  ligacao: 'Ligação',
  nota: 'Nota',
  auditoria: 'Auditoria',
  proposta: 'Proposta',
  mudanca_estagio: 'Mudança de estágio',
}

export type Ator = 'richard' | 'agente' | 'bridge'

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const
