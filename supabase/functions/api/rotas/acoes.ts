import type { Rota } from '../app.ts'
import { erros } from '../lib/erros.ts'
import { UUID, ehObjeto } from '../lib/util.ts'
import { exigirLimiteDiario, exigirSemOptOut, expiraEm, leadOu404 } from '../lib/negocio.ts'
import { ehEstagio } from '../_shared/dominio.ts'

const TIPOS = ['enviar_mensagem', 'mudar_estagio', 'criar_venda', 'outro'] as const

export const rotasAcoes: Rota[] = [
  {
    metodo: 'POST',
    padrao: '/acoes-pendentes',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const campos: Record<string, string> = {}
      const tipo = c.tipo
      if (typeof tipo !== 'string' || !(TIPOS as readonly string[]).includes(tipo)) campos.tipo = `Use um destes: ${TIPOS.join(', ')}.`
      const justificativa = typeof c.justificativa === 'string' ? c.justificativa.trim() : ''
      if (!justificativa) campos.justificativa = 'Explique em uma frase por que o Richard deveria aprovar.'
      const payload = c.payload === undefined ? {} : c.payload
      if (!ehObjeto(payload)) campos.payload = 'Objeto JSON.'
      const horas = c.expira_em_horas === undefined ? 48 : c.expira_em_horas
      if (typeof horas !== 'number' || horas < 1 || horas > 168) campos.expira_em_horas = 'Número de 1 a 168.'
      if (Object.keys(campos).length) throw erros.validacao(campos)

      const p = payload as Record<string, unknown>
      let leadId: string | null = null
      if (c.lead_id !== undefined && c.lead_id !== null) {
        const lead = await leadOu404(ctx, typeof c.lead_id === 'string' ? c.lead_id : undefined)
        leadId = lead.id
        if (tipo === 'enviar_mensagem') exigirSemOptOut(lead)
      } else if (tipo !== 'outro') {
        throw erros.validacao({ lead_id: 'Obrigatório para este tipo de ação.' })
      }
      if (tipo === 'enviar_mensagem') {
        if (typeof p.texto !== 'string' || !p.texto.trim()) throw erros.validacao({ 'payload.texto': 'Texto final da mensagem (use POST /mensagens/preparar para gerar).' })
        await exigirLimiteDiario(ctx)
      }
      if (tipo === 'mudar_estagio') {
        if (!ehEstagio(p.estagio)) throw erros.validacao({ 'payload.estagio': 'Estágio de destino válido.' })
        if (p.estagio === 'perdido' && (typeof p.motivo_perda !== 'string' || !p.motivo_perda.trim()))
          throw erros.validacao({ 'payload.motivo_perda': 'Obrigatório para perdido.' })
      }

      const acao = await ctx.deps.banco.inserirAcaoPendente(ctx.userId, {
        tipo: tipo as string,
        lead_id: leadId,
        payload: p,
        justificativa,
        expira_em: expiraEm(ctx, horas as number),
        criada_por: ctx.chave.id,
      })
      return { status: 201, corpo: acao, resumo: `ação proposta ${tipo}` }
    },
  },
  {
    metodo: 'GET',
    padrao: '/acoes-pendentes/:id',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const id = ctx.params.id ?? ''
      if (!UUID.test(id)) throw erros.naoEncontrado('acao', id)
      const acao = await ctx.deps.banco.obterAcaoPendente(ctx.userId, id)
      if (!acao) throw erros.naoEncontrado('acao', id)
      const expirada = acao.status === 'pendente' && new Date(acao.expira_em) <= ctx.agora
      return { status: 200, corpo: expirada ? { ...acao, status: 'expirada' } : acao }
    },
  },
]
