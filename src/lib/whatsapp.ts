import { ABA_WHATSAPP, linkWaMe, linkWhatsappWeb } from '../../shared/whatsapp.ts'

export type ModoWhatsapp = 'auto' | 'web' | 'app' | 'perguntar'

export function ehCelular(): boolean {
  const ua = navigator.userAgent
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (matchMedia('(pointer: coarse)').matches && innerWidth < 900)
}

/** Resolve o modo efetivo (auto → app no celular, web no desktop). */
export function modoEfetivo(modo: string | null | undefined): 'web' | 'app' | 'perguntar' {
  if (modo === 'web' || modo === 'app' || modo === 'perguntar') return modo
  return ehCelular() ? 'app' : 'web'
}

/**
 * Abre o WhatsApp com a mensagem. Precisa ser chamado direto no clique (gesto do usuário).
 * Desktop: WhatsApp Web sempre na mesma aba nomeada. Celular: wa.me (abre o app).
 */
export function abrirWhatsapp(numero: string, texto: string, destino: 'web' | 'app'): void {
  if (destino === 'web') {
    const aba = window.open(linkWhatsappWeb(numero, texto), ABA_WHATSAPP)
    aba?.focus()
  } else {
    // Nova aba/app: o CRM continua aberto por trás para o "Enviei".
    const aba = window.open(linkWaMe(numero, texto), '_blank')
    if (!aba) window.location.href = linkWaMe(numero, texto)
  }
}
