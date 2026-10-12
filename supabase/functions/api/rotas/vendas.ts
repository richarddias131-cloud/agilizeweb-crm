import type { Rota } from '../app.ts'
import { erros } from '../lib/erros.ts'
import { codificarCursor, dataIso, decodificarCursor, limiteDe } from '../lib/util.ts'
import type { FiltrosVendas } from '../lib/tipos.ts'

const STATUS = ['aguardando', 'pago', 'cancelado']

function periodo(q: URLSearchParams): { de: string | null; ate: string | null } {
  const campos: Record<string, string> = {}
  const ler = (k: 'de' | 'ate') => {
    const v = q.get(k)
    if (v === null) return null
    const d = dataIso(v)
    if (!d) campos[k] = 'Data ISO 8601 (ex.: 2026-10-01T00:00:00-03:00).'
    return d
  }
  const de = ler('de')
  const ate = ler('ate')
  if (de && ate && ate <= de) campos.ate = '"ate" precisa ser depois de "de".'
  if (Object.keys(campos).length) throw erros.validacao(campos)
  return { de, ate }
}

export const rotasVendas: Rota[] = [
  {
    metodo: 'GET',
    padrao: '/vendas',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const { de, ate } = periodo(ctx.query)
      const f: FiltrosVendas = { limite: limiteDe(ctx.query) }
      if (de) f.de = de
      if (ate) f.ate = ate
      const status = ctx.query.get('status')
      if (status) {
        if (!STATUS.includes(status)) throw erros.validacao({ status: `Use um destes: ${STATUS.join(', ')}.` })
        f.status = status
      }
      const apos = decodificarCursor<{ fechada_em: string; id: string }>(ctx.query.get('cursor'), ['fechada_em', 'id'])
      if (apos) f.apos = apos
      const linhas = await ctx.deps.banco.listarVendas(ctx.userId, { ...f, limite: f.limite + 1 })
      const dados = linhas.slice(0, f.limite).map((v) => ({ ...v, valor_total: Number(v.valor_total), valor_mensal: Number(v.valor_mensal) }))
      const u = dados[dados.length - 1]
      return { status: 200, corpo: { dados, proximo_cursor: linhas.length > f.limite && u ? codificarCursor({ fechada_em: u.fechada_em, id: u.id }) : null } }
    },
  },
  {
    metodo: 'GET',
    padrao: '/metricas/resumo',
    escopo: 'relatorios',
    escrita: false,
    async executar(ctx) {
      const { de, ate } = periodo(ctx.query)
      return { status: 200, corpo: await ctx.deps.banco.metricas(ctx.userId, de, ate) }
    },
  },
]
