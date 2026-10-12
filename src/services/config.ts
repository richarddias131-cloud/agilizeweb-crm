import { supabase } from '../lib/supabase'
import type { Tables, TablesUpdate } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou, traduzirErro } from './erros'

export type Config = Tables<'config'>

/** Cria catálogo, templates e config na primeira vez (idempotente). */
export async function inicializarUsuario(): Promise<void> {
  const r = await supabase.rpc('inicializar_usuario', {})
  if (r.error) throw traduzirErro(r.error)
}

export async function obterConfig(): Promise<Config> {
  let c = falhou(await supabase.from('config').select('*').maybeSingle())
  if (!c) {
    await inicializarUsuario()
    c = falhou(await supabase.from('config').select('*').single())
  }
  return c
}

export async function salvarConfig(id: string, alteracao: TablesUpdate<'config'>): Promise<Config> {
  const c = falhou(await supabase.from('config').update(alteracao).eq('id', id).select('*').single(), 'Não foi possível salvar.')
  invalidar('config')
  invalidar('fila')
  return c
}
