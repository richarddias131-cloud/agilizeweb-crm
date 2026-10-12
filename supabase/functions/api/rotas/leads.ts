import type { Rota } from '../app.ts'
import { ErroApi, erros } from '../lib/erros.ts'
import { ESTAGIOS, ehEstagio, type Estagio } from '../_shared/dominio.ts'
import { normalizarTelefone } from '../_shared/phone.ts'
import { codificarCursor, decodificarCursor, dataIso, ehObjeto, limiteDe } from '../lib/util.ts'
import { validarCamposLead } from '../lib/validacao.ts'
import { expiraEm, leadOu404, registrarEnvio } from '../lib/negocio.ts'
import type { FiltrosLeads } from '../lib/tipos.ts'

const TIPOS_LIVRES = ['nota', 'ligacao', 'auditoria', 'proposta', 'whatsapp_enviado', 'whatsapp_recebido'] as const

export const rotasLeads: Rota[] = [
  {
    metodo: 'GET',
    padrao: '/leads',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const q = ctx.query
      const f: FiltrosLeads = { limite: limiteDe(q) }
      const estagio = q.get('estagio')
      if (estagio) {
        if (!ehEstagio(estagio)) throw erros.validacao({ estagio: `Use um destes: ${ESTAGIOS.join(', ')}.` })
        f.estagio = estagio
      }
      for (const k of ['cidade', 'segmento', 'tag', 'busca'] as const) {
        const v = q.get(k)?.trim()
        if (v) f[k] = v
      }
      const dias = q.get('sem_contato_ha_dias')
      if (dias !== null) {
        const n = Number(dias)
        if (!Number.isInteger(n) || n < 0) throw erros.validacao({ sem_contato_ha_dias: 'Inteiro maior ou igual a 0.' })
        f.sem_contato_ha_dias = n
      }
      const desde = q.get('atualizado_desde')
      if (desde !== null) {
        const d = dataIso(desde)
        if (!d) throw erros.validacao({ atualizado_desde: 'Data ISO 8601 (ex.: 2026-10-12T00:00:00-03:00).' })
        f.atualizado_desde = d
      }
      if (q.get('incluir_arquivados') === 'true') f.incluir_arquivados = true
      const apos = decodificarCursor<{ updated_at: string; id: string }>(q.get('cursor'), ['updated_at', 'id'])
      if (apos) f.apos = apos

      const linhas = await ctx.deps.banco.listarLeads(ctx.userId, { ...f, limite: f.limite + 1 })
      const dados = linhas.slice(0, f.limite)
      const ultimo = dados[dados.length - 1]
      return {
        status: 200,
        corpo: {
          dados,
          proximo_cursor: linhas.length > f.limite && ultimo ? codificarCursor({ updated_at: ultimo.updated_at, id: ultimo.id }) : null,
        },
      }
    },
  },
  {
    metodo: 'GET',
    padrao: '/leads/por-whatsapp/:numero',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const r = normalizarTelefone(ctx.params.numero)
      if (!r.ok) throw erros.validacao({ numero: r.erro })
      const lead = await ctx.deps.banco.leadPorWhatsapp(ctx.userId, r.numero)
      if (!lead) throw new ErroApi(404, 'lead_nao_encontrado', `Nenhum lead com o WhatsApp ${r.numero}. Você pode criá-lo com POST /leads.`, { whatsapp: r.numero })
      return { status: 200, corpo: lead }
    },
  },
  {
    metodo: 'GET',
    padrao: '/leads/:id',
    escopo: 'leitura',
    escrita: false,
    async executar(ctx) {
      const lead = await leadOu404(ctx, ctx.params.id)
      const [interacoes, tarefas] = await Promise.all([
        ctx.deps.banco.interacoes(ctx.userId, lead.id, 20),
        ctx.deps.banco.listarTarefas(ctx.userId, { lead_id: lead.id, abertas: true, limite: 50 }),
      ])
      return { status: 200, corpo: { lead, interacoes, tarefas } }
    },
  },
  {
    metodo: 'POST',
    padrao: '/leads',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const dados = validarCamposLead(ctx.corpo, { criacao: true })
      const existente = await ctx.deps.banco.leadPorWhatsapp(ctx.userId, dados.whatsapp!)
      if (existente) {
        // Upsert: atualiza só os campos enviados. Nunca reativa opt-out nem desarquiva.
        const { whatsapp: _w, ...resto } = dados
        const lead = Object.keys(resto).length ? await ctx.deps.banco.atualizarLead(ctx.userId, existente.id, resto) : existente
        return { status: 200, corpo: { criado: false, lead }, resumo: `lead atualizado ${existente.id}` }
      }
      const lead = await ctx.deps.banco.inserirLead(ctx.userId, {
        ...dados,
        empresa: dados.empresa!,
        whatsapp: dados.whatsapp!,
        cidade: dados.cidade ?? '',
        origem: dados.origem ?? 'agente',
      })
      return { status: 201, corpo: { criado: true, lead }, resumo: `lead criado ${lead.id}` }
    },
  },
  {
    metodo: 'PATCH',
    padrao: '/leads/:id',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const lead = await leadOu404(ctx, ctx.params.id)
      const dados = validarCamposLead(ctx.corpo, { criacao: false })
      if (dados.whatsapp && dados.whatsapp !== lead.whatsapp) {
        const outro = await ctx.deps.banco.leadPorWhatsapp(ctx.userId, dados.whatsapp)
        if (outro) throw erros.conflito('whatsapp_duplicado', `Esse WhatsApp já pertence ao lead "${outro.empresa}".`, { lead_id: outro.id })
      }
      if (!Object.keys(dados).length) return { status: 200, corpo: lead }
      return { status: 200, corpo: await ctx.deps.banco.atualizarLead(ctx.userId, lead.id, dados), resumo: `lead editado ${lead.id}` }
    },
  },
  {
    metodo: 'POST',
    padrao: '/leads/:id/estagio',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const lead = await leadOu404(ctx, ctx.params.id)
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const estagio = c.estagio
      if (!ehEstagio(estagio)) throw erros.validacao({ estagio: `Use um destes: ${ESTAGIOS.join(', ')}.` })
      const motivo = typeof c.motivo_perda === 'string' ? c.motivo_perda.trim() : ''
      if (estagio === 'perdido' && !motivo)
        throw erros.validacao({ motivo_perda: 'Obrigatório ao mover para perdido (ex.: "Sem interesse", "Já tem fornecedor").' })

      if (estagio === 'ganho') {
        // Ganho envolve venda: só com aprovação do Richard.
        const acao = await ctx.deps.banco.inserirAcaoPendente(ctx.userId, {
          tipo: 'mudar_estagio',
          lead_id: lead.id,
          payload: { estagio: 'ganho' },
          justificativa: typeof c.justificativa === 'string' ? c.justificativa : 'O agente sugere marcar como ganho.',
          expira_em: expiraEm(ctx),
          criada_por: ctx.chave.id,
        })
        return { status: 202, corpo: { aplicado: false, acao_pendente: acao, mensagem: 'Mudança para ganho aguarda aprovação do Richard.' }, resumo: `ganho proposto ${lead.id}` }
      }
      if (lead.estagio === estagio) return { status: 200, corpo: { aplicado: true, lead } }
      const atualizado = await ctx.deps.banco.mudarEstagio(lead.id, estagio as Estagio, motivo || null, ctx.ator)
      return { status: 200, corpo: { aplicado: true, lead: atualizado }, resumo: `estágio ${lead.estagio}→${estagio}` }
    },
  },
  {
    metodo: 'POST',
    padrao: '/leads/:id/arquivar',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const lead = await leadOu404(ctx, ctx.params.id)
      if (lead.arquivado) return { status: 200, corpo: lead }
      return { status: 200, corpo: await ctx.deps.banco.atualizarLead(ctx.userId, lead.id, { arquivado: true }), resumo: `arquivado ${lead.id}` }
    },
  },
  {
    metodo: 'POST',
    padrao: '/leads/:id/interacoes',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const lead = await leadOu404(ctx, ctx.params.id)
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const tipo = c.tipo
      if (typeof tipo !== 'string' || !(TIPOS_LIVRES as readonly string[]).includes(tipo))
        throw erros.validacao({ tipo: `Use um destes: ${TIPOS_LIVRES.join(', ')}. Mudança de estágio é por POST /leads/{id}/estagio.` })
      const conteudo = typeof c.conteudo === 'string' ? c.conteudo.trim() : null
      if (!conteudo && tipo !== 'whatsapp_recebido') throw erros.validacao({ conteudo: 'Escreva o conteúdo da interação.' })

      if (tipo === 'whatsapp_enviado') {
        // Mensagem enviada fora do CRM: aplica a cadência como o "Enviei".
        const r = await registrarEnvio(ctx, lead, conteudo!, null)
        return { status: 201, corpo: { id: r.id, tipo, lead_id: lead.id }, resumo: `envio registrado ${lead.id}` }
      }
      if (tipo === 'whatsapp_recebido') {
        const r = await ctx.deps.banco.marcarRespondeu(lead.id, conteudo, ctx.ator)
        return { status: 201, corpo: { tipo, lead_id: lead.id, tarefa_id: r.id }, resumo: `resposta registrada ${lead.id}` }
      }
      const ocorreu = c.ocorreu_em === undefined ? undefined : dataIso(c.ocorreu_em)
      if (ocorreu === null) throw erros.validacao({ ocorreu_em: 'Data ISO 8601.' })
      const i = await ctx.deps.banco.inserirInteracao(
        ctx.userId,
        { lead_id: lead.id, tipo: tipo as 'nota', conteudo, ...(ocorreu ? { ocorreu_em: ocorreu } : {}) },
        ctx.ator,
      )
      return { status: 201, corpo: i, resumo: `${tipo} registrada ${lead.id}` }
    },
  },
  {
    metodo: 'POST',
    padrao: '/leads/:id/respondeu',
    escopo: 'escrita',
    escrita: true,
    async executar(ctx) {
      const lead = await leadOu404(ctx, ctx.params.id)
      const c = ehObjeto(ctx.corpo) ? ctx.corpo : {}
      const r = await ctx.deps.banco.marcarRespondeu(lead.id, typeof c.conteudo === 'string' ? c.conteudo : null, ctx.ator)
      const atualizado = await ctx.deps.banco.obterLead(ctx.userId, lead.id)
      return { status: 200, corpo: { lead: atualizado, tarefa_id: r.id }, resumo: `respondeu ${lead.id}` }
    },
  },
]
