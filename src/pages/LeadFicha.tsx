import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addDays, format, set as setHora } from 'date-fns'
import { EstagioBadge } from '../components/EstagioBadge'
import { CampoEditavel } from '../components/CampoEditavel'
import { Erro, Skeleton } from '../components/Estados'
import { Icon, type IconName } from '../components/Icon'
import { Modal } from '../components/Modal'
import { MotivoPerdaModal } from '../components/MotivoPerdaModal'
import { SEGMENTOS_SUGERIDOS } from '../components/CapturaRapida'
import { VendaModal } from '../components/VendaModal'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { atualizarLead, obterLead, type AlteracaoLead, type Lead } from '../services/leads'
import { useAcoesLead } from '../hooks/useAcoesLead'
import { useEnvio } from '../context/EnvioContext'
import { acaoSugerida } from '../../shared/fila.ts'
import { listarInteracoes, registrarInteracao, type Interacao } from '../services/interacoes'
import { concluirTarefa, criarTarefa, listarTarefasDoLead, type Tarefa } from '../services/tarefas'
import { listarServicos } from '../services/servicos'
import { vendasDoLead, type Venda, type ItemVenda } from '../services/vendas'
import {
  ESTAGIOS,
  ESTAGIO_ROTULO,
  ORIGENS,
  ORIGEM_ROTULO,
  TIPO_INTERACAO_ROTULO,
  UFS,
  type Estagio,
  type TipoInteracao,
} from '../../shared/dominio.ts'
import { formatarTelefone } from '../../shared/phone.ts'
import { dataHora, haQuanto, moeda, quando } from '../lib/formato'

type Ficha = { lead: Lead; interacoes: Interacao[]; tarefas: Tarefa[]; vendas: Venda[] }

async function carregarFicha(id: string): Promise<Ficha> {
  const [lead, interacoes, tarefas, vendas] = await Promise.all([obterLead(id), listarInteracoes(id), listarTarefasDoLead(id), vendasDoLead(id)])
  return { lead, interacoes, tarefas, vendas }
}

const ICONE_INTERACAO: Record<TipoInteracao, IconName> = {
  whatsapp_enviado: 'whatsapp',
  whatsapp_recebido: 'whatsapp',
  ligacao: 'whatsapp',
  nota: 'nota',
  auditoria: 'painel',
  proposta: 'vendas',
  mudanca_estagio: 'seta',
}

function linkExterno(url: string | null): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function linkInstagram(v: string | null): string | null {
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return `https://instagram.com/${v.replace(/^@/, '')}`
}

