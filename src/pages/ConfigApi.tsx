import { useState } from 'react'
import { Erro, Skeleton } from '../components/Estados'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { obterConfig, salvarConfig } from '../services/config'
import { atualizarChave, criarChave, listarChaves, listarRegistro, ESCOPOS, type Escopo } from '../services/api'
import { dataHora, haQuanto, quando } from '../lib/formato'

const ESCOPO_DESCRICAO: Record<Escopo, string> = {
  leitura: 'Consultar leads, fila, templates e tarefas',
  escrita: 'Criar e editar leads, interações, tarefas e propostas',
  relatorios: 'Ler métricas e relatórios',
  envio: 'Enviar WhatsApp direto pelo wa-bridge (só para quem já respondeu)',
}

const URL_API = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://SEU-PROJETO.supabase.co'}/functions/v1/api/v1`

/** Aba "API e agente": chaves, pausar agente, regra de envio e registro de chamadas. */
export function ConfigApi() {
  const toast = useToast()
  const { dados: config, mutar: mutarConfig } = useDados('config', obterConfig)
  const { dados: chaves, erro, recarregar } = useDados('api:chaves', listarChaves)
  const { dados: registro, recarregar: recarregarRegistro, atualizando } = useDados('api:registro', () => listarRegistro(100), false)
  const [criando, setCriando] = useState(false)

  async function alternar(campo: 'agente_pausado' | 'permitir_envio_direto_apos_resposta', valor: boolean) {
    if (!config) return
    mutarConfig((c) => ({ ...c!, [campo]: valor }))
    try {
      await salvarConfig(config.id, { [campo]: valor })
      toast(campo === 'agente_pausado' ? (valor ? 'Agente pausado: escritas bloqueadas.' : 'Agente liberado.') : 'Regra de envio salva.')
    } catch (e) {
      mutarConfig((c) => ({ ...c!, [campo]: !valor }))
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tipo: 'erro' })
    }
  }

  async function revogar(id: string, nome: string) {
    if (!window.confirm(`Revogar a chave "${nome}"? O agente perde o acesso na hora.`)) return
    try {
      await atualizarChave(id, { ativa: false })
      toast('Chave revogada.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível revogar.', { tipo: 'erro' })
    }
  }

  return (
    <div className="stack">
      <section className={`card card-pad secao-config ${config?.agente_pausado ? 'secao-alerta' : ''}`}>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="bloco-titulo">
              <Icon name="robo" size={18} /> Pausar agente
            </h2>
            <p className="muted" style={{ fontSize: '.9rem' }}>
              Ligado: a API responde <code className="mono">503 agente_pausado</code> para qualquer escrita. Leituras continuam.
            </p>
          </div>
          <label className="interruptor">
            <input type="checkbox" checked={!!config?.agente_pausado} disabled={!config} onChange={(e) => void alternar('agente_pausado', e.target.checked)} />
            <span aria-hidden="true" />
            <span className="sr-only">Pausar agente</span>
          </label>
        </div>
        <div className="row wrap" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h3>Permitir envio direto depois que o lead responder</h3>
            <p className="muted" style={{ fontSize: '.9rem' }}>
              Desligado: toda mensagem do agente vira proposta em "Para aprovar". Prospecção fria nunca sai direto, com ou sem esta opção.
            </p>
          </div>
          <label className="interruptor">
            <input
              type="checkbox"
              checked={!!config?.permitir_envio_direto_apos_resposta}
              disabled={!config}
              onChange={(e) => void alternar('permitir_envio_direto_apos_resposta', e.target.checked)}
            />
            <span aria-hidden="true" />
            <span className="sr-only">Permitir envio direto após resposta</span>
          </label>
        </div>
      </section>

      <section className="card card-pad secao-config">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="bloco-titulo">Chaves de API</h2>
            <p className="muted" style={{ fontSize: '.9rem' }}>
              Endereço da API: <code className="mono url-api">{URL_API}</code>
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>
            Nova chave <span className="arrow">→</span>
          </button>
        </div>
        {erro && !chaves ? (
          <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
        ) : !chaves ? (
          <Skeleton linhas={2} />
        ) : !chaves.length ? (
          <p className="muted">Nenhuma chave ainda. Crie a chave do Grok Bot para conectar o agente.</p>
        ) : (
          <ul className="rows card lista-chaves" role="list">
            {chaves.map((c) => (
              <li key={c.id} className={`chave-item ${c.ativa ? '' : 'chave-revogada'}`}>
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <b style={{ fontWeight: 500 }}>{c.nome}</b>
                    <code className="mono muted">{c.prefixo}…</code>
                    {!c.ativa && <span className="badge badge-danger">Revogada</span>}
                    {c.expira_em && <span className="badge">expira {quando(c.expira_em)}</span>}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {c.escopos.map((e) => (
                      <span key={e} className={`badge ${e === 'envio' ? 'badge-em' : ''}`}>{e}</span>
                    ))}
                  </div>
                  <span className="muted" style={{ fontSize: '.8rem' }}>
                    Criada {haQuanto(c.created_at)} · último uso {c.ultimo_uso_em ? haQuanto(c.ultimo_uso_em) : 'nunca'}
                  </span>
                </div>
                {c.ativa && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => void revogar(c.id, c.nome)}>
                    Revogar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad secao-config">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="bloco-titulo">Registro do agente</h2>
            <p className="muted" style={{ fontSize: '.9rem' }}>As últimas 100 chamadas à API (guardadas por 30 dias).</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={atualizando} onClick={() => void recarregarRegistro()}>
            {atualizando ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
        {!registro ? (
          <Skeleton linhas={3} altura={44} />
        ) : !registro.length ? (
          <p className="muted">Nenhuma chamada ainda.</p>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Rota</th>
                  <th>Status</th>
                  <th className="ocultar-celular">Resumo</th>
                </tr>
              </thead>
              <tbody>
                {registro.map((r) => (
                  <tr key={r.id}>
                    <td className="mono num" title={dataHora(r.criado_em)}>
                      {quando(r.criado_em)}
                    </td>
                    <td className="mono">
                      <span className="muted">{r.metodo}</span> {r.rota}
                    </td>
                    <td>
                      <span className={`badge num ${r.status_http < 300 ? 'badge-em' : r.status_http >= 500 || r.status_http === 403 ? 'badge-danger' : ''}`}>
                        {r.status_http}
                      </span>
                    </td>
                    <td className="ocultar-celular muted">{r.resumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NovaChaveModal aberto={criando} aoFechar={() => setCriando(false)} />
    </div>
  )
}

function NovaChaveModal({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const toast = useToast()
  const [nome, setNome] = useState('Grok Bot')
  const [escopos, setEscopos] = useState<Escopo[]>(['leitura', 'escrita', 'relatorios'])
  const [dias, setDias] = useState('')
  const [criada, setCriada] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function fechar() {
    setCriada(null)
    setNome('Grok Bot')
    setEscopos(['leitura', 'escrita', 'relatorios'])
    setDias('')
    aoFechar()
  }

  async function criar() {
    if (!nome.trim() || !escopos.length) return toast('Dê um nome e escolha ao menos um escopo.', { tipo: 'erro' })
    const n = dias.trim() ? Number(dias) : null
    if (n !== null && (!Number.isInteger(n) || n < 1)) return toast('Validade: número inteiro de dias.', { tipo: 'erro' })
    setSalvando(true)
    try {
      const { texto } = await criarChave(nome, escopos, n ? new Date(Date.now() + n * 86_400_000).toISOString() : null)
      setCriada(texto)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível criar.', { tipo: 'erro' })
    } finally {
      setSalvando(false)
    }
  }

  async function copiar() {
    if (!criada) return
    try {
      await navigator.clipboard.writeText(criada)
      toast('Chave copiada.')
    } catch {
      toast('Não deu para copiar automaticamente. Selecione e copie o texto.', { tipo: 'erro' })
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      eyebrow="API"
      titulo={criada ? 'Copie a chave agora' : 'Nova chave de API'}
      rodape={
        criada ? (
          <button type="button" className="btn btn-primary" onClick={fechar}>
            Já copiei <span className="arrow">→</span>
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={fechar}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void criar()}>
              {salvando ? 'Criando…' : 'Criar chave'} <span className="arrow">→</span>
            </button>
          </>
        )
      }
    >
      {criada ? (
        <div className="stack">
          <p>
            Esta é a única vez que a chave aparece. O CRM guarda só uma impressão digital (hash) dela. Se perder, revogue e crie outra.
          </p>
          <div className="chave-mostrada">
            <code className="mono">{criada}</code>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void copiar()}>
              <Icon name="copiar" size={16} /> Copiar
            </button>
          </div>
          <p className="hint">Cole no Grok Bot como header: Authorization: Bearer {criada.slice(0, 8)}…</p>
        </div>
      ) : (
        <div className="stack">
          <div className="field">
            <label htmlFor="ch-nome">Nome</label>
            <input id="ch-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
            <span className="hint">Aparece na linha do tempo junto do selo AGENTE.</span>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Escopos
            </legend>
            {ESCOPOS.map((e) => (
              <label key={e} className="toggle escopo">
                <input
                  type="checkbox"
                  checked={escopos.includes(e)}
                  onChange={(ev) => setEscopos((s) => (ev.target.checked ? [...s, e] : s.filter((x) => x !== e)))}
                />
                <span>
                  <b style={{ fontWeight: 500 }}>{e}</b> <span className="muted">— {ESCOPO_DESCRICAO[e]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="ch-dias">Validade em dias (opcional)</label>
            <input id="ch-dias" className="input num" inputMode="numeric" placeholder="Sem validade" value={dias} onChange={(e) => setDias(e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  )
}
