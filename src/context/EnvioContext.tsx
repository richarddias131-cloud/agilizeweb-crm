import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDados } from '../hooks/useDados'
import { obterConfig } from '../services/config'
import { listarTemplates, type Template } from '../services/templates'
import { listarServicos } from '../services/servicos'
import { desfazer, registrarEnvio, type LeadEnvio } from '../services/envio'
import { useToast } from './ToastContext'
import { renderizarTemplate, type Renderizado } from '../../shared/template.ts'
import { BRAND } from '../config/brand'
import { abrirWhatsapp, modoEfetivo } from '../lib/whatsapp'
import { ehCampoDeTexto } from '../lib/teclado'
import { MensagemModal } from '../components/MensagemModal'

export type Proximo = { rotulo: string; ir: () => void }

type Pendente = {
  lead: LeadEnvio
  texto: string
  template: Pick<Template, 'id' | 'chave'> | null
  aoEnviar?: (() => void) | undefined
  proximo?: Proximo | null | undefined
}

export type AbrirMensagemOpcoes = {
  lead: LeadEnvio
  templateChave?: string | null
  aoEnviar?: () => void
  proximo?: Proximo | null
}

type EnvioCtx = {
  templates: Template[]
  /** Modo efetivo de abertura do WhatsApp. */
  destino: 'web' | 'app' | 'perguntar'
  renderizar: (lead: LeadEnvio, corpo: string) => Renderizado
  templatePorChave: (chave: string | null | undefined) => Template | null
  /** Abre a prévia (modal) da mensagem. */
  abrirMensagem: (o: AbrirMensagemOpcoes) => void
  /** Abre o WhatsApp agora (chamar no clique) e mostra a barra Enviei / Não enviei. */
  enviarAgora: (p: Pendente, destino: 'web' | 'app') => void
  pendente: boolean
}

const Ctx = createContext<EnvioCtx | null>(null)
const CHAVE_PENDENTE = 'agz-envio-pendente'

export function useEnvio(): EnvioCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useEnvio fora do EnvioProvider')
  return c
}

export function EnvioProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const { dados: config } = useDados('config', obterConfig)
  const { dados: templatesTodos } = useDados('templates', listarTemplates)
  const { dados: servicos } = useDados('servicos', listarServicos)
  const [pendente, setPendente] = useState<Pendente | null>(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE_PENDENTE)
      return salvo ? (JSON.parse(salvo) as Pendente) : null
    } catch {
      return null
    }
  })
  const [proximo, setProximo] = useState<Proximo | null>(null)
  const [modal, setModal] = useState<AbrirMensagemOpcoes | null>(null)
  const registrando = useRef(false)

  const templates = useMemo(() => (templatesTodos ?? []).filter((t) => t.ativo), [templatesTodos])
  const destino = modoEfetivo(config?.whatsapp_modo)

  // Sobrevive a um recarregamento (ex.: celular voltando do app do WhatsApp).
  useEffect(() => {
    try {
      if (pendente) {
        const { lead, texto, template } = pendente
        sessionStorage.setItem(CHAVE_PENDENTE, JSON.stringify({ lead, texto, template }))
      } else sessionStorage.removeItem(CHAVE_PENDENTE)
    } catch {
      /* ignora */
    }
  }, [pendente])

  const renderizar = useCallback(
    (lead: LeadEnvio, corpo: string) => {
      const servico = servicos?.find((s) => s.id === lead.servico_interesse)
      return renderizarTemplate(corpo, {
        contato_nome: lead.contato_nome,
        empresa: lead.empresa,
        cidade: lead.cidade,
        segmento: lead.segmento,
        nota_auditoria: lead.nota_auditoria,
        servico: servico ? { nome: servico.nome, preco: Number(servico.preco) } : null,
        assinatura: config?.assinatura || BRAND.assinatura,
      })
    },
    [servicos, config],
  )

  const templatePorChave = useCallback(
    (chave: string | null | undefined) => (chave ? templates.find((t) => t.chave === chave) ?? null : null),
    [templates],
  )

  const enviarAgora = useCallback((p: Pendente, d: 'web' | 'app') => {
    abrirWhatsapp(p.lead.whatsapp, p.texto, d)
    setProximo(null)
    setPendente(p)
  }, [])

  const enviei = useCallback(async () => {
    if (!pendente || registrando.current) return
    registrando.current = true
    const p = pendente
    setPendente(null)
    p.aoEnviar?.()
    try {
      const d = await registrarEnvio(p.lead, p.texto, p.template, config)
      toast(`Enviado para ${p.lead.empresa}.`, {
        desfazer: async () => {
          try {
            await desfazer(d)
            toast('Envio desfeito.')
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Não foi possível desfazer.', { tipo: 'erro' })
          }
        },
      })
      if (p.proximo) setProximo(p.proximo)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível registrar o envio.', { tipo: 'erro' })
    } finally {
      registrando.current = false
    }
  }, [pendente, config, toast])

  const naoEnviei = useCallback(() => setPendente(null), [])

  // Enter = Enviei, Esc = Não enviei.
  useEffect(() => {
    if (!pendente) return
    function onKey(e: KeyboardEvent) {
      if (document.querySelector('dialog[open]') || ehCampoDeTexto(e.target)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        void enviei()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        naoEnviei()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendente, enviei, naoEnviei])

  // Sugestão de próximo lead some sozinha.
  useEffect(() => {
    if (!proximo) return
    const t = window.setTimeout(() => setProximo(null), 9000)
    return () => window.clearTimeout(t)
  }, [proximo])

  const valor = useMemo<EnvioCtx>(
    () => ({
      templates,
      destino,
      renderizar,
      templatePorChave,
      abrirMensagem: (o) => setModal(o),
      enviarAgora,
      pendente: !!pendente,
    }),
    [templates, destino, renderizar, templatePorChave, enviarAgora, pendente],
  )

  return (
    <Ctx.Provider value={valor}>
      {children}
      {modal && <MensagemModal opcoes={modal} aoFechar={() => setModal(null)} />}
      {pendente ? (
        <div className="barra-envio" role="region" aria-label="Confirmar envio">
          <p className="barra-envio-texto">
            Mensagem para <b>{pendente.lead.empresa}</b>. Enviou?
          </p>
          <div className="barra-envio-botoes">
            <button type="button" className="btn btn-ghost btn-lg" onClick={naoEnviei}>
              Não enviei <kbd className="nav-kbd">Esc</kbd>
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void enviei()} autoFocus>
              Enviei <kbd className="nav-kbd nav-kbd-em">Enter</kbd>
            </button>
          </div>
        </div>
      ) : proximo ? (
        <div className="barra-envio barra-envio-proximo" role="region" aria-label="Próximo lead">
          <p className="barra-envio-texto">
            Próximo da fila: <b>{proximo.rotulo}</b>
          </p>
          <div className="barra-envio-botoes">
            <button type="button" className="btn btn-ghost" onClick={() => setProximo(null)}>
              Agora não
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const p = proximo
                setProximo(null)
                p.ir()
              }}
            >
              Abrir próximo <span className="arrow">→</span>
            </button>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  )
}
