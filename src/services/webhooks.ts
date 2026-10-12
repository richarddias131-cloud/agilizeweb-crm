import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou, traduzirErro } from './erros'

export type Webhook = Tables<'webhooks'>
export type Entrega = Tables<'webhook_entregas'>

export const EVENTOS_WEBHOOK = [
  { id: 'lead.criado', rotulo: 'Lead criado' },
  { id: 'lead.respondeu', rotulo: 'Lead respondeu' },
  { id: 'lead.estagio_alterado', rotulo: 'Estágio alterado' },
  { id: 'mensagem.recebida', rotulo: 'Mensagem recebida (wa-bridge)' },
  { id: 'acao.aprovada', rotulo: 'Proposta aprovada' },
  { id: 'acao.rejeitada', rotulo: 'Proposta rejeitada' },
  { id: 'venda.criada', rotulo: 'Venda registrada' },
] as const

function gerarSegredo(): string {
  const b = crypto.getRandomValues(new Uint8Array(24))
  return 'whsec_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export async function listarWebhooks(): Promise<Webhook[]> {
  return falhou(await supabase.from('webhooks').select('*').order('created_at'), 'Não foi possível carregar os webhooks.')
}

export async function criarWebhook(url: string, eventos: string[]): Promise<Webhook> {
  const w = falhou(
    await supabase.from('webhooks').insert({ url: url.trim(), eventos, segredo: gerarSegredo() }).select('*').single(),
    'Não foi possível criar o webhook. Confira se a URL começa com https://',
  )
  invalidar('webhooks')
  return w
}

export async function atualizarWebhook(id: string, alteracao: Partial<Pick<Webhook, 'url' | 'eventos' | 'ativo' | 'falhas_seguidas'>>): Promise<void> {
  falhou(await supabase.from('webhooks').update(alteracao).eq('id', id), 'Não foi possível salvar o webhook.')
  invalidar('webhooks')
}

export async function excluirWebhook(id: string): Promise<void> {
  falhou(await supabase.from('webhooks').delete().eq('id', id), 'Não foi possível remover o webhook.')
  invalidar('webhooks')
}

export async function testarWebhook(id: string): Promise<string> {
  const r = await supabase.rpc('testar_webhook', { p_webhook: id })
  if (r.error) throw traduzirErro(r.error, 'Não foi possível enviar o teste.')
  return r.data
}

export async function obterEntrega(id: string): Promise<Entrega | null> {
  return falhou(await supabase.from('webhook_entregas').select('*').eq('id', id).maybeSingle())
}

export async function ultimasEntregas(webhookId: string, limite = 10): Promise<Entrega[]> {
  return falhou(await supabase.from('webhook_entregas').select('*').eq('webhook_id', webhookId).order('created_at', { ascending: false }).limit(limite))
}
