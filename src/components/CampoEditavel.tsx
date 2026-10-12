import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type Opcao = { valor: string; rotulo: string }
type Props = {
  rotulo: string
  valor: string | null | undefined
  /** Texto exibido quando não está editando (padrão: o próprio valor). */
  exibir?: ReactNode
  tipo?: 'texto' | 'numero' | 'url' | 'tel' | 'textarea' | 'select'
  opcoes?: Opcao[]
  placeholder?: string
  salvar: (v: string) => Promise<void>
}

/** Campo com edição inline: toque para editar, Enter/fora salva, Esc cancela. */
export function CampoEditavel({ rotulo, valor, exibir, tipo = 'texto', opcoes, placeholder, salvar }: Props) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(valor ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null)

  useEffect(() => {
    if (!editando) setRascunho(valor ?? '')
  }, [valor, editando])

  useEffect(() => {
    if (editando) ref.current?.focus()
  }, [editando])

  async function confirmar() {
    if (rascunho === (valor ?? '')) {
      setEditando(false)
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await salvar(rascunho)
      setEditando(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
      ref.current?.focus()
    } finally {
      setSalvando(false)
    }
  }

  const id = `campo-${rotulo.toLowerCase().replace(/\W+/g, '-')}`
  const comum = {
    id,
    ref,
    value: rascunho,
    disabled: salvando,
    placeholder,
    'aria-invalid': !!erro,
    onBlur: () => void confirmar(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setRascunho(valor ?? '')
        setErro(null)
        setEditando(false)
      }
      if (e.key === 'Enter' && (tipo !== 'textarea' || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void confirmar()
      }
    },
  }

  return (
    <div className="campo">
      <label className="label" htmlFor={id}>
        {rotulo}
      </label>
      {editando ? (
        <div className="campo-edicao">
          {tipo === 'textarea' ? (
            <textarea className="textarea" {...comum} onChange={(e) => setRascunho(e.target.value)} />
          ) : tipo === 'select' ? (
            <select
              className="select"
              {...comum}
              onChange={(e) => {
                setRascunho(e.target.value)
              }}
            >
              <option value="">—</option>
              {opcoes?.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={`input ${tipo === 'numero' || tipo === 'tel' ? 'num' : ''}`}
              inputMode={tipo === 'numero' ? 'decimal' : tipo === 'url' ? 'url' : tipo === 'tel' ? 'tel' : 'text'}
              {...comum}
              onChange={(e) => setRascunho(e.target.value)}
            />
          )}
          {erro && <span className="hint-error">{erro}</span>}
        </div>
      ) : (
        <button type="button" id={id} className="campo-valor" onClick={() => setEditando(true)}>
          {valor ? exibir ?? valor : <span className="muted">{placeholder ?? 'Adicionar'}</span>}
        </button>
      )}
    </div>
  )
}
