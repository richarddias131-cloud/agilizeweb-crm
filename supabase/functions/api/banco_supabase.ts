// Implementação do Banco com supabase-js (service_role, só dentro da Edge Function).
// Toda consulta filtra pelo user_id dono da chave.
import { createClient, type PostgrestError, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import type { Database } from './_shared/database.types.ts'
import type { FilaBruta } from './_shared/fila.ts'
import { ErroApi, erros } from './lib/erros.ts'
import type { AlteracaoLead, AtorCtx, Banco, FiltrosLeads, FiltrosTarefas, NovoLead, NovoLog, Tarefa } from './lib/tipos.ts'

function falha(e: PostgrestError): never {
  const m = e.message ?? ''
  if (m.includes('lead_opt_out')) throw new ErroApi(403, 'lead_opt_out', 'Este lead pediu para não receber mensagens (opt-out).')
  if (m.includes('motivo_perda')) throw erros.validacao({ motivo_perda: 'Obrigatório ao mover para perdido.' })
  if (m.includes('lead_nao_encontrado')) throw new ErroApi(404, 'lead_nao_encontrado', 'Lead não encontrado.')
  if (e.code === '23505' && m.includes('leads_whatsapp_unico')) throw erros.conflito('whatsapp_duplicado', 'Já existe um lead com esse WhatsApp.')
  if (e.code === '23514') throw erros.validacao({ banco: `Valor recusado pelo banco: ${m}` })
  if (e.code === '23503') throw erros.validacao({ referencia: 'Referência inválida (ex.: servico_interesse não existe).' })
  console.error('[banco]', e)
  throw erros.interno()
}

type Resposta = { data: unknown; error: PostgrestError | null }

/** Devolve o dado do ramo de sucesso ou lança o erro traduzido. */
function ok<R extends Resposta>(r: R): Extract<R, { error: null }>['data'] {
  if (r.error) falha(r.error)
  return r.data as Extract<R, { error: null }>['data']
}

/** Remove caracteres que quebram a sintaxe de filtros do PostgREST. */
const limparBusca = (s: string) => s.replace(/[,()*%\\]/g, ' ').trim()

export class BancoSupabase implements Banco {
  private db: SupabaseClient<Database>

  constructor(url: string, chaveServico: string) {
    this.db = createClient<Database>(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  async chavePorHash(hash: string) {
    return ok(await this.db.from('api_chaves').select('*').eq('hash', hash).maybeSingle())
  }
  async tocarChave(id: string) {
    await this.db.from('api_chaves').update({ ultimo_uso_em: new Date().toISOString() }).eq('id', id)
  }
  async contarChamadas(chaveId: string, desde: string) {
    const r = await this.db.from('api_log').select('id', { count: 'exact', head: true }).eq('chave_id', chaveId).gte('criado_em', desde)
    if (r.error) falha(r.error)
    return r.count ?? 0
  }
  async registrarLog(l: NovoLog) {
    ok(await this.db.from('api_log').insert(l))
  }
  async obterIdempotencia(chaveId: string, chave: string, desde: string) {
    const r = ok(
      await this.db.from('idempotencia').select('status_http,resposta').eq('chave_id', chaveId).eq('idempotency_key', chave).gte('criado_em', desde).maybeSingle(),
    )
    return r ? { status_http: r.status_http, resposta: r.resposta } : null
  }
  async salvarIdempotencia(userId: string, chaveId: string, chave: string, status: number, resposta: unknown) {
    // upsert: uma chave antiga (> 24 h) é sobrescrita
    ok(
      await this.db
        .from('idempotencia')
        .upsert(
          { user_id: userId, chave_id: chaveId, idempotency_key: chave, status_http: status, resposta: resposta as never, criado_em: new Date().toISOString() },
          { onConflict: 'chave_id,idempotency_key' },
        ),
    )
  }
  async limpeza() {
    const agora = Date.now()
    await this.db.from('api_log').delete().lt('criado_em', new Date(agora - 30 * 86_400_000).toISOString())
    await this.db.from('idempotencia').delete().lt('criado_em', new Date(agora - 86_400_000).toISOString())
  }

  async obterConfig(userId: string) {
    return ok(await this.db.from('config').select('*').eq('user_id', userId).maybeSingle())
  }

  async listarLeads(userId: string, f: FiltrosLeads) {
    let q = this.db.from('leads').select('*').eq('user_id', userId)
    if (!f.incluir_arquivados) q = q.eq('arquivado', false)
    if (f.estagio) q = q.eq('estagio', f.estagio)
    if (f.cidade) q = q.ilike('cidade', f.cidade)
    if (f.segmento) q = q.ilike('segmento', f.segmento)
    if (f.tag) q = q.contains('tags', [f.tag])
    if (f.atualizado_desde) q = q.gte('updated_at', f.atualizado_desde)
    if (f.busca) {
      const b = limparBusca(f.busca)
      const digitos = b.replace(/\D/g, '')
      const conds = [`empresa.ilike.*${b}*`, `contato_nome.ilike.*${b}*`, `cidade.ilike.*${b}*`]
      if (digitos.length >= 4) conds.push(`whatsapp.like.*${digitos}*`)
      q = q.or(conds.join(','))
    }
    if (f.sem_contato_ha_dias !== undefined) {
      const limite = new Date(Date.now() - f.sem_contato_ha_dias * 86_400_000).toISOString()
      q = q.or(`ultimo_contato_em.is.null,ultimo_contato_em.lt.${limite}`)
    }
    if (f.apos) q = q.or(`updated_at.lt.${f.apos.updated_at},and(updated_at.eq.${f.apos.updated_at},id.lt.${f.apos.id})`)
    return ok(await q.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(f.limite))
  }
  async obterLead(userId: string, id: string) {
    return ok(await this.db.from('leads').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  }
  async leadPorWhatsapp(userId: string, numero: string) {
    return ok(await this.db.from('leads').select('*').eq('user_id', userId).eq('whatsapp', numero).maybeSingle())
  }
  async inserirLead(userId: string, dados: NovoLead) {
    return ok(await this.db.from('leads').insert({ ...dados, user_id: userId }).select('*').single())
  }
  async atualizarLead(userId: string, id: string, dados: AlteracaoLead) {
    return ok(await this.db.from('leads').update(dados).eq('user_id', userId).eq('id', id).select('*').single())
  }

  async interacoes(userId: string, leadId: string, limite: number) {
    return ok(await this.db.from('interacoes').select('*').eq('user_id', userId).eq('lead_id', leadId).order('ocorreu_em', { ascending: false }).limit(limite))
  }
  async inserirInteracao(userId: string, i: { lead_id: string; tipo: Database['public']['Enums']['tipo_interacao']; conteudo: string | null; ocorreu_em?: string }, ator: AtorCtx) {
    return ok(await this.db.from('interacoes').insert({ ...i, user_id: userId, ator: ator.ator, ator_nome: ator.nome }).select('*').single())
  }

  async listarTarefas(userId: string, f: FiltrosTarefas) {
    let q = this.db.from('tarefas').select('*').eq('user_id', userId)
    if (f.lead_id) q = q.eq('lead_id', f.lead_id)
    if (f.abertas) q = q.is('concluida_em', null)
    if (f.apos) q = q.or(`vence_em.gt.${f.apos.vence_em},and(vence_em.eq.${f.apos.vence_em},id.gt.${f.apos.id})`)
    return ok(await q.order('vence_em').order('id').limit(f.limite))
  }
  async obterTarefa(userId: string, id: string) {
    return ok(await this.db.from('tarefas').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  }
  async inserirTarefa(userId: string, t: { lead_id: string | null; titulo: string; vence_em: string; origem: string }) {
    return ok(await this.db.from('tarefas').insert({ ...t, user_id: userId }).select('*').single())
  }
  async atualizarTarefa(userId: string, id: string, t: Partial<Pick<Tarefa, 'titulo' | 'vence_em' | 'concluida_em'>>) {
    return ok(await this.db.from('tarefas').update(t).eq('user_id', userId).eq('id', id).select('*').single())
  }

  async templates(userId: string) {
    return ok(await this.db.from('templates').select('*').eq('user_id', userId).order('ordem'))
  }
  async servicos(userId: string) {
    return ok(await this.db.from('servicos').select('*').eq('user_id', userId).order('ordem'))
  }

  async inserirAcaoPendente(userId: string, a: { tipo: string; lead_id: string | null; payload: Record<string, unknown>; justificativa: string | null; expira_em: string; criada_por: string | null }) {
    return ok(await this.db.from('acoes_pendentes').insert({ ...a, payload: a.payload as never, user_id: userId }).select('*').single())
  }
  async obterAcaoPendente(userId: string, id: string) {
    return ok(await this.db.from('acoes_pendentes').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  }
  async contarEnviosAgente(userId: string, desde: string) {
    const [a, i] = await Promise.all([
      this.db.from('acoes_pendentes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('tipo', 'enviar_mensagem').gte('created_at', desde),
      this.db.from('interacoes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('tipo', 'whatsapp_enviado').in('ator', ['agente', 'bridge']).gte('created_at', desde),
    ])
    if (a.error) falha(a.error)
    if (i.error) falha(i.error)
    return (a.count ?? 0) + (i.count ?? 0)
  }

  async mudarEstagio(leadId: string, estagio: Database['public']['Enums']['estagio_lead'], motivo: string | null, ator: AtorCtx) {
    return ok(
      await this.db.rpc('mudar_estagio', {
        p_lead: leadId,
        p_estagio: estagio,
        ...(motivo ? { p_motivo_perda: motivo } : {}),
        p_ator: ator.ator,
        ...(ator.nome ? { p_ator_nome: ator.nome } : {}),
      }),
    )
  }
  async registrarEnvio(
    leadId: string,
    conteudo: string,
    templateId: string | null,
    a: { estagio: Database['public']['Enums']['estagio_lead']; tentativas_sem_resposta: number; proxima_acao: string | null; proxima_acao_em: string | null },
    ator: AtorCtx,
  ) {
    const r = ok(
      await this.db.rpc('registrar_envio', {
        p_lead: leadId,
        p_conteudo: conteudo,
        ...(templateId ? { p_template: templateId } : {}),
        p_estagio: a.estagio,
        p_tentativas: a.tentativas_sem_resposta,
        ...(a.proxima_acao ? { p_proxima_acao: a.proxima_acao } : {}),
        ...(a.proxima_acao_em ? { p_proxima_acao_em: a.proxima_acao_em } : {}),
        p_ator: ator.ator,
        ...(ator.nome ? { p_ator_nome: ator.nome } : {}),
      }),
    )
    return r as unknown as { id: string; marco: string }
  }
  async marcarRespondeu(leadId: string, conteudo: string | null, ator: AtorCtx) {
    const r = ok(
      await this.db.rpc('marcar_respondeu', {
        p_lead: leadId,
        ...(conteudo ? { p_conteudo: conteudo } : {}),
        p_ator: ator.ator,
        ...(ator.nome ? { p_ator_nome: ator.nome } : {}),
      }),
    )
    return r as unknown as { id: string; marco: string }
  }
  async encerrarCadencia(leadId: string, reativarEm: string, ator: AtorCtx) {
    ok(await this.db.rpc('encerrar_cadencia', { p_lead: leadId, p_reativar_em: reativarEm, p_ator: ator.ator, ...(ator.nome ? { p_ator_nome: ator.nome } : {}) }))
  }
  async filaHoje(userId: string) {
    return ok(await this.db.rpc('fila_hoje', { p_user: userId })) as unknown as FilaBruta
  }
}
