import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Icon } from '../components/Icon'
import { ThemeToggle } from '../components/ThemeToggle'
import { NAV_CONFIG, NAV_PRINCIPAL } from '../components/nav'
import { sair } from '../services/auth'

const EXTRAS = [...NAV_PRINCIPAL.filter((i) => ['/painel', '/importar'].includes(i.to)), NAV_CONFIG]

export function Mais() {
  return (
    <div className="page">
      <PageHeader eyebrow="Menu" titulo="Mais" />
      <div className="card rows">
        {EXTRAS.map((item) => (
          <Link key={item.to} to={item.to} className="lista-link">
            <Icon name={item.icone} />
            <span>{item.rotulo}</span>
            <Icon name="seta" size={16} className="muted" />
          </Link>
        ))}
        <div className="lista-link">
          <Icon name="sol" />
          <span>Tema</span>
          <ThemeToggle />
        </div>
        <button type="button" className="lista-link" onClick={() => void sair()}>
          <Icon name="sair" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  )
}
