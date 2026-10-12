import { erros } from './erros.ts'

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cursor opaco de paginação (base64url de um objeto). */
export function codificarCursor(v: Record<string, string>): string {
  return btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodificarCursor<T extends Record<string, string>>(c: string | null, campos: (keyof T)[]): T | undefined {
  if (!c) return undefined
  try {
    const v = JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/'))) as T
    if (campos.every((k) => typeof v[k] === 'string')) return v
  } catch {
    /* cai no erro abaixo */
  }
  throw erros.validacao({ cursor: 'Cursor inválido. Use exatamente o valor de "proximo_cursor" da resposta anterior.' })
}

export function limiteDe(q: URLSearchParams, padrao = 50, maximo = 200): number {
  const v = q.get('limite')
  if (v === null) return padrao
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > maximo) throw erros.validacao({ limite: `Use um inteiro de 1 a ${maximo}.` })
  return n
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function dataIso(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Início do dia em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019). */
export function inicioDoDiaSP(agora: Date): string {
  const sp = new Date(agora.getTime() - 3 * 3_600_000)
  sp.setUTCHours(0, 0, 0, 0)
  return new Date(sp.getTime() + 3 * 3_600_000).toISOString()
}
