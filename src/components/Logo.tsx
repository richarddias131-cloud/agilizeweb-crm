import { BRAND } from '../config/brand'

/**
 * Símbolo "Facetado" da CRESBI: losango aberto à direita (contorno na cor do texto)
 * com a pedra em ouro. Nunca girar, preencher ou inverter (manual da marca).
 */
export function SimboloCresbi({ className = 'logo-simbolo' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M45 19 L32 6 L6 32 L32 58 L45 45" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" />
      <rect x="26" y="26" width="12" height="12" transform="rotate(45 32 32)" fill="var(--gold)" />
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo" aria-label={`${BRAND.nome} ${BRAND.produto}`}>
      <SimboloCresbi />
      {!compact && (
        <>
          <span className="logo-texto">{BRAND.nome}</span>
          <span className="logo-produto">{BRAND.produto}</span>
        </>
      )}
    </span>
  )
}
