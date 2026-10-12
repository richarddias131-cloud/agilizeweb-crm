// Copia shared/*.ts (sem testes) e os tipos do banco para a Edge Function.
// A Edge Function não enxerga arquivos fora de supabase/functions no deploy,
// então mantemos uma cópia idêntica. O teste shared/sincronizado.test.ts
// falha se as cópias divergirem.  Uso: npm run sync:shared
import { copyFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const destino = join(raiz, 'supabase/functions/api/_shared')
rmSync(destino, { recursive: true, force: true })
mkdirSync(destino, { recursive: true })

for (const f of readdirSync(join(raiz, 'shared'))) {
  if (f.endsWith('.ts') && !f.endsWith('.test.ts')) copyFileSync(join(raiz, 'shared', f), join(destino, f))
}
copyFileSync(join(raiz, 'src/lib/database.types.ts'), join(destino, 'database.types.ts'))
console.log('shared/ sincronizado em supabase/functions/api/_shared/')
