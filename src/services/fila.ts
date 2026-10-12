import { supabase } from '../lib/supabase'
import { configCadencia, montarFila, type Fila, type FilaBruta } from '../../shared/fila.ts'
import { dataReativar } from '../../shared/cadencia.ts'
import { traduzirErro } from './erros'

async function buscarBruta(): Promise<FilaBruta> {
  const r = await supabase.rpc('fila_hoje', {})
  if (r.error) throw traduzirErro(r.error, 'Não foi possível montar a fila de hoje.')
  return r.data as unknown as FilaBruta
}

/** Fila do dia já montada. Aplica o fim da cadência (sem_resposta + "Reativar") quando vencer. */
export async function carregarFila(): Promise<Fila> {
  let bruta = await buscarBruta()
  let fila = montarFila(bruta)
  if (fila.encerrar.length) {
    const reativarEm = dataReativar(configCadencia(bruta.config))
    await Promise.all(
      fila.encerrar.map((l) => supabase.rpc('encerrar_cadencia', { p_lead: l.id, p_reativar_em: reativarEm })),
    )
    bruta = await buscarBruta()
    fila = montarFila(bruta)
  }
  return fila
}
