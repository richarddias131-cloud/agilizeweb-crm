import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Tema = 'light' | 'dark' | 'system'
const CHAVE = 'agz-tema'

function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* localStorage indisponível */
  }
  return 'system'
}

function aplicar(t: Tema) {
  const root = document.documentElement
  if (t === 'system') delete root.dataset.theme
  else root.dataset.theme = t
  const escuro =
    t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#06100D' : '#FFFFFF')
}

type ThemeState = { tema: Tema; setTema: (t: Tema) => void }
const ThemeCtx = createContext<ThemeState>({ tema: 'system', setTema: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(lerTema)

  useEffect(() => {
    aplicar(tema)
    if (tema !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => aplicar('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [tema])

  const setTema = useCallback((t: Tema) => {
    try {
      if (t === 'system') localStorage.removeItem(CHAVE)
      else localStorage.setItem(CHAVE, t)
    } catch {
      /* ignora */
    }
    setTemaState(t)
  }, [])

  return <ThemeCtx.Provider value={{ tema, setTema }}>{children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeState {
  return useContext(ThemeCtx)
}
