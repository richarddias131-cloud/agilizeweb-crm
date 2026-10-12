// Banco em memória para os testes da API (imita as RPCs e regras do Postgres).
import type { AcaoPendente, ApiChave, AtorCtx, Banco, Evento, Config, FiltrosLeads, FiltrosTarefas, FiltrosVendas, Interacao, Lead, NovoLead, NovoLog, Servico, Tarefa, Template, Venda } from '../lib/tipos.ts'
import type { Estagio } from '../_shared/dominio.ts'
import type { FilaBruta, LeadFila } from '../_shared/fila.ts'
import { sha256Hex } from '../lib/util.ts'

let seq = 0
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

export const USER = '11111111-1111-4111-8111-111111111111'
export const OUTRO_USER = '22222222-2222-4222-8222-222222222222'

export class BancoMemoria implements Banco {
  chaves: ApiChave[] = []
  logs: NovoLog[] = []
  idem: { chave_id: string; chave: string; status: number; resposta: unknown; em: string }[] = []
  configs: Config[] = []
  leads: Lead[] = []
  interacoesL: Interacao[] = []
  tarefasL: Tarefa[] = []
  templatesL: Template[] = []
  servicosL: Servico[] = []
  acoes: AcaoPendente[] = []
  vendasL: Venda[] = []
  agora = () => new Date()

  /** Cria uma chave e devolve o texto completo (agz_...). */
  async criarChave(escopos: string[], o: Partial<ApiChave> = {}, userId = USER): Promise<string> {
    const textoChave = `agz_${crypto.randomUUID().replace(/-/g, '')}`
    const t = this.agora().toISOString()
    this.chaves.push({
      id: id(),
      user_id: userId,
      nome: 'Grok Bot',
      prefixo: textoChave.slice(0, 8),
      hash: await sha256Hex(textoChave),
      escopos,
      ativa: true,
      ultimo_uso_em: null,
      expira_em: null,
      created_at: t,
      updated_at: t,
      ...o,
    })
    return textoChave
  }

  config(userId = USER, o: Partial<Config> = {}): Config {
    const t = this.agora().toISOString()
    const c: Config = {
      id: id(),
      user_id: userId,
      cadencia_dias: [2, 3, 5],
      encerrar_apos_dias: 5,
      reativar_apos_dias: 60,
      meta_diaria: 20,
      whatsapp_modo: 'auto',
      tema: 'system',
      assinatura: 'Richard | AgilizeWeb',
      whatsapp_proprio: null,
      agente_pausado: false,
      permitir_envio_direto_apos_resposta: false,
      bridge_limite_diario: 40,
      created_at: t,
      updated_at: t,
      ...o,
    }
    this.configs = this.configs.filter((x) => x.user_id !== userId).concat(c)
    return c
  }

  semear(userId = USER): void {
    const t = this.agora().toISOString()
    const tpl = (chave: string, nome: string, corpo: string, ordem: number): Template => ({
      id: id(), user_id: userId, chave, nome, estagio_alvo: null, corpo, ordem, ativo: true, created_at: t, updated_at: t,
    })
    this.templatesL.push(
      tpl('abordagem', 'Abordagem', 'Olá, {{nome}}! Vi a {{empresa}} em {{cidade}}. {{assinatura}}', 1),
      tpl('followup1', 'Follow-up 1', 'Oi, {{nome}}! Posso enviar a auditoria da {{empresa}}?', 2),
      tpl('auditoria', 'Envio da auditoria', 'Nota {{nota}}/100 para {{empresa}}.', 5),
    )
    this.servicosL.push({ id: id(), user_id: userId, nome: 'Kit Comércio no Mapa', preco: 549.9, recorrente: false, preco_mensal: null, ativo: true, ordem: 4, created_at: t, updated_at: t })
  }

