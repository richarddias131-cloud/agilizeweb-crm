import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { supabaseConfigurado } from './lib/supabase'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { ConfigAusente } from './pages/ConfigAusente'
import { EmConstrucao } from './pages/EmConstrucao'
import { Mais } from './pages/Mais'

function Protegida({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useAuth()
  if (carregando) return <div className="tela-carregando" aria-busy="true" aria-label="Carregando" />
  if (!sessao) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  return (
    <ThemeProvider>
      {!supabaseConfigurado ? (
        <ConfigAusente />
      ) : (
        <AuthProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <Protegida>
                    <Layout />
                  </Protegida>
                }
              >
                <Route
                  index
                  element={<EmConstrucao eyebrow="01 / Hoje" titulo="Hoje" texto="A fila do dia chega na Fase 3." />}
                />
                <Route
                  path="leads"
                  element={<EmConstrucao eyebrow="02 / Leads" titulo="Leads" texto="Lista e ficha dos leads chegam na Fase 2." />}
                />
                <Route
                  path="funil"
                  element={<EmConstrucao eyebrow="03 / Funil" titulo="Funil" texto="O kanban chega na Fase 5." />}
                />
                <Route
                  path="vendas"
                  element={<EmConstrucao eyebrow="04 / Vendas" titulo="Vendas" texto="O registro de vendas chega na Fase 5." />}
                />
                <Route
                  path="painel"
                  element={<EmConstrucao eyebrow="05 / Painel" titulo="Painel" texto="Os números do mês chegam na Fase 6." />}
                />
                <Route
                  path="importar"
                  element={<EmConstrucao eyebrow="06 / Importar" titulo="Importar CSV" texto="A importação chega na Fase 6." />}
                />
                <Route
                  path="config"
                  element={<EmConstrucao eyebrow="07 / Ajustes" titulo="Configurações" texto="Catálogo, templates e cadência chegam nas próximas fases." />}
                />
                <Route path="mais" element={<Mais />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </AuthProvider>
      )}
    </ThemeProvider>
  )
}
