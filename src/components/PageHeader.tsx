import type { ReactNode } from 'react'

type Props = { eyebrow?: string; titulo: string; acoes?: ReactNode; children?: ReactNode }

export function PageHeader({ eyebrow, titulo, acoes, children }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-texto">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{titulo}</h1>
        {children}
      </div>
      {acoes && <div className="page-header-acoes">{acoes}</div>}
    </header>
  )
}
