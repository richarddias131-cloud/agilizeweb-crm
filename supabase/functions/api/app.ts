// Pipeline da API: rota → autenticação → limite → pausa → escopo → idempotência → handler → log.
import { ErroApi, erros } from './lib/erros.ts'
import { sha256Hex } from './lib/util.ts'
import type { ApiChave, AtorCtx, Config, Deps, Escopo } from './lib/tipos.ts'
import { ROTAS } from './rotas/index.ts'
import { especificacaoOpenApi } from './openapi.ts'

export type Ctx = {
  deps: Deps
  userId: string
  chave: ApiChave
  config: Config | null
  ator: AtorCtx
  agora: Date
  params: Record<string, string>
  query: URLSearchParams
  corpo: unknown
}

export type Resposta = { status: number; corpo: unknown; resumo?: string }

export type Rota = {
  metodo: 'GET' | 'POST' | 'PATCH'
  padrao: string
  /** null = rota pública (sem chave). */
  escopo: Escopo | null
  /** Escritas são bloqueadas pelo "Pausar agente". */
  escrita: boolean
  executar: (ctx: Ctx) => Promise<Resposta>
}

const LIMITE_POR_MINUTO = 60

const CABECALHOS_BASE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  // CORS fechado: sem Access-Control-Allow-Origin. A API é para servidores.
  'X-Content-Type-Options': 'nosniff',
}

function json(status: number, corpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(corpo), { status, headers: { ...CABECALHOS_BASE, ...extra } })
}

function corpoErro(e: ErroApi) {
  return { erro: { codigo: e.codigo, mensagem: e.message, detalhes: e.detalhes } }
}

/** "/functions/v1/api/v1/leads/x" ou "/api/v1/leads/x" → "/leads/x" */
export function extrairRota(pathname: string): string | null {
  const i = pathname.indexOf('/api/v1')
  let resto: string | null = null
  if (i >= 0) resto = pathname.slice(i + 7)
  else if (pathname.startsWith('/v1')) resto = pathname.slice(3)
  if (resto === null) return null
  return (resto.replace(/\/+$/, '') || '/').replace(/\/{2,}/g, '/')
}

function casar(padrao: string, rota: string): Record<string, string> | null {
  const p = padrao.split('/')
  const r = rota.split('/')
  if (p.length !== r.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(r[i]!)
    else if (seg !== r[i]) return null
  }
  return params
}

function encontrarRota(metodo: string, rota: string): { rota: Rota; params: Record<string, string> } | 'metodo' | null {
  let existeOutroMetodo = false
  for (const def of ROTAS) {
    const params = casar(def.padrao, rota)
    if (!params) continue
    if (def.metodo === metodo) return { rota: def, params }
    existeOutroMetodo = true
  }
  return existeOutroMetodo ? 'metodo' : null
}

export function criarApp(deps: Deps): (req: Request) => Promise<Response> {
  return async function tratar(req: Request): Promise<Response> {
    const inicio = Date.now()
    const url = new URL(req.url)
    const metodo = req.method.toUpperCase()
    const rota = extrairRota(url.pathname)
    let chave: ApiChave | null = null
    let resposta: Response
    let resumo: string | null = null

    try {
      if (metodo === 'OPTIONS') throw new ErroApi(403, 'cors_bloqueado', 'Esta API não aceita chamadas de navegador. Chame a partir de um servidor.')
      if (rota === null) throw erros.rotaNaoEncontrada(metodo, url.pathname)

      // Rotas públicas
      if (metodo === 'GET' && rota === '/health') {
        return json(200, { status: 'ok', versao: deps.versao, horario: deps.agora().toISOString() })
      }
      if (metodo === 'GET' && rota === '/openapi.json') {
        return json(200, especificacaoOpenApi(url.origin + url.pathname.replace(/\/openapi\.json$/, '')))
      }

      const achada = encontrarRota(metodo, rota)
      if (achada === null) throw erros.rotaNaoEncontrada(metodo, rota)
      if (achada === 'metodo') throw erros.metodoNaoPermitido()

      // Autenticação
      const auth = req.headers.get('authorization') ?? ''
      const m = auth.match(/^Bearer\s+(agz_[A-Za-z0-9_-]{20,})$/)
      if (!m) throw erros.naoAutenticado()
      chave = await deps.banco.chavePorHash(await sha256Hex(m[1]!))
      const agora = deps.agora()
      if (!chave || !chave.ativa || (chave.expira_em && new Date(chave.expira_em) <= agora)) {
        chave = null
        throw erros.chaveInvalida()
      }

      // Limite por minuto (contado no api_log; vale entre instâncias da função)
      const recentes = await deps.banco.contarChamadas(chave.id, new Date(agora.getTime() - 60_000).toISOString())
      if (recentes >= LIMITE_POR_MINUTO) throw erros.limite(60)

      const config = await deps.banco.obterConfig(chave.user_id)
      const { rota: def, params } = achada

      if (def.escopo && !chave.escopos.includes(def.escopo)) throw erros.semEscopo(def.escopo)
      if (def.escrita && config?.agente_pausado) throw erros.pausado()

      // Corpo
      let corpo: unknown = null
      if (metodo !== 'GET') {
        const texto = await req.text()
        if (texto.trim()) {
          try {
            corpo = JSON.parse(texto)
          } catch {
            throw erros.jsonInvalido()
          }
        }
      }

      // Idempotência (POST)
      const chaveIdem = metodo === 'POST' ? req.headers.get('idempotency-key')?.trim() || null : null
      if (chaveIdem && chaveIdem.length > 200) throw erros.validacao({ 'Idempotency-Key': 'Máximo de 200 caracteres.' })
      if (chaveIdem) {
        const salvo = await deps.banco.obterIdempotencia(chave.id, chaveIdem, new Date(agora.getTime() - 86_400_000).toISOString())
        if (salvo) {
          resumo = 'resposta repetida (Idempotency-Key)'
          resposta = json(salvo.status_http, salvo.resposta, { 'Idempotent-Replayed': 'true' })
          return resposta
        }
      }

      const ctx: Ctx = {
        deps,
        userId: chave.user_id,
        chave,
        config,
        ator: { ator: 'agente', nome: chave.nome },
        agora,
        params,
        query: url.searchParams,
        corpo,
      }
      const r = await def.executar(ctx)
      resumo = r.resumo ?? null
      if (chaveIdem) await deps.banco.salvarIdempotencia(chave.user_id, chave.id, chaveIdem, r.status, r.corpo)
      resposta = json(r.status, r.corpo)
      await deps.banco.tocarChave(chave.id)
    } catch (e) {
      const erro = e instanceof ErroApi ? e : erros.interno()
      if (!(e instanceof ErroApi)) console.error('[api] erro inesperado', e)
      resumo = resumo ?? erro.codigo
      resposta = json(erro.status, corpoErro(erro), erro.cabecalhos)
      // Erros de validação também são idempotentes: o agente recebe a mesma resposta.
    } finally {
      // Toda chamada autenticada vai para o api_log (sem dados sensíveis).
      if (chave) {
        const c = chave
        const status = (resposta! as Response | undefined)?.status ?? 500
        const registro = deps.banco
          .registrarLog({
            user_id: c.user_id,
            chave_id: c.id,
            metodo,
            rota: rota ?? url.pathname,
            status_http: status,
            duracao_ms: Date.now() - inicio,
            resumo,
          })
          .catch((err) => console.error('[api] falha ao gravar log', err))
        await registro
        if (Math.random() < (deps.chanceLimpeza ?? 0.02)) await deps.banco.limpeza().catch(() => {})
      }
    }
    return resposta
  }
}