  novoLead(o: Partial<Lead> = {}, userId = USER): Lead {
    const t = this.agora().toISOString()
    const l: Lead = {
      id: id(), user_id: userId, empresa: 'Ótica Teste', contato_nome: 'Marina', whatsapp: `55199${String(10000000 + seq).slice(-8)}`, cidade: 'Campinas', uf: 'SP',
      segmento: 'Ótica', origem: 'prospeccao_ativa', link_google: null, site_atual: null, instagram: null, nota_auditoria: null, servico_interesse: null,
      valor_estimado: null, estagio: 'novo', motivo_perda: null, proxima_acao: null, proxima_acao_em: null, ultimo_contato_em: null, ultima_resposta_em: null,
      tentativas_sem_resposta: 0, opt_out: false, arquivado: false, tags: [], observacoes: null, created_at: t, updated_at: t, ...o,
    }
    this.leads.push(l)
    return l
  }

  // ---- Banco ----
  async chavePorHash(hash: string) { return this.chaves.find((c) => c.hash === hash) ?? null }
  async tocarChave(cid: string) { const c = this.chaves.find((x) => x.id === cid); if (c) c.ultimo_uso_em = this.agora().toISOString() }
  async contarChamadas(chaveId: string, desde: string) {
    return this.logs.filter((l) => l.chave_id === chaveId && (l as NovoLog & { em: string }).em >= desde).length
  }
  async registrarLog(l: NovoLog) { this.logs.push({ ...l, em: this.agora().toISOString() } as NovoLog) }
  async obterIdempotencia(chaveId: string, chave: string, desde: string) {
    const r = this.idem.find((i) => i.chave_id === chaveId && i.chave === chave && i.em >= desde)
    return r ? { status_http: r.status, resposta: structuredClone(r.resposta) } : null
  }
  async salvarIdempotencia(_u: string, chaveId: string, chave: string, status: number, resposta: unknown) {
    this.idem.push({ chave_id: chaveId, chave, status, resposta: structuredClone(resposta), em: this.agora().toISOString() })
  }
  async limpeza() {}
  async obterConfig(userId: string) { return this.configs.find((c) => c.user_id === userId) ?? null }

