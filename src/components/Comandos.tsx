import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { Modal } from './Modal'
import { useCaptura } from './CapturaRapida'
import { lerCache } from '../lib/cache'
import { ehCampoDeTexto, normalizarBusca } from '../lib/teclado'
import type { LeadResumo } from '../services/leads'
import { ESTAGIO_ROTULO } from '../../shared/dominio.ts'
import { formatarTelefone } from '../../shared/phone.ts'

type Comando = { id: string; grupo: string; rotulo: string; detalhe?: string; icone: IconName; executar: () => void; atalho?: string }

const ATALHOS: [string, string][] = [
  ['Ctrl/⌘ + K', 'Paleta de comandos'],
  ['N', 'Novo lead'],
  ['H', 'Ir para Hoje'],
  ['F', 'Ir para o Funil'],
  ['/', 'Buscar leads'],
  ['Enter / Esc', 'Enviei / Não enviei (depois de abrir o WhatsApp)'],
  ['Shift + A', 'Aprovar todas as propostas do agente (Hoje)'],
  ['?', 'Esta lista de atalhos'],
]

/** Paleta (Ctrl/Cmd + K) e atalhos globais. */
export function Comandos() {
  const navigate = useNavigate()
  const local = useLocation()
  const { abrir: novoLead } = useCaptura()
  const [aberta, setAberta] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberta((a) => !a)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || ehCampoDeTexto(e.target) || document.querySelector('dialog[open], .foco')) return
      const k = e.key
      if (k === '?') {
        e.preventDefault()
        setAjuda(true)
      } else if (k.toLowerCase() === 'h' && !e.shiftKey) {
        e.preventDefault()
        navigate('/')
      } else if (k.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault()
        navigate('/funil')
      } else if (k === '/' && local.pathname !== '/leads') {
        e.preventDefault()
        navigate('/leads?buscar=1')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, local.pathname])

  useEffect(() => {
    if (aberta) {
      setBusca('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [aberta])

  const ir = (to: string) => () => {
    setAberta(false)
    navigate(to)
  }

  const comandos = useMemo<Comando[]>(() => {
    const fixos: Comando[] = [
      { id: 'novo', grupo: 'Ações', rotulo: 'Novo lead', icone: 'plus', atalho: 'N', executar: () => (setAberta(false), novoLead()) },
      { id: 'foco', grupo: 'Ações', rotulo: 'Modo foco', detalhe: 'Limpar a fila do dia', icone: 'foco', executar: ir('/?foco=1') },
      { id: 'importar', grupo: 'Ações', rotulo: 'Importar CSV', icone: 'importar', executar: ir('/importar') },
      { id: 'atalhos', grupo: 'Ações', rotulo: 'Ver atalhos de teclado', icone: 'nota', atalho: '?', executar: () => (setAberta(false), setAjuda(true)) },
      { id: 't-hoje', grupo: 'Telas', rotulo: 'Hoje', icone: 'hoje', atalho: 'H', executar: ir('/') },
      { id: 't-leads', grupo: 'Telas', rotulo: 'Leads', icone: 'leads', executar: ir('/leads') },
      { id: 't-funil', grupo: 'Telas', rotulo: 'Funil', icone: 'funil', atalho: 'F', executar: ir('/funil') },
      { id: 't-vendas', grupo: 'Telas', rotulo: 'Vendas', icone: 'vendas', executar: ir('/vendas') },
      { id: 't-painel', grupo: 'Telas', rotulo: 'Painel', icone: 'painel', executar: ir('/painel') },
      { id: 't-config', grupo: 'Telas', rotulo: 'Configurações', icone: 'config', executar: ir('/config') },
      { id: 't-tpl', grupo: 'Telas', rotulo: 'Templates de mensagem', icone: 'nota', executar: ir('/config?aba=templates') },
      { id: 't-api', grupo: 'Telas', rotulo: 'API e agente', icone: 'robo', executar: ir('/config?aba=api') },
    ]
    const q = normalizarBusca(busca.trim())
    const filtrados = q ? fixos.filter((c) => normalizarBusca(`${c.rotulo} ${c.detalhe ?? ''}`).includes(q)) : fixos
    if (!q) return filtrados
    const digitos = busca.replace(/\D/g, '')
    const leads = (lerCache<LeadResumo[]>('leads:lista') ?? [])
      .filter((l) => normalizarBusca(`${l.empresa} ${l.contato_nome ?? ''} ${l.cidade}`).includes(q) || (digitos.length >= 4 && l.whatsapp.includes(digitos)))
      .slice(0, 8)
      .map<Comando>((l) => ({
        id: `lead-${l.id}`,
        grupo: 'Leads',
        rotulo: l.empresa,
        detalhe: `${ESTAGIO_ROTULO[l.estagio]} · ${[l.cidade, formatarTelefone(l.whatsapp)].filter(Boolean).join(' · ')}`,
        icone: 'leads',
        executar: ir(`/leads/${l.id}`),
      }))
    return [...leads, ...filtrados]
  }, [busca, novoLead])

  useEffect(() => setSel(0), [busca])
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  function onKeyInput(e: KeyboardEventReact) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, comandos.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      comandos[sel]?.executar()
    }
  }

  let grupoAnterior = ''
  return (
    <>
      {aberta && (
        <div className="paleta-fundo" onMouseDown={() => setAberta(false)}>
          <div className="paleta card card-lg" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onMouseDown={(e) => e.stopPropagation()}>
            <div className="paleta-busca">
              <Icon name="busca" size={18} />
              <input
                ref={inputRef}
                className="paleta-input"
                placeholder="Buscar lead, tela ou ação…"
                value={busca}
                role="combobox"
                aria-expanded="true"
                aria-controls="paleta-lista"
                aria-activedescendant={comandos[sel] ? `cmd-${comandos[sel]!.id}` : undefined}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setAberta(false)
                  } else onKeyInput(e)
                }}
              />
              <kbd className="nav-kbd">Esc</kbd>
            </div>
            <ul id="paleta-lista" className="paleta-lista" role="listbox" ref={listaRef}>
              {comandos.length === 0 && <li className="paleta-vazio muted">Nada encontrado para "{busca}".</li>}
              {comandos.map((c, i) => {
                const titulo = c.grupo !== grupoAnterior ? c.grupo : null
                grupoAnterior = c.grupo
                return (
                  <li key={c.id} role="presentation">
                    {titulo && <div className="paleta-grupo label">{titulo}</div>}
                    <div
                      id={`cmd-${c.id}`}
                      role="option"
                      aria-selected={i === sel}
                      className="paleta-item"
                      onMouseMove={() => setSel(i)}
                      onClick={c.executar}
                    >
                      <Icon name={c.icone} size={18} />
                      <span className="paleta-item-texto">
                        <span>{c.rotulo}</span>
                        {c.detalhe && <span className="muted">{c.detalhe}</span>}
                      </span>
                      {c.atalho && <kbd className="nav-kbd">{c.atalho}</kbd>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      <Modal aberto={ajuda} aoFechar={() => setAjuda(false)} eyebrow="Teclado" titulo="Atalhos">
        <table className="tabela">
          <tbody>
            {ATALHOS.map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd className="nav-kbd">{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </>
  )
}
