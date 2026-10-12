import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useEnvio, type Proximo } from '../context/EnvioContext'
import { useToast } from '../context/ToastContext'
import { aplicarMudancaEstagio, decidirAcao } from '../services/acoes'
import { mutarFila } from '../services/fila'
import type { AcaoPendenteFila } from '../../shared/fila.ts'
import { ESTAGIO_ROTULO, ehEstagio } from '../../shared/dominio.ts'
import { ehCampoDeTexto } from '../lib/teclado'
import { haQuanto } from '../lib/formato'

const ROTULO_TIPO: Record<string, string> = {
  enviar_mensagem: 'Mensagem',
  mudar_estagio: 'Mudar estágio',
  criar_venda: 'Venda',
  outro: 'Outro',
}

function textoDe(a: AcaoPendenteFila): string {
  return typeof a.payload.texto === 'string' ? a.payload.texto : ''
}

function resumo(a: AcaoPendenteFila): string {
  if (a.tipo === 'mudar_estagio' && ehEstagio(a.payload.estagio))
    return `Mover para ${ESTAGIO_ROTULO[a.payload.estagio]}${typeof a.payload.motivo_perda === 'string' ? ` (${a.payload.motivo_perda})` : ''}`
  if (a.tipo === 'criar_venda') return 'Registrar uma venda para este lead'
  return ''
}

