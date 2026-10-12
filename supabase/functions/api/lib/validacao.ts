// Validação dos campos de lead que o agente pode enviar.
import { normalizarTelefone } from '../_shared/phone.ts'
import { ORIGENS, UFS } from '../_shared/dominio.ts'
import { erros } from './erros.ts'
import { UUID, dataIso, ehObjeto } from './util.ts'
import type { AlteracaoLead } from './tipos.ts'

const TEXTO = ['empresa', 'contato_nome', 'cidade', 'segmento', 'link_google', 'site_atual', 'instagram', 'proxima_acao', 'observacoes'] as const

/** Campos editáveis pelo agente. Estágio muda só por /estagio; opt_out só pode virar true. */
export const CAMPOS_LEAD = [...TEXTO, 'whatsapp', 'uf', 'origem', 'nota_auditoria', 'servico_interesse', 'valor_estimado', 'proxima_acao_em', 'tags', 'opt_out'] as const

export function validarCamposLead(corpo: unknown, opcoes: { criacao: boolean }): AlteracaoLead {
  if (!ehObjeto(corpo)) throw erros.validacao({ corpo: 'Envie um objeto JSON com os campos do lead.' })
  const campos: Record<string, string> = {}
  const saida: AlteracaoLead = {}

  const desconhecidos = Object.keys(corpo).filter((k) => !(CAMPOS_LEAD as readonly string[]).includes(k))
  for (const k of desconhecidos) {
    campos[k] =
      k === 'estagio'
        ? 'Para mudar o estágio use POST /leads/{id}/estagio.'
        : k === 'arquivado'
          ? 'Para arquivar use POST /leads/{id}/arquivar.'
          : 'Campo desconhecido ou não editável pela API.'
  }

  for (const k of TEXTO) {
    if (!(k in corpo)) continue
    const v = corpo[k]
    if (v === null) {
      if (k === 'cidade') saida.cidade = ''
      else (saida as Record<string, unknown>)[k] = null
    } else if (typeof v === 'string') saida[k] = v.trim()
    else campos[k] = 'Deve ser texto ou null.'
  }
  if ('empresa' in saida && !saida.empresa) campos.empresa = 'Não pode ficar vazio.'

  if ('whatsapp' in corpo) {
    const r = normalizarTelefone(typeof corpo.whatsapp === 'string' ? corpo.whatsapp : '')
    if (r.ok) saida.whatsapp = r.numero
    else campos.whatsapp = r.erro
  }
  if ('uf' in corpo) {
    const v = corpo.uf
    if (v === null) saida.uf = null
    else if (typeof v === 'string' && (UFS as readonly string[]).includes(v.toUpperCase())) saida.uf = v.toUpperCase()
    else campos.uf = 'Use a sigla do estado (ex.: SP) ou null.'
  }
  if ('origem' in corpo) {
    if (typeof corpo.origem === 'string' && (ORIGENS as readonly string[]).includes(corpo.origem)) saida.origem = corpo.origem
    else campos.origem = `Use um destes: ${ORIGENS.join(', ')}.`
  }
  if ('nota_auditoria' in corpo) {
    const v = corpo.nota_auditoria
    if (v === null) saida.nota_auditoria = null
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100) saida.nota_auditoria = v
    else campos.nota_auditoria = 'Inteiro de 0 a 100, ou null.'
  }
  if ('valor_estimado' in corpo) {
    const v = corpo.valor_estimado
    if (v === null) saida.valor_estimado = null
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) saida.valor_estimado = v
    else campos.valor_estimado = 'Número (ex.: 549.9), nunca texto formatado.'
  }
  if ('servico_interesse' in corpo) {
    const v = corpo.servico_interesse
    if (v === null) saida.servico_interesse = null
    else if (typeof v === 'string' && UUID.test(v)) saida.servico_interesse = v
    else campos.servico_interesse = 'Id (uuid) de um serviço de GET /servicos, ou null.'
  }
  if ('proxima_acao_em' in corpo) {
    const v = corpo.proxima_acao_em
    if (v === null) saida.proxima_acao_em = null
    else {
      const d = dataIso(v)
      if (d) saida.proxima_acao_em = d
      else campos.proxima_acao_em = 'Data ISO 8601 com fuso (ex.: 2026-10-14T09:00:00-03:00).'
    }
  }
  if ('tags' in corpo) {
    const v = corpo.tags
    if (Array.isArray(v) && v.every((t) => typeof t === 'string')) saida.tags = [...new Set(v.map((t) => t.trim()).filter(Boolean))]
    else campos.tags = 'Lista de textos.'
  }
  if ('opt_out' in corpo) {
    if (corpo.opt_out === true) saida.opt_out = true
    else campos.opt_out = 'A API só pode marcar opt_out como true. Reativar um opt-out é exclusivo do Richard.'
  }

  if (opcoes.criacao) {
    if (!saida.empresa) campos.empresa = campos.empresa ?? 'Obrigatório.'
    if (!saida.whatsapp && !campos.whatsapp) campos.whatsapp = 'Obrigatório.'
  }

  if (Object.keys(campos).length) throw erros.validacao(campos)
  return saida
}
