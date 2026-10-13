import { describe, expect, it } from 'vitest'
import { renderizarTemplate } from './template.ts'

const lead = {
  contato_nome: 'Marina Souza',
  empresa: 'Ótica Visão',
  cidade: 'Campinas',
  segmento: 'Ótica',
  nota_auditoria: 62,
  servico: { nome: 'Kit Comércio no Mapa', preco: 549.9 },
  assinatura: 'Richard | CRESBI',
}

describe('renderizarTemplate', () => {
  it('substitui todas as variáveis', () => {
    const r = renderizarTemplate(
      'Olá, {{nome}}! {{empresa}} em {{cidade}} ({{segmento}}) tirou {{nota}}/100. {{servico}} por {{preco}}. {{assinatura}}',
      lead,
    )
    expect(r.texto).toBe(
      'Olá, Marina! Ótica Visão em Campinas (ótica) tirou 62/100. Kit Comércio no Mapa por R$ 549,90. Richard | CRESBI',
    )
    expect(r.faltando).toEqual([])
  })

  it('usa "tudo bem" quando não há nome do contato', () => {
    expect(renderizarTemplate('Olá, {{nome}}!', { contato_nome: '' }).texto).toBe('Olá, tudo bem!')
    expect(renderizarTemplate('Olá, {{nome}}!', {}).texto).toBe('Olá, tudo bem!')
  })

  it('aceita espaços e maiúsculas dentro das chaves', () => {
    expect(renderizarTemplate('{{ Empresa }}', lead).texto).toBe('Ótica Visão')
  })

  it('aponta variáveis sem valor e mantém desconhecidas', () => {
    const r = renderizarTemplate('Nota {{nota}} de {{empresa}} {{xyz}}', { empresa: 'X' })
    expect(r.faltando).toEqual(['nota'])
    expect(r.texto).toBe('Nota de X {{xyz}}')
  })

  it('nota zero é valor válido', () => {
    expect(renderizarTemplate('{{nota}}', { nota_auditoria: 0 }).texto).toBe('0')
  })
})
