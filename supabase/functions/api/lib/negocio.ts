// Regras de negócio usadas por várias rotas da API.
import type { Ctx } from '../app.ts'
import { erros } from './erros.ts'
import type { Lead, Template } from './tipos.ts'
import { UUID, inicioDoDiaSP } from './util.ts'
import { aposEnvio, ehProspeccaoFria } from '../_shared/cadencia.ts'
import { configCadencia } from '../_shared/fila.ts'
import { renderizarTemplate } from '../_shared/template.ts'
import { linkWaMe, linkWhatsappWeb } from '../_shared/whatsapp.ts'

export async function leadOu404(ctx: Ctx, id: string | undefined): Promise<Lead> {
  if (!id || !UUID.test(id)) throw erros.leadNaoEncontrado(String(id))
  const lead = await ctx.deps.banco.obterLead(ctx.userId, id)
  if (!lead) throw erros.leadNaoEncontrado(id)
  return lead
}

/** Bloqueio de opt-out: aplicado no servidor, sempre. */
export function exigirSemOptOut(lead: Lead): void {
  if (lead.opt_out) throw erros.optOut(lead.id)
}

/** Registra uma mensagem enviada (aplica a cadência compartilhada). */
export async function registrarEnvio(ctx: Ctx, lead: Lead, texto: string, template: Pick<Template, 'id' | 'chave'> | null) {
  exigirSemOptOut(lead)
  const atualizacao = aposEnvio(lead, configCadencia(ctx.config as never), ctx.agora, template?.chave ?? null)
  return ctx.deps.banco.registrarEnvio(lead.id, texto, template?.id ?? null, atualizacao, ctx.ator)
}

export type Preparada = {
  lead_id: string
  template_id: string | null
  texto: string
  faltando: string[]
  link_wa_me: string
  link_whatsapp_web: string
  prospeccao_fria: boolean
}

/** Renderiza a mensagem (template ou texto livre) com os dados do lead. */
export async function prepararMensagem(
  ctx: Ctx,
  lead: Lead,
  entrada: { template_id?: unknown; template_chave?: unknown; texto?: unknown },
): Promise<Preparada> {
  exigirSemOptOut(lead)
  let template: Template | null = null
  let corpo: string
  if (typeof entrada.texto === 'string' && entrada.texto.trim()) {
    corpo = entrada.texto
  } else {
    const templates = await ctx.deps.banco.templates(ctx.userId)
    if (typeof entrada.template_id === 'string') template = templates.find((t) => t.id === entrada.template_id) ?? null
    else if (typeof entrada.template_chave === 'string') template = templates.find((t) => t.chave === entrada.template_chave) ?? null
    else throw erros.validacao({ template_id: 'Envie template_id, template_chave ou texto.' })
    if (!template) throw erros.validacao({ template_id: 'Template não encontrado. Consulte GET /templates.' })
    if (!template.ativo) throw erros.validacao({ template_id: 'Template inativo. Escolha um ativo em GET /templates.' })
    corpo = template.corpo
  }
  const servicos = lead.servico_interesse ? await ctx.deps.banco.servicos(ctx.userId) : []
  const servico = servicos.find((s) => s.id === lead.servico_interesse)
  const r = renderizarTemplate(corpo, {
    contato_nome: lead.contato_nome,
    empresa: lead.empresa,
    cidade: lead.cidade,
    segmento: lead.segmento,
    nota_auditoria: lead.nota_auditoria,
    servico: servico ? { nome: servico.nome, preco: Number(servico.preco) } : null,
    assinatura: ctx.config?.assinatura ?? 'Richard | AgilizeWeb',
  })
  return {
    lead_id: lead.id,
    template_id: template?.id ?? null,
    texto: r.texto,
    faltando: r.faltando,
    link_wa_me: linkWaMe(lead.whatsapp, r.texto),
    link_whatsapp_web: linkWhatsappWeb(lead.whatsapp, r.texto),
    prospeccao_fria: ehProspeccaoFria(lead),
  }
}

/** Limite diário de mensagens do agente (propostas + envios). */
export async function exigirLimiteDiario(ctx: Ctx): Promise<void> {
  const limite = Math.min(ctx.config?.meta_diaria ?? 20, ctx.config?.bridge_limite_diario ?? 40) || 0
  const feitos = await ctx.deps.banco.contarEnviosAgente(ctx.userId, inicioDoDiaSP(ctx.agora))
  if (feitos >= limite) throw erros.limiteDiario(limite)
}

export function expiraEm(ctx: Ctx, horas = 48): string {
  return new Date(ctx.agora.getTime() + horas * 3_600_000).toISOString()
}
