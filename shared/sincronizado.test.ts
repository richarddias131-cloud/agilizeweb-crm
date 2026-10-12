import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(__dirname, '..')
const destino = join(raiz, 'supabase/functions/api/_shared')

describe('cópia de shared/ na Edge Function', () => {
  const arquivos = readdirSync(join(raiz, 'shared')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  it.each(arquivos)('%s está idêntico (rode npm run sync:shared)', (f) => {
    expect(readFileSync(join(destino, f), 'utf8')).toBe(readFileSync(join(raiz, 'shared', f), 'utf8'))
  })
  it('database.types.ts está idêntico (rode npm run sync:shared)', () => {
    expect(readFileSync(join(destino, 'database.types.ts'), 'utf8')).toBe(
      readFileSync(join(raiz, 'src/lib/database.types.ts'), 'utf8'),
    )
  })
})
