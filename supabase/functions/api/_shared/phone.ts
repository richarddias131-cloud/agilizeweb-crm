// Normalização de telefone brasileiro para WhatsApp (formato 55DDDNUMERO).
// Usado pelo front, pela importação CSV e pela Edge Function da API.

export const DDDS_VALIDOS: ReadonlySet<string> = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

export type ResultadoTelefone =
  | { ok: true; numero: string; aviso?: string }
  | { ok: false; erro: string; numero?: undefined }

/**
 * Aceita qualquer formato colado: "(19) 99999-9999", "+55 19 9...", "019 9999-9999",
 * com ou sem o 9º dígito. Devolve sempre "55" + DDD + número.
 * Celular sem o 9º dígito (8 dígitos começando em 6–9) ganha o 9 na frente.
 */
export function normalizarTelefone(entrada: string | null | undefined): ResultadoTelefone {
  if (!entrada || !entrada.trim()) return { ok: false, erro: 'Informe o WhatsApp.' }

  let d = entrada.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2) // discagem internacional 00 55...

  // Com código do país: 55 + 10 ou 11 dígitos.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2)
  } else if (d.startsWith('0') && (d.length === 11 || d.length === 12)) {
    d = d.slice(1) // 0 de longa distância: 019 99999-9999
  }

  if (d.length < 10) {
    return { ok: false, erro: 'Número curto demais. Inclua o DDD (ex.: 19 99999-9999).' }
  }
  if (d.length > 11) {
    return { ok: false, erro: 'Número longo demais. Confira se não há dígitos a mais.' }
  }

  const ddd = d.slice(0, 2)
  let local = d.slice(2)
  if (!DDDS_VALIDOS.has(ddd)) {
    return { ok: false, erro: `DDD ${ddd} não existe no Brasil.` }
  }

  let aviso: string | undefined
  if (local.length === 9) {
    if (local[0] !== '9') {
      return { ok: false, erro: 'Celular com 9 dígitos precisa começar com 9.' }
    }
  } else {
    // 8 dígitos
    const primeiro = local[0] ?? ''
    if ('6789'.includes(primeiro)) {
      local = '9' + local
      aviso = 'Adicionamos o 9º dígito do celular.'
    } else if ('2345'.includes(primeiro)) {
      aviso = 'Parece um fixo. Confira se esse número tem WhatsApp.'
    } else {
      return { ok: false, erro: 'Número inválido. Confira os dígitos.' }
    }
  }

  return aviso ? { ok: true, numero: `55${ddd}${local}`, aviso } : { ok: true, numero: `55${ddd}${local}` }
}

/** Formata 5519999999999 → (19) 99999-9999 para exibição. */
export function formatarTelefone(numero: string | null | undefined): string {
  if (!numero) return ''
  const d = numero.replace(/\D/g, '')
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return numero
}
