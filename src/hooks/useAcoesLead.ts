import { useCallback } from 'react'
import { useToast } from '../context/ToastContext'
import { marcarRespondeu, mudarEstagio, type Lead } from '../services/leads'
import { desfazer } from '../services/envio'
import { ESTAGIO_ROTULO, type Estagio } from '../../shared/dominio.ts'

type LeadAcao = Pick<
  Lead,
  'id' | 'empresa' | 'estagio' | 'motivo_perda' | 'tentativas_sem_resposta' | 'proxima_acao' | 'proxima_acao_em' | 'ultima_resposta_em'
>

/** Ações rápidas de lead com toast de desfazer (5 s). */
export function useAcoesLead() {
  const toast = useToast()

  const comDesfazer = useCallback(
    async (acao: () => Promise<Parameters<typeof desfazer>[0]>, msg: string): Promise<boolean> => {
      try {
        const d = await acao()
        toast(msg, {
          desfazer: async () => {
            try {
              await desfazer(d)
              toast('Desfeito.')
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Não foi possível desfazer.', { tipo: 'erro' })
            }
          },
        })
        return true
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Não foi possível concluir.', { tipo: 'erro' })
        return false
      }
    },
    [toast],
  )

  const respondeu = useCallback(
    (lead: LeadAcao) => comDesfazer(() => marcarRespondeu(lead), `${lead.empresa} respondeu. Tarefa "Responder" criada.`),
    [comDesfazer],
  )

  const trocarEstagio = useCallback(
    (lead: LeadAcao, e: Estagio, motivo?: string) =>
      comDesfazer(() => mudarEstagio(lead, e, motivo), `${lead.empresa}: ${ESTAGIO_ROTULO[e]}.`),
    [comDesfazer],
  )

  return { respondeu, trocarEstagio }
}
