import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import { invalidar } from '../lib/cache'
import { falhou } from './erros'
import type { LeadImportado, LinhaBruta } from '../../shared/importacao.ts'
import type { LeadResumo } from './leads'
import { ESTAGIO_ROTULO } from '../../shared/dominio.ts'
import { formatarTelefone } from '../../shared/phone.ts'

export type CsvLido = { colunas: string[]; linhas: LinhaBruta[]; nome: string }

export function lerCsv(arquivo: File): Promise<CsvLido> {
  return new Promise((resolve, reject) => {
    Papa.parse<LinhaBruta>(arquivo, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (r) => {
        const colunas = (r.meta.fields ?? []).filter(Boolean)
        if (!colunas.length) return reject(new Error('Não encontrei cabeçalho no arquivo. A primeira linha precisa ter os nomes das colunas.'))
        resolve({ colunas, linhas: r.data, nome: arquivo.name })
      },
      error: (e) => reject(new Error(`Não foi possível ler o CSV: ${e.message}`)),
    })
  })
}

/** Todos os WhatsApps já cadastrados (inclui arquivados), para descartar duplicados. */
export async function whatsappsExistentes(): Promise<Set<string>> {
  const todos = new Set<string>()
  for (let de = 0; ; de += 1000) {
    const dados = falhou(await supabase.from('leads').select('whatsapp').range(de, de + 999))
    dados.forEach((l) => todos.add(l.whatsapp))
    if (dados.length < 1000) break
  }
  return todos
}

/** Insere em blocos; números que surgirem no meio do caminho são ignorados (sem erro). */
export async function importarLeads(leads: LeadImportado[], progresso?: (feitos: number) => void): Promise<number> {
  let inseridos = 0
  for (let i = 0; i < leads.length; i += 200) {
    const bloco = leads.slice(i, i + 200)
    const r = falhou(
      await supabase.from('leads').upsert(bloco, { onConflict: 'user_id,whatsapp', ignoreDuplicates: true }).select('id'),
      'Falha ao importar um bloco de leads.',
    )
    inseridos += r.length
    progresso?.(Math.min(i + 200, leads.length))
  }
  invalidar('leads')
  invalidar('fila')
  return inseridos
}

export function baixarCsv(nome: string, linhas: Record<string, unknown>[]): void {
  const csv = Papa.unparse(linhas, { delimiter: ';' })
  // BOM para o Excel abrir com acentos certos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportarLeads(leads: LeadResumo[]): void {
  baixarCsv(
    `leads-${new Date().toISOString().slice(0, 10)}.csv`,
    leads.map((l) => ({
      empresa: l.empresa,
      contato: l.contato_nome ?? '',
      whatsapp: formatarTelefone(l.whatsapp),
      cidade: l.cidade,
      uf: l.uf ?? '',
      segmento: l.segmento ?? '',
      estagio: ESTAGIO_ROTULO[l.estagio],
      valor_estimado: l.valor_estimado ?? '',
      nota_auditoria: l.nota_auditoria ?? '',
      ultimo_contato: l.ultimo_contato_em ?? '',
      tags: l.tags.join(', '),
      opt_out: l.opt_out ? 'sim' : 'não',
    })),
  )
}
