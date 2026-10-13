import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { invalidar } from '../lib/cache'
import { falhou } from './erros'

export type ChaveApi = Omit<Tables<'api_chaves'>, 'hash'>
export type RegistroApi = Tables<'api_log'>
export const ESCOPOS = ['leitura', 'escrita', 'relatorios', 'envio'] as const
export type Escopo = (typeof ESCOPOS)[number]

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** crb_ + 40 caracteres aleatórios (≈ 238 bits). */
function gerarTextoChave(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40))
  return 'crb_' + Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('')
}

async function sha256Hex(texto: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listarChaves(): Promise<ChaveApi[]> {
  return falhou(
    await supabase
      .from('api_chaves')
      .select('id,user_id,nome,prefixo,escopos,ativa,ultimo_uso_em,expira_em,created_at,updated_at')
      .order('created_at', { ascending: false }),
    'Não foi possível carregar as chaves.',
  )
}

/** Cria a chave e devolve o texto completo (mostrado uma única vez; só o hash é salvo). */
export async function criarChave(nome: string, escopos: Escopo[], expiraEm: string | null): Promise<{ texto: string; chave: ChaveApi }> {
  const texto = gerarTextoChave()
  const chave = falhou(
    await supabase
      .from('api_chaves')
      .insert({ nome: nome.trim(), prefixo: texto.slice(0, 8), hash: await sha256Hex(texto), escopos, expira_em: expiraEm })
      .select('id,user_id,nome,prefixo,escopos,ativa,ultimo_uso_em,expira_em,created_at,updated_at')
      .single(),
    'Não foi possível criar a chave.',
  )
  invalidar('api:chaves')
  return { texto, chave }
}

export async function atualizarChave(id: string, alteracao: { ativa?: boolean; escopos?: Escopo[] }): Promise<void> {
  falhou(await supabase.from('api_chaves').update(alteracao).eq('id', id))
  invalidar('api:chaves')
}

export async function listarRegistro(limite = 100): Promise<RegistroApi[]> {
  return falhou(
    await supabase.from('api_log').select('*').order('criado_em', { ascending: false }).limit(limite),
    'Não foi possível carregar o registro.',
  )
}
