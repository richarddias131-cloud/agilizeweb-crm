import type { AcaoPendenteFila } from '../../shared/fila.ts'

/** Ações propostas pelo agente. Aprovação em 1 toque chega na Fase 4. */
export function BlocoAprovar({ acoes }: { acoes: AcaoPendenteFila[] }) {
  return (
    <section className="card bloco-fila bloco-destaque" aria-label="Para aprovar">
      <header className="card-cabecalho">
        <h2 className="bloco-titulo">Para aprovar</h2>
        <span className="badge badge-em num">{acoes.length}</span>
      </header>
      <ul className="rows" role="list">
        {acoes.map((a) => (
          <li key={a.id} className="item-fila">
            <div className="item-fila-info">
              <span className="item-fila-empresa">{a.lead?.empresa ?? a.tipo}</span>
              <span className="muted item-fila-sub">{a.justificativa}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
