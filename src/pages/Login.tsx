import { useState, type CSSProperties, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { entrar } from '../services/auth'

export function Login() {
  const { sessao } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (sessao) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email.trim(), senha)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <form className="login-card card card-lg" onSubmit={onSubmit} noValidate>
        <Logo />
        <div className="stack" style={{ '--gap': '6px' } as CSSProperties}>
          <span className="eyebrow">01 / Entrar</span>
          <h1>Acesse o CRM.</h1>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        {erro && (
          <p className="hint-error" role="alert">
            {erro}
          </p>
        )}
        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={enviando || !email || !senha}>
          {enviando ? 'Entrando…' : 'Entrar'} <span className="arrow">→</span>
        </button>
      </form>
    </div>
  )
}
