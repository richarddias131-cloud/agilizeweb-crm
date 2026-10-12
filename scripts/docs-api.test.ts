import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { especificacaoOpenApi } from '../supabase/functions/api/openapi.ts'
import { ferramentasGrok, paraYaml } from './docs-api-lib.ts'

const raiz = join(__dirname, '..')

describe('documentação da API está em dia (rode npm run docs:api)', () => {
  const spec = especificacaoOpenApi()
  it('docs/openapi.yaml', () => {
    expect(readFileSync(join(raiz, 'docs/openapi.yaml'), 'utf8')).toBe(paraYaml(spec))
  })
  it('docs/grok-tools.json', () => {
    expect(JSON.parse(readFileSync(join(raiz, 'docs/grok-tools.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(ferramentasGrok(spec))))
  })
  it('toda ferramenta tem nome único e descrição', () => {
    const nomes = ferramentasGrok(spec).map((f) => (f as { function: { name: string; description: string } }).function)
    expect(new Set(nomes.map((n) => n.name)).size).toBe(nomes.length)
    nomes.forEach((n) => expect(n.description.length).toBeGreaterThan(30))
  })
})
