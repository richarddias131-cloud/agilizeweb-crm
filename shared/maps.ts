// Extrai o nome da empresa de um link do Google Maps / Perfil do Google.

export function ehLinkGoogle(texto: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|g\.page|maps\.app\.goo\.gl)\//i.test(texto.trim())
}

/**
 * Exemplos que funcionam:
 *  https://www.google.com/maps/place/%C3%93tica+X/@-22.9,-47.0,17z/...
 *  https://www.google.com/maps/search/?api=1&query=Otica+X
 *  https://www.google.com/search?q=Otica+X+Campinas
 * Links curtos (maps.app.goo.gl) não trazem o nome: retorna null.
 */
export function extrairNomeDoLinkGoogle(link: string): string | null {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return null
  }
  if (!ehLinkGoogle(url.href)) return null

  const limpar = (s: string) => {
    let t = s.replace(/\+/g, ' ')
    try {
      t = decodeURIComponent(t)
    } catch {
      /* mantém como está */
    }
    t = t.replace(/\s+/g, ' ').trim()
    return t.length >= 2 && !/^-?\d+(\.\d+)?,/.test(t) ? t : null
  }

  const place = url.pathname.match(/\/maps\/place\/([^/@]+)/)
  if (place?.[1]) return limpar(place[1])

  for (const p of ['query', 'q']) {
    const v = url.searchParams.get(p)
    if (v) return limpar(v)
  }
  return null
}
