import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou } from './erros'

export type Interacao = Tables<'interacoes'>

export async function listarInteracoes(leadId: string, limite = 100): Promise<Interacao[]> {
  return falhou(
    await supabase
      .from('interacoes')
      .select('*')
      .eq('lead_id', leadId)
      .order('ocorreu_em', { ascending: false })
      .limit(limite),
    'Não foi possível carregar a linha do tempo.',
  )
}

export async function registrarInteracao(i: TablesInsert<'interacoes'>): Promise<Interacao> {
  const criada = falhou(await supabase.from('interacoes').insert(i).select('*').single(), 'Não foi possível registrar.')
  invalidar(`lead:${i.lead_id}`)
  return criada
}

export async function excluirInteracao(id: string, leadId: string): Promise<void> {
  falhou(await supabase.from('interacoes').delete().eq('id', id))
  invalidar(`lead:${leadId}`)
}
