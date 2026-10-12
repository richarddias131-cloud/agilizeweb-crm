import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export async function obterSessao(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function ouvirSessao(cb: (s: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => cb(sessao))
  return () => data.subscription.unsubscribe()
}

export async function entrar(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) {
    if (error.message.toLowerCase().includes('invalid login')) {
      throw new Error('E-mail ou senha incorretos.')
    }
    if (error.message.toLowerCase().includes('fetch')) {
      throw new Error('Sem conexão com o servidor. Confira sua internet e tente de novo.')
    }
    throw new Error(error.message)
  }
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut()
}
