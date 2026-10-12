import type { Rota } from '../app.ts'

export const rotasCatalogo: Rota[] = [
  {
    metodo: 'GET',
    padrao: '/templates',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const t = await ctx.deps.banco.templates(ctx.userId)
      return { status: 200, corpo: { dados: t.filter((x) => x.ativo), proximo_cursor: null } }
    },
  },
  {
    metodo: 'GET',
    padrao: '/servicos',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const s = await ctx.deps.banco.servicos(ctx.userId)
      return {
        status: 200,
        corpo: { dados: s.map((x) => ({ ...x, preco: Number(x.preco), preco_mensal: x.preco_mensal === null ? null : Number(x.preco_mensal) })), proximo_cursor: null },
      }
    },
  },
]
