import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou } from './erros'

export type Tarefa = Tables<'tarefas'>

function aoMudar(leadId?: string | null) {
  invalidar('tarefas')
  invalidar('fila')
  if (leadId) invalidar(`lead:${leadId}`)
}

export async function listarTarefasDoLead(leadId: string): Promise<Tarefa[]> {
  return falhou(
    await supabase.from('tarefas').select('*').eq('lead_id', leadId).is('concluida_em', null).order('vence_em'),
  )
}

export async function criarTarefa(t: TablesInsert<'tarefas'>): Promise<Tarefa> {
  const criada = falhou(await supabase.from('tarefas').insert(t).select('*').single(), 'Não foi possível criar a tarefa.')
  aoMudar(t.lead_id)
  return criada
}

export async function concluirTarefa(id: string, leadId?: string | null, concluida = true): Promise<void> {
  falhou(
    await supabase
      .from('tarefas')
      .update({ concluida_em: concluida ? new Date().toISOString() : null })
      .eq('id', id),
  )
  aoMudar(leadId)
}
