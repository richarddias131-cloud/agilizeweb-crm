import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { useEnvio, type AbrirMensagemOpcoes } from '../context/EnvioContext'
import type { LeadEnvio } from '../services/envio'
import type { Template } from '../services/templates'
import { VARIAVEL_DESCRICAO } from '../../shared/template.ts'

/** Estado do editor de mensagem: template escolhido + texto (editável). */
export function useEditorMensagem(
  lead: LeadEnvio | null,
  templateChaveInicial: string | null | undefined,
  textoInicial?: { texto: string; templateId: string | null },
) {
  const { templates, renderizar, templatePorChave } = useEnvio()
  // undefined = usar o template sugerido; null = texto livre; string = id escolhido.
  const [escolhaId, setEscolhaId] = useState<string | null | undefined>(textoInicial ? textoInicial.templateId : undefined)
  const [texto, setTexto] = useState(textoInicial?.texto ?? '')
  const [editado, setEditado] = useState(!!textoInicial)

  // Troca de lead (Modo foco): volta para a sugestão. Refetch de templates não apaga o que foi digitado.
  useEffect(() => {
    if (textoInicial) return
    setEscolhaId(undefined)
    setEditado(false)
  }, [lead?.id, templateChaveInicial, textoInicial])

  const template: Template | null =
    escolhaId === undefined
      ? templatePorChave(templateChaveInicial)
      : escolhaId === null
        ? null
        : templates.find((t) => t.id === escolhaId) ?? null

  const renderizado = useMemo(
    () => (lead && template ? renderizar(lead, template.corpo) : { texto: '', faltando: [] }),
    [lead, template, renderizar],
  )

  useEffect(() => {
    if (!editado) setTexto(renderizado.texto)
  }, [renderizado.texto, editado])

  return {
    templates,
    template,
    escolher: (t: Template | null) => {
      setEscolhaId(t ? t.id : null)
      setEditado(false)
    },
    texto,
    editar: (v: string) => {
      setTexto(v)
      setEditado(true)
    },
    faltando: editado ? [] : renderizado.faltando,
  }
}

type Editor = ReturnType<typeof useEditorMensagem>

export function EditorMensagem({ editor, idTexto = 'msg-texto' }: { editor: Editor; idTexto?: string }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="chips" role="radiogroup" aria-label="Template">
        {editor.templates.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={editor.template?.id === t.id}
            className="chip"
            onClick={() => editor.escolher(t)}
          >
            {t.nome}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={editor.template === null}
          className="chip"
          onClick={() => editor.escolher(null)}
        >
          Texto livre
        </button>
      </div>
      <label className="sr-only" htmlFor={idTexto}>
        Mensagem
      </label>
      <textarea
        id={idTexto}
        className="textarea mensagem-texto"
        value={editor.texto}
        placeholder="Escreva a mensagem"
        onChange={(e) => editor.editar(e.target.value)}
      />
      {editor.faltando.length > 0 && (
        <p className="hint-error">
          Sem valor para: {editor.faltando.map((v) => VARIAVEL_DESCRICAO[v].toLowerCase()).join(', ')}. Complete no lead ou ajuste o
          texto.
        </p>
      )}
    </div>
  )
}

export function MensagemModal({ opcoes, aoFechar }: { opcoes: AbrirMensagemOpcoes; aoFechar: () => void }) {
  const { destino, enviarAgora } = useEnvio()
  const { lead } = opcoes
  const editor = useEditorMensagem(lead, opcoes.templateChave, opcoes.textoInicial)
  const vazio = !editor.texto.trim()

  function enviar(d: 'web' | 'app') {
    enviarAgora(
      {
        lead,
        texto: editor.texto.trim(),
        template: editor.template ? { id: editor.template.id, chave: editor.template.chave } : null,
        aoEnviar: opcoes.aoEnviar,
        proximo: opcoes.proximo,
      },
      d,
    )
    aoFechar()
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      eyebrow={opcoes.textoInicial ? 'Editar e aprovar' : 'WhatsApp'}
      titulo={lead.empresa}
      largura="larga"
      rodape={
        lead.opt_out ? (
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Fechar
          </button>
        ) : destino === 'perguntar' ? (
          <>
            <button type="button" className="btn btn-ghost" disabled={vazio} onClick={() => enviar('app')}>
              Abrir no app
            </button>
            <button type="button" className="btn btn-primary" disabled={vazio} onClick={() => enviar('web')}>
              <Icon name="whatsapp" size={18} /> WhatsApp Web <span className="arrow">→</span>
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" disabled={vazio} onClick={() => enviar(destino)}>
            <Icon name="whatsapp" size={18} /> Enviar no WhatsApp <span className="arrow">→</span>
          </button>
        )
      }
    >
      {lead.opt_out ? (
        <p className="hint-error">Esse lead pediu para não receber mensagens (opt-out). O envio está bloqueado.</p>
      ) : (
        <EditorMensagem editor={editor} />
      )}
    </Modal>
  )
}
