// Montagem da fila "Hoje". O banco (fila_hoje) entrega os candidatos de cada
// bloco; aqui decidimos a ação sugerida e o template de cada item.
// Usado pela tela Hoje e pelo endpoint GET /fila/hoje.

import type { Estagio } from './dominio.ts'
import { CADENCIA_PADRAO, aguardandoNos, deveEncerrar, emCadencia, passoDaCadencia, type ConfigCadencia, type LeadCadencia } from './cadencia.ts'

export type LeadFila = LeadCadencia & {
  id: string
  empresa: string
  contato_nome: string | null
  whatsapp: string
  cidade: string
  segmento: string | null
  nota_auditoria: number | null
  servico_interesse: string | null
  motivo_perda: string | null
  opt_out: boolean
  tags: string[]
  created_at: string
}

export type TarefaFila = {
  id: string
  lead_id: string | null
  titulo: string
  vence_em: string
  origem: string
  lead: { id: string; empresa: string; contato_nome: string | null; cidade: string; estagio: Estagio } | null
}

export type AcaoPendenteFila = {
  id: string
  tipo: string
  lead_id: string | null
  payload: Record<string, unknown>
  justificativa: string | null
  status: string
  expira_em: string
  created_at: string
  chave_nome: string | null
  lead: { id: string; empresa: string; contato_nome: string | null; whatsapp: string; cidade: string; estagio: Estagio; opt_out: boolean } | null
}

export type FilaBruta = {
  gerada_em: string
  meta_diaria: number
  abordagens_hoje: number
  config: (Partial<ConfigCadencia> & Record<string, unknown>) | null
  para_aprovar: AcaoPendenteFila[]
  responderam: LeadFila[]
  followups: LeadFila[]
  novos: LeadFila[]
  novos_total: number
  tarefas: TarefaFila[]
}

export type AcaoSugerida = {
  rotulo: string
  /** Chave do template indicado (null = mensagem livre ou ação sem mensagem). */
  template_chave: string | null
  /** mensagem = abre a prévia de WhatsApp; abrir = abre a ficha. */
  tipo: 'mensagem' | 'abrir'
}

export type Bloco = 'responderam' | 'followups' | 'novos'
export type ItemFila = { bloco: Bloco; lead: LeadFila; acao: AcaoSugerida }

export type Fila = {
  para_aprovar: AcaoPendenteFila[]
  responderam: ItemFila[]
  followups: ItemFila[]
  novos: ItemFila[]
  tarefas: TarefaFila[]
  /** Leads cuja cadência acabou: o cliente deve chamar encerrar_cadencia. */
  encerrar: LeadFila[]
  progresso: { feitas: number; meta: number }
  novos_total: number
  /** Itens de mensagem na ordem do Modo foco. */
  sequencia: ItemFila[]
}

export function configCadencia(c: FilaBruta['config']): ConfigCadencia {
  return {
    cadencia_dias: Array.isArray(c?.cadencia_dias) ? c.cadencia_dias : CADENCIA_PADRAO.cadencia_dias,
    encerrar_apos_dias: typeof c?.encerrar_apos_dias === 'number' ? c.encerrar_apos_dias : CADENCIA_PADRAO.encerrar_apos_dias,
    reativar_apos_dias: typeof c?.reativar_apos_dias === 'number' ? c.reativar_apos_dias : CADENCIA_PADRAO.reativar_apos_dias,
  }
}

/** Ação certa para o estágio do lead. */
export function acaoSugerida(lead: LeadFila, config: ConfigCadencia = CADENCIA_PADRAO): AcaoSugerida {
  const msg = (rotulo: string, template_chave: string | null): AcaoSugerida => ({ rotulo, template_chave, tipo: 'mensagem' })
  const temNota = lead.nota_auditoria !== null && lead.nota_auditoria !== undefined

  if (aguardandoNos(lead)) {
    if (lead.estagio === 'respondeu' && temNota) return msg('Enviar auditoria', 'auditoria')
    if (lead.estagio === 'respondeu') return { rotulo: 'Fazer auditoria', template_chave: null, tipo: 'abrir' }
    return msg('Responder', null)
  }

  switch (lead.estagio) {
    case 'novo':
      return msg('Abordar', 'abordagem')
    case 'abordado': {
      if (emCadencia(lead)) {
        const passo = passoDaCadencia(lead.tentativas_sem_resposta, config)
        if (passo) return msg(passo.rotulo, passo.template_chave)
      }
      return msg(lead.proxima_acao || 'Follow-up', null)
    }
    case 'respondeu':
      return temNota ? msg('Enviar auditoria', 'auditoria') : { rotulo: 'Fazer auditoria', template_chave: null, tipo: 'abrir' }
    case 'auditoria_enviada':
      return msg('Enviar proposta', 'proposta_kit')
    case 'sem_resposta':
      return msg('Reativar', 'followup1')
    case 'ganho':
      return msg('Pós-venda', 'pos_venda')
    default:
      return msg(lead.proxima_acao || 'Follow-up', null)
  }
}

export function montarFila(bruta: FilaBruta, agora: Date = new Date()): Fila {
  const config = configCadencia(bruta.config)
  const encerrar: LeadFila[] = []

  const responderam = bruta.responderam.map<ItemFila>((lead) => ({ bloco: 'responderam', lead, acao: acaoSugerida(lead, config) }))

  const followups: ItemFila[] = []
  for (const lead of bruta.followups) {
    if (deveEncerrar(lead, config, agora)) {
      encerrar.push(lead)
      continue
    }
    followups.push({ bloco: 'followups', lead, acao: acaoSugerida(lead, config) })
  }

  const novos = bruta.novos.map<ItemFila>((lead) => ({ bloco: 'novos', lead, acao: acaoSugerida(lead, config) }))

  // Tarefas automáticas de leads que já estão em outro bloco não se repetem.
  const naFila = new Set([...responderam, ...followups].map((i) => i.lead.id))
  const tarefas = bruta.tarefas.filter((t) => !(t.origem === 'cadencia' && t.lead_id && naFila.has(t.lead_id)))

  const sequencia = [...responderam, ...followups, ...novos].filter((i) => i.acao.tipo === 'mensagem')

  return {
    para_aprovar: bruta.para_aprovar,
    responderam,
    followups,
    novos,
    tarefas,
    encerrar,
    progresso: { feitas: bruta.abordagens_hoje, meta: bruta.meta_diaria },
    novos_total: bruta.novos_total,
    sequencia,
  }
}
