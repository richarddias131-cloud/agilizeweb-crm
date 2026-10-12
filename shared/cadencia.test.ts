import { describe, expect, it } from 'vitest'
import { aposEnvio, deveEncerrar, passoDaCadencia, type LeadCadencia } from './cadencia.ts'

const agora = new Date('2026-10-12T12:00:00Z')
const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000).toISOString()
const base: LeadCadencia = {
  estagio: 'novo',
  tentativas_sem_resposta: 0,
  proxima_acao: null,
  proxima_acao_em: null,
  ultimo_contato_em: null,
  ultima_resposta_em: null,
}

describe('passoDaCadencia', () => {
  it('segue abordagem → FU1 → FU2 → Última → encerrar', () => {
    expect(passoDaCadencia(0)?.template_chave).toBe('abordagem')
    expect(passoDaCadencia(1)?.rotulo).toBe('Follow-up 1')
    expect(passoDaCadencia(2)?.template_chave).toBe('followup2')
    expect(passoDaCadencia(3)?.rotulo).toBe('Última mensagem')
    expect(passoDaCadencia(4)).toBeNull()
  })
  it('respeita cadência editada', () => {
    const cfg = { cadencia_dias: [1, 1], encerrar_apos_dias: 3, reativar_apos_dias: 30 }
    expect(passoDaCadencia(1, cfg)?.rotulo).toBe('Follow-up 1')
    expect(passoDaCadencia(2, cfg)?.rotulo).toBe('Última mensagem')
    expect(passoDaCadencia(3, cfg)).toBeNull()
  })
})

describe('aposEnvio (cadência fria)', () => {
  it('abordagem: novo → abordado, FU1 em 2 dias', () => {
    expect(aposEnvio(base, undefined, agora, 'abordagem')).toEqual({
      estagio: 'abordado',
      tentativas_sem_resposta: 1,
      proxima_acao: 'Follow-up 1',
      proxima_acao_em: dias(2),
    })
  })

  it('percorre toda a cadência com os intervalos 2, 3, 5 e encerra em +5', () => {
    let lead: LeadCadencia = { ...base }
    const esperado = [
      ['Follow-up 1', 2],
      ['Follow-up 2', 3],
      ['Última mensagem', 5],
      ['Encerrar cadência', 5],
    ] as const
    for (const [rotulo, d] of esperado) {
      const r = aposEnvio(lead, undefined, agora)
      expect(r.proxima_acao).toBe(rotulo)
      expect(r.proxima_acao_em).toBe(dias(d))
      lead = { ...lead, ...r, ultimo_contato_em: agora.toISOString() }
    }
    expect(lead.tentativas_sem_resposta).toBe(4)
  })

  it('reativação de sem_resposta recomeça a contagem', () => {
    const r = aposEnvio({ ...base, estagio: 'sem_resposta', tentativas_sem_resposta: 4 }, undefined, agora, 'followup1')
    expect(r.estagio).toBe('abordado')
    expect(r.tentativas_sem_resposta).toBe(1)
  })
})

describe('aposEnvio (conversa em andamento)', () => {
  const respondeu: LeadCadencia = {
    ...base,
    estagio: 'respondeu',
    ultimo_contato_em: '2026-10-10T10:00:00Z',
    ultima_resposta_em: '2026-10-11T10:00:00Z',
  }
  it('envio da auditoria avança para auditoria_enviada e agenda follow-up', () => {
    expect(aposEnvio(respondeu, undefined, agora, 'auditoria')).toEqual({
      estagio: 'auditoria_enviada',
      tentativas_sem_resposta: 0,
      proxima_acao: 'Follow-up',
      proxima_acao_em: dias(2),
    })
  })
  it('mensagem livre não muda o estágio', () => {
    expect(aposEnvio(respondeu, undefined, agora, null).estagio).toBe('respondeu')
  })
  it('nunca volta estágio nem mexe em ganho', () => {
    const proposta = { ...respondeu, estagio: 'proposta_enviada' as const }
    expect(aposEnvio(proposta, undefined, agora, 'auditoria').estagio).toBe('proposta_enviada')
    const ganho = aposEnvio({ ...respondeu, estagio: 'ganho' }, undefined, agora, 'pos_venda')
    expect(ganho).toMatchObject({ estagio: 'ganho', proxima_acao: null, proxima_acao_em: null })
  })
})

describe('deveEncerrar', () => {
  const ultima: LeadCadencia = {
    ...base,
    estagio: 'abordado',
    tentativas_sem_resposta: 4,
    proxima_acao: 'Encerrar cadência',
    ultimo_contato_em: '2026-10-01T10:00:00Z',
    proxima_acao_em: '2026-10-06T10:00:00Z',
  }
  it('encerra quando o prazo depois da última passou', () => {
    expect(deveEncerrar(ultima, undefined, agora)).toBe(true)
  })
  it('não encerra antes do prazo, nem se respondeu', () => {
    expect(deveEncerrar({ ...ultima, proxima_acao_em: dias(1) }, undefined, agora)).toBe(false)
    expect(deveEncerrar({ ...ultima, ultima_resposta_em: '2026-10-05T10:00:00Z' }, undefined, agora)).toBe(false)
    expect(deveEncerrar({ ...ultima, tentativas_sem_resposta: 3 }, undefined, agora)).toBe(false)
  })
})
