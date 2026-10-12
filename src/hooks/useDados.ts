import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { aoInvalidar, gravarCache, lerCache, ouvirCache } from '../lib/cache'

type Estado<T> = {
  dados: T | undefined
  /** true só quando não há nada em cache para mostrar. */
  carregando: boolean
  /** true enquanto busca em segundo plano. */
  atualizando: boolean
  erro: string | null
  recarregar: () => Promise<void>
  /** Atualização otimista local (sem ir ao servidor). */
  mutar: (fn: (atual: T | undefined) => T) => void
}

export function useDados<T>(chave: string | null, carregar: () => Promise<T>, persistir = true): Estado<T> {
  const carregarRef = useRef(carregar)
  carregarRef.current = carregar
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const geracao = useRef(0)

  const dados = useSyncExternalStore(
    useCallback((fn) => (chave ? ouvirCache(chave, fn) : () => {}), [chave]),
    () => (chave ? lerCache<T>(chave) : undefined),
  )

  const recarregar = useCallback(async () => {
    if (!chave) return
    const minha = ++geracao.current
    setAtualizando(true)
    try {
      const novo = await carregarRef.current()
      if (minha === geracao.current) {
        gravarCache(chave, novo, persistir)
        setErro(null)
      }
    } catch (e) {
      if (minha === geracao.current) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    } finally {
      if (minha === geracao.current) setAtualizando(false)
    }
  }, [chave, persistir])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    if (!chave) return
    return aoInvalidar((prefixo) => {
      if (chave.startsWith(prefixo)) void recarregar()
    })
  }, [chave, recarregar])

  const mutar = useCallback(
    (fn: (atual: T | undefined) => T) => {
      if (chave) gravarCache(chave, fn(lerCache<T>(chave)), persistir)
    },
    [chave, persistir],
  )

  return { dados, carregando: dados === undefined && !erro, atualizando, erro, recarregar, mutar }
}
