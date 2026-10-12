import type { Rota } from '../app.ts'
import { erros } from '../lib/erros.ts'
import { UUID, codificarCursor, dataIso, decodificarCursor, ehObjeto, limiteDe } from '../lib/util.ts'
import { leadOu404 } from '../lib/negocio.ts'
import type { FiltrosTarefas } from '../lib/tipos.ts'

export const rotasTarefas: Rota[] = [
  {
    metodo: 'GET',
    padrao: '/tarefas',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const q = ctx.query
      const f: FiltrosTarefas = { limite: limiteDe(q), abertas: q.get('abertas') !== 'false' }
      const lead = q.get('lead_id')
      if (lead) {
        if (!UUID.test(lead)) throw erros.validacao({ lead_id: 'uuid de um lead.' })
        f.lead_id = lead
      }
      const apos = decodificarCursor<{ vence_em: string; id: string }>(q.get('cursor'), ['vence_em', 'id'])
      if (apos) f.apos = apos
      const linhas = await ctx.deps.banco.listarTarefas(ctx.userId, { ...f, limite: f.limite + 1 })
      const dados = linhas.slice(0, f.limite)
      const u = dados[dados.length - 1]
      return { status: 200, corpo: { dados, proximo_cursor: linhas.length > f.limite && u ? codificarCursor({ vence_em: u.vence_em, id: u.id }) : null } }
    },
  },
  {
    metodo: 'POST',
    padrao: '/tarefas',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const titulo = typeof c.titulo === 'string' ? c.titulo.trim() : ''
      const vence = c.vence_em === undefined ? ctx.agora.toISOString() : dataIso(c.vence_em)
      const campos: Record<string, string> = {}
      if (!titulo) campos.titulo = 'Obrigatório.'
      if (!vence) campos.vence_em = 'Data ISO 8601.'
      if (Object.keys(campos).length) throw erros.validacao(campos)
      let leadId: string | null = null
      if (c.lead_id) leadId = (await leadOu404(ctx, typeof c.lead_id === 'string' ? c.lead_id : undefined)).id
      const t = await ctx.deps.banco.inserirTarefa(ctx.userId, { lead_id: leadId, titulo, vence_em: vence!, origem: 'agente' })
      return { status: 201, corpo: t, resumo: 'tarefa criada' }
    },
  },
  {
    metodo: 'PATCH',
    padrao: '/tarefas/:id',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const id = ctx.params.id ?? ''
      const atual = UUID.test(id) ? await ctx.deps.banco.obterTarefa(ctx.userId, id) : null
      if (!atual) throw erros.naoEncontrado('tarefa', id)
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const mud: { titulo?: string; vence_em?: string; concluida_em?: string | null } = {}
      const campos: Record<string, string> = {}
      if ('titulo' in c) {
        if (typeof c.titulo === 'string' && c.titulo.trim()) mud.titulo = c.titulo.trim()
        else campos.titulo = 'Texto não vazio.'
      }
      if ('vence_em' in c) {
        const d = dataIso(c.vence_em)
        if (d) mud.vence_em = d
        else campos.vence_em = 'Data ISO 8601.'
      }
      if ('concluida' in c) {
        if (typeof c.concluida === 'boolean') mud.concluida_em = c.concluida ? ctx.agora.toISOString() : null
        else campos.concluida = 'true ou false.'
      }
      if (Object.keys(campos).length) throw erros.validacao(campos)
      return { status: 200, corpo: await ctx.deps.banco.atualizarTarefa(ctx.userId, id, mud), resumo: 'tarefa editada' }
    },
  },
]
