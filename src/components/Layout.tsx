import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { NAV_CONFIG, NAV_MOBILE, NAV_PRINCIPAL } from './nav'
import { sair } from '../services/auth'
import { Fab, useCaptura } from './CapturaRapida'
import { ouvirMudancas } from '../services/realtime'

export function Layout() {
  const { abrir } = useCaptura()
  // Propostas do agente e respostas do wa-bridge aparecem sem recarregar.
  useEffect(() => ouvirMudancas(), [])
  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <aside className="sidebar" aria-label="Navegação principal">
        <NavLink to="/" className="sidebar-logo" aria-label="Ir para Hoje">
          <Logo />
        </NavLink>
        <button type="button" className="btn btn-primary sidebar-novo" onClick={abrir}>
          <Icon name="plus" size={18} /> Novo lead <kbd className="nav-kbd nav-kbd-em">N</kbd>
        </button>
        <nav className="sidebar-nav">
          {NAV_PRINCIPAL.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-item">
              <Icon name={item.icone} />
              <span>{item.rotulo}</span>
              {item.atalho && <kbd className="nav-kbd">{item.atalho}</kbd>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to={NAV_CONFIG.to} className="nav-item">
            <Icon name={NAV_CONFIG.icone} />
            <span>{NAV_CONFIG.rotulo}</span>
          </NavLink>
          <button type="button" className="nav-item" onClick={() => void sair()}>
            <Icon name="sair" />
            <span>Sair</span>
          </button>
          <div className="sidebar-tema">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <header className="topbar">
        <NavLink to="/" aria-label="Ir para Hoje">
          <Logo />
        </NavLink>
      </header>

      <main id="conteudo" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      <Fab />

      <nav className="bottomnav" aria-label="Navegação">
        {NAV_MOBILE.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bottomnav-item">
            <Icon name={item.icone} size={22} />
            <span>{item.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
