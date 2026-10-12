// Gera docs/openapi.yaml e docs/grok-tools.json a partir de supabase/functions/api/openapi.ts.
// Uso: npm run docs:api   (Node 22+, roda TypeScript direto)
import { writeFileSync } from 'node:fs'
import { especificacaoOpenApi } from '../supabase/functions/api/openapi.ts'
import { paraYaml, ferramentasGrok } from './docs-api-lib.ts'

const raiz = new URL('..', import.meta.url).pathname
const spec = especificacaoOpenApi()
writeFileSync(`${raiz}docs/openapi.yaml`, paraYaml(spec))
writeFileSync(`${raiz}docs/grok-tools.json`, JSON.stringify(ferramentasGrok(spec), null, 2) + '\n')
console.log('docs/openapi.yaml e docs/grok-tools.json gerados.')
