import { describe, expect, it } from 'vitest'
import { lerValor, prepararImportacao, sugerirMapeamento, tagDaCampanha } from './importacao.ts'

describe('sugerirMapeamento', () => {
  it('reconhece nomes comuns de colunas, com e sem acento', () => {
    expect(sugerirMapeamento(['Nome da Empresa', 'Telefone', 'Município', 'Estado', 'Categoria', 'Google Maps URL', 'Observação'])).toEqual({
      empresa: 'Nome da Empresa',
      whatsapp: 'Telefone',
      cidade: 'Município',
      uf: 'Estado',
      segmento: 'Categoria',
      link_google: 'Google Maps URL',
      observacoes: 'Observação',
    })
  })
  it('não usa a mesma coluna duas vezes', () => {
    const m = sugerirMapeamento(['nome', 'whatsapp'])
    expect(m.empresa).toBe('nome')
    expect(m.contato_nome).toBeUndefined()
  })
})

describe('prepararImportacao', () => {
  const mapa = { empresa: 'Empresa', whatsapp: 'Fone', cidade: 'Cidade', uf: 'UF', tags: 'Tags', valor_estimado: 'Valor' } as const
  it('normaliza, descarta duplicados (arquivo e base) e aponta inválidos com motivo', () => {
    const r = prepararImportacao(
      [
        { Empresa: 'Ótica A', Fone: '(19) 99999-0001', Cidade: 'Campinas', UF: 'sp', Tags: 'vip; centro', Valor: 'R$ 1.234,50' },
        { Empresa: 'Ótica A de novo', Fone: '+55 19 99999-0001' },
        { Empresa: 'Já existe', Fone: '19 99999-0002' },
        { Empresa: 'Sem telefone', Fone: '' },
        { Empresa: '', Fone: '19 99999-0003' },
        { Empresa: 'DDD errado', Fone: '(20) 99999-0004' },
        { Empresa: '', Fone: '' },
      ],
      mapa,
      new Set(['5519999990002']),
      { tag: 'lista-out-2026-10-12' },
    )
    expect(r.validos).toHaveLength(1)
    expect(r.validos[0]).toMatchObject({
      empresa: 'Ótica A',
      whatsapp: '5519999990001',
      uf: 'SP',
      valor_estimado: 1234.5,
      tags: ['vip', 'centro', 'lista-out-2026-10-12'],
      origem: 'importacao',
    })
    expect(r.duplicados.map((d) => [d.linha, d.motivo])).toEqual([
      [2, 'Repetido no arquivo'],
      [3, 'Já cadastrado no CRM'],
    ])
    expect(r.invalidos.map((d) => d.linha)).toEqual([4, 5, 6])
    expect(r.invalidos[2]?.motivo).toMatch(/DDD 20/)
  })
  it('sem mapa, lê os campos pelo nome (formato da API)', () => {
    const r = prepararImportacao([{ empresa: 'X', whatsapp: '19988887777', tags: ['a'] }], null, new Set(), { origem: 'agente' })
    expect(r.validos[0]).toMatchObject({ whatsapp: '5519988887777', tags: ['a'], origem: 'agente' })
  })
  it('usa o nome do link do Google quando falta a empresa', () => {
    const r = prepararImportacao([{ link_google: 'https://www.google.com/maps/place/Gr%C3%A1fica+Sol/@1,2', whatsapp: '19988887777' }], null, new Set())
    expect(r.validos[0]?.empresa).toBe('Gráfica Sol')
  })
})

describe('auxiliares', () => {
  it('lerValor entende formatos brasileiros', () => {
    expect(lerValor('549,90')).toBe(549.9)
    expect(lerValor('R$ 1.299,00')).toBe(1299)
    expect(lerValor('549.9')).toBe(549.9)
    expect(lerValor('abc')).toBeNull()
  })
  it('tagDaCampanha', () => {
    expect(tagDaCampanha('Prospecção Campinas (out).csv', new Date('2026-10-12T15:00:00Z'))).toBe('prospeccao-campinas-out-2026-10-12')
  })
})
