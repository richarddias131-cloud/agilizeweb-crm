// Importação de leads em lote. Mesma regra para o CSV da tela e para POST /leads/lote.
import { normalizarTelefone } from './phone.ts'
import { UFS } from './dominio.ts'
import { extrairNomeDoLinkGoogle } from './maps.ts'

export const CAMPOS_IMPORTACAO = [
  { campo: 'empresa', rotulo: 'Empresa', obrigatorio: true, sinonimos: ['empresa', 'nome', 'nome da empresa', 'razao social', 'estabelecimento', 'negocio', 'loja', 'name', 'title', 'company'] },
  { campo: 'whatsapp', rotulo: 'WhatsApp', obrigatorio: true, sinonimos: ['whatsapp', 'whats', 'wpp', 'zap', 'telefone', 'fone', 'celular', 'tel', 'phone', 'numero', 'contato telefone'] },
  { campo: 'cidade', rotulo: 'Cidade', obrigatorio: false, sinonimos: ['cidade', 'municipio', 'city', 'localidade'] },
  { campo: 'uf', rotulo: 'UF', obrigatorio: false, sinonimos: ['uf', 'estado', 'state'] },
  { campo: 'contato_nome', rotulo: 'Contato', obrigatorio: false, sinonimos: ['contato', 'nome do contato', 'responsavel', 'dono', 'proprietario', 'contact'] },
  { campo: 'segmento', rotulo: 'Segmento', obrigatorio: false, sinonimos: ['segmento', 'categoria', 'ramo', 'nicho', 'category', 'tipo'] },
  { campo: 'link_google', rotulo: 'Link do Google', obrigatorio: false, sinonimos: ['link google', 'google', 'maps', 'google maps', 'link maps', 'url maps', 'perfil google', 'link'] },
  { campo: 'site_atual', rotulo: 'Site', obrigatorio: false, sinonimos: ['site', 'website', 'url', 'pagina'] },
  { campo: 'instagram', rotulo: 'Instagram', obrigatorio: false, sinonimos: ['instagram', 'insta', 'ig'] },
  { campo: 'valor_estimado', rotulo: 'Valor estimado', obrigatorio: false, sinonimos: ['valor', 'valor estimado', 'ticket'] },
  { campo: 'tags', rotulo: 'Tags', obrigatorio: false, sinonimos: ['tags', 'etiquetas', 'tag'] },
  { campo: 'observacoes', rotulo: 'Observações', obrigatorio: false, sinonimos: ['observacoes', 'observacao', 'obs', 'notas', 'nota', 'comentarios', 'endereco'] },
] as const

export type CampoImportacao = (typeof CAMPOS_IMPORTACAO)[number]['campo']
export type Mapeamento = Partial<Record<CampoImportacao, string>>
export type LinhaBruta = Record<string, unknown>

export type LeadImportado = {
  empresa: string
  whatsapp: string
  cidade: string
  uf: string | null
  contato_nome: string | null
  segmento: string | null
  link_google: string | null
  site_atual: string | null
  instagram: string | null
  valor_estimado: number | null
  tags: string[]
  observacoes: string | null
  origem: string
}

export type Rejeitado = { linha: number; empresa: string; whatsapp: string; motivo: string }
export type ResultadoImportacao = { validos: LeadImportado[]; duplicados: Rejeitado[]; invalidos: Rejeitado[] }

const sem = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Sugere qual coluna do CSV vai em cada campo do CRM, pelo nome da coluna. */
export function sugerirMapeamento(colunas: string[]): Mapeamento {
  const mapa: Mapeamento = {}
  const usadas = new Set<string>()
  const norm = colunas.map((c) => ({ original: c, n: sem(c) }))
  // 1º: nome exato; 2º: a coluna contém o sinônimo.
  for (const passo of ['exato', 'contem'] as const) {
    for (const def of CAMPOS_IMPORTACAO) {
      if (mapa[def.campo]) continue
      const achada = norm.find(
        (c) => !usadas.has(c.original) && def.sinonimos.some((s) => (passo === 'exato' ? c.n === s : c.n.includes(s) && s.length >= 3)),
      )
      if (achada) {
        mapa[def.campo] = achada.original
        usadas.add(achada.original)
      }
    }
  }
  return mapa
}

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim()
const ouNulo = (v: unknown): string | null => texto(v) || null

