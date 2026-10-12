import { PageHeader } from '../components/PageHeader'

type Props = { eyebrow: string; titulo: string; texto: string }

export function EmConstrucao({ eyebrow, titulo, texto }: Props) {
  return (
    <div className="page">
      <PageHeader eyebrow={eyebrow} titulo={titulo} />
      <div className="card card-lg empty">
        <span className="badge">Em construção</span>
        <p>{texto}</p>
      </div>
    </div>
  )
}
