import { BRAND } from '../config/brand'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo" aria-label={`${BRAND.nome} ${BRAND.produto}`}>
      <svg viewBox="25.5 22.5 49 55" aria-hidden="true">
        <polyline
          points="30,27 50,50 30,73"
          fill="none"
          stroke="#2EE59D"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          className="logo-seta2"
          points="50,27 70,50 50,73"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <>
          <span className="logo-texto">
            {BRAND.logoParte1}
            <b>{BRAND.logoParte2}</b>
          </span>
          <span className="mono logo-produto">{BRAND.produto}</span>
        </>
      )}
    </span>
  )
}
