import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou } from './erros'

export type Servico = Tables<'servicos'>

export async function listarServicos(): Promise<Servico[]> {
  return falhou(await supabase.from('servicos').select('*').order('ordem'), 'Não foi possível carregar o catálogo.')
}

export async function salvarServico(id: string | null, s: TablesInsert<'servicos'> | TablesUpdate<'servicos'>): Promise<Servico> {
  const r = id
    ? await supabase.from('servicos').update(s).eq('id', id).select('*').single()
    : await supabase.from('servicos').insert(s as TablesInsert<'servicos'>).select('*').single()
  invalidar('servicos')
  return falhou(r, 'Não foi possível salvar o serviço.')
}
