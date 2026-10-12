import { supabase } from '../lib/supabase'
import { traduzirErro } from './erros'
import type { Estagio } from '../../shared/dominio.ts'

export type MetricasResumo = {
  periodo: { de: string; ate: string }
  funil: { estagio: Estagio; quantidade: number; valor_estimado: number }[]
  taxa_resposta: { abordados: number; responderam: number; taxa: number }
  abordagens_por_dia: { dia: string; quantidade: number }[]
  receita_periodo: { paga: number; aguardando: number; vendas: number }
  receita_mes: { paga: number; aguardando: number; vendas: number }
  receita_recorrente: { mensal: number; manutencoes_ativas: number }
  motivos_perda: { motivo: string; quantidade: number }[]
  segmentos: { segmento: string; abordados: number; responderam: number; taxa: number }[]
}

export async function obterMetricas(de: Date, ate: Date = new Date()): Promise<MetricasResumo> {
  const r = await supabase.rpc('metricas_resumo', { p_de: de.toISOString(), p_ate: ate.toISOString() })
  if (r.error) throw traduzirErro(r.error, 'Não foi possível carregar o painel.')
  return r.data as unknown as MetricasResumo
}
