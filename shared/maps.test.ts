import { describe, expect, it } from 'vitest'
import { extrairNomeDoLinkGoogle } from './maps.ts'

describe('extrairNomeDoLinkGoogle', () => {
  it('extrai de /maps/place/', () => {
    expect(
      extrairNomeDoLinkGoogle('https://www.google.com/maps/place/%C3%93tica+Vis%C3%A3o/@-22.9,-47.06,17z/data=!3m1'),
    ).toBe('Ótica Visão')
  })
  it('extrai de ?q= e ?query=', () => {
    expect(extrairNomeDoLinkGoogle('https://www.google.com/search?q=Studio+Car+Campinas')).toBe('Studio Car Campinas')
    expect(extrairNomeDoLinkGoogle('https://www.google.com/maps/search/?api=1&query=Gr%C3%A1fica+Sol')).toBe(
      'Gráfica Sol',
    )
  })
  it('retorna null para link curto, coordenadas ou não-Google', () => {
    expect(extrairNomeDoLinkGoogle('https://maps.app.goo.gl/AbCdEf123')).toBeNull()
    expect(extrairNomeDoLinkGoogle('https://www.google.com/maps/place/-22.9,-47.0')).toBeNull()
    expect(extrairNomeDoLinkGoogle('https://example.com/maps/place/X')).toBeNull()
    expect(extrairNomeDoLinkGoogle('não é link')).toBeNull()
  })
})
