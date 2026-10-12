import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { EstagioBadge } from '../components/EstagioBadge'
import { Erro, Skeleton, Vazio } from '../components/Estados'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { MotivoPerdaModal } from '../components/MotivoPerdaModal'
import { useCaptura } from '../components/CapturaRapida'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { adicionarTag, atualizarVarios, listarLeads, mudarEstagioVarios, type LeadResumo } from '../services/leads'
import { ESTAGIOS, ESTAGIO_ROTULO, ehEstagio, type Estagio } from '../../shared/dominio.ts'
import { formatarTelefone } from '../../shared/phone.ts'
import { haQuanto } from '../lib/formato'
import { exportarLeads } from '../services/importacao'
import { ehCampoDeTexto, normalizarBusca } from '../lib/teclado'

const LIMITE_INICIAL = 100
const DIAS_SEM_CONTATO = [3, 7, 15, 30, 60]

function unicos(valores: (string | null | undefined)[]): string[] {
  return [...new Set(valores.filter((v): v is string => !!v && !!v.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function Leads() {
  const { dados: leads, carregando, erro, recarregar } = useDados('leads:lista', () => listarLeads())
  const { abrir } = useCaptura()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [limite, setLimite] = useState(LIMITE_INICIAL)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [modalEstagio, setModalEstagio] = useState(false)
  const [modalTag, setModalTag] = useState(false)
  const [modalPerda, setModalPerda] = useState(false)
  const [tag, setTag] = useState('')
  const buscaRef = useRef<HTMLInputElement>(null)

  const busca = params.get('q') ?? ''
  const estagio = params.get('estagio') ?? ''
  const segmento = params.get('segmento') ?? ''
  const cidade = params.get('cidade') ?? ''
  const tagFiltro = params.get('tag') ?? ''
  const semContato = Number(params.get('sem_contato') ?? 0)

  const setParam = (chave: string, valor: string) => {
    const p = new URLSearchParams(params)
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    setParams(p, { replace: true })
    setLimite(LIMITE_INICIAL)
  }

  // Vindo do atalho "/" em outra tela.
  useEffect(() => {
    if (params.get('buscar') === '1') {
      buscaRef.current?.focus()
      const p = new URLSearchParams(params)
      p.delete('buscar')
      setParams(p, { replace: true })
    }
  }, [params, setParams])

  // "/" foca a busca.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !ehCampoDeTexto(e.target) && !document.querySelector('dialog[open]')) {
        e.preventDefault()
        buscaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const opcoes = useMemo(
    () => ({
      segmentos: unicos(leads?.map((l) => l.segmento) ?? []),
      cidades: unicos(leads?.map((l) => l.cidade) ?? []),
      tags: unicos(leads?.flatMap((l) => l.tags) ?? []),
    }),
    [leads],
  )

  const filtrados = useMemo(() => {
    if (!leads) return []
    const q = normalizarBusca(busca.trim())
    const qDigitos = busca.replace(/\D/g, '')
    const limiteData = semContato ? Date.now() - semContato * 86_400_000 : 0
    return leads.filter((l) => {
      if (estagio && l.estagio !== estagio) return false
      if (segmento && l.segmento !== segmento) return false
      if (cidade && l.cidade !== cidade) return false
      if (tagFiltro && !l.tags.includes(tagFiltro)) return false
      if (semContato) {
        const ultimo = l.ultimo_contato_em ? new Date(l.ultimo_contato_em).getTime() : 0
        if (ultimo > limiteData) return false
      }
      if (q) {
        const alvo = normalizarBusca(`${l.empresa} ${l.contato_nome ?? ''} ${l.cidade}`)
        const bateTexto = alvo.includes(q)
        const bateTel = qDigitos.length >= 4 && l.whatsapp.includes(qDigitos)
        if (!bateTexto && !bateTel) return false
      }
      return true
    })
  }, [leads, busca, estagio, segmento, cidade, tagFiltro, semContato])

  const visiveis = filtrados.slice(0, limite)
  const temFiltro = !!(busca || estagio || segmento || cidade || tagFiltro || semContato)
  const ids = [...selecionados]

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.id))

  async function emMassa(acao: () => Promise<void>, msg: string) {
    try {
      await acao()
      toast(msg)
      setSelecionados(new Set())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível concluir.', { tipo: 'erro' })
    }
  }

  async function aplicarEstagio(e: Estagio, motivo?: string) {
    setModalEstagio(false)
    setModalPerda(false)
    await emMassa(() => mudarEstagioVarios(ids, e, motivo), `${ids.length} lead(s) movido(s) para ${ESTAGIO_ROTULO[e]}.`)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="02 / Leads"
        titulo="Leads"
        acoes={
          <>
            <button type="button" className="btn btn-ghost" disabled={!filtrados.length} onClick={() => exportarLeads(filtrados)}>
              Exportar CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={abrir}>
              Novo lead <span className="arrow">→</span>
            </button>
          </>
        }
      >
        {leads && (
          <p className="muted num">
            {filtrados.length === leads.length ? `${leads.length} leads` : `${filtrados.length} de ${leads.length} leads`}
          </p>
        )}
      </PageHeader>

      <div className="filtros">
        <div className="busca">
          <Icon name="busca" size={18} />
          <input
            ref={buscaRef}
            className="input"
            type="search"
            placeholder="Buscar empresa, contato, telefone ou cidade"
            aria-label="Buscar leads"
            value={busca}
            onChange={(e) => setParam('q', e.target.value)}
          />
          <kbd className="nav-kbd busca-kbd">/</kbd>
        </div>
        <div className="filtros-linha">
          <select className="select" aria-label="Estágio" value={estagio} onChange={(e) => setParam('estagio', e.target.value)}>
            <option value="">Todos os estágios</option>
            {ESTAGIOS.map((e) => (
              <option key={e} value={e}>
                {ESTAGIO_ROTULO[e]}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Segmento" value={segmento} onChange={(e) => setParam('segmento', e.target.value)}>
            <option value="">Todos os segmentos</option>
            {opcoes.segmentos.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="select" aria-label="Cidade" value={cidade} onChange={(e) => setParam('cidade', e.target.value)}>
            <option value="">Todas as cidades</option>
            {opcoes.cidades.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="select" aria-label="Tag" value={tagFiltro} onChange={(e) => setParam('tag', e.target.value)}>
            <option value="">Todas as tags</option>
            {opcoes.tags.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Sem contato há"
            value={semContato || ''}
            onChange={(e) => setParam('sem_contato', e.target.value)}
          >
            <option value="">Qualquer último contato</option>
            {DIAS_SEM_CONTATO.map((d) => (
              <option key={d} value={d}>
                Sem contato há {d}+ dias
              </option>
            ))}
          </select>
          {temFiltro && (
            <button type="button" className="ulink" onClick={() => setParams({}, { replace: true })}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {selecionados.size > 0 && (
        <div className="barra-massa card" role="region" aria-label="Ações em massa">
          <span className="num">
            <b>{selecionados.size}</b> selecionado(s)
          </span>
          <div className="row wrap" style={{ '--gap': '8px' } as CSSProperties}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModalEstagio(true)}>
              Mudar estágio
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModalTag(true)}>
              Adicionar tag
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm(`Marcar ${ids.length} lead(s) como opt-out? Eles nunca mais vão aparecer nas filas de abordagem.`))
                  void emMassa(() => atualizarVarios(ids, { opt_out: true }), 'Opt-out registrado.')
              }}
            >
              Marcar opt-out
            </button>
            <button type="button" className="ulink" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {erro && !leads ? (
        <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
      ) : carregando ? (
        <Skeleton linhas={6} />
      ) : !leads?.length ? (
        <Vazio
          texto="Nenhum lead ainda. Cadastre o primeiro em segundos, só com empresa, WhatsApp e cidade."
          acao={
            <button type="button" className="btn btn-primary" onClick={abrir}>
              Cadastrar primeiro lead <span className="arrow">→</span>
            </button>
          }
        />
      ) : !filtrados.length ? (
        <Vazio
          texto="Nenhum lead com esses filtros."
          acao={
            <button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>
              Limpar filtros
            </button>
          }
        />
      ) : (
        <div className="card lista-leads">
          <div className="lista-leads-topo">
            <label className="check">
              <input
                type="checkbox"
                checked={todosVisiveisMarcados}
                onChange={() =>
                  setSelecionados((s) => {
                    const n = new Set(s)
                    visiveis.forEach((l) => (todosVisiveisMarcados ? n.delete(l.id) : n.add(l.id)))
                    return n
                  })
                }
              />
              <span className="sr-only">Selecionar todos os visíveis</span>
            </label>
            <span className="label">Empresa</span>
          </div>
          <ul className="rows" role="list">
            {visiveis.map((l) => (
              <LinhaLead key={l.id} lead={l} marcado={selecionados.has(l.id)} alternar={() => alternar(l.id)} />
            ))}
          </ul>
          {filtrados.length > limite && (
            <div style={{ padding: 16 }}>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => setLimite((x) => x + 200)}>
                Mostrar mais ({filtrados.length - limite} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      <Modal aberto={modalEstagio} aoFechar={() => setModalEstagio(false)} eyebrow="Em massa" titulo="Mover para qual estágio?">
        <div className="opcoes">
          {ESTAGIOS.map((e) => (
            <button
              key={e}
              type="button"
              className="opcao"
              onClick={() => {
                if (e === 'perdido') {
                  setModalEstagio(false)
                  setModalPerda(true)
                } else if (ehEstagio(e)) void aplicarEstagio(e)
              }}
            >
              {ESTAGIO_ROTULO[e]}
            </button>
          ))}
        </div>
      </Modal>

      <MotivoPerdaModal aberto={modalPerda} aoFechar={() => setModalPerda(false)} aoConfirmar={(m) => void aplicarEstagio('perdido', m)} />

      <Modal
        aberto={modalTag}
        aoFechar={() => setModalTag(false)}
        eyebrow="Em massa"
        titulo="Adicionar tag"
        rodape={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!tag.trim()}
            onClick={() => {
              setModalTag(false)
              void emMassa(() => adicionarTag(ids, tag), `Tag "${tag.trim()}" adicionada.`)
              setTag('')
            }}
          >
            Adicionar <span className="arrow">→</span>
          </button>
        }
      >
        <div className="field">
          <label htmlFor="tag-massa">Tag</label>
          <input id="tag-massa" className="input" list="tags-existentes" autoFocus value={tag} onChange={(e) => setTag(e.target.value)} />
          <datalist id="tags-existentes">
            {opcoes.tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </Modal>
    </div>
  )
}

function LinhaLead({ lead: l, marcado, alternar }: { lead: LeadResumo; marcado: boolean; alternar: () => void }) {
  return (
    <li className={`linha-lead ${marcado ? 'marcada' : ''}`}>
      <label className="check">
        <input type="checkbox" checked={marcado} onChange={alternar} />
        <span className="sr-only">Selecionar {l.empresa}</span>
      </label>
      <Link to={`/leads/${l.id}`} className="linha-lead-link">
        <span className="linha-lead-principal">
          <span className="linha-lead-empresa">{l.empresa}</span>
          <span className="muted linha-lead-sub">
            {[l.contato_nome, l.cidade, formatarTelefone(l.whatsapp)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="linha-lead-meta">
          {l.opt_out && <span className="badge badge-danger">Opt-out</span>}
          <EstagioBadge estagio={l.estagio} />
          <span className="muted mono linha-lead-quando">{l.ultimo_contato_em ? haQuanto(l.ultimo_contato_em) : 'sem contato'}</span>
        </span>
      </Link>
    </li>
  )
}
