// Links de envio do WhatsApp (Fase A: sem servidor).

export function linkWaMe(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

export function linkWhatsappWeb(numero: string, texto: string): string {
  return `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`
}

/** Nome da aba reutilizada pelo WhatsApp Web (não acumula abas). */
export const ABA_WHATSAPP = 'cresbi-wa'
