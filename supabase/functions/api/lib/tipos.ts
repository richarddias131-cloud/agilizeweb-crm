import type { Tables, TablesInsert, TablesUpdate } from '../_shared/database.types.ts'
import type { Estagio, Ator } from '../_shared/dominio.ts'
import type { FilaBruta } from '../_shared/fila.ts'

export type Lead = Tables<'leads'>
export type Interacao = Tables<'interacoes'>
export type Tarefa = Tables<'tarefas'>
export type Template = Tables<'templates'>
export type Servico = Tables<'servicos'>
export type Venda = Tables<'vendas'>
export type Config = Tables<'config'>
export type ApiChave = Tables<'api_chaves'>
export type AcaoPendente = Tables<'acoes_pendentes'>
export type NovoLead = Omit<TablesInsert<'leads'>, 'user_id'>
export type AlteracaoLead = TablesUpdate<'leads'>

export type Escopo = 'leitura' | 'escrita' | 'envio' | 'relatorios'

/** Quem está agindo (vai para interacoes.ator / ator_nome). */
export type AtorCtx = { ator: Ator; nome: string | null }

export type FiltrosLeads = {
  estagio?: Estagio
  cidade?: string
  segmento?: string
  tag?: string
  busca?: string
  sem_contato_ha_dias?: number
  atualizado_desde?: string
  incluir_arquivados?: boolean
  limite: number
  /** Keyset: itens com (updated_at, id) menores que este par. */
  apos?: { updated_at: string; id: string }
}

export type FiltrosTarefas = {
  lead_id?: string
  abertas?: boolean
  limite: number
  apos?: { vence_em: string; id: string }
}

export type FiltrosVendas = {
  de?: string
  ate?: string
  status?: string
  limite: number
  apos?: { fechada_em: string; id: string }
}

export type NovoLog = {
  user_id: string
  chave_id: string | null
  metodo: string
  rota: string
  status_http: number
  duracao_ms: number
  resumo: string | null
}

/**
 * Acesso a dados da API. Toda operação recebe o user_id dono da chave e só
 * enxerga dados dele. Implementações: banco_supabase.ts (produção) e
 * tests/banco_memoria.ts (testes).
 */
export interface Banco {
  chavePorHash(hash: string): Promise<ApiChave | null>
  tocarChave(id: string): Promise<void>
  contarChamadas(chaveId: string, desde: string): Promise<number>
  registrarLog(l: NovoLog): Promise<void>
  obterIdempotencia(chaveId: string, chave: string, desde: string): Promise<{ status_http: number; resposta: unknown } | null>
  salvarIdempotencia(userId: string, chaveId: string, chave: string, status: number, resposta: unknown): Promise<void>
  limpeza(): Promise<void>

  obterConfig(userId: string): Promise<Config | null>

  listarLeads(userId: string, f: FiltrosLeads): Promise<Lead[]>
  obterLead(userId: string, id: string): Promise<Lead | null>
  leadPorWhatsapp(userId: string, numero: string): Promise<Lead | null>
  inserirLead(userId: string, dados: NovoLead): Promise<Lead>
  atualizarLead(userId: string, id: string, dados: AlteracaoLead): Promise<Lead>

  interacoes(userId: string, leadId: string, limite: number): Promise<Interacao[]>
  inserirInteracao(userId: string, i: { lead_id: string; tipo: Interacao['tipo']; conteudo: string | null; ocorreu_em?: string }, ator: AtorCtx): Promise<Interacao>

  listarTarefas(userId: string, f: FiltrosTarefas): Promise<Tarefa[]>
  obterTarefa(userId: string, id: string): Promise<Tarefa | null>
  inserirTarefa(userId: string, t: { lead_id: string | null; titulo: string; vence_em: string; origem: string }): Promise<Tarefa>
  atualizarTarefa(userId: string, id: string, t: Partial<Pick<Tarefa, 'titulo' | 'vence_em' | 'concluida_em'>>): Promise<Tarefa>

  templates(userId: string): Promise<Template[]>
  servicos(userId: string): Promise<Servico[]>

  inserirAcaoPendente(
    userId: string,
    a: { tipo: string; lead_id: string | null; payload: Record<string, unknown>; justificativa: string | null; expira_em: string; criada_por: string | null },
  ): Promise<AcaoPendente>
  obterAcaoPendente(userId: string, id: string): Promise<AcaoPendente | null>
  /** Ações de envio propostas + mensagens enviadas pelo agente/bridge desde um instante. */
  contarEnviosAgente(userId: string, desde: string): Promise<number>

  mudarEstagio(leadId: string, estagio: Estagio, motivo: string | null, ator: AtorCtx): Promise<Lead>
  registrarEnvio(
    leadId: string,
    conteudo: string,
    templateId: string | null,
    atualizacao: { estagio: Estagio; tentativas_sem_resposta: number; proxima_acao: string | null; proxima_acao_em: string | null },
    ator: AtorCtx,
  ): Promise<{ id: string; marco: string }>
  marcarRespondeu(leadId: string, conteudo: string | null, ator: AtorCtx): Promise<{ id: string; marco: string }>
  encerrarCadencia(leadId: string, reativarEm: string, ator: AtorCtx): Promise<void>
  filaHoje(userId: string): Promise<FilaBruta>
}

export type Deps = {
  banco: Banco
  agora: () => Date
  versao: string
  /** O wa-bridge está online e pode enviar? (Fase 7) */
  bridgeOnline: (userId: string) => Promise<boolean>
  /** Probabilidade de rodar a limpeza de log/idempotência numa requisição. */
  chanceLimpeza?: number
}
