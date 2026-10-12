import { ESTAGIO_ROTULO, type Estagio } from '../../shared/dominio.ts'

const ATIVOS: Estagio[] = ['respondeu', 'auditoria_enviada', 'proposta_enviada', 'negociacao', 'ganho']

export function EstagioBadge({ estagio }: { estagio: Estagio }) {
  const classe = ATIVOS.includes(estagio) ? 'badge badge-em' : estagio === 'perdido' ? 'badge badge-danger' : 'badge'
  return <span className={classe}>{ESTAGIO_ROTULO[estagio]}</span>
}
