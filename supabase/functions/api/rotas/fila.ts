import type { Rota } from '../app.ts'
import { configCadencia, montarFila, type ItemFila } from '../_shared/fila.ts'
import { dataReativar } from '../_shared/cadencia.ts'
import { renderizarTemplate } from '../_shared/template.ts'

export const rotasFila: Rota[] = [
  {
    metodo: 'GET',
    padrao: '/fila/hoje',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const { banco } = ctx.deps
      let bruta = await banco.filaHoje(ctx.userId)
      let fila = montarFila(bruta, ctx.agora)

      // Mesmo comportamento da tela: cadência vencida → sem_resposta + tarefa "Reativar".
      // Com o agente pausado, a fila é só leitura.
      if (fila.encerrar.length && !ctx.config?.agente_pausado) {
        const reativar = dataReativar(configCadencia(bruta.config), ctx.agora)
        for (const l of fila.encerrar) await banco.encerrarCadencia(l.id, reativar, ctx.ator)
        bruta = await banco.filaHoje(ctx.userId)
        fila = montarFila(bruta, ctx.agora)
      }

      const [templates, servicos] = await Promise.all([banco.templates(ctx.userId), banco.servicos(ctx.userId)])
      const assinatura = ctx.config?.assinatura ?? 'Richard | CRESBI'

      const item = (i: ItemFila) => {
        const t = i.acao.template_chave ? templates.find((x) => x.chave === i.acao.template_chave && x.ativo) : undefined
        const s = servicos.find((x) => x.id === i.lead.servico_interesse)
        return {
          bloco: i.bloco,
          lead: i.lead,
          acao_sugerida: i.acao.rotulo,
          tipo_acao: i.acao.tipo,
          template: t ? { id: t.id, chave: t.chave, nome: t.nome } : null,
          mensagem_sugerida: t
            ? renderizarTemplate(t.corpo, {
                ...i.lead,
                servico: s ? { nome: s.nome, preco: Number(s.preco) } : null,
                assinatura,
              }).texto
            : null,
          prospeccao_fria: !i.lead.ultima_resposta_em,
        }
      }

      return {
        status: 200,
        corpo: {
          gerada_em: bruta.gerada_em,
          progresso: fila.progresso,
          para_aprovar: fila.para_aprovar,
          responderam: fila.responderam.map(item),
          followups: fila.followups.map(item),
          novos: fila.novos.map(item),
          tarefas: fila.tarefas,
          novos_total: fila.novos_total,
          encerrados_agora: fila.encerrar.length,
        },
      }
    },
  },
]
