// Renderização de templates de mensagem. Mesma função na tela e na API.

export const VARIAVEIS = ['nome', 'empresa', 'cidade', 'segmento', 'nota', 'servico', 'preco', 'assinatura'] as const
export type Variavel = (typeof VARIAVEIS)[number]

export const VARIAVEL_DESCRICAO: Record<Variavel, string> = {
  nome: 'Primeiro nome do contato (ou "tudo bem")',
  empresa: 'Nome da empresa',
  cidade: 'Cidade',
  segmento: 'Segmento',
  nota: 'Nota da auditoria (0–100)',
  servico: 'Serviço de interesse',
  preco: 'Preço do serviço de interesse',
  assinatura: 'Sua assinatura',
}

export type DadosTemplate = {
  contato_nome?: string | null
  empresa?: string | null
  cidade?: string | null
  segmento?: string | null
  nota_auditoria?: number | null
  servico?: { nome: string; preco: number } | null
  assinatura?: string | null
}

export type Renderizado = {
  texto: string
  /** Variáveis usadas no template que ficaram sem valor (aviso na prévia). */
  faltando: Variavel[]
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

export function valoresTemplate(d: DadosTemplate): Record<Variavel, string> {
  return {
    nome: primeiroNome(d.contato_nome) || 'tudo bem',
    empresa: d.empresa?.trim() ?? '',
    cidade: d.cidade?.trim() ?? '',
    segmento: d.segmento?.trim().toLowerCase() ?? '',
    nota: d.nota_auditoria === null || d.nota_auditoria === undefined ? '' : String(d.nota_auditoria),
    servico: d.servico?.nome ?? '',
    // Intl usa espaço não separável depois de "R$"; trocamos por espaço comum para o WhatsApp.
    preco: d.servico ? moeda.format(d.servico.preco).replace(/ /g, ' ') : '',
    assinatura: d.assinatura?.trim() ?? '',
  }
}

/** Substitui {{variavel}} (com ou sem espaços dentro das chaves). Variáveis desconhecidas ficam como estão. */
export function renderizarTemplate(corpo: string, d: DadosTemplate): Renderizado {
  const valores = valoresTemplate(d)
  const faltando = new Set<Variavel>()
  const texto = corpo.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (original, nomeBruto: string) => {
    const nome = nomeBruto.toLowerCase() as Variavel
    if (!(VARIAVEIS as readonly string[]).includes(nome)) return original
    const v = valores[nome]
    if (!v && nome !== 'nome') faltando.add(nome)
    return v
  })
  return { texto: texto.replace(/[ \t]{2,}/g, ' ').trim(), faltando: [...faltando] }
}
