import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Tema = 'light' | 'dark' | 'system'
const CHAVE = 'agz-tema'

/** Padrão da marca CRESBI: tema escuro. */
function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE)
    if (t === 'light' || t === 'system') return t
  } catch {
    /* localStorage indisponível */
  }
  return 'dark'
}

function aplicar(t: Tema) {
  document.documentElement.dataset.theme = t
  const claro = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', claro ? '#F6F4EF' : '#0A0A0B')
}

type ThemeState = { tema: Tema; setTema: (t: Tema) => void }
const ThemeCtx = createContext<ThemeState>({ tema: 'dark', setTema: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(lerTema)

  useEffect(() => {
    aplicar(tema)
    if (tema !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => aplicar('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [tema])

  const setTema = useCallback((t: Tema) => {
    try {
      if (t === 'dark') localStorage.removeItem(CHAVE)
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
