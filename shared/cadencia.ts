// Cadência automática de follow-up. Calculada na hora (front e API), sem cron.
//
// Padrão: abordagem → 2 dias → Follow-up 1 → 3 dias → Follow-up 2 → 5 dias →
// Última mensagem → 5 dias sem resposta → sem_resposta + tarefa "Reativar" em 60 dias.
// Qualquer resposta interrompe a cadência (marcar_respondeu zera tentativas).

import type { Estagio } from './dominio.ts'

export type ConfigCadencia = {
  /** Dias entre cada mensagem: [abordagem→FU1, FU1→FU2, FU2→Última]. */
  cadencia_dias: number[]
  encerrar_apos_dias: number
  reativar_apos_dias: number
}

export const CADENCIA_PADRAO: ConfigCadencia = { cadencia_dias: [2, 3, 5], encerrar_apos_dias: 5, reativar_apos_dias: 60 }

export type LeadCadencia = {
  estagio: Estagio
  tentativas_sem_resposta: number
  proxima_acao: string | null
  proxima_acao_em: string | null
  ultimo_contato_em: string | null
  ultima_resposta_em: string | null
}

export type PassoCadencia = { numero: number; rotulo: string; template_chave: string }

const DIA = 86_400_000

/** Para onde cada template leva o lead quando enviado. */
export const ESTAGIO_POR_TEMPLATE: Record<string, Estagio> = {
  abordagem: 'abordado',
  followup1: 'abordado',
  followup2: 'abordado',
  ultima: 'abordado',
  auditoria: 'auditoria_enviada',
  proposta_kit: 'proposta_enviada',
}

const ORDEM: Record<Estagio, number> = {
  novo: 0,
  abordado: 1,
  sem_resposta: 1,
  respondeu: 2,
  auditoria_enviada: 3,
  proposta_enviada: 4,
  negociacao: 5,
  ganho: 6,
  perdido: 6,
}

export function ordemEstagio(e: Estagio): number {
  return ORDEM[e]
}

/** O lead respondeu depois da nossa última mensagem? */
export function aguardandoNos(lead: Pick<LeadCadencia, 'ultima_resposta_em' | 'ultimo_contato_em'>): boolean {
  if (!lead.ultima_resposta_em) return false
  if (!lead.ultimo_contato_em) return true
  return new Date(lead.ultima_resposta_em).getTime() > new Date(lead.ultimo_contato_em).getTime()
}

/** Prospecção fria: o lead nunca respondeu. */
export function ehProspeccaoFria(lead: Pick<LeadCadencia, 'ultima_resposta_em'>): boolean {
  return !lead.ultima_resposta_em
}

/**
 * Qual mensagem da cadência corresponde a N tentativas já enviadas sem resposta.
 * 0 → Abordagem; 1..n-1 → Follow-up N; n → Última mensagem; > n → null (encerrar).
 */
export function passoDaCadencia(tentativas: number, config: ConfigCadencia = CADENCIA_PADRAO): PassoCadencia | null {
  const n = config.cadencia_dias.length
  if (tentativas <= 0) return { numero: 0, rotulo: 'Abordar', template_chave: 'abordagem' }
  if (tentativas > n) return null
  if (tentativas === n) return { numero: tentativas, rotulo: 'Última mensagem', template_chave: 'ultima' }
  return { numero: tentativas, rotulo: `Follow-up ${tentativas}`, template_chave: `followup${tentativas}` }
}

/** O lead está na cadência fria (sem resposta, aguardando follow-up)? */
export function emCadencia(lead: LeadCadencia): boolean {
  return lead.estagio === 'abordado' && !aguardandoNos(lead)
}

export type AtualizacaoEnvio = {
  estagio: Estagio
  tentativas_sem_resposta: number
  proxima_acao: string | null
  proxima_acao_em: string | null
}

/** O que muda no lead quando uma mensagem é enviada ("Enviei"). */
export function aposEnvio(
  lead: LeadCadencia,
  config: ConfigCadencia = CADENCIA_PADRAO,
  agora: Date = new Date(),
  templateChave?: string | null,
): AtualizacaoEnvio {
  const destino = templateChave ? ESTAGIO_POR_TEMPLATE[templateChave] : undefined
  const em = (dias: number) => new Date(agora.getTime() + dias * DIA).toISOString()
  const fria =
    (lead.estagio === 'novo' || lead.estagio === 'sem_resposta' || lead.estagio === 'abordado') &&
    !aguardandoNos(lead) &&
    !(destino && ORDEM[destino] > ORDEM.abordado)

  if (fria) {
    const tentativas = lead.estagio === 'abordado' ? lead.tentativas_sem_resposta + 1 : 1
    const proximo = passoDaCadencia(tentativas, config)
    if (proximo) {
      return {
        estagio: 'abordado',
        tentativas_sem_resposta: tentativas,
        proxima_acao: proximo.rotulo,
        proxima_acao_em: em(config.cadencia_dias[tentativas - 1] ?? 2),
      }
    }
    return {
      estagio: 'abordado',
      tentativas_sem_resposta: tentativas,
      proxima_acao: 'Encerrar cadência',
      proxima_acao_em: em(config.encerrar_apos_dias),
    }
  }

  // Conversa em andamento: avança o estágio se o template pedir e agenda um follow-up.
  const fechado = lead.estagio === 'ganho' || lead.estagio === 'perdido'
  const estagio = destino && !fechado && ORDEM[destino] > ORDEM[lead.estagio] ? destino : lead.estagio
  return {
    estagio,
    tentativas_sem_resposta: 0,
    proxima_acao: fechado ? null : 'Follow-up',
    proxima_acao_em: fechado ? null : em(config.cadencia_dias[0] ?? 2),
  }
}

/** Passou o prazo depois da última mensagem: mover para sem_resposta. */
export function deveEncerrar(lead: LeadCadencia, config: ConfigCadencia = CADENCIA_PADRAO, agora: Date = new Date()): boolean {
  return (
    emCadencia(lead) &&
    lead.tentativas_sem_resposta > config.cadencia_dias.length &&
    !!lead.proxima_acao_em &&
    new Date(lead.proxima_acao_em).getTime() <= agora.getTime()
  )
}

export function dataReativar(config: ConfigCadencia = CADENCIA_PADRAO, agora: Date = new Date()): string {
  return new Date(agora.getTime() + config.reativar_apos_dias * DIA).toISOString()
}
