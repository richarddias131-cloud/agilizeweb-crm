import { supabase } from '../lib/supabase'
import { invalidar } from '../lib/cache'

/**
 * Escuta mudanças feitas fora desta tela (agente pela API, wa-bridge, outro dispositivo)
 * e atualiza as telas. Se o Realtime estiver indisponível, nada quebra: as telas
 * continuam atualizando ao abrir.
 */
export function ouvirMudancas(): () => void {
  let timer: number | undefined
  const pendentes = new Set<string>()
  const agendar = (...prefixos: string[]) => {
    prefixos.forEach((p) => pendentes.add(p))
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      pendentes.forEach((p) => invalidar(p))
      pendentes.clear()
    }, 400)
  }

  const canal = supabase
    .channel('crm-mudancas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'acoes_pendentes' }, () => agendar('fila'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p) => {
      const id = (p.new as { id?: string } | null)?.id
      agendar('fila', 'leads', ...(id ? [`lead:${id}`] : []))
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interacoes' }, (p) => {
      const id = (p.new as { lead_id?: string } | null)?.lead_id
      agendar('fila', ...(id ? [`lead:${id}`] : []))
    })
    .subscribe()

  return () => {
    window.clearTimeout(timer)
    void supabase.removeChannel(canal)
  }
}
