import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && anonKey)

/**
 * Cliente único do Supabase. Só deve ser importado em src/services/.
 * Sem as variáveis de ambiente, usamos valores fictícios para não quebrar o
 * carregamento; o App mostra a tela "configure o Supabase".
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'anon-key-ausente',
  {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'agz-auth' },
  },
)
