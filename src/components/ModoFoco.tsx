import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EstagioBadge } from './EstagioBadge'
import { Icon } from './Icon'
import { EditorMensagem, useEditorMensagem } from './MensagemModal'
import { useEnvio } from '../context/EnvioContext'
import { useAcoesLead } from '../hooks/useAcoesLead'
import type { ItemFila } from '../../shared/fila.ts'
import { formatarTelefone } from '../../shared/phone.ts'
import { haQuanto } from '../lib/formato'

const ROTULO_BLOCO: Record<ItemFila['bloco'], string> = {
  responderam: 'Aguardando você',
  followups: 'Follow-up',
  novos: 'Lead novo',
}

type Props = { itens: ItemFila[]; aoFechar: () => void; aoEnviar: (item: ItemFila) => void }

/** Um lead por vez, em tela cheia: mensagem pronta → Enviar → Enviei → próximo. */
export function ModoFoco({ itens: itensIniciais, aoFechar, aoEnviar }: Props) {
  const [itens] = useState(itensIniciais) // fotografia da fila ao entrar
  const [indice, setIndice] = useState(0)
  const [feitos, setFeitos] = useState(0)
  const [inicio] = useState(() => Date.now())
  const { destino, enviarAgora, pendente } = useEnvio()
  const acoes = useAcoesLead()
  const atual = itens[indice] ?? null
  const editor = useEditorMensagem(atual?.lead ?? null, atual?.acao.template_chave)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  // Esc fecha (quando não há envio pendente; aí o Esc é "Não enviei").
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente && !document.querySelector('dialog[open]')) aoFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendente, aoFechar])

  const avancar = () => setIndice((i) => i + 1)

  function enviar(d: 'web' | 'app') {
    if (!atual) return
    const item = atual
    enviarAgora(
      {
        lead: item.lead,
        texto: editor.texto.trim(),
        template: editor.template ? { id: editor.template.id, chave: editor.template.chave } : null,
        aoEnviar: () => {
          aoEnviar(item)
          setFeitos((n) => n + 1)
          avancar()
        },
      },
      d,
    )
  }

  const minutos = Math.max(1, Math.round((Date.now() - inicio) / 60000))

  return (
    <div className="foco" role="dialog" aria-modal="true" aria-label="Modo foco" ref={ref} tabIndex={-1}>
      <header className="foco-topo">
        <span className="eyebrow">
          Modo foco · <span className="num">{Math.min(indice + 1, itens.length)} de {itens.length}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={aoFechar}>
          Sair <kbd className="nav-kbd">Esc</kbd>
        </button>
      </header>
      <div className="progress foco-progresso">
        <span style={{ width: `${(indice / Math.max(itens.length, 1)) * 100}%` }} />
      </div>

      {!atual ? (
        <div className="foco-fim">
          <span className="badge badge-em">Fila concluída</span>
          <h1>
            {feitos} {feitos === 1 ? 'mensagem enviada' : 'mensagens enviadas'} em {minutos} min.
          </h1>
          <p className="muted">A fila de mensagens do dia está limpa. Confira as tarefas restantes na tela Hoje.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={aoFechar}>
            Voltar para Hoje <span className="arrow">→</span>
          </button>
        </div>
      ) : (
        <div className="foco-corpo" key={atual.lead.id}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className={`badge ${atual.bloco === 'responderam' ? 'badge-em' : ''}`}>{ROTULO_BLOCO[atual.bloco]}</span>
              <EstagioBadge estagio={atual.lead.estagio} />
              <span className="badge">{atual.acao.rotulo}</span>
            </div>
            <h1 className="foco-empresa">{atual.lead.empresa}</h1>
            <p className="muted">
              {[atual.lead.contato_nome, atual.lead.cidade, formatarTelefone(atual.lead.whatsapp)].filter(Boolean).join(' · ')}
              {' · '}
              {atual.lead.ultimo_contato_em ? `último contato ${haQuanto(atual.lead.ultimo_contato_em)}` : 'nunca contatado'}
            </p>
            <Link to={`/leads/${atual.lead.id}`} className="ulink" onClick={aoFechar}>
              Abrir ficha completa
            </Link>
          </div>

          <EditorMensagem editor={editor} idTexto="foco-texto" />

          <div className="foco-acoes">
            {destino === 'perguntar' ? (
              <div className="row wrap">
                <button type="button" className="btn btn-primary btn-lg" disabled={!editor.texto.trim() || pendente} onClick={() => enviar('web')}>
                  <Icon name="whatsapp" size={20} /> WhatsApp Web
                </button>
                <button type="button" className="btn btn-ghost btn-lg" disabled={!editor.texto.trim() || pendente} onClick={() => enviar('app')}>
                  App
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                disabled={!editor.texto.trim() || pendente}
                onClick={() => enviar(destino)}
              >
                <Icon name="whatsapp" size={20} /> Enviar no WhatsApp <span className="arrow">→</span>
              </button>
            )}
            <div className="row wrap foco-secundarias">
              <button type="button" className="ulink" disabled={pendente} onClick={avancar}>
                Pular
              </button>
              {atual.bloco !== 'novos' && (
                <button
                  type="button"
                  className="ulink"
                  disabled={pendente}
                  onClick={() => {
                    void acoes.respondeu(atual.lead)
                    aoEnviar(atual)
                    avancar()
                  }}
                >
                  Já respondeu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
