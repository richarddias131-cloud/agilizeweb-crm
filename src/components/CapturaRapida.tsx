import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { useToast } from '../context/ToastContext'
import { buscarPorWhatsapp, criarLead } from '../services/leads'
import { listarServicos } from '../services/servicos'
import { useDados } from '../hooks/useDados'
import { normalizarTelefone } from '../../shared/phone.ts'
import { extrairNomeDoLinkGoogle, ehLinkGoogle } from '../../shared/maps.ts'
import { ORIGENS, ORIGEM_ROTULO, UFS, type Origem } from '../../shared/dominio.ts'
import { ehCampoDeTexto } from '../lib/teclado'

export const SEGMENTOS_SUGERIDOS = [
  'Estética automotiva',
  'Arquitetura e interiores',
  'Restaurante',
  'Ótica',
  'Gráfica',
  'Salão de beleza',
  'Barbearia',
  'Academia',
  'Pet shop',
  'Clínica',
  'Oficina mecânica',
  'Loja de roupas',
]

type CapturaCtx = { abrir: () => void }
const Ctx = createContext<CapturaCtx>({ abrir: () => {} })

export function useCaptura(): CapturaCtx {
  return useContext(Ctx)
}

const CHAVE_ULTIMA_CIDADE = 'agz-ultima-cidade'

function lerUltimaCidade(): { cidade: string; uf: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_ULTIMA_CIDADE) ?? 'null') as { cidade: string; uf: string } | null
    return v ?? { cidade: '', uf: '' }
  } catch {
    return { cidade: '', uf: '' }
  }
}

const VAZIO = {
  empresa: '',
  whatsapp: '',
  cidade: '',
  uf: '',
  contato_nome: '',
  segmento: '',
  origem: 'prospeccao_ativa' as Origem,
  link_google: '',
  site_atual: '',
  instagram: '',
  valor_estimado: '',
  servico_interesse: '',
  tags: '',
  observacoes: '',
}

export function CapturaProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const abrir = useCallback(() => setAberto(true), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || ehCampoDeTexto(e.target)) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      setAberto(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const valor = useMemo(() => ({ abrir }), [abrir])
  return (
    <Ctx.Provider value={valor}>
      {children}
      <CapturaModal aberto={aberto} aoFechar={() => setAberto(false)} />
    </Ctx.Provider>
  )
}

