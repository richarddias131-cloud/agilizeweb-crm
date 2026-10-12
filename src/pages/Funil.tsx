import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { PageHeader } from '../components/PageHeader'
import { Erro, Skeleton, Vazio } from '../components/Estados'
import { MotivoPerdaModal } from '../components/MotivoPerdaModal'
import { VendaModal } from '../components/VendaModal'
import { useCaptura } from '../components/CapturaRapida'
import { useDados } from '../hooks/useDados'
import { useAcoesLead } from '../hooks/useAcoesLead'
import { listarLeads, type LeadResumo } from '../services/leads'
import { ESTAGIOS, ESTAGIO_ROTULO, ehEstagio, type Estagio } from '../../shared/dominio.ts'
import { haQuanto, moeda } from '../lib/formato'

const CHAVE = 'leads:lista'

function useDesktop(): boolean {
  const [d, setD] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const f = () => setD(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return d
}

export function Funil() {
  const { dados: leads, carregando, erro, recarregar, mutar } = useDados(CHAVE, () => listarLeads())
  const acoes = useAcoesLead()
  const { abrir } = useCaptura()
  const desktop = useDesktop()
  const [perda, setPerda] = useState<LeadResumo | null>(null)
  const [venda, setVenda] = useState<LeadResumo | null>(null)

  const porEstagio = useMemo(() => {
    const m = new Map<Estagio, LeadResumo[]>(ESTAGIOS.map((e) => [e, []]))
    for (const l of leads ?? []) m.get(l.estagio)?.push(l)
    return m
  }, [leads])

  /** Move com atualização otimista; perdido pede motivo e ganho abre a venda. */
  async function mover(lead: LeadResumo, destino: Estagio, motivo?: string) {
    if (lead.estagio === destino) return
    if (destino === 'perdido' && !motivo) return setPerda(lead)
    if (destino === 'ganho') return setVenda(lead)
    const anterior = lead.estagio
    mutar((ls) => (ls ?? []).map((l) => (l.id === lead.id ? { ...l, estagio: destino, motivo_perda: motivo ?? l.motivo_perda } : l)))
    const ok = await acoes.trocarEstagio(lead, destino, motivo)
    if (!ok) mutar((ls) => (ls ?? []).map((l) => (l.id === lead.id ? { ...l, estagio: anterior } : l)))
  }

  return (
    <div className={`page ${desktop ? 'page-larga' : ''}`}>
      <PageHeader eyebrow="03 / Funil" titulo="Funil">
        {leads && (
          <p className="muted num">
            {leads.length} leads · {moeda(leads.filter((l) => !['perdido', 'sem_resposta'].includes(l.estagio)).reduce((t, l) => t + Number(l.valor_estimado ?? 0), 0))} em
            aberto
          </p>
        )}
      </PageHeader>

      {erro && !leads ? (
        <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
      ) : carregando ? (
        <Skeleton linhas={4} />
      ) : !leads?.length ? (
        <Vazio
          texto="O funil está vazio. Cadastre seus primeiros leads para acompanhar cada negócio aqui."
          acao={
            <button type="button" className="btn btn-primary" onClick={abrir}>
              Novo lead <span className="arrow">→</span>
            </button>
          }
        />
      ) : desktop ? (
        <Kanban porEstagio={porEstagio} mover={mover} />
      ) : (
        <ListaPorEstagio porEstagio={porEstagio} mover={mover} />
      )}

      <MotivoPerdaModal
        aberto={!!perda}
        empresa={perda?.empresa}
        aoFechar={() => setPerda(null)}
        aoConfirmar={(m) => {
          const l = perda!
          setPerda(null)
          void mover(l, 'perdido', m)
        }}
      />
      <VendaModal aberto={!!venda} lead={venda} aoFechar={() => setVenda(null)} />
    </div>
  )
}

type MoverFn = (lead: LeadResumo, destino: Estagio, motivo?: string) => Promise<void> | void

function soma(ls: LeadResumo[]): number {
  return ls.reduce((t, l) => t + Number(l.valor_estimado ?? 0), 0)
}

/* ------------------------------ Desktop ------------------------------ */

function Kanban({ porEstagio, mover }: { porEstagio: Map<Estagio, LeadResumo[]>; mover: MoverFn }) {
  const [arrastando, setArrastando] = useState<LeadResumo | null>(null)
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const todos = useMemo(() => [...porEstagio.values()].flat(), [porEstagio])

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null)
    const lead = todos.find((l) => l.id === e.active.id)
    const destino = e.over?.id
    if (lead && ehEstagio(destino)) void mover(lead, destino)
  }

  return (
    <DndContext
      sensors={sensores}
      onDragStart={(e) => setArrastando(todos.find((l) => l.id === e.active.id) ?? null)}
      onDragCancel={() => setArrastando(null)}
      onDragEnd={aoSoltar}
      accessibility={{
        screenReaderInstructions: { draggable: 'Para mover, pressione espaço, use as setas para escolher a coluna e espaço de novo para soltar.' },
        announcements: {
          onDragStart: ({ active }) => `Pegou ${todos.find((l) => l.id === active.id)?.empresa ?? 'lead'}.`,
          onDragOver: ({ over }) => (over && ehEstagio(over.id) ? `Sobre ${ESTAGIO_ROTULO[over.id]}.` : 'Fora das colunas.'),
          onDragEnd: ({ over }) => (over && ehEstagio(over.id) ? `Solto em ${ESTAGIO_ROTULO[over.id]}.` : 'Cancelado.'),
          onDragCancel: () => 'Cancelado.',
        },
      }}
    >
      <div className="kanban" role="list" aria-label="Colunas do funil">
        {ESTAGIOS.map((e) => (
          <Coluna key={e} estagio={e} leads={porEstagio.get(e) ?? []} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{arrastando ? <CartaoLead lead={arrastando} sobreposto /> : null}</DragOverlay>
    </DndContext>
  )
}

function Coluna({ estagio, leads }: { estagio: Estagio; leads: LeadResumo[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: estagio })
  const [limite, setLimite] = useState(40)
  return (
    <section ref={setNodeRef} className={`coluna ${isOver ? 'coluna-sobre' : ''} coluna-${estagio}`} role="listitem" aria-label={ESTAGIO_ROTULO[estagio]}>
      <header className="coluna-topo">
        <span className="coluna-titulo">{ESTAGIO_ROTULO[estagio]}</span>
        <span className="badge num">{leads.length}</span>
      </header>
      <span className="coluna-soma num">{moeda(soma(leads))}</span>
      <div className="coluna-cartoes">
        {leads.slice(0, limite).map((l) => (
          <Arrastavel key={l.id} lead={l} />
        ))}
        {leads.length > limite && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLimite((n) => n + 40)}>
            Mais {leads.length - limite}
          </button>
        )}
      </div>
    </section>
  )
}

