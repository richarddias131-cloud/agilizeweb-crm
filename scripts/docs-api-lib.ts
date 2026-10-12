// Serializador YAML mínimo e conversão OpenAPI → ferramentas (function calling xAI/OpenAI).

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

function escalar(v: string | number | boolean | null): string {
  if (v === null) return 'null'
  if (typeof v !== 'string') return String(v)
  // Aspas sempre que houver qualquer chance de ambiguidade.
  if (v === '' || /^[\s\-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\s$|^(true|false|null|yes|no|~)$|^[\d.+-]/i.test(v) || v.includes('\n'))
    return JSON.stringify(v)
  return v
}

function chave(k: string): string {
  return /^[A-Za-z_$][\w$-]*$/.test(k) && !/^(true|false|null|yes|no)$/i.test(k) ? k : JSON.stringify(k)
}

export function paraYaml(v: unknown, nivel = 0): string {
  const ind = '  '.repeat(nivel)
  const val = v as Json
  if (Array.isArray(val)) {
    if (!val.length) return `${ind}[]\n`
    return val
      .map((item) => {
        if (item !== null && typeof item === 'object' && !(Array.isArray(item) && !item.length) && Object.keys(item).length) {
          const corpo = paraYaml(item, nivel + 1).replace(/^\s+/, '')
          return `${ind}- ${corpo}`
        }
        return `${ind}- ${item !== null && typeof item === 'object' ? (Array.isArray(item) ? '[]' : '{}') : escalar(item)}\n`
      })
      .join('')
  }
  if (val !== null && typeof val === 'object') {
    const entradas = Object.entries(val).filter(([, x]) => x !== undefined)
    if (!entradas.length) return `${ind}{}\n`
    return entradas
      .map(([k, x]) => {
        if (x !== null && typeof x === 'object') {
          const vazio = Array.isArray(x) ? !x.length : !Object.keys(x).length
          if (vazio) return `${ind}${chave(k)}: ${Array.isArray(x) ? '[]' : '{}'}\n`
          return `${ind}${chave(k)}:\n${paraYaml(x, nivel + 1)}`
        }
        return `${ind}${chave(k)}: ${escalar(x as string)}\n`
      })
      .join('')
  }
  return `${ind}${escalar(val as string)}\n`
}

type Spec = ReturnType<typeof import('../supabase/functions/api/openapi.ts').especificacaoOpenApi>
type Esquema = Record<string, unknown>

/** Resolve $ref de components/schemas e remove campos que o function calling não precisa. */
function resolver(s: unknown, spec: Spec, profundidade = 0): unknown {
  if (Array.isArray(s)) return s.map((x) => resolver(x, spec, profundidade))
  if (s && typeof s === 'object') {
    const o = s as Esquema
    if (typeof o.$ref === 'string') {
      const nome = o.$ref.split('/').pop()!
      const alvo = (spec.components.schemas as Record<string, Esquema>)[nome]
      return profundidade > 3 ? { type: 'object' } : resolver(alvo, spec, profundidade + 1)
    }
    const saida: Esquema = {}
    for (const [k, v] of Object.entries(o)) {
      if (k === 'examples' || k === 'format') continue
      saida[k] = resolver(v, spec, profundidade)
    }
    return saida
  }
  return s
}

/** Uma ferramenta por operação marcada com x-ferramenta (formato tools da API xAI/OpenAI). */
export function ferramentasGrok(spec: Spec) {
  const ferramentas: unknown[] = []
  for (const [rota, metodos] of Object.entries(spec.paths as Record<string, Record<string, Esquema>>)) {
    for (const [metodo, operacao] of Object.entries(metodos)) {
      const f = operacao['x-ferramenta'] as { nome: string; descricao: string } | undefined
      if (!f) continue
      const props: Record<string, unknown> = {}
      const obrigatorios: string[] = []
      for (const p of (operacao.parameters as Esquema[] | undefined) ?? []) {
        if (typeof p.$ref === 'string') continue // Idempotency-Key: o executor gera
        props[p.name as string] = { ...(resolver(p.schema, spec) as Esquema), description: p.description }
        if (p.required) obrigatorios.push(p.name as string)
      }
      const corpo = (operacao.requestBody as Esquema | undefined)?.content as Record<string, { schema: Esquema }> | undefined
      if (corpo) {
        const s = resolver(corpo['application/json']!.schema, spec) as Esquema
        Object.assign(props, s.properties as Esquema)
        obrigatorios.push(...((s.required as string[] | undefined) ?? []))
      }
      ferramentas.push({
        type: 'function',
        function: {
          name: f.nome,
          description: `${f.descricao} [${metodo.toUpperCase()} ${rota}]`,
          parameters: { type: 'object', properties: props, required: [...new Set(obrigatorios)], additionalProperties: false },
        },
        'x-http': { metodo: metodo.toUpperCase(), rota, escopo: operacao['x-escopo'] ?? null },
      })
    }
  }
  return ferramentas
}
