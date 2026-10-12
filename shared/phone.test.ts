import { describe, expect, it } from 'vitest'
import { formatarTelefone, normalizarTelefone } from './phone.ts'

const ok = (entrada: string) => {
  const r = normalizarTelefone(entrada)
  if (!r.ok) throw new Error(`esperava ok para "${entrada}", veio: ${r.erro}`)
  return r
}

describe('normalizarTelefone', () => {
  it.each([
    ['(19) 99999-9999', '5519999999999'],
    ['19 99999 9999', '5519999999999'],
    ['19999999999', '5519999999999'],
    ['+55 19 99999-9999', '5519999999999'],
    ['55 (19) 9 9999-9999', '5519999999999'],
    ['5519999999999', '5519999999999'],
    ['0055 19 99999 9999', '5519999999999'],
    ['019 99999-9999', '5519999999999'],
    ['(11) 98765.4321', '5511987654321'],
  ])('%s → %s', (entrada, esperado) => {
    expect(ok(entrada).numero).toBe(esperado)
  })

  it('adiciona o 9º dígito em celular antigo e avisa', () => {
    const r = ok('(19) 9999-8888')
    expect(r.numero).toBe('5519999998888')
    expect(r.aviso).toMatch(/9º dígito/)
    expect(ok('+55 19 8888-7777').numero).toBe('5519988887777')
  })

  it('mantém fixo com 8 dígitos e avisa', () => {
    const r = ok('(19) 3333-4444')
    expect(r.numero).toBe('551933334444')
    expect(r.aviso).toMatch(/fixo/)
  })

  it.each([
    ['', /Informe/],
    ['   ', /Informe/],
    ['99999-9999', /curto/],
    ['(20) 99999-9999', /DDD 20/],
    ['(10) 99999-9999', /DDD 10/],
    ['(19) 89999-9999', /começar com 9/],
    ['(19) 1999-9999', /inválido/],
    ['+55 19 99999-99999', /longo/],
  ])('rejeita "%s"', (entrada, erro) => {
    const r = normalizarTelefone(entrada)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(erro)
  })

  it('aceita null/undefined sem quebrar', () => {
    expect(normalizarTelefone(null).ok).toBe(false)
    expect(normalizarTelefone(undefined).ok).toBe(false)
  })
})

describe('formatarTelefone', () => {
  it('formata celular e fixo', () => {
    expect(formatarTelefone('5519999999999')).toBe('(19) 99999-9999')
    expect(formatarTelefone('551933334444')).toBe('(19) 3333-4444')
    expect(formatarTelefone('')).toBe('')
  })
})
