// Cache leve com stale-while-revalidate: as telas abrem na hora com o último
// dado conhecido (memória + localStorage) e atualizam em segundo plano.

type Entrada = { dados: unknown; em: number }
type Ouvinte = () => void

const memoria = new Map<string, Entrada>()
const ouvintes = new Map<string, Set<Ouvinte>>()
const invalidadores = new Set<(chave: string) => void>()
const PREFIXO = 'agz-cache:'
const VERSAO = 1

function lerPersistido(chave: string): Entrada | undefined {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave)
    if (!bruto) return undefined
    const e = JSON.parse(bruto) as Entrada & { v?: number }
    return e.v === VERSAO ? { dados: e.dados, em: e.em } : undefined
  } catch {
    return undefined
  }
}

export function lerCache<T>(chave: string): T | undefined {
  let e = memoria.get(chave)
  if (!e) {
    e = lerPersistido(chave)
    if (e) memoria.set(chave, e)
  }
  return e?.dados as T | undefined
}

export function gravarCache<T>(chave: string, dados: T, persistir = true): void {
  const e = { dados, em: Date.now() }
  memoria.set(chave, e)
  if (persistir) {
    try {
      localStorage.setItem(PREFIXO + chave, JSON.stringify({ ...e, v: VERSAO }))
    } catch {
      /* cota cheia ou indisponível: segue só em memória */
    }
  }
  ouvintes.get(chave)?.forEach((fn) => fn())
}

export function ouvirCache(chave: string, fn: Ouvinte): () => void {
  let s = ouvintes.get(chave)
  if (!s) ouvintes.set(chave, (s = new Set()))
  s.add(fn)
  return () => s.delete(fn)
}

/** Pede recarga de todas as consultas cuja chave começa com o prefixo. */
export function invalidar(prefixo: string): void {
  invalidadores.forEach((fn) => fn(prefixo))
}

export function aoInvalidar(fn: (prefixo: string) => void): () => void {
  invalidadores.add(fn)
  return () => invalidadores.delete(fn)
}

export function limparCache(): void {
  memoria.clear()
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIXO))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignora */
  }
}
