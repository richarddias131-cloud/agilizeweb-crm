import { supabase } from '../lib/supabase'
import type { Lead } from './leads'
import type { Config } from './config'
import { invalidar } from '../lib/cache'
import { aposEnvio } from '../../shared/cadencia.ts'
import { configCadencia } from '../../shared/fila.ts'
import { traduzirErro } from './erros'

/** Campos do lead necessários para enviar mensagem e calcular a cadência. */
export type LeadEnvio = Pick<
  Lead,
  | 'id'
  | 'empresa'
  | 'contato_nome'
  | 'whatsapp'
  | 'cidade'
  | 'segmento'
  | 'nota_auditoria'
  | 'servico_interesse'
  | 'opt_out'
  | 'estagio'
  | 'tentativas_sem_resposta'
  | 'proxima_acao'
  | 'proxima_acao_em'
  | 'ultimo_contato_em'
  | 'ultima_resposta_em'
>

/** Retrato para desfazer + marco da transação. */
export type Desfazer = { leadId: string; marco: string; anterior: Record<string, unknown> }

export async function registrarEnvio(
  lead: LeadEnvio,
  texto: string,
  template: { id: string; chave: string | null } | null,
  config: Config | null | undefined,
): Promise<Desfazer> {
  const proximo = aposEnvio(lead, configCadencia(config ?? null), new Date(), template?.chave)
  const r = await supabase.rpc('registrar_envio', {
    p_lead: lead.id,
    p_conteudo: texto,
    ...(template ? { p_template: template.id } : {}),
    p_estagio: proximo.estagio,
    p_tentativas: proximo.tentativas_sem_resposta,
    ...(proximo.proxima_acao ? { p_proxima_acao: proximo.proxima_acao } : {}),
    ...(proximo.proxima_acao_em ? { p_proxima_acao_em: proximo.proxima_acao_em } : {}),
  })
  if (r.error) throw traduzirErro(r.error, 'Não foi possível registrar o envio.')
  invalidar('fila')
  invalidar('leads')
  invalidar(`lead:${lead.id}`)
  const { marco } = r.data as { marco: string }
  return {
    leadId: lead.id,
    marco,
    anterior: {
      estagio: lead.estagio,
      tentativas_sem_resposta: lead.tentativas_sem_resposta,
      proxima_acao: lead.proxima_acao,
      proxima_acao_em: lead.proxima_acao_em,
      ultimo_contato_em: lead.ultimo_contato_em,
    },
  }
}

export async function desfazer(d: Desfazer): Promise<void> {
  const r = await supabase.rpc('desfazer_acao', { p_lead: d.leadId, p_marco: d.marco, p_anterior: d.anterior as never })
  if (r.error) throw traduzirErro(r.error, 'Não foi possível desfazer.')
  invalidar('fila')
  invalidar('leads')
  invalidar('tarefas')
  invalidar(`lead:${d.leadId}`)
}