  async listarLeads(userId: string, f: FiltrosLeads) {
    let r = this.leads.filter((l) => l.user_id === userId && (f.incluir_arquivados || !l.arquivado))
    if (f.estagio) r = r.filter((l) => l.estagio === f.estagio)
    if (f.cidade) r = r.filter((l) => l.cidade === f.cidade)
    if (f.tag) r = r.filter((l) => l.tags.includes(f.tag!))
    if (f.busca) r = r.filter((l) => `${l.empresa} ${l.contato_nome} ${l.cidade} ${l.whatsapp}`.toLowerCase().includes(f.busca!.toLowerCase()))
    r.sort((a, b) => (a.updated_at === b.updated_at ? b.id.localeCompare(a.id) : b.updated_at.localeCompare(a.updated_at)))
    if (f.apos) r = r.filter((l) => l.updated_at < f.apos!.updated_at || (l.updated_at === f.apos!.updated_at && l.id < f.apos!.id))
    return r.slice(0, f.limite)
  }
  async obterLead(userId: string, lid: string) { return this.leads.find((l) => l.id === lid && l.user_id === userId) ?? null }
  async leadPorWhatsapp(userId: string, n: string) { return this.leads.find((l) => l.whatsapp === n && l.user_id === userId) ?? null }
  async inserirLead(userId: string, d: NovoLead) { return this.novoLead(d as Partial<Lead>, userId) }
  async atualizarLead(userId: string, lid: string, d: Partial<Lead>) {
    const l = (await this.obterLead(userId, lid))!
    Object.assign(l, d, { updated_at: this.agora().toISOString() })
    return l
  }
  async interacoes(userId: string, leadId: string, limite: number) {
    return this.interacoesL.filter((i) => i.user_id === userId && i.lead_id === leadId).slice(-limite).reverse()
  }
  async inserirInteracao(userId: string, i: { lead_id: string; tipo: Interacao['tipo']; conteudo: string | null; ocorreu_em?: string }, ator: AtorCtx) {
    const t = this.agora().toISOString()
    const nova: Interacao = { id: id(), user_id: userId, lead_id: i.lead_id, tipo: i.tipo, conteudo: i.conteudo, dados: {}, template_id: null, ocorreu_em: i.ocorreu_em ?? t, ator: ator.ator, ator_nome: ator.nome, created_at: t, updated_at: t }
    this.interacoesL.push(nova)
    return nova
  }
  async listarTarefas(userId: string, f: FiltrosTarefas) {
    return this.tarefasL.filter((t) => t.user_id === userId && (!f.lead_id || t.lead_id === f.lead_id) && (!f.abertas || !t.concluida_em)).slice(0, f.limite)
  }
  async obterTarefa(userId: string, tid: string) { return this.tarefasL.find((t) => t.id === tid && t.user_id === userId) ?? null }
  async inserirTarefa(userId: string, t: { lead_id: string | null; titulo: string; vence_em: string; origem: string }) {
    const agora = this.agora().toISOString()
    const nova: Tarefa = { id: id(), user_id: userId, concluida_em: null, created_at: agora, updated_at: agora, ...t }
    this.tarefasL.push(nova)
    return nova
  }
  async atualizarTarefa(userId: string, tid: string, d: Partial<Tarefa>) { const t = (await this.obterTarefa(userId, tid))!; Object.assign(t, d); return t }
  async templates(userId: string) { return this.templatesL.filter((t) => t.user_id === userId) }
  async servicos(userId: string) { return this.servicosL.filter((s) => s.user_id === userId) }
  async inserirAcaoPendente(userId: string, a: { tipo: string; lead_id: string | null; payload: Record<string, unknown>; justificativa: string | null; expira_em: string; criada_por: string | null }) {
    const t = this.agora().toISOString()
    const nova = { id: id(), user_id: userId, status: 'pendente', decidida_em: null, created_at: t, updated_at: t, ...a } as AcaoPendente
    this.acoes.push(nova)
    return nova
  }
  async obterAcaoPendente(userId: string, aid: string) { return this.acoes.find((a) => a.id === aid && a.user_id === userId) ?? null }
  async contarEnviosAgente(userId: string, desde: string) {
    return (
      this.acoes.filter((a) => a.user_id === userId && a.tipo === 'enviar_mensagem' && a.created_at >= desde).length +
      this.interacoesL.filter((i) => i.user_id === userId && i.tipo === 'whatsapp_enviado' && i.ator !== 'richard' && i.created_at >= desde).length
    )
  }
  async mudarEstagio(leadId: string, estagio: Estagio, motivo: string | null, ator: AtorCtx) {
    const l = this.leads.find((x) => x.id === leadId)!
    if (estagio === 'perdido' && !motivo) throw new Error('motivo_perda_obrigatorio')
    const de = l.estagio
    l.estagio = estagio
    if (estagio === 'perdido') l.motivo_perda = motivo
    await this.inserirInteracao(l.user_id, { lead_id: l.id, tipo: 'mudanca_estagio', conteudo: `${de} → ${estagio}` }, ator)
    return l
  }
  async registrarEnvio(leadId: string, conteudo: string, _t: string | null, a: { estagio: Estagio; tentativas_sem_resposta: number; proxima_acao: string | null; proxima_acao_em: string | null }, ator: AtorCtx) {
    const l = this.leads.find((x) => x.id === leadId)!
    if (l.opt_out) throw new Error('lead_opt_out')
    const i = await this.inserirInteracao(l.user_id, { lead_id: l.id, tipo: 'whatsapp_enviado', conteudo }, ator)
    if (l.estagio !== a.estagio) await this.mudarEstagio(l.id, a.estagio, null, ator)
    Object.assign(l, { ultimo_contato_em: this.agora().toISOString(), tentativas_sem_resposta: a.tentativas_sem_resposta, proxima_acao: a.proxima_acao, proxima_acao_em: a.proxima_acao_em })
    return { id: i.id, marco: i.created_at }
  }
  async marcarRespondeu(leadId: string, conteudo: string | null, ator: AtorCtx) {
    const l = this.leads.find((x) => x.id === leadId)!
    await this.inserirInteracao(l.user_id, { lead_id: l.id, tipo: 'whatsapp_recebido', conteudo }, ator)
    if (['novo', 'abordado', 'sem_resposta', 'perdido'].includes(l.estagio)) await this.mudarEstagio(l.id, 'respondeu', null, ator)
    Object.assign(l, { tentativas_sem_resposta: 0, ultima_resposta_em: this.agora().toISOString(), proxima_acao: 'Responder', proxima_acao_em: null })
    const t = await this.inserirTarefa(l.user_id, { lead_id: l.id, titulo: `Responder ${l.empresa}`, vence_em: this.agora().toISOString(), origem: 'cadencia' })
    return { id: t.id, marco: t.created_at }
  }
  async encerrarCadencia(leadId: string, reativarEm: string, ator: AtorCtx) {
    const l = this.leads.find((x) => x.id === leadId)!
    await this.mudarEstagio(l.id, 'sem_resposta', null, ator)
    l.proxima_acao_em = null
    await this.inserirTarefa(l.user_id, { lead_id: l.id, titulo: `Reativar ${l.empresa}`, vence_em: reativarEm, origem: 'cadencia' })
  }
  async filaHoje(userId: string): Promise<FilaBruta> {
    const meus = this.leads.filter((l) => l.user_id === userId && !l.arquivado && !l.opt_out)
    const fim = new Date(this.agora().getTime() + 86_400_000).toISOString()
    const resp = (l: Lead) => !!l.ultima_resposta_em && (!l.ultimo_contato_em || l.ultima_resposta_em > l.ultimo_contato_em)
    return {
      gerada_em: this.agora().toISOString(),
      meta_diaria: 20,
      abordagens_hoje: 0,
      config: (await this.obterConfig(userId)) as never,
      para_aprovar: [],
      responderam: meus.filter(resp) as unknown as LeadFila[],
      followups: meus.filter((l) => !resp(l) && l.proxima_acao_em && l.proxima_acao_em < fim) as unknown as LeadFila[],
      novos: meus.filter((l) => l.estagio === 'novo' && !l.proxima_acao_em) as unknown as LeadFila[],
      novos_total: meus.filter((l) => l.estagio === 'novo').length,
      tarefas: [],
    }
  }
  async listarVendas(userId: string, f: FiltrosVendas) {
    return this.vendasL
      .filter((v) => v.user_id === userId && (!f.de || v.fechada_em >= f.de) && (!f.ate || v.fechada_em < f.ate) && (!f.status || v.status === f.status))
      .sort((a, b) => b.fechada_em.localeCompare(a.fechada_em))
      .slice(0, f.limite)
  }
  async metricas(userId: string, de: string | null, ate: string | null) {
    const v = this.vendasL.filter((x) => x.user_id === userId)
    return { periodo: { de, ate }, receita_periodo: { paga: v.filter((x) => x.status === 'pago').reduce((t, x) => t + Number(x.valor_total), 0) } }
  }
  async whatsappsExistentes(userId: string, numeros: string[]) {
    return new Set(this.leads.filter((l) => l.user_id === userId && numeros.includes(l.whatsapp)).map((l) => l.whatsapp))
  }
  async inserirLeads(userId: string, leads: NovoLead[]) {
    const criados: Lead[] = []
    for (const l of leads) if (!(await this.leadPorWhatsapp(userId, l.whatsapp))) criados.push(this.novoLead(l as Partial<Lead>, userId))
    return criados
  }
  async eventos(userId: string, desde: string, limite: number): Promise<Evento[]> {
    const ev: Evento[] = [
      ...this.leads.filter((l) => l.user_id === userId && l.updated_at > desde).map((l) => ({ tipo: (l.created_at > desde ? 'lead_criado' : 'lead_atualizado') as Evento['tipo'], ocorreu_em: l.updated_at, lead_id: l.id, dados: l as unknown as Record<string, unknown> })),
      ...this.interacoesL.filter((i) => i.user_id === userId && i.created_at > desde).map((i) => ({ tipo: 'interacao' as const, ocorreu_em: i.created_at, lead_id: i.lead_id, dados: i as unknown as Record<string, unknown> })),
    ]
    return ev.sort((a, b) => a.ocorreu_em.localeCompare(b.ocorreu_em)).slice(0, limite)
  }
}
