import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { EstagioBadge } from '../components/EstagioBadge'
import { Erro, Skeleton } from '../components/Estados'
import { Icon } from '../components/Icon'
import { ModoFoco } from '../components/ModoFoco'
import { useCaptura } from '../components/CapturaRapida'
import { useEnvio, type Proximo } from '../context/EnvioContext'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { useAcoesLead } from '../hooks/useAcoesLead'
import { carregarFila } from '../services/fila'
import { concluirTarefa } from '../services/tarefas'
import type { Fila, ItemFila, TarefaFila } from '../../shared/fila.ts'
import { haQuanto, quando } from '../lib/formato'
import { BlocoAprovar } from '../components/BlocoAprovar'

export function Hoje() {
  const { dados: fila, carregando, erro, recarregar, mutar } = useDados<Fila>('fila:hoje', carregarFila)
  const { abrir } = useCaptura()
  const { abrirMensagem } = useEnvio()
  const acoes = useAcoesLead()
  const toast = useToast()
  const navigate = useNavigate()
  const [foco, setFoco] = useState(false)
  const [params, setParams] = useSearchParams()

  // Paleta de comandos → "Modo foco"
  useEffect(() => {
    if (params.get('foco') === '1' && fila) {
      setParams({}, { replace: true })
      if (fila.sequencia.length) setFoco(true)
    }
  }, [params, fila, setParams])

  const hoje = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  if (erro && !fila) {
    return (
      <div className="page">
        <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
      </div>
    )
  }

  /** Tira o item da fila na hora (otimista); o servidor confirma depois. */
  const removerDaFila = (leadId: string) =>
    mutar((f) =>
      f
        ? {
            ...f,
            responderam: f.responderam.filter((i) => i.lead.id !== leadId),
            followups: f.followups.filter((i) => i.lead.id !== leadId),
            novos: f.novos.filter((i) => i.lead.id !== leadId),
            sequencia: f.sequencia.filter((i) => i.lead.id !== leadId),
          }
        : f!,
    )

  function proximoDe(item: ItemFila): Proximo | null {
    if (!fila) return null
    const seq = fila.sequencia.filter((i) => i.lead.id !== item.lead.id)
    const prox = seq[0]
    if (!prox) return null
    return { rotulo: `${prox.lead.empresa} — ${prox.acao.rotulo}`, ir: () => agir(prox) }
  }

  function agir(item: ItemFila) {
    if (item.acao.tipo === 'abrir') {
      navigate(`/leads/${item.lead.id}`)
      return
    }
    abrirMensagem({
      lead: item.lead,
      templateChave: item.acao.template_chave,
      aoEnviar: () => {
        removerDaFila(item.lead.id)
        if (item.bloco === 'novos')
          mutar((f) => (f ? { ...f, progresso: { ...f.progresso, feitas: f.progresso.feitas + 1 } } : f!))
      },
      proximo: proximoDe(item),
    })
  }

  async function respondeu(item: ItemFila) {
    removerDaFila(item.lead.id)
    await acoes.respondeu(item.lead)
  }

  async function concluir(t: TarefaFila) {
    mutar((f) => (f ? { ...f, tarefas: f.tarefas.filter((x) => x.id !== t.id) } : f!))
    try {
      await concluirTarefa(t.id, t.lead_id)
      toast('Tarefa concluída.', { desfazer: () => concluirTarefa(t.id, t.lead_id, false) })
    } catch (e) {
      void recarregar()
      toast(e instanceof Error ? e.message : 'Não foi possível concluir.', { tipo: 'erro' })
    }
  }

  const progresso = fila?.progresso ?? { feitas: 0, meta: 20 }
  const pct = progresso.meta ? Math.min(100, Math.round((progresso.feitas / progresso.meta) * 100)) : 0
  const totalMensagens = fila?.sequencia.length ?? 0
  const filaVazia =
    fila && !fila.para_aprovar.length && !fila.responderam.length && !fila.followups.length && !fila.novos.length && !fila.tarefas.length

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-texto">
          <span className="eyebrow">01 / {hoje}</span>
          <h1>Hoje</h1>
        </div>
        <div className="page-header-acoes">
          <button type="button" className="btn btn-primary" disabled={!totalMensagens} onClick={() => setFoco(true)}>
            <Icon name="foco" size={18} /> Modo foco
            {totalMensagens > 0 && <span className="num">· {totalMensagens}</span>}
          </button>
        </div>
      </header>

      <section className="card card-pad progresso-dia" aria-label="Progresso do dia">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Abordagens de hoje</span>
          <span className="num progresso-numero">
            <b>{progresso.feitas}</b> de {progresso.meta}
          </span>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progresso.meta} aria-valuenow={progresso.feitas}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </section>

      {carregando ? (
        <Skeleton linhas={5} />
      ) : filaVazia ? (
        <div className="card card-lg empty">
          <span className="badge badge-em">Fila limpa</span>
          <p>
            {fila!.novos_total === 0
              ? 'Nada pendente e nenhum lead novo na base. Cadastre ou importe uma lista para abordar hoje.'
              : 'Meta do dia batida e nada pendente. Bom trabalho!'}
          </p>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={abrir}>
              Novo lead <span className="arrow">→</span>
            </button>
            <Link to="/importar" className="ulink">
              Importar CSV
            </Link>
          </div>
        </div>
      ) : (
        fila && (
          <>
            {fila.para_aprovar.length > 0 && <BlocoAprovar acoes={fila.para_aprovar} />}

            <Bloco titulo="Responderam" quantidade={fila.responderam.length} destaque>
              {fila.responderam.length === 0 ? null : (
                <ListaItens itens={fila.responderam} agir={agir} respondeu={respondeu} />
              )}
            </Bloco>

            <Bloco titulo="Follow-ups" quantidade={fila.followups.length} vazio="Nenhum follow-up para hoje. Que tal abordar 5 leads novos?">
              {fila.followups.length > 0 && <ListaItens itens={fila.followups} agir={agir} respondeu={respondeu} />}
            </Bloco>

            <Bloco
              titulo="Leads novos para abordar"
              quantidade={fila.novos.length}
              vazio={
                fila.novos_total === 0
                  ? 'Nenhum lead novo na base. Cadastre ou importe uma lista para continuar prospectando.'
                  : `Meta do dia batida. Ainda há ${fila.novos_total} leads novos para amanhã.`
              }
              acaoVazio={
                fila.novos_total === 0 ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={abrir}>
                    Novo lead
                  </button>
                ) : null
              }
            >
              {fila.novos.length > 0 && <ListaItens itens={fila.novos} agir={agir} respondeu={respondeu} />}
            </Bloco>

            <Bloco titulo="Tarefas de hoje" quantidade={fila.tarefas.length} vazio="Nenhuma tarefa para hoje.">
              {fila.tarefas.length > 0 && (
                <ul className="rows" role="list">
                  {fila.tarefas.map((t) => (
                    <li key={t.id} className="item-fila item-tarefa">
                      <label className="check">
                        <input type="checkbox" onChange={() => void concluir(t)} />
                        <span className="sr-only">Concluir {t.titulo}</span>
                      </label>
                      <div className="item-fila-info">
                        <span className="item-fila-empresa">{t.titulo}</span>
                        <span className="muted item-fila-sub">
                          {t.lead ? (
                            <Link to={`/leads/${t.lead.id}`}>{t.lead.empresa}</Link>
                          ) : (
                            'Sem lead'
                          )}
                          {' · '}
                          {new Date(t.vence_em) < new Date() ? `venceu ${quando(t.vence_em)}` : quando(t.vence_em)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>
          </>
        )
      )}

      {foco && fila && (
        <ModoFoco
          itens={fila.sequencia}
          aoFechar={() => {
            setFoco(false)
            void recarregar()
          }}
          aoEnviar={(item) => {
            removerDaFila(item.lead.id)
            if (item.bloco === 'novos')
              mutar((f) => (f ? { ...f, progresso: { ...f.progresso, feitas: f.progresso.feitas + 1 } } : f!))
          }}
        />
      )}
    </div>
  )
}

function Bloco({
  titulo,
  quantidade,
  destaque,
  vazio,
  acaoVazio,
  children,
}: {
  titulo: string
  quantidade: number
  destaque?: boolean
  vazio?: string
  acaoVazio?: ReactNode
  children: ReactNode
}) {
  if (quantidade === 0 && !vazio) return null
  return (
    <section className={`card bloco-fila ${destaque && quantidade > 0 ? 'bloco-destaque' : ''}`} aria-label={titulo}>
      <header className="card-cabecalho">
        <h2 className="bloco-titulo">
          {destaque && quantidade > 0 && <span className="dot" aria-hidden="true" />}
          {titulo}
        </h2>
        <span className={`badge num ${destaque && quantidade > 0 ? 'badge-em' : ''}`}>{quantidade}</span>
      </header>
      {quantidade === 0 ? (
        <div className="bloco-vazio">
          <p className="muted">{vazio}</p>
          {acaoVazio}
        </div>
      ) : (
        children
      )}
    </section>
  )
}

function ListaItens({
  itens,
  agir,
  respondeu,
}: {
  itens: ItemFila[]
  agir: (i: ItemFila) => void
  respondeu: (i: ItemFila) => void
}) {
  return (
    <ul className="rows" role="list">
      {itens.map((item) => {
        const l = item.lead
        return (
          <li key={l.id} className="item-fila">
            <Link to={`/leads/${l.id}`} className="item-fila-info">
              <span className="item-fila-empresa">{l.empresa}</span>
              <span className="muted item-fila-sub">
                {[l.contato_nome, l.cidade].filter(Boolean).join(' · ')}
                {' · '}
                {l.ultimo_contato_em ? `último contato ${haQuanto(l.ultimo_contato_em)}` : 'nunca contatado'}
              </span>
              <span className="item-fila-estagio">
                <EstagioBadge estagio={l.estagio} />
              </span>
            </Link>
            <div className="item-fila-acoes">
              {item.bloco !== 'novos' && item.bloco !== 'responderam' && (
                <button type="button" className="btn-icon" aria-label={`${l.empresa} respondeu`} title="Respondeu" onClick={() => void respondeu(item)}>
                  <Icon name="check" size={18} />
                </button>
              )}
              <button
                type="button"
                className={item.acao.tipo === 'mensagem' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => agir(item)}
              >
                {item.acao.rotulo} <span className="arrow">→</span>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
