import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou, traduzirErro } from './erros'

export type Venda = Tables<'vendas'>
export type ItemVenda = { servico_id: string | null; nome: string; qtd: number; preco: number }
export type VendaComLead = Venda & { lead: { id: string; empresa: string; cidade: string } | null }

function aoMudar(leadId?: string) {
  invalidar('vendas')
  invalidar('leads')
  invalidar('fila')
  invalidar('painel')
  if (leadId) invalidar(`lead:${leadId}`)
}

export async function registrarVenda(v: {
  leadId: string
  itens: ItemVenda[]
  forma: string | null
  status: 'aguardando' | 'pago'
  manutencao: boolean
  valorMensal: number
}): Promise<Venda> {
  const r = await supabase.rpc('registrar_venda', {
    p_lead: v.leadId,
    p_itens: v.itens as never,
    ...(v.forma ? { p_forma_pagamento: v.forma } : {}),
    p_status: v.status,
    p_manutencao_mensal: v.manutencao,
    p_valor_mensal: v.manutencao ? v.valorMensal : 0,
  })
  if (r.error) {
    if (r.error.message.includes('venda_sem_itens')) throw new Error('Escolha ao menos um serviço.')
    throw traduzirErro(r.error, 'Não foi possível registrar a venda.')
  }
  aoMudar(v.leadId)
  return r.data
}

/** Vendas fechadas no intervalo [de, ate). */
export async function listarVendas(de: string, ate: string): Promise<VendaComLead[]> {
  return falhou(
    await supabase
      .from('vendas')
      .select('*, lead:leads(id,empresa,cidade)')
      .gte('fechada_em', de)
      .lt('fechada_em', ate)
      .order('fechada_em', { ascending: false }),
    'Não foi possível carregar as vendas.',
  ) as unknown as VendaComLead[]
}

export async function listarManutencoesAtivas(): Promise<VendaComLead[]> {
  return falhou(
    await supabase
      .from('vendas')
      .select('*, lead:leads(id,empresa,cidade)')
      .eq('manutencao_mensal', true)
      .neq('status', 'cancelado')
      .order('fechada_em', { ascending: false }),
    'Não foi possível carregar as manutenções.',
  ) as unknown as VendaComLead[]
}

export async function atualizarVenda(id: string, alteracao: Partial<Pick<Venda, 'status' | 'forma_pagamento' | 'manutencao_mensal'>>, leadId?: string): Promise<void> {
  falhou(await supabase.from('vendas').update(alteracao).eq('id', id), 'Não foi possível atualizar a venda.')
  aoMudar(leadId)
}

export async function vendasDoLead(leadId: string): Promise<Venda[]> {
  return falhou(await supabase.from('vendas').select('*').eq('lead_id', leadId).order('fechada_em', { ascending: false }))
}
