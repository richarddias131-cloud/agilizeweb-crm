import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

type Props = {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  eyebrow?: string
  children: ReactNode
  rodape?: ReactNode
  largura?: 'normal' | 'larga'
}

/** Modal com <dialog> nativo (foco preso e Esc já resolvidos pelo navegador). No celular vira folha inferior. */
export function Modal({ aberto, aoFechar, titulo, eyebrow, children, rodape, largura = 'normal' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberto && !d.open) d.showModal()
    if (!aberto && d.open) d.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      className={`modal ${largura === 'larga' ? 'modal-larga' : ''}`}
      aria-labelledby="modal-titulo"
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar()
      }}
    >
      {aberto && (
        <div className="modal-corpo">
          <header className="modal-topo">
            <div className="stack" style={{ gap: 4 }}>
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              <h2 id="modal-titulo">{titulo}</h2>
            </div>
            <button type="button" className="btn-icon" aria-label="Fechar" onClick={aoFechar}>
              <Icon name="x" />
            </button>
          </header>
          <div className="modal-conteudo">{children}</div>
          {rodape && <footer className="modal-rodape">{rodape}</footer>}
        </div>
      )}
    </dialog>
  )
}
