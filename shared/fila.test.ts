import { describe, expect, it } from 'vitest'
import { acaoSugerida, montarFila, type FilaBruta, type LeadFila } from './fila.ts'

const agora = new Date('2026-10-12T12:00:00Z')
let seq = 0
const lead = (o: Partial<LeadFila> = {}): LeadFila => ({
  id: `l${++seq}`,
  empresa: `Empresa ${seq}`,
  contato_nome: null,
  whatsapp: '5519999999999',
  cidade: 'Campinas',
  segmento: null,
  nota_auditoria: null,
  servico_interesse: null,
  motivo_perda: null,
  opt_out: false,
  tags: [],
  created_at: '2026-10-01T10:00:00Z',
  estagio: 'novo',
  tentativas_sem_resposta: 0,
  proxima_acao: null,
  proxima_acao_em: null,
  ultimo_contato_em: null,
  ultima_resposta_em: null,
  ...o,
})

const bruta = (o: Partial<FilaBruta> = {}): FilaBruta => ({
  gerada_em: agora.toISOString(),
  meta_diaria: 20,
  abordagens_hoje: 3,
  config: null,
  para_aprovar: [],
  responderam: [],
  followups: [],
  novos: [],
  novos_total: 0,
  tarefas: [],
  ...o,
})

describe('acaoSugerida', () => {
  it('escolhe a ação pelo estágio e pela cadência', () => {
    expect(acaoSugerida(lead()).rotulo).toBe('Abordar')
    expect(acaoSugerida(lead({ estagio: 'abordado', tentativas_sem_resposta: 1, ultimo_contato_em: '2026-10-10T00:00:00Z' }))).toEqual({
      rotulo: 'Follow-up 1',
      template_chave: 'followup1',
      tipo: 'mensagem',
    })
    expect(acaoSugerida(lead({ estagio: 'abordado', tentativas_sem_resposta: 3 })).template_chave).toBe('ultima')
    expect(acaoSugerida(lead({ estagio: 'auditoria_enviada' })).template_chave).toBe('proposta_kit')
    expect(acaoSugerida(lead({ estagio: 'sem_resposta' })).rotulo).toBe('Reativar')
  })

  it('quem respondeu: auditoria se já tem nota, senão abrir a ficha para fazer', () => {
    const r = { estagio: 'respondeu' as const, ultimo_contato_em: '2026-10-10T00:00:00Z', ultima_resposta_em: '2026-10-11T00:00:00Z' }
    expect(acaoSugerida(lead({ ...r, nota_auditoria: 55 }))).toMatchObject({ rotulo: 'Enviar auditoria', template_chave: 'auditoria' })
    expect(acaoSugerida(lead(r))).toMatchObject({ rotulo: 'Fazer auditoria', tipo: 'abrir' })
    expect(acaoSugerida(lead({ ...r, estagio: 'proposta_enviada' }))).toMatchObject({ rotulo: 'Responder', template_chave: null })
  })
})

describe('montarFila', () => {
  it('separa leads para encerrar e calcula progresso', () => {
    const vencido = lead({
      estagio: 'abordado',
      tentativas_sem_resposta: 4,
      ultimo_contato_em: '2026-10-01T00:00:00Z',
      proxima_acao_em: '2026-10-06T00:00:00Z',
    })
    const fu = lead({ estagio: 'abordado', tentativas_sem_resposta: 2, ultimo_contato_em: '2026-10-09T00:00:00Z', proxima_acao_em: '2026-10-12T09:00:00Z' })
    const f = montarFila(bruta({ followups: [vencido, fu], novos: [lead()] }), agora)
    expect(f.encerrar.map((l) => l.id)).toEqual([vencido.id])
    expect(f.followups).toHaveLength(1)
    expect(f.followups[0]?.acao.rotulo).toBe('Follow-up 2')
    expect(f.progresso).toEqual({ feitas: 3, meta: 20 })
  })

  it('não repete tarefa automática de lead que já está na fila e monta a sequência do Modo foco', () => {
    const resp = lead({ estagio: 'respondeu', nota_auditoria: 70, ultimo_contato_em: '2026-10-10T00:00:00Z', ultima_resposta_em: '2026-10-11T00:00:00Z' })
    const semNota = lead({ estagio: 'respondeu', ultimo_contato_em: '2026-10-10T00:00:00Z', ultima_resposta_em: '2026-10-11T00:00:00Z' })
    const novo = lead()
    const f = montarFila(
      bruta({
        responderam: [resp, semNota],
        novos: [novo],
        tarefas: [
          { id: 't1', lead_id: resp.id, titulo: 'Responder X', vence_em: agora.toISOString(), origem: 'cadencia', lead: null },
          { id: 't2', lead_id: resp.id, titulo: 'Ligar', vence_em: agora.toISOString(), origem: 'manual', lead: null },
          { id: 't3', lead_id: null, titulo: 'Emitir NF', vence_em: agora.toISOString(), origem: 'manual', lead: null },
        ],
      }),
      agora,
    )
    expect(f.tarefas.map((t) => t.id)).toEqual(['t2', 't3'])
    expect(f.sequencia.map((i) => i.lead.id)).toEqual([resp.id, novo.id])
  })
})