function CapturaModal({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [f, setF] = useState(VAZIO)
  const [detalhes, setDetalhes] = useState(false)
  const [salvando, setSalvando] = useState<null | 'salvar' | 'abordar'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [duplicado, setDuplicado] = useState<{ id: string; empresa: string; arquivado: boolean } | null>(null)
  const [tocouTel, setTocouTel] = useState(false)
  const empresaRef = useRef<HTMLInputElement>(null)
  const { dados: servicos } = useDados('servicos', listarServicos)

  useEffect(() => {
    if (!aberto) return
    const ultima = lerUltimaCidade()
    setF({ ...VAZIO, cidade: ultima.cidade, uf: ultima.uf })
    setErro(null)
    setDuplicado(null)
    setTocouTel(false)
    setDetalhes(false)
    window.setTimeout(() => empresaRef.current?.focus(), 30)
  }, [aberto])

  const tel = useMemo(() => (f.whatsapp.trim() ? normalizarTelefone(f.whatsapp) : null), [f.whatsapp])

  // Aviso de duplicado em tempo real.
  useEffect(() => {
    setDuplicado(null)
    if (!tel?.ok) return
    let vivo = true
    const t = window.setTimeout(() => {
      buscarPorWhatsapp(tel.numero)
        .then((d) => vivo && setDuplicado(d))
        .catch(() => {})
    }, 250)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [tel])

  const set = (campo: keyof typeof VAZIO) => (v: string) => setF((x) => ({ ...x, [campo]: v }))

  function aplicarLink(link: string) {
    const nome = extrairNomeDoLinkGoogle(link)
    setF((x) => ({ ...x, link_google: link.trim(), empresa: x.empresa && !ehLinkGoogle(x.empresa) ? x.empresa : nome ?? '' }))
    if (!nome) setDetalhes(true)
  }

  const validos = f.empresa.trim() && f.cidade.trim() && tel?.ok && !duplicado

  async function salvar(modo: 'salvar' | 'abordar', e?: FormEvent) {
    e?.preventDefault()
    setTocouTel(true)
    if (!validos || !tel?.ok) {
      if (!f.empresa.trim()) setErro('Informe o nome da empresa.')
      else if (!tel?.ok) setErro(tel?.erro ?? 'Informe o WhatsApp.')
      else if (!f.cidade.trim()) setErro('Informe a cidade.')
      return
    }
    setErro(null)
    setSalvando(modo)
    try {
      const valor = f.valor_estimado ? Number(f.valor_estimado.replace(/\./g, '').replace(',', '.')) : null
      const lead = await criarLead({
        empresa: f.empresa.trim(),
        whatsapp: tel.numero,
        cidade: f.cidade.trim(),
        uf: f.uf || null,
        contato_nome: f.contato_nome.trim() || null,
        segmento: f.segmento.trim() || null,
        origem: f.origem,
        link_google: f.link_google.trim() || null,
        site_atual: f.site_atual.trim() || null,
        instagram: f.instagram.trim() || null,
        valor_estimado: valor !== null && Number.isFinite(valor) ? valor : null,
        servico_interesse: f.servico_interesse || null,
        tags: f.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        observacoes: f.observacoes.trim() || null,
      })
      try {
        localStorage.setItem(CHAVE_ULTIMA_CIDADE, JSON.stringify({ cidade: lead.cidade, uf: lead.uf ?? '' }))
      } catch {
        /* ignora */
      }
      aoFechar()
      toast(`${lead.empresa} salvo.`)
      if (modo === 'abordar') navigate(`/leads/${lead.id}?abordar=1`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      eyebrow="Captura rápida"
      titulo="Novo lead"
      rodape={
        <>
          <button type="button" className="btn btn-ghost" disabled={!!salvando} onClick={() => void salvar('salvar')}>
            {salvando === 'salvar' ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="submit" form="form-captura" className="btn btn-primary" disabled={!!salvando}>
            {salvando === 'abordar' ? 'Salvando…' : 'Salvar e abordar agora'} <span className="arrow">→</span>
          </button>
        </>
      }
    >
      <form id="form-captura" className="stack" onSubmit={(e) => void salvar('abordar', e)} noValidate>
        <div className="field">
          <label htmlFor="cap-empresa">Empresa</label>
          <input
            ref={empresaRef}
            id="cap-empresa"
            className="input"
            value={f.empresa}
            placeholder="Nome ou cole o link do Google Maps"
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value
              if (ehLinkGoogle(v)) aplicarLink(v)
              else set('empresa')(v)
            }}
          />
          {f.link_google && <span className="hint">Link do Google salvo no lead.</span>}
        </div>

        <div className="field">
          <label htmlFor="cap-whatsapp">WhatsApp</label>
          <input
            id="cap-whatsapp"
            className="input num"
            value={f.whatsapp}
            inputMode="tel"
            autoComplete="off"
            placeholder="(19) 99999-9999"
            aria-invalid={tocouTel && tel !== null && !tel.ok}
            aria-describedby="cap-whatsapp-hint"
            onBlur={() => setTocouTel(true)}
            onChange={(e) => set('whatsapp')(e.target.value)}
          />
          <span id="cap-whatsapp-hint">
            {duplicado ? (
              <span className="hint-error">
                Esse número já é {duplicado.empresa}
                {duplicado.arquivado ? ' (arquivado)' : ''} —{' '}
                <Link to={`/leads/${duplicado.id}`} onClick={aoFechar} className="ulink" style={{ minHeight: 0 }}>
                  abrir
                </Link>
              </span>
            ) : tel && !tel.ok && tocouTel ? (
              <span className="hint-error">{tel.erro}</span>
            ) : tel?.ok && tel.aviso ? (
              <span className="hint">{tel.aviso}</span>
            ) : null}
          </span>
        </div>

        <div className="captura-cidade">
          <div className="field">
            <label htmlFor="cap-cidade">Cidade</label>
            <input
              id="cap-cidade"
              className="input"
              value={f.cidade}
              autoComplete="address-level2"
              onChange={(e) => set('cidade')(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cap-uf">UF</label>
            <select id="cap-uf" className="select" value={f.uf} onChange={(e) => set('uf')(e.target.value)}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className="ulink"
          aria-expanded={detalhes}
          aria-controls="cap-detalhes"
          onClick={() => setDetalhes((d) => !d)}
        >
          {detalhes ? 'Menos detalhes' : 'Mais detalhes'}
        </button>

        {detalhes && (
          <div id="cap-detalhes" className="stack">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="cap-contato">Contato</label>
                <input id="cap-contato" className="input" value={f.contato_nome} onChange={(e) => set('contato_nome')(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cap-segmento">Segmento</label>
                <input
                  id="cap-segmento"
                  className="input"
                  list="segmentos"
                  value={f.segmento}
                  onChange={(e) => set('segmento')(e.target.value)}
                />
                <datalist id="segmentos">
                  {SEGMENTOS_SUGERIDOS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="cap-origem">Origem</label>
                <select id="cap-origem" className="select" value={f.origem} onChange={(e) => set('origem')(e.target.value)}>
                  {ORIGENS.filter((o) => o !== 'agente').map((o) => (
                    <option key={o} value={o}>
                      {ORIGEM_ROTULO[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="cap-servico">Serviço de interesse</label>
                <select
                  id="cap-servico"
                  className="select"
                  value={f.servico_interesse}
                  onChange={(e) => set('servico_interesse')(e.target.value)}
                >
                  <option value="">—</option>
                  {servicos?.filter((s) => s.ativo).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="cap-link">Link do Google (Perfil / Maps)</label>
              <input
                id="cap-link"
                className="input"
                inputMode="url"
                value={f.link_google}
                onChange={(e) => (ehLinkGoogle(e.target.value) ? aplicarLink(e.target.value) : set('link_google')(e.target.value))}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="cap-site">Site atual</label>
                <input id="cap-site" className="input" inputMode="url" value={f.site_atual} onChange={(e) => set('site_atual')(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cap-insta">Instagram</label>
                <input id="cap-insta" className="input" placeholder="@perfil" value={f.instagram} onChange={(e) => set('instagram')(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cap-valor">Valor estimado (R$)</label>
                <input
                  id="cap-valor"
                  className="input num"
                  inputMode="decimal"
                  value={f.valor_estimado}
                  onChange={(e) => set('valor_estimado')(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="cap-tags">Tags (separe por vírgula)</label>
                <input id="cap-tags" className="input" value={f.tags} onChange={(e) => set('tags')(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cap-obs">Observações</label>
              <textarea id="cap-obs" className="textarea" value={f.observacoes} onChange={(e) => set('observacoes')(e.target.value)} />
            </div>
          </div>
        )}

        {erro && (
          <p className="hint-error" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  )
}

export function Fab() {
  const { abrir } = useCaptura()
  return (
    <button type="button" className="fab" aria-label="Novo lead" onClick={abrir}>
      <Icon name="plus" size={26} />
    </button>
  )
}
