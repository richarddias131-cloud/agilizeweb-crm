import type { Rota } from '../app.ts'
import { erros } from '../lib/erros.ts'
import { dataIso, ehObjeto } from '../lib/util.ts'
import { prepararImportacao } from '../_shared/importacao.ts'
import { normalizarTelefone } from '../_shared/phone.ts'

const MAX_LOTE = 500

export const rotasSincronizacao: Rota[] = [
  {
    // Mesmo relatório da importação CSV: importados, duplicados e inválidos com motivo.
    metodo: 'POST',
    padrao: '/leads/lote',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const leads = c.leads
      if (!Array.isArray(leads) || !leads.length) throw erros.validacao({ leads: 'Envie uma lista "leads" com pelo menos 1 item.' })
      if (leads.length > MAX_LOTE) throw erros.validacao({ leads: `Máximo de ${MAX_LOTE} leads por chamada. Divida em lotes.` })
      if (!leads.every(ehObjeto)) throw erros.validacao({ leads: 'Cada item precisa ser um objeto com os campos do lead.' })
      const tag = typeof c.tag === 'string' && c.tag.trim() ? c.tag.trim() : null

      const numeros = leads.map((l) => normalizarTelefone(typeof l.whatsapp === 'string' ? l.whatsapp : '')).flatMap((r) => (r.ok ? [r.numero] : []))
      const existentes = await ctx.deps.banco.whatsappsExistentes(ctx.userId, [...new Set(numeros)])
      const r = prepararImportacao(leads as Record<string, unknown>[], null, existentes, { tag, origem: 'agente' })
      const criados = await ctx.deps.banco.inserirLeads(ctx.userId, r.validos)
      const corrida = r.validos.length - criados.length
      return {
        status: 200,
        corpo: {
          importados: criados.length,
          duplicados: r.duplicados.length + corrida,
          invalidos: r.invalidos.length,
          ids: criados.map((l) => ({ id: l.id, whatsapp: l.whatsapp })),
          detalhes: { duplicados: r.duplicados, invalidos: r.invalidos },
        },
        resumo: `lote: ${criados.length} importados, ${r.duplicados.length + corrida} duplicados, ${r.invalidos.length} inválidos`,
      }
    },
  },
  {
    // Feed para sincronizar por polling (quem não usa webhook).
    metodo: 'GET',
    padrao: '/eventos',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const bruto = ctx.query.get('desde')
      const desde = bruto ? dataIso(bruto) : null
      if (!desde) throw erros.validacao({ desde: 'Obrigatório: data ISO 8601. Na primeira vez, use o momento atual; depois, o "proximo_desde" da resposta.' })
      const limiteBruto = ctx.query.get('limite')
      const limite = limiteBruto === null ? 200 : Number(limiteBruto)
      if (!Number.isInteger(limite) || limite < 1 || limite > 500) throw erros.validacao({ limite: 'Inteiro de 1 a 500.' })
      const dados = await ctx.deps.banco.eventos(ctx.userId, desde, limite)
      const ultimo = dados[dados.length - 1]
      return { status: 200, corpo: { dados, proximo_desde: ultimo ? ultimo.ocorreu_em : desde, tem_mais: dados.length === limite } }
    },
  },
]
