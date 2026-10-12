import { supabase } from '../lib/supabase'
import { invalidar } from '../lib/cache'
import { falhou, traduzirErro } from './erros'
import type { Estagio } from '../../shared/dominio.ts'

export type StatusAcao = 'pendente' | 'aprovada' | 'rejeitada'

export async function decidirAcao(id: string, status: StatusAcao): Promise<void> {
  falhou(
    await supabase
      .from('acoes_pendentes')
      .update({ status, decidida_em: status === 'pendente' ? null : new Date().toISOString() })
      .eq('id', id),
    'Não foi possível registrar a decisão.',
  )
  invalidar('fila')
}

/** Aplica a mudança de estágio proposta pelo agente (fica registrada como do agente, aprovada por você). */
export async function aplicarMudancaEstagio(leadId: string, estagio: Estagio, motivo: string | null, nomeAgente: string | null): Promise<void> {
  const r = await supabase.rpc('mudar_estagio', {
    p_lead: leadId,
    p_estagio: estagio,
    ...(motivo ? { p_motivo_perda: motivo } : {}),
    p_ator: 'agente',
    p_ator_nome: `${nomeAgente ?? 'Agente'} · aprovado por você`,
  })
  if (r.error) throw traduzirErro(r.error)
  invalidar('leads')
  invalidar(`lead:${leadId}`)
}
