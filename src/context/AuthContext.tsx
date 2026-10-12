import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { obterSessao, ouvirSessao } from '../services/auth'
import { inicializarUsuario } from '../services/config'
import { limparCache } from '../lib/cache'

type AuthState = { sessao: Session | null; carregando: boolean }

const AuthCtx = createContext<AuthState>({ sessao: null, carregando: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<AuthState>({ sessao: null, carregando: true })

  useEffect(() => {
    let vivo = true
    obterSessao().then((s) => vivo && setEstado({ sessao: s, carregando: false }))
    const parar = ouvirSessao((s) => {
      setEstado({ sessao: s, carregando: false })
      if (!s) limparCache()
    })
    return () => {
      vivo = false
      parar()
    }
  }, [])

  // Garante catálogo, templates e config do usuário (idempotente, uma vez por sessão).
  const userId = estado.sessao?.user.id
  useEffect(() => {
    if (userId) inicializarUsuario().catch(() => {})
  }, [userId])

  return <AuthCtx.Provider value={estado}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthCtx)
}
