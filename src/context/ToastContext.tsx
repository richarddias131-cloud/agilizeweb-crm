import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Toast = {
  id: number
  texto: string
  tipo: 'ok' | 'erro'
  desfazer?: () => void | Promise<void>
}
type Mostrar = (texto: string, opcoes?: { tipo?: 'ok' | 'erro'; desfazer?: Toast['desfazer']; duracao?: number }) => void

const ToastCtx = createContext<Mostrar>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const remover = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const mostrar = useCallback<Mostrar>(
    (texto, opcoes = {}) => {
      const id = ++seq.current
      const toast: Toast = { id, texto, tipo: opcoes.tipo ?? 'ok', ...(opcoes.desfazer ? { desfazer: opcoes.desfazer } : {}) }
      setToasts((t) => [...t.slice(-2), toast])
      window.setTimeout(() => remover(id), opcoes.duracao ?? (opcoes.desfazer ? 5000 : 3500))
    },
    [remover],
  )

  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tipo === 'erro' ? 'toast-erro' : ''}`}>
            <span>{t.texto}</span>
            {t.desfazer && (
              <button
                type="button"
                className="toast-acao"
                onClick={() => {
                  remover(t.id)
                  void t.desfazer?.()
                }}
              >
                Desfazer
              </button>
            )}
            <button type="button" className="toast-fechar" aria-label="Fechar aviso" onClick={() => remover(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): Mostrar {
  return useContext(ToastCtx)
}
