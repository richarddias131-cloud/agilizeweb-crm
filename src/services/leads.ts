import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import type { Estagio } from '../../shared/dominio.ts'
import { normalizarTelefone } from '../../shared/phone.ts'
import { invalidar } from '../lib/cache'
import { falhou, traduzirErro } from './erros'
import type { Desfazer } from './envio'

export type Lead = Tables<'leads'>
export type NovoLead = TablesInsert<'leads'>
export type AlteracaoLead = TablesUpdate<'leads'>

/** Campos usados na lista (mais leve que o lead completo). */
const CAMPOS_LISTA =
  'id,empresa,contato_nome,whatsapp,cidade,uf,segmento,estagio,tags,ultimo_contato_em,ultima_resposta_em,proxima_acao_em,opt_out,arquivado,valor_estimado,nota_auditoria,created_at,updated_at,origem'
export type LeadResumo = Pick<
  Lead,
  | 'id'
  | 'empresa'
  | 'contato_nome'
  | 'whatsapp'
  | 'cidade'
  | 'uf'
  | 'segmento'
  | 'estagio'
  | 'tags'
  | 'ultimo_contato_em'
  | 'ultima_resposta_em'
  | 'proxima_acao_em'
  | 'opt_out'
  | 'arquivado'
  | 'valor_estimado'
  | 'nota_auditoria'
  | 'created_at'
  | 'updated_at'
  | 'origem'
>

function aoMudar() {
  invalidar('leads')
  invalidar('fila')
}

export async function listarLeads(incluirArquivados = false): Promise<LeadResumo[]> {
  // Volume de um usuário (milhares) cabe em memória: busca e filtros ficam instantâneos.
  const todos: LeadResumo[] = []
  const PAGINA = 1000
  for (let de = 0; ; de += PAGINA) {
    let q = supabase.from('leads').select(CAMPOS_LISTA).order('updated_at', { ascending: false }).range(de, de + PAGINA - 1)
    if (!incluirArquivados) q = q.eq('arquivado', false)
    const dados = falhou(await q, 'Não foi possível carregar os leads.') as LeadResumo[]
    todos.push(...dados)
    if (dados.length < PAGINA) break
  }
  return todos
}

export async function obterLead(id: string): Promise<Lead> {
  return falhou(await supabase.from('leads').select('*').eq('id', id).single(), 'Lead não encontrado.')
}

export async function buscarPorWhatsapp(entrada: string): Promise<Pick<Lead, 'id' | 'empresa' | 'arquivado'> | null> {
  const r = normalizarTelefone(entrada)
  if (!r.ok) return null
  return falhou(
    await supabase.from('leads').select('id,empresa,arquivado').eq('whatsapp', r.numero).maybeSingle(),
  )
}

export async function criarLead(lead: NovoLead): Promise<Lead> {
  const tel = normalizarTelefone(lead.whatsapp)
  if (!tel.ok) throw new Error(tel.erro)
  const criado = falhou(
    await supabase
      .from('leads')
      .insert({ ...lead, whatsapp: tel.numero })
      .select('*')
      .single(),
    'Não foi possível salvar o lead.',
  )
  aoMudar()
  return criado
}

export async function atualizarLead(id: string, alteracao: AlteracaoLead): Promise<Lead> {
  const dados = { ...alteracao }
  if (dados.whatsapp !== undefined) {
    const tel = normalizarTelefone(dados.whatsapp)
    if (!tel.ok) throw new Error(tel.erro)
    dados.whatsapp = tel.numero
  }
  const atualizado = falhou(
    await supabase.from('leads').update(dados).eq('id', id).select('*').single(),
    'Não foi possível salvar.',
  )
  aoMudar()
  invalidar(`lead:${id}`)
  return atualizado
}

export async function atualizarVarios(ids: string[], alteracao: AlteracaoLead): Promise<void> {
  if (!ids.length) return
  falhou(await supabase.from('leads').update(alteracao).in('id', ids))
  aoMudar()
}

export async function adicionarTag(ids: string[], tag: string): Promise<void> {
  const t = tag.trim()
  if (!ids.length || !t) return
  const atuais = falhou(await supabase.from('leads').select('id,tags').in('id', ids))
  await Promise.all(
    atuais
      .filter((l) => !l.tags.includes(t))
      .map(async (l) => falhou(await supabase.from('leads').update({ tags: [...l.tags, t] }).eq('id', l.id))),
  )
  aoMudar()
}

/** Muda o estágio e devolve o necessário para desfazer. */
export async function mudarEstagio(
  lead: Pick<Lead, 'id' | 'estagio' | 'motivo_perda' | 'proxima_acao' | 'proxima_acao_em'>,
  estagio: Estagio,
  motivoPerda?: string,
): Promise<Desfazer> {
  const id = lead.id
  const r = await supabase.rpc('mudar_estagio', {
    p_lead: id,
    p_estagio: estagio,
    ...(motivoPerda ? { p_motivo_perda: motivoPerda } : {}),
  })
  if (r.error) throw traduzirErro(r.error)
  aoMudar()
  invalidar(`lead:${id}`)
  return {
    leadId: id,
    marco: r.data.updated_at,
    anterior: {
      estagio: lead.estagio,
      motivo_perda: lead.motivo_perda,
      proxima_acao: lead.proxima_acao,
      proxima_acao_em: lead.proxima_acao_em,
    },
  }
}

export async function mudarEstagioVarios(ids: string[], estagio: Estagio, motivoPerda?: string): Promise<void> {
  for (const id of ids) {
    const r = await supabase.rpc('mudar_estagio', {
      p_lead: id,
      p_estagio: estagio,
      ...(motivoPerda ? { p_motivo_perda: motivoPerda } : {}),
    })
    if (r.error) throw traduzirErro(r.error)
  }
  aoMudar()
}

/** Botão "Respondeu": devolve o necessário para desfazer. */
export async function marcarRespondeu(
  lead: Pick<Lead, 'id' | 'estagio' | 'tentativas_sem_resposta' | 'proxima_acao' | 'proxima_acao_em' | 'ultima_resposta_em'>,
): Promise<Desfazer> {
  const r = await supabase.rpc('marcar_respondeu', { p_lead: lead.id })
  if (r.error) throw traduzirErro(r.error)
  aoMudar()
  invalidar(`lead:${lead.id}`)
  invalidar('tarefas')
  return {
    leadId: lead.id,
    marco: (r.data as { marco: string }).marco,
    anterior: {
      estagio: lead.estagio,
      tentativas_sem_resposta: lead.tentativas_sem_resposta,
      proxima_acao: lead.proxima_acao,
      proxima_acao_em: lead.proxima_acao_em,
      ultima_resposta_em: lead.ultima_resposta_em,
    },
  }
}