export function lerValor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null
  const t = texto(v).replace(/[R$\s]/g, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function lerUf(v: unknown): string | null {
  const t = texto(v).toUpperCase()
  return (UFS as readonly string[]).includes(t) ? t : null
}

function lerTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(texto).filter(Boolean)
  return texto(v)
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Valida e normaliza as linhas: telefone (55DDDNUMERO), duplicados no próprio
 * arquivo e na base (`existentes` = números já cadastrados) e campos opcionais.
 * `linha` nos relatórios é 1-based, contando a partir da primeira linha de dados.
 */
export function prepararImportacao(
  linhas: LinhaBruta[],
  mapa: Mapeamento | null,
  existentes: Set<string>,
  opcoes: { tag?: string | null; origem?: string } = {},
): ResultadoImportacao {
  const res: ResultadoImportacao = { validos: [], duplicados: [], invalidos: [] }
  const vistos = new Set<string>()
  const pegar = (l: LinhaBruta, campo: CampoImportacao): unknown => (mapa ? (mapa[campo] ? l[mapa[campo]!] : undefined) : l[campo])

  linhas.forEach((l, i) => {
    const linha = i + 1
    const link = ouNulo(pegar(l, 'link_google'))
    const empresa = texto(pegar(l, 'empresa')) || (link ? extrairNomeDoLinkGoogle(link) ?? '' : '')
    const telBruto = texto(pegar(l, 'whatsapp'))
    if (!empresa && !telBruto) return // linha vazia: ignora em silêncio
    if (!empresa) {
      res.invalidos.push({ linha, empresa, whatsapp: telBruto, motivo: 'Sem nome da empresa' })
      return
    }
    const tel = normalizarTelefone(telBruto)
    if (!tel.ok) {
      res.invalidos.push({ linha, empresa, whatsapp: telBruto, motivo: tel.erro })
      return
    }
    if (existentes.has(tel.numero)) {
      res.duplicados.push({ linha, empresa, whatsapp: tel.numero, motivo: 'Já cadastrado no CRM' })
      return
    }
    if (vistos.has(tel.numero)) {
      res.duplicados.push({ linha, empresa, whatsapp: tel.numero, motivo: 'Repetido no arquivo' })
      return
    }
    vistos.add(tel.numero)
    const tags = lerTags(pegar(l, 'tags'))
    if (opcoes.tag && !tags.includes(opcoes.tag)) tags.push(opcoes.tag)
    res.validos.push({
      empresa,
      whatsapp: tel.numero,
      cidade: texto(pegar(l, 'cidade')),
      uf: lerUf(pegar(l, 'uf')),
      contato_nome: ouNulo(pegar(l, 'contato_nome')),
      segmento: ouNulo(pegar(l, 'segmento')),
      link_google: link,
      site_atual: ouNulo(pegar(l, 'site_atual')),
      instagram: ouNulo(pegar(l, 'instagram')),
      valor_estimado: lerValor(pegar(l, 'valor_estimado')),
      tags,
      observacoes: ouNulo(pegar(l, 'observacoes')),
      origem: opcoes.origem ?? 'importacao',
    })
  })
  return res
}

/** "Prospecção Campinas.csv" + data → "prospeccao-campinas-2026-10-12" */
export function tagDaCampanha(nomeArquivo: string, data: Date = new Date()): string {
  const base = sem(nomeArquivo.replace(/\.[^.]+$/, ''))
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  const d = data.toISOString().slice(0, 10)
  return `${base || 'importacao'}-${d}`
}