/** "Para aprovar": propostas do Grok Bot com Aprovar / Editar e aprovar / Rejeitar (Shift + A aprova tudo). */
export function BlocoAprovar({ acoes }: { acoes: AcaoPendenteFila[] }) {
  const { enviarAgora, abrirMensagem, destino, templates } = useEnvio()
  const toast = useToast()
  const navigate = useNavigate()
  const acoesRef = useRef(acoes)
  acoesRef.current = acoes

  const tirar = (id: string) => mutarFila((f) => ({ ...f, para_aprovar: f.para_aprovar.filter((x) => x.id !== id) }))
  const templateDe = (a: AcaoPendenteFila) => {
    const id = typeof a.payload.template_id === 'string' ? a.payload.template_id : null
    const t = id ? templates.find((x) => x.id === id) : undefined
    return t ? { id: t.id, chave: t.chave } : null
  }

  /** Mensagem: abre o WhatsApp com o texto do agente; só conta como aprovada no "Enviei". */
  function aprovarMensagem(a: AcaoPendenteFila, proximo?: Proximo | null) {
    if (!a.lead) return
    if (a.lead.opt_out) {
      toast('Esse lead está com opt-out. Rejeite a proposta.', { tipo: 'erro' })
      return
    }
    enviarAgora(
      {
        lead: a.lead,
        texto: textoDe(a),
        template: templateDe(a),
        aoEnviar: () => {
          tirar(a.id)
          void decidirAcao(a.id, 'aprovada')
        },
        proximo,
      },
      destino === 'perguntar' ? 'web' : destino,
    )
  }

  async function aprovarOutra(a: AcaoPendenteFila): Promise<boolean> {
    try {
      if (a.tipo === 'mudar_estagio' && a.lead && ehEstagio(a.payload.estagio)) {
        const motivo = typeof a.payload.motivo_perda === 'string' ? a.payload.motivo_perda : null
        await aplicarMudancaEstagio(a.lead.id, a.payload.estagio, motivo, a.chave_nome)
      }
      tirar(a.id)
      await decidirAcao(a.id, 'aprovada')
      if (a.tipo === 'criar_venda' && a.lead) navigate(`/leads/${a.lead.id}?venda=1`)
      return true
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível aprovar.', { tipo: 'erro' })
      return false
    }
  }

  async function aprovar(a: AcaoPendenteFila) {
    if (a.tipo === 'enviar_mensagem') return aprovarMensagem(a)
    if (await aprovarOutra(a)) toast('Aprovado.')
  }

  async function rejeitar(a: AcaoPendenteFila) {
    tirar(a.id)
    try {
      await decidirAcao(a.id, 'rejeitada')
      toast('Proposta rejeitada.', { desfazer: () => decidirAcao(a.id, 'pendente') })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível rejeitar.', { tipo: 'erro' })
    }
  }

  // Shift + A: aprova tudo (com confirmação). Mensagens abrem uma a uma, em sequência.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.shiftKey && e.key.toLowerCase() === 'a') || e.metaKey || e.ctrlKey || ehCampoDeTexto(e.target)) return
      if (document.querySelector('dialog[open]')) return
      const lista = acoesRef.current
      if (!lista.length) return
      e.preventDefault()
      const msgs = lista.filter((a) => a.tipo === 'enviar_mensagem' && a.lead && !a.lead.opt_out)
      const outras = lista.filter((a) => a.tipo !== 'enviar_mensagem')
      if (!window.confirm(`Aprovar ${lista.length} proposta(s) do agente?${msgs.length ? ` As ${msgs.length} mensagem(ns) vão abrir no WhatsApp uma de cada vez.` : ''}`)) return
      void Promise.all(outras.map(aprovarOutra)).then((r) => r.some(Boolean) && toast(`${r.filter(Boolean).length} aprovada(s).`))
      const encadear = (i: number): Proximo | null => {
        const prox = msgs[i]
        return prox ? { rotulo: `${prox.lead!.empresa} — mensagem do agente`, ir: () => aprovarMensagem(prox, encadear(i + 1)) } : null
      }
      if (msgs[0]) aprovarMensagem(msgs[0], encadear(1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [destino, templates])

  return (
    <section className="card bloco-fila bloco-destaque" aria-label="Para aprovar">
      <header className="card-cabecalho">
        <h2 className="bloco-titulo">
          <Icon name="robo" size={18} /> Para aprovar
        </h2>
        <span className="row" style={{ gap: 8 }}>
          {acoes.length > 1 && (
            <span className="muted mono dica-teclado" style={{ fontSize: '.7rem' }}>
              Shift + A aprova tudo
            </span>
          )}
          <span className="badge badge-em num">{acoes.length}</span>
        </span>
      </header>
      <ul className="rows" role="list">
        {acoes.map((a) => {
          const msg = a.tipo === 'enviar_mensagem'
          return (
            <li key={a.id} className="aprovar-item">
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="badge">{ROTULO_TIPO[a.tipo] ?? a.tipo}</span>
                {a.lead ? (
                  <Link to={`/leads/${a.lead.id}`} className="aprovar-empresa">
                    {a.lead.empresa}
                  </Link>
                ) : (
                  <span className="aprovar-empresa">Sem lead</span>
                )}
                {a.lead?.opt_out && <span className="badge badge-danger">Opt-out</span>}
                <span className="muted mono" style={{ fontSize: '.7rem', marginLeft: 'auto' }}>
                  {a.chave_nome ?? 'Agente'} · {haQuanto(a.created_at)}
                </span>
              </div>
              {msg ? <p className="previa-balao">{textoDe(a)}</p> : resumo(a) && <p>{resumo(a)}</p>}
              {a.justificativa && (
                <p className="aprovar-justificativa">
                  <span className="label">Por quê</span> {a.justificativa}
                </p>
              )}
              <div className="aprovar-botoes">
                <button type="button" className="btn btn-primary btn-sm" disabled={!!a.lead?.opt_out && msg} onClick={() => void aprovar(a)}>
                  <Icon name="check" size={16} /> Aprovar
                </button>
                {msg && a.lead && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={a.lead.opt_out}
                    onClick={() =>
                      abrirMensagem({
                        lead: a.lead!,
                        textoInicial: { texto: textoDe(a), templateId: templateDe(a)?.id ?? null },
                        aoEnviar: () => {
                          tirar(a.id)
                          void decidirAcao(a.id, 'aprovada')
                        },
                      })
                    }
                  >
                    <Icon name="nota" size={16} /> Editar e aprovar
                  </button>
                )}
                <button type="button" className="btn btn-danger btn-sm" onClick={() => void rejeitar(a)}>
                  <Icon name="x" size={16} /> Rejeitar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