export function LeadFicha() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { dados, carregando, erro, recarregar, mutar } = useDados<Ficha>(`lead:${id}`, () => carregarFicha(id))
  const { dados: servicos } = useDados('servicos', listarServicos)
  const [modalPerda, setModalPerda] = useState(false)
  const [modalAgendar, setModalAgendar] = useState(false)
  const [modalNota, setModalNota] = useState(false)
  const [modalVenda, setModalVenda] = useState(false)
  const [params, setParams] = useSearchParams()
  const acoes = useAcoesLead()
  const { abrirMensagem } = useEnvio()
  const leadCarregado = dados?.lead

  // "Salvar e abordar agora" e links ?abordar=1 abrem a mensagem direto.
  useEffect(() => {
    if (params.get('venda') === '1' && leadCarregado) {
      setParams({}, { replace: true })
      setModalVenda(true)
    }
    if (params.get('abordar') === '1' && leadCarregado) {
      setParams({}, { replace: true })
      if (!leadCarregado.opt_out) abrirMensagem({ lead: leadCarregado, templateChave: acaoSugerida(leadCarregado).template_chave })
    }
  }, [params, leadCarregado, setParams, abrirMensagem])

  if (erro && !dados) return <div className="page"><Erro texto={erro} tentarDeNovo={() => void recarregar()} /></div>
  if (carregando || !dados) return <div className="page"><Skeleton linhas={5} altura={72} /></div>

  const { lead, interacoes, tarefas, vendas } = dados

  /** Salva um campo com atualização otimista. */
  async function salvarCampo(alteracao: AlteracaoLead) {
    const anterior = dados!.lead
    mutar((f) => ({ ...f!, lead: { ...f!.lead, ...alteracao } as Lead }))
    try {
      const atualizado = await atualizarLead(id, alteracao)
      mutar((f) => ({ ...f!, lead: atualizado }))
    } catch (e) {
      mutar((f) => ({ ...f!, lead: anterior }))
      throw e
    }
  }

  async function trocarEstagio(e: Estagio, motivo?: string) {
    if (e === lead.estagio) return
    if (e === 'perdido' && !motivo) {
      setModalPerda(true)
      return
    }
    if (e === 'ganho') {
      setModalVenda(true)
      return
    }
    const anterior = lead
    mutar((f) => ({ ...f!, lead: { ...f!.lead, estagio: e } }))
    const ok = await acoes.trocarEstagio(anterior, e, motivo)
    if (!ok) mutar((f) => ({ ...f!, lead: anterior }))
  }

  async function respondeu() {
    const anterior = lead
    mutar((f) => ({
      ...f!,
      lead: { ...f!.lead, estagio: ['novo', 'abordado', 'sem_resposta', 'perdido'].includes(f!.lead.estagio) ? 'respondeu' : f!.lead.estagio },
    }))
    const ok = await acoes.respondeu(anterior)
    if (!ok) mutar((f) => ({ ...f!, lead: anterior }))
  }

  const sugerida = acaoSugerida(lead)
  const ofereceAuditoria = lead.nota_auditoria !== null && ['novo', 'abordado', 'respondeu'].includes(lead.estagio) && !lead.opt_out

  const texto = (campo: keyof AlteracaoLead) => async (v: string) => salvarCampo({ [campo]: v.trim() || null } as AlteracaoLead)

  return (
    <div className="page ficha">
      <div className="ficha-voltar">
        <button type="button" className="ulink" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/leads'))}>
          <Icon name="voltar" size={16} /> Voltar
        </button>
      </div>

      <section className="card card-lg ficha-topo">
        <div className="ficha-titulo">
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">{lead.segmento || 'Lead'}{lead.cidade ? ` · ${lead.cidade}` : ''}</span>
            <h1>{lead.empresa}</h1>
            <p className="muted">
              {[lead.contato_nome, formatarTelefone(lead.whatsapp)].filter(Boolean).join(' · ')}
              {lead.ultimo_contato_em && <> · último contato {haQuanto(lead.ultimo_contato_em)}</>}
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              <EstagioBadge estagio={lead.estagio} />
              {lead.opt_out && <span className="badge badge-danger">Opt-out</span>}
              {lead.arquivado && <span className="badge">Arquivado</span>}
              {lead.tags.map((t) => (
                <span key={t} className="badge">{t}</span>
              ))}
            </div>
          </div>
          <div className="ficha-nota" aria-label="Nota da auditoria">
            <span className="label">Auditoria</span>
            <span className="ficha-nota-valor num">{lead.nota_auditoria ?? '—'}</span>
            <span className="muted mono" style={{ fontSize: '.75rem' }}>/100</span>
          </div>
        </div>

        <div className="ficha-acoes">
          <button
            type="button"
            className="btn btn-primary"
            disabled={lead.opt_out}
            title={lead.opt_out ? 'Lead com opt-out: envio bloqueado' : undefined}
            onClick={() => abrirMensagem({ lead, templateChave: sugerida.template_chave })}
          >
            <Icon name="whatsapp" size={18} /> {sugerida.tipo === 'mensagem' && sugerida.template_chave ? sugerida.rotulo : 'WhatsApp'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void respondeu()}>
            <Icon name="check" size={18} /> Respondeu
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setModalAgendar(true)}>
            <Icon name="calendario" size={18} /> Agendar
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setModalNota(true)}>
            <Icon name="nota" size={18} /> Nota
          </button>
        </div>

        <div className="estagios-rolagem" role="radiogroup" aria-label="Estágio">
          {ESTAGIOS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={lead.estagio === e}
              className="estagio-pill"
              onClick={() => void trocarEstagio(e)}
            >
              {ESTAGIO_ROTULO[e]}
            </button>
          ))}
        </div>

        {ofereceAuditoria && (
          <div className="aviso-em">
            <p>
              Auditoria registrada: nota <b className="num">{lead.nota_auditoria}</b>/100. Enviar para {lead.contato_nome?.split(' ')[0] || lead.empresa} agora?
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirMensagem({ lead, templateChave: 'auditoria' })}>
              Enviar auditoria <span className="arrow">→</span>
            </button>
          </div>
        )}

        {lead.proxima_acao_em && (
          <p className="ficha-proxima">
            <Icon name="calendario" size={16} /> Próxima ação: <b>{lead.proxima_acao || 'Follow-up'}</b> — {quando(lead.proxima_acao_em)}
          </p>
        )}
      </section>

      <div className="ficha-colunas">
        <section className="stack">
          {vendas.length > 0 && (
            <div className="card">
              <div className="card-cabecalho"><span className="eyebrow">Vendas</span></div>
              <ul className="rows" role="list">
                {vendas.map((v) => (
                  <li key={v.id} className="tarefa">
                    <span className="spacer">
                      {((Array.isArray(v.itens) ? v.itens : []) as unknown as ItemVenda[]).map((i) => i.nome).join(' + ')}
                      {v.manutencao_mensal && <span className="muted"> · manutenção {moeda(Number(v.valor_mensal))}/mês</span>}
                    </span>
                    <span className="num">{moeda(Number(v.valor_total))}</span>
                    <span className={`badge ${v.status === 'pago' ? 'badge-em' : v.status === 'cancelado' ? 'badge-danger' : ''}`}>{v.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tarefas.length > 0 && (
            <div className="card">
              <div className="card-cabecalho"><span className="eyebrow">Tarefas abertas</span></div>
              <ul className="rows" role="list">
                {tarefas.map((t) => (
                  <li key={t.id} className="tarefa">
                    <label className="check">
                      <input
                        type="checkbox"
                        onChange={() =>
                          void concluirTarefa(t.id, id).then(() =>
                            toast('Tarefa concluída.', { desfazer: () => concluirTarefa(t.id, id, false) }),
                          )
                        }
                      />
                      <span className="sr-only">Concluir {t.titulo}</span>
                    </label>
                    <span className="spacer">{t.titulo}</span>
                    <span className="muted mono" style={{ fontSize: '.75rem' }}>{quando(t.vence_em)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="card-cabecalho"><span className="eyebrow">Linha do tempo</span></div>
            {interacoes.length === 0 ? (
              <p className="muted" style={{ padding: '0 20px 20px' }}>Nenhuma interação ainda. A primeira mensagem que você enviar aparece aqui.</p>
            ) : (
              <ol className="timeline" role="list">
                {interacoes.map((i) => (
                  <li key={i.id} className={`timeline-item timeline-${i.tipo}`}>
                    <span className="timeline-icone" aria-hidden="true">
                      <Icon name={ICONE_INTERACAO[i.tipo]} size={14} />
                    </span>
                    <div className="timeline-corpo">
                      <div className="row wrap" style={{ gap: 8 }}>
                        <span className="timeline-tipo">{TIPO_INTERACAO_ROTULO[i.tipo]}</span>
                        {i.ator === 'agente' && <span className="badge badge-em" title={i.ator_nome ?? undefined}><Icon name="robo" size={12} /> Agente</span>}
                        {i.ator === 'bridge' && <span className="badge">Bridge</span>}
                        <time className="muted mono timeline-quando" dateTime={i.ocorreu_em} title={dataHora(i.ocorreu_em)}>
                          {quando(i.ocorreu_em)}
                        </time>
                      </div>
                      {i.conteudo && <p className="timeline-texto">{i.conteudo}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="card dados-lead" aria-label="Dados do lead">
          <div className="card-cabecalho"><span className="eyebrow">Dados</span></div>
          <div className="rows">
            <CampoEditavel rotulo="Empresa" valor={lead.empresa} salvar={async (v) => { if (!v.trim()) throw new Error('A empresa precisa de um nome.'); await salvarCampo({ empresa: v.trim() }) }} />
            <CampoEditavel rotulo="Contato" valor={lead.contato_nome} salvar={texto('contato_nome')} />
            <CampoEditavel rotulo="WhatsApp" tipo="tel" valor={lead.whatsapp} exibir={formatarTelefone(lead.whatsapp)} salvar={(v) => salvarCampo({ whatsapp: v })} />
            <CampoEditavel rotulo="Cidade" valor={lead.cidade} salvar={(v) => salvarCampo({ cidade: v.trim() })} />
            <CampoEditavel rotulo="UF" tipo="select" valor={lead.uf} opcoes={UFS.map((u) => ({ valor: u, rotulo: u }))} salvar={texto('uf')} />
            <CampoEditavel rotulo="Segmento" valor={lead.segmento} placeholder={SEGMENTOS_SUGERIDOS[0]} salvar={texto('segmento')} />
            <CampoEditavel rotulo="Origem" tipo="select" valor={lead.origem} exibir={ORIGEM_ROTULO[lead.origem as keyof typeof ORIGEM_ROTULO]} opcoes={ORIGENS.map((o) => ({ valor: o, rotulo: ORIGEM_ROTULO[o] }))} salvar={(v) => salvarCampo({ origem: v || 'prospeccao_ativa' })} />
            <CampoEditavel
              rotulo="Nota da auditoria"
              tipo="numero"
              valor={lead.nota_auditoria?.toString()}
              placeholder="0 a 100"
              salvar={async (v) => {
                const n = v.trim() === '' ? null : Number(v)
                if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100)) throw new Error('Use um número inteiro de 0 a 100.')
                await salvarCampo({ nota_auditoria: n })
              }}
            />
            <CampoEditavel
              rotulo="Serviço de interesse"
              tipo="select"
              valor={lead.servico_interesse}
              exibir={servicos?.find((s) => s.id === lead.servico_interesse)?.nome}
              opcoes={servicos?.map((s) => ({ valor: s.id, rotulo: `${s.nome} — ${moeda(s.preco)}` })) ?? []}
              salvar={texto('servico_interesse')}
            />
            <CampoEditavel
              rotulo="Valor estimado"
              tipo="numero"
              valor={lead.valor_estimado?.toString()}
              exibir={<span className="num">{moeda(lead.valor_estimado)}</span>}
              salvar={async (v) => {
                const n = v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))
                if (n !== null && (!Number.isFinite(n) || n < 0)) throw new Error('Valor inválido.')
                await salvarCampo({ valor_estimado: n })
              }}
            />
            <CampoEditavel
              rotulo="Perfil do Google"
              tipo="url"
              valor={lead.link_google}
              exibir={<LinkFora href={linkExterno(lead.link_google)}>Abrir perfil</LinkFora>}
              salvar={texto('link_google')}
            />
            <CampoEditavel rotulo="Site atual" tipo="url" valor={lead.site_atual} exibir={<LinkFora href={linkExterno(lead.site_atual)}>{lead.site_atual}</LinkFora>} salvar={texto('site_atual')} />
            <CampoEditavel rotulo="Instagram" valor={lead.instagram} exibir={<LinkFora href={linkInstagram(lead.instagram)}>{lead.instagram}</LinkFora>} salvar={texto('instagram')} />
            <CampoEditavel
              rotulo="Tags"
              valor={lead.tags.join(', ')}
              placeholder="separe por vírgula"
              salvar={(v) => salvarCampo({ tags: [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] })}
            />
            <CampoEditavel rotulo="Próxima ação" valor={lead.proxima_acao} salvar={texto('proxima_acao')} />
            {lead.estagio === 'perdido' && <CampoEditavel rotulo="Motivo da perda" valor={lead.motivo_perda} salvar={async (v) => { if (!v.trim()) throw new Error('Informe o motivo.'); await salvarCampo({ motivo_perda: v.trim() }) }} />}
            <CampoEditavel rotulo="Observações" tipo="textarea" valor={lead.observacoes} salvar={texto('observacoes')} />
          </div>
          <div className="dados-lead-rodape">
            <label className="toggle">
              <input
                type="checkbox"
                checked={lead.opt_out}
                onChange={(e) => {
                  const v = e.target.checked
                  if (v && !window.confirm('Marcar opt-out? Esse lead nunca mais vai aparecer nas filas de abordagem.')) return
                  void salvarCampo({ opt_out: v }).catch((err: Error) => toast(err.message, { tipo: 'erro' }))
                }}
              />
              <span>Opt-out (não quer receber mensagens)</span>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                void salvarCampo({ arquivado: !lead.arquivado }).then(() =>
                  toast(lead.arquivado ? 'Lead desarquivado.' : 'Lead arquivado.', {
                    desfazer: () => salvarCampo({ arquivado: lead.arquivado }),
                  }),
                )
              }
            >
              {lead.arquivado ? 'Desarquivar' : 'Arquivar'}
            </button>
            <span className="muted mono" style={{ fontSize: '.72rem' }}>Criado em {dataHora(lead.created_at)}</span>
          </div>
        </section>
      </div>

      <VendaModal aberto={modalVenda} lead={lead} aoFechar={() => setModalVenda(false)} />
      <MotivoPerdaModal
        aberto={modalPerda}
        empresa={lead.empresa}
        aoFechar={() => setModalPerda(false)}
        aoConfirmar={(m) => {
          setModalPerda(false)
          void trocarEstagio('perdido', m)
        }}
      />
      <AgendarModal
        aberto={modalAgendar}
        aoFechar={() => setModalAgendar(false)}
        acaoAtual={lead.proxima_acao}
        aoConfirmar={async (quandoIso, acao) => {
          setModalAgendar(false)
          await salvarCampo({ proxima_acao_em: quandoIso, proxima_acao: acao || 'Follow-up' })
          toast(`Agendado para ${quando(quandoIso)}.`)
        }}
      />
      <NotaModal
        aberto={modalNota}
        aoFechar={() => setModalNota(false)}
        aoConfirmar={async (tipo, conteudo, comoTarefa) => {
          setModalNota(false)
          try {
            if (comoTarefa) await criarTarefa({ lead_id: id, titulo: conteudo, vence_em: new Date().toISOString() })
            else await registrarInteracao({ lead_id: id, tipo, conteudo })
            toast(comoTarefa ? 'Tarefa criada.' : 'Registrado.')
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Não foi possível registrar.', { tipo: 'erro' })
          }
        }}
      />
    </div>
  )
}

function LinkFora({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <span className="row" style={{ gap: 8, minWidth: 0 }}>
      <span className="truncar">{children}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="btn-icon" aria-label="Abrir em nova aba" onClick={(e) => e.stopPropagation()}>
        <Icon name="link" size={16} />
      </a>
    </span>
  )
}

function AgendarModal({
  aberto,
  aoFechar,
  aoConfirmar,
  acaoAtual,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: (iso: string, acao: string) => Promise<void>
  acaoAtual: string | null
}) {
  const [acao, setAcao] = useState('')
  const [personalizado, setPersonalizado] = useState('')
  const base = (dias: number) => setHora(addDays(new Date(), dias), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 })
  const atalhos = [
    { rotulo: 'Hoje mais tarde', data: new Date(Date.now() + 3 * 3_600_000) },
    { rotulo: 'Amanhã 9h', data: base(1) },
    { rotulo: 'Em 2 dias', data: base(2) },
    { rotulo: 'Em 1 semana', data: base(7) },
    { rotulo: 'Em 1 mês', data: base(30) },
  ]
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} eyebrow="Agendar" titulo="Quando retomar?">
      <div className="stack">
        <div className="field">
          <label htmlFor="ag-acao">O que fazer</label>
          <input id="ag-acao" className="input" placeholder={acaoAtual || 'Follow-up'} value={acao} onChange={(e) => setAcao(e.target.value)} />
        </div>
        <div className="opcoes">
          {atalhos.map((a) => (
            <button key={a.rotulo} type="button" className="opcao" onClick={() => void aoConfirmar(a.data.toISOString(), acao)}>
              {a.rotulo}
              <span className="muted mono" style={{ fontSize: '.72rem' }}>{format(a.data, 'dd/MM HH:mm')}</span>
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="ag-data">Outra data</label>
          <div className="row">
            <input id="ag-data" type="datetime-local" className="input" value={personalizado} onChange={(e) => setPersonalizado(e.target.value)} />
            <button type="button" className="btn btn-primary" disabled={!personalizado} onClick={() => void aoConfirmar(new Date(personalizado).toISOString(), acao)}>
              Agendar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function NotaModal({
  aberto,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: (tipo: 'nota' | 'ligacao', conteudo: string, comoTarefa: boolean) => Promise<void>
}) {
  const [tipo, setTipo] = useState<'nota' | 'ligacao' | 'tarefa'>('nota')
  const [conteudo, setConteudo] = useState('')
  const enviar = () => {
    if (!conteudo.trim()) return
    void aoConfirmar(tipo === 'tarefa' ? 'nota' : tipo, conteudo.trim(), tipo === 'tarefa')
    setConteudo('')
  }
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      eyebrow="Registrar"
      titulo="Nota rápida"
      rodape={
        <button type="button" className="btn btn-primary" disabled={!conteudo.trim()} onClick={enviar}>
          Salvar <span className="arrow">→</span>
        </button>
      }
    >
      <div className="stack">
        <div className="segmented segmented-texto" role="radiogroup" aria-label="Tipo">
          {([['nota', 'Nota'], ['ligacao', 'Ligação'], ['tarefa', 'Tarefa']] as const).map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => setTipo(v)}>
              {r}
            </button>
          ))}
        </div>
        <textarea
          className="textarea"
          aria-label="Conteúdo"
          autoFocus
          value={conteudo}
          placeholder={tipo === 'tarefa' ? 'Ex.: Ligar para confirmar o orçamento' : 'O que aconteceu?'}
          onChange={(e) => setConteudo(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && enviar()}
        />
        <span className="hint">Ctrl + Enter salva.</span>
      </div>
    </Modal>
  )
}
