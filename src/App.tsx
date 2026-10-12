import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { supabaseConfigurado } from './lib/supabase'
import { Layout } from './components/Layout'
import { CapturaProvider } from './components/CapturaRapida'
import { Login } from './pages/Login'
import { ConfigAusente } from './pages/ConfigAusente'
import { EmConstrucao } from './pages/EmConstrucao'
import { Mais } from './pages/Mais'
import { Leads } from './pages/Leads'
import { LeadFicha } from './pages/LeadFicha'
import { Hoje } from './pages/Hoje'
import { Config } from './pages/Config'
import { Funil } from './pages/Funil'
import { Vendas } from './pages/Vendas'
import { EnvioProvider } from './context/EnvioContext'

function Protegida({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useAuth()
  if (carregando) return <div className="tela-carregando" aria-busy="true" aria-label="Carregando" />
  if (!sessao) return <Navigate to="/login" replace />
  return (
    <EnvioProvider>
      <CapturaProvider>{children}</CapturaProvider>
    </EnvioProvider>
  )
}

function Rotas() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protegida>
            <Layout />
          </Protegida>
        }
      >
        <Route index element={<Hoje />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadFicha />} />
        <Route path="funil" element={<Funil />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="painel" element={<EmConstrucao eyebrow="05 / Painel" titulo="Painel" texto="Os números do mês chegam na Fase 6." />} />
        <Route path="importar" element={<EmConstrucao eyebrow="06 / Importar" titulo="Importar CSV" texto="A importação chega na Fase 6." />} />
        <Route path="config" element={<Config />} />
        <Route path="mais" element={<Mais />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ThemeProvider>
      {!supabaseConfigurado ? (
        <ConfigAusente />
      ) : (
        <AuthProvider>
          <ToastProvider>
            <HashRouter>
              <Rotas />
            </HashRouter>
          </ToastProvider>
        </AuthProvider>
      )}
    </ThemeProvider>
  )
}
