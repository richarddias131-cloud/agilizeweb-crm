import { useState } from 'react'
import { Skeleton } from '../components/Estados'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { atualizarWebhook, criarWebhook, excluirWebhook, listarWebhooks, obterEntrega, testarWebhook, EVENTOS_WEBHOOK, type Webhook } from '../services/webhooks'

/** Webhooks (CRM → agente): cadastro, ativação, teste e aviso de desativação automática. */
export function ConfigWebhooks() {
  const toast = useToast()
  const { dados: webhooks, recarregar } = useDados('webhooks', listarWebhooks)
  const [novo, setNovo] = useState(false)
  const [testando, setTestando] = useState<string | null>(null)
  const [verSegredo, setVerSegredo] = useState<string | null>(null)
  const desativados = (webhooks ?? []).filter((w) => !w.ativo && w.falhas_seguidas >= 10)

  async function testar(w: Webhook) {
    setTestando(w.id)
    try {
      const entregaId = await testarWebhook(w.id)
      // A resposta chega de forma assíncrona (pg_net); confere por alguns segundos.
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        const e = await obterEntrega(entregaId)
        const resp = e?.ultimo_status
        if (e && e.status === 'entregue') return toast(`Teste entregue (HTTP ${resp}).`)
        if (e && e.status !== 'enviando' && resp !== null) return toast(`O servidor respondeu HTTP ${resp}${e.ultimo_erro ? ` (${e.ultimo_erro})` : ''}.`, { tipo: 'erro' })
      }
      toast('Teste enviado. A resposta ainda não chegou; confira o status em instantes.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível testar.', { tipo: 'erro' })
    } finally {
      setTestando(null)
      void recarregar()
    }
  }

  return (
    <section className="card card-pad secao-config">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="bloco-titulo">Webhooks</h2>
          <p className="muted" style={{ fontSize: '.9rem' }}>
            O CRM avisa o agente (ou o n8n) quando algo acontece. Assinatura HMAC-SHA256 no header <code className="mono">X-Cresbi-Assinatura</code>.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setNovo(true)}>
          Novo webhook
        </button>
      </div>

      {desativados.length > 0 && (
        <div className="aviso-perigo" role="alert">
          <Icon name="x" size={18} /> {desativados.length === 1 ? 'Um webhook foi desativado' : `${desativados.length} webhooks foram desativados`} depois de 10 falhas
          seguidas. Confira o servidor de destino, use "Enviar teste" e reative.
        </div>
      )}

      {!webhooks ? (
        <Skeleton linhas={1} />
      ) : !webhooks.length ? (
        <p className="muted">Nenhum webhook. Sem eles, o agente pode sincronizar por GET /eventos.</p>
      ) : (
        <ul className="rows card lista-chaves" role="list">
          {webhooks.map((w) => (
            <li key={w.id} className={`chave-item ${w.ativo ? '' : 'chave-revogada'}`}>
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <code className="mono url-api">{w.url}</code>
                <div className="row wrap" style={{ gap: 6 }}>
                  {w.eventos.map((e) => (
                    <span key={e} className="badge">{e}</span>
                  ))}
                </div>
                <span className="muted" style={{ fontSize: '.8rem' }}>
                  {w.ativo ? 'Ativo' : 'Desativado'} · último status {w.ultimo_status ?? '—'}
                  {w.falhas_seguidas > 0 && ` · ${w.falhas_seguidas} falha(s) seguida(s)`}
                </span>
                {verSegredo === w.id ? (
                  <code className="mono url-api" style={{ userSelect: 'all' }}>{w.segredo}</code>
                ) : (
                  <button type="button" className="ulink" style={{ minHeight: 32 }} onClick={() => setVerSegredo(w.id)}>
                    Mostrar segredo
                  </button>
                )}
              </div>
              <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={testando === w.id} onClick={() => void testar(w)}>
                  {testando === w.id ? 'Testando…' : 'Enviar teste'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    void atualizarWebhook(w.id, w.ativo ? { ativo: false } : { ativo: true, falhas_seguidas: 0 }).then(() =>
                      toast(w.ativo ? 'Webhook desativado.' : 'Webhook reativado.'),
                    )
                  }
                >
                  {w.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  aria-label="Remover webhook"
                  onClick={() => window.confirm('Remover este webhook?') && void excluirWebhook(w.id).then(() => toast('Webhook removido.'))}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NovoWebhookModal aberto={novo} aoFechar={() => setNovo(false)} />
    </section>
  )
}

function NovoWebhookModal({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [eventos, setEventos] = useState<string[]>(['lead.respondeu', 'acao.aprovada', 'acao.rejeitada'])
  const [criado, setCriado] = useState<Webhook | null>(null)

  function fechar() {
    setUrl('')
    setCriado(null)
    aoFechar()
  }

  async function criar() {
    if (!/^https:\/\/\S+$/.test(url.trim())) return toast('Use uma URL https:// válida.', { tipo: 'erro' })
    if (!eventos.length) return toast('Escolha ao menos um evento.', { tipo: 'erro' })
    try {
      setCriado(await criarWebhook(url, eventos))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível criar.', { tipo: 'erro' })
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      eyebrow="Webhook"
      titulo={criado ? 'Webhook criado' : 'Novo webhook'}
      rodape={
        criado ? (
          <button type="button" className="btn btn-primary" onClick={fechar}>
            Pronto <span className="arrow">→</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void criar()}>
            Criar webhook <span className="arrow">→</span>
          </button>
        )
      }
    >
      {criado ? (
        <div className="stack">
          <p>Configure este segredo no receptor para validar a assinatura (HMAC-SHA256 do corpo):</p>
          <div className="chave-mostrada">
            <code className="mono">{criado.segredo}</code>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void navigator.clipboard.writeText(criado.segredo).then(() => toast('Segredo copiado.'))}>
              <Icon name="copiar" size={16} /> Copiar
            </button>
          </div>
          <p className="hint">Depois, use "Enviar teste" para conferir.</p>
        </div>
      ) : (
        <div className="stack">
          <div className="field">
            <label htmlFor="wh-url">URL (https)</label>
            <input id="wh-url" className="input" inputMode="url" placeholder="https://seu-servidor.com/webhooks/crm" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Eventos
            </legend>
            {EVENTOS_WEBHOOK.map((e) => (
              <label key={e.id} className="toggle escopo">
                <input type="checkbox" checked={eventos.includes(e.id)} onChange={(ev) => setEventos((s) => (ev.target.checked ? [...s, e.id] : s.filter((x) => x !== e.id)))} />
                <span>
                  {e.rotulo} <code className="mono muted" style={{ fontSize: '.75rem' }}>{e.id}</code>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