function Arrastavel({ lead }: { lead: LeadResumo }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? 'arrastando' : ''} aria-roledescription="cartão arrastável">
      <CartaoLead lead={lead} />
    </div>
  )
}

function CartaoLead({ lead: l, sobreposto }: { lead: LeadResumo; sobreposto?: boolean }) {
  return (
    <article className={`cartao ${sobreposto ? 'cartao-sobreposto' : ''}`}>
      <Link to={`/leads/${l.id}`} className="cartao-empresa">
        {l.empresa}
      </Link>
      <span className="muted cartao-sub">{[l.contato_nome, l.cidade].filter(Boolean).join(' · ')}</span>
      <span className="cartao-rodape">
        <span className="num">{l.valor_estimado ? moeda(Number(l.valor_estimado)) : ''}</span>
        <span className="muted mono">{l.ultimo_contato_em ? haQuanto(l.ultimo_contato_em) : 'sem contato'}</span>
      </span>
      {l.estagio === 'perdido' && l.motivo_perda && <span className="muted cartao-sub">{l.motivo_perda}</span>}
    </article>
  )
}

/* ------------------------------ Celular ------------------------------ */

function ListaPorEstagio({ porEstagio, mover }: { porEstagio: Map<Estagio, LeadResumo[]>; mover: MoverFn }) {
  const [params, setParams] = useSearchParams()
  const atual = ehEstagio(params.get('estagio')) ? (params.get('estagio') as Estagio) : 'novo'
  const lista = porEstagio.get(atual) ?? []
  return (
    <div className="stack">
      <div className="estagios-rolagem abas-funil" role="tablist" aria-label="Estágio">
        {ESTAGIOS.map((e) => (
          <button
            key={e}
            type="button"
            role="tab"
            aria-selected={atual === e}
            aria-checked={atual === e}
            className="estagio-pill"
            onClick={() => setParams({ estagio: e }, { replace: true })}
          >
            {ESTAGIO_ROTULO[e]} <span className="num">{porEstagio.get(e)?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <p className="muted num">
        {lista.length} {lista.length === 1 ? 'lead' : 'leads'} · {moeda(soma(lista))}
      </p>
      {lista.length === 0 ? (
        <Vazio texto={`Nenhum lead em ${ESTAGIO_ROTULO[atual]}.`} />
      ) : (
        <ul className="card rows lista-funil" role="list">
          {lista.map((l) => (
            <li key={l.id} className="item-fila">
              <Link to={`/leads/${l.id}`} className="item-fila-info">
                <span className="item-fila-empresa">{l.empresa}</span>
                <span className="muted item-fila-sub">
                  {[l.cidade, l.valor_estimado ? moeda(Number(l.valor_estimado)) : null, l.ultimo_contato_em ? haQuanto(l.ultimo_contato_em) : 'sem contato']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
              <select
                className="select select-mover"
                aria-label={`Mover ${l.empresa} para`}
                value={l.estagio}
                onChange={(e) => ehEstagio(e.target.value) && void mover(l, e.target.value)}
              >
                {ESTAGIOS.map((e) => (
                  <option key={e} value={e}>
                    {ESTAGIO_ROTULO[e]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
