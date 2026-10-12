import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou } from './erros'

export type Template = Tables<'templates'>

export async function listarTemplates(): Promise<Template[]> {
  return falhou(await supabase.from('templates').select('*').order('ordem'), 'Não foi possível carregar os templates.')
}

export async function salvarTemplate(id: string | null, t: TablesInsert<'templates'> | TablesUpdate<'templates'>): Promise<Template> {
  const r = id
    ? await supabase.from('templates').update(t).eq('id', id).select('*').single()
    : await supabase.from('templates').insert(t as TablesInsert<'templates'>).select('*').single()
  invalidar('templates')
  return falhou(r, 'Não foi possível salvar o template.')
}
