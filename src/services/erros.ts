import type { PostgrestError } from '@supabase/supabase-js'

/** Converte erros do Supabase/Postgres em mensagens úteis em português. */
export function traduzirErro(erro: PostgrestError | Error | null | undefined, padrao = 'Algo deu errado.'): Error {
  if (!erro) return new Error(padrao)
  const msg = erro.message ?? ''
  const codigo = 'code' in erro ? erro.code : undefined

  if (codigo === '23505' && msg.includes('leads_whatsapp_unico')) return new Error('Esse WhatsApp já está cadastrado.')
  if (codigo === '23505') return new Error('Esse registro já existe.')
  if (msg.includes('lead_nao_encontrado')) return new Error('Lead não encontrado. Ele pode ter sido arquivado.')
  if (msg.includes('motivo_perda_obrigatorio') || msg.includes('leads_motivo_perda'))
    return new Error('Informe o motivo da perda.')
  if (msg.includes('lead_opt_out')) return new Error('Esse lead pediu para não receber mensagens (opt-out).')
  if (msg.includes('leads_whatsapp_check')) return new Error('WhatsApp inválido. Use DDD + número.')
  if (codigo === '23514') return new Error('Algum campo está com valor inválido. Confira e tente de novo.')
  if (codigo === '42501' || codigo === 'PGRST301') return new Error('Sua sessão expirou. Entre de novo.')
  if (/fetch|network|Failed to/i.test(msg)) return new Error('Sem conexão. Confira sua internet e tente de novo.')
  return new Error(msg || padrao)
}

type Resposta = { data: unknown; error: PostgrestError | null }

/** Lança o erro traduzido ou devolve o dado do ramo de sucesso da resposta. */
export function falhou<R extends Resposta>(r: R, padrao?: string): Extract<R, { error: null }>['data'] {
  if (r.error) throw traduzirErro(r.error, padrao)
  return r.data as Extract<R, { error: null }>['data']
}
