import { Logo } from '../components/Logo'

export function ConfigAusente() {
  return (
    <div className="login">
      <div className="login-card card card-lg">
        <Logo />
        <span className="eyebrow">Configuração</span>
        <h1>Falta conectar o Supabase.</h1>
        <p className="muted">
          As variáveis <code className="mono">VITE_SUPABASE_URL</code> e{' '}
          <code className="mono">VITE_SUPABASE_ANON_KEY</code> não foram definidas neste build. Siga o passo a passo
          do <b>SETUP.md</b> (Secrets do GitHub ou arquivo <code className="mono">.env.local</code>).
        </p>
      </div>
    </div>
  )
}
