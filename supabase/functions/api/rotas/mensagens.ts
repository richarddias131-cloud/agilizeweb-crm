import type { Rota } from '../app.ts'
import { erros } from '../lib/erros.ts'
import { ehObjeto } from '../lib/util.ts'
import { exigirLimiteDiario, expiraEm, leadOu404, prepararMensagem, registrarEnvio } from '../lib/negocio.ts'

export const rotasMensagens: Rota[] = [
  {
    // Só renderiza: não grava nada (por isso não é bloqueada pelo "Pausar agente").
    metodo: 'POST',
    padrao: '/mensagens/preparar',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const lead = await leadOu404(ctx, typeof c.lead_id === 'string' ? c.lead_id : undefined)
      return { status: 200, corpo: await prepararMensagem(ctx, lead, c) }
    },
  },
  {
    // Envia pelo wa-bridge quando permitido; caso contrário vira ação pendente para o Richard aprovar.
    metodo: 'POST',
    padrao: '/mensagens/enviar',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const lead = await leadOu404(ctx, typeof c.lead_id === 'string' ? c.lead_id : undefined)
      const preparada = await prepararMensagem(ctx, lead, c) // já bloqueia opt-out (403)
      if (!preparada.texto.trim()) throw erros.validacao({ texto: 'A mensagem ficou vazia.' })
      await exigirLimiteDiario(ctx)

      const temEscopoEnvio = ctx.chave.escopos.includes('envio')
      const bridgeOnline = temEscopoEnvio ? await ctx.deps.bridgeOnline(ctx.userId) : false
      const liberadoAposResposta = !!ctx.config?.permitir_envio_direto_apos_resposta

      let motivo: string | null = null
      if (preparada.prospeccao_fria) motivo = 'prospeccao_fria'
      else if (!temEscopoEnvio) motivo = 'sem_escopo_envio'
      else if (!liberadoAposResposta) motivo = 'envio_direto_desligado'
      else if (!bridgeOnline) motivo = 'bridge_offline'

      if (motivo) {
        const acao = await ctx.deps.banco.inserirAcaoPendente(ctx.userId, {
          tipo: 'enviar_mensagem',
          lead_id: lead.id,
          payload: { texto: preparada.texto, template_id: preparada.template_id },
          justificativa: typeof c.justificativa === 'string' && c.justificativa.trim() ? c.justificativa.trim() : null,
          expira_em: expiraEm(ctx),
          criada_por: ctx.chave.id,
        })
        return {
          status: 202,
          corpo: {
            enviado: false,
            motivo,
            acao_pendente: acao,
            mensagem: 'A mensagem foi para a fila "Para aprovar" do Richard. Consulte GET /acoes-pendentes/{id} para saber se foi aprovada.',
          },
          resumo: `envio virou ação pendente (${motivo}) ${lead.id}`,
        }
      }

      // Envio direto pelo wa-bridge (Fase 7): o bridge consome mensagens registradas pelo agente.
      const template = preparada.template_id ? { id: preparada.template_id, chave: (await ctx.deps.banco.templates(ctx.userId)).find((t) => t.id === preparada.template_id)?.chave ?? null } : null
      const r = await registrarEnvio(ctx, lead, preparada.texto, template)
      return { status: 201, corpo: { enviado: true, interacao_id: r.id }, resumo: `enviado pelo bridge ${lead.id}` }
    },
  },
]
