import type { ReactNode } from 'react'

export function Skeleton({ linhas = 4, altura = 56 }: { linhas?: number; altura?: number }) {
  return (
    <div className="card rows" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} style={{ padding: 16 }}>
          <div className="skeleton" style={{ height: altura - 32, width: `${70 - i * 7}%` }} />
        </div>
      ))}
    </div>
  )
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return (
    <div className="card card-lg empty">
      <p>{texto}</p>
      {acao}
    </div>
  )
}

export function Erro({ texto, tentarDeNovo }: { texto: string; tentarDeNovo?: () => void }) {
  return (
    <div className="card card-lg empty" role="alert">
      <span className="badge badge-danger">Erro</span>
      <p>{texto}</p>
      {tentarDeNovo && (
        <button type="button" className="btn btn-ghost" onClick={tentarDeNovo}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}
