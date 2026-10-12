// Testes da API (deno test). Usam o banco em memória; não precisam de rede.
import { criarApp } from '../app.ts'
import { BancoMemoria, OUTRO_USER, USER } from './banco_memoria.ts'

// ---- asserts mínimos (sem dependências externas) ----
function igual(atual: unknown, esperado: unknown, msg = '') {
  const a = JSON.stringify(atual)
  const e = JSON.stringify(esperado)
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`)
}
function verdade(v: unknown, msg = 'esperava verdadeiro') {
  if (!v) throw new Error(msg)
}

type Cenario = { banco: BancoMemoria; chamar: (metodo: string, rota: string, opts?: { chave?: string | null; corpo?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; corpo: any; headers: Headers }> }

async function cenario(opts: { escopos?: string[]; bridgeOnline?: boolean } = {}): Promise<Cenario & { chave: string }> {
  const banco = new BancoMemoria()
  banco.config()
  banco.semear()
  const chave = await banco.criarChave(opts.escopos ?? ['leitura', 'escrita', 'relatorios'])
  const app = criarApp({ banco, agora: () => new Date(), versao: 'teste', bridgeOnline: async () => opts.bridgeOnline ?? false, chanceLimpeza: 0 })
  const chamar: Cenario['chamar'] = async (metodo, rota, o = {}) => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) }
    const k = o.chave === undefined ? chave : o.chave
    if (k) headers.authorization = `Bearer ${k}`
    if (o.corpo !== undefined) headers['content-type'] = 'application/json'
    const r = await app(new Request(`https://x.supabase.co/functions/v1/api/v1${rota}`, { method: metodo, headers, body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo) }))
    const txt = await r.text()
    return { status: r.status, corpo: txt ? JSON.parse(txt) : null, headers: r.headers }
  }
  return { banco, chamar, chave }
}

// ---------------------------------------------------------------------------
Deno.test('health e openapi são públicos', async () => {
  const { chamar } = await cenario()
  const h = await chamar('GET', '/health', { chave: null })
  igual(h.status, 200)
  igual(h.corpo.status, 'ok')
  const o = await chamar('GET', '/openapi.json', { chave: null })
  igual(o.status, 200)
  igual(o.corpo.openapi, '3.1.0')
  verdade(o.corpo.paths['/leads'].post, 'openapi tem POST /leads')
})

Deno.test('autenticação: sem chave, chave errada, revogada e expirada → 401', async () => {
  const { chamar, banco } = await cenario()
  igual((await chamar('GET', '/leads', { chave: null })).corpo.erro.codigo, 'nao_autenticado')
  igual((await chamar('GET', '/leads', { chave: 'agz_naoexiste0000000000000000' })).status, 401)
  const revogada = await banco.criarChave(['leitura'], { ativa: false })
  igual((await chamar('GET', '/leads', { chave: revogada })).corpo.erro.codigo, 'chave_invalida')
  const expirada = await banco.criarChave(['leitura'], { expira_em: new Date(Date.now() - 1000).toISOString() })
  igual((await chamar('GET', '/leads', { chave: expirada })).status, 401)
})

Deno.test('escopos: leitura não escreve; relatórios não lê leads', async () => {
  const { chamar, banco } = await cenario()
  const soLeitura = await banco.criarChave(['leitura'])
  igual((await chamar('GET', '/leads', { chave: soLeitura })).status, 200)
  const r = await chamar('POST', '/leads', { chave: soLeitura, corpo: { empresa: 'X', whatsapp: '19999998888' } })
  igual(r.status, 403)
  igual(r.corpo.erro.codigo, 'escopo_insuficiente')
  igual(r.corpo.erro.detalhes.escopo_necessario, 'escrita')
  const soRelatorio = await banco.criarChave(['relatorios'])
  igual((await chamar('GET', '/leads', { chave: soRelatorio })).status, 403)
})

Deno.test('chave só enxerga dados do próprio usuário', async () => {
  const { chamar, banco } = await cenario()
  const deOutro = banco.novoLead({ empresa: 'Do outro' }, OUTRO_USER)
  igual((await chamar('GET', `/leads/${deOutro.id}`)).corpo.erro.codigo, 'lead_nao_encontrado')
  igual((await chamar('GET', '/leads')).corpo.dados.length, 0)
})

Deno.test('POST /leads faz upsert pelo WhatsApp normalizado', async () => {
  const { chamar, banco } = await cenario()
  const a = await chamar('POST', '/leads', { corpo: { empresa: 'Ótica Sol', whatsapp: '(19) 9999-8888', cidade: 'Campinas' } })
  igual(a.status, 201)
  igual(a.corpo.criado, true)
  igual(a.corpo.lead.whatsapp, '5519999998888')
  igual(a.corpo.lead.origem, 'agente')
  const b = await chamar('POST', '/leads', { corpo: { empresa: 'Ótica Sol', whatsapp: '+55 19 99999-8888', segmento: 'Ótica' } })
  igual(b.status, 200)
  igual(b.corpo.criado, false)
  igual(b.corpo.lead.segmento, 'Ótica')
  igual(banco.leads.length, 1)
  const inval = await chamar('POST', '/leads', { corpo: { empresa: 'X', whatsapp: '123', estagio: 'ganho' } })
  igual(inval.status, 422)
  verdade(inval.corpo.erro.detalhes.campos.whatsapp && inval.corpo.erro.detalhes.campos.estagio, 'aponta whatsapp e estagio')
})

Deno.test('idempotência: mesma Idempotency-Key devolve a mesma resposta sem duplicar', async () => {
  const { chamar, banco } = await cenario()
  const h = { 'Idempotency-Key': 'op-123' }
  const corpo = { empresa: 'Gráfica Lua', whatsapp: '19988887777' }
  const r1 = await chamar('POST', '/leads', { corpo, headers: h })
  const lead = banco.leads[0]!
  const r2 = await chamar('POST', '/leads', { corpo, headers: h })
  igual(r1.status, 201)
  igual(r2.status, 201, 'repetição devolve o mesmo status (201), não 200')
  igual(r2.corpo, r1.corpo)
  igual(r2.headers.get('idempotent-replayed'), 'true')
  // Interação também não duplica
  const i1 = await chamar('POST', `/leads/${lead.id}/interacoes`, { corpo: { tipo: 'nota', conteudo: 'oi' }, headers: { 'Idempotency-Key': 'n1' } })
  await chamar('POST', `/leads/${lead.id}/interacoes`, { corpo: { tipo: 'nota', conteudo: 'oi' }, headers: { 'Idempotency-Key': 'n1' } })
  igual(i1.status, 201)
  igual(banco.interacoesL.filter((i) => i.tipo === 'nota').length, 1)
  // Chave diferente cria de novo
  await chamar('POST', `/leads/${lead.id}/interacoes`, { corpo: { tipo: 'nota', conteudo: 'oi' }, headers: { 'Idempotency-Key': 'n2' } })
  igual(banco.interacoesL.filter((i) => i.tipo === 'nota').length, 2)
})

Deno.test('opt-out: bloqueia preparar, enviar e propor mensagem; não pode ser reativado', async () => {
  const { chamar, banco } = await cenario({ escopos: ['leitura', 'escrita', 'envio'], bridgeOnline: true })
  const l = banco.novoLead({ opt_out: true, ultima_resposta_em: new Date().toISOString() })
  const p = await chamar('POST', '/mensagens/preparar', { corpo: { lead_id: l.id, template_chave: 'abordagem' } })
  igual(p.status, 403)
  igual(p.corpo.erro.codigo, 'lead_opt_out')
  igual((await chamar('POST', '/mensagens/enviar', { corpo: { lead_id: l.id, texto: 'oi' } })).corpo.erro.codigo, 'lead_opt_out')
  igual((await chamar('POST', '/acoes-pendentes', { corpo: { tipo: 'enviar_mensagem', lead_id: l.id, payload: { texto: 'oi' }, justificativa: 'x' } })).status, 403)
  igual((await chamar('POST', `/leads/${l.id}/interacoes`, { corpo: { tipo: 'whatsapp_enviado', conteudo: 'oi' } })).status, 403)
  const reativar = await chamar('PATCH', `/leads/${l.id}`, { corpo: { opt_out: false } })
  igual(reativar.status, 422)
  igual(banco.leads[0]!.opt_out, true)
  igual(banco.acoes.length, 0)
})

Deno.test('prospecção fria nunca sai direto: vira ação pendente, mesmo com tudo liberado', async () => {
  const { chamar, banco } = await cenario({ escopos: ['leitura', 'escrita', 'envio'], bridgeOnline: true })
  banco.config(USER, { permitir_envio_direto_apos_resposta: true })
  const fria = banco.novoLead()
  const r = await chamar('POST', '/mensagens/enviar', { corpo: { lead_id: fria.id, template_chave: 'abordagem', justificativa: 'Perfil sem fotos' } })
  igual(r.status, 202)
  igual(r.corpo.enviado, false)
  igual(r.corpo.motivo, 'prospeccao_fria')
  igual(r.corpo.acao_pendente.tipo, 'enviar_mensagem')
  igual(r.corpo.acao_pendente.payload.texto, 'Olá, Marina! Vi a Ótica Teste em Campinas. Richard | AgilizeWeb')
  igual(banco.interacoesL.filter((i) => i.tipo === 'whatsapp_enviado').length, 0, 'nada enviado')

  const st = await chamar('GET', `/acoes-pendentes/${r.corpo.acao_pendente.id}`)
  igual(st.corpo.status, 'pendente')
})

Deno.test('envio direto só para quem já respondeu, com escopo envio, regra ligada e bridge online', async () => {
  const quente = { ultima_resposta_em: new Date(Date.now() - 3600_000).toISOString(), estagio: 'respondeu' as const }

  const c1 = await cenario({ escopos: ['leitura', 'escrita'], bridgeOnline: true })
  c1.banco.config(USER, { permitir_envio_direto_apos_resposta: true })
  igual((await c1.chamar('POST', '/mensagens/enviar', { corpo: { lead_id: c1.banco.novoLead(quente).id, texto: 'oi' } })).corpo.motivo, 'sem_escopo_envio')

  const c2 = await cenario({ escopos: ['leitura', 'escrita', 'envio'], bridgeOnline: true })
  igual((await c2.chamar('POST', '/mensagens/enviar', { corpo: { lead_id: c2.banco.novoLead(quente).id, texto: 'oi' } })).corpo.motivo, 'envio_direto_desligado')

  const c3 = await cenario({ escopos: ['leitura', 'escrita', 'envio'], bridgeOnline: false })
  c3.banco.config(USER, { permitir_envio_direto_apos_resposta: true })
  igual((await c3.chamar('POST', '/mensagens/enviar', { corpo: { lead_id: c3.banco.novoLead(quente).id, texto: 'oi' } })).corpo.motivo, 'bridge_offline')

  const c4 = await cenario({ escopos: ['leitura', 'escrita', 'envio'], bridgeOnline: true })
  c4.banco.config(USER, { permitir_envio_direto_apos_resposta: true })
  const ok = await c4.chamar('POST', '/mensagens/enviar', { corpo: { lead_id: c4.banco.novoLead(quente).id, texto: 'oi' } })
  igual(ok.status, 201)
  igual(ok.corpo.enviado, true)
  const enviada = c4.banco.interacoesL.find((i) => i.tipo === 'whatsapp_enviado')!
  igual([enviada.ator, enviada.ator_nome], ['agente', 'Grok Bot'])
})

Deno.test('Pausar agente: escritas → 503, leituras e preparar continuam', async () => {
  const { chamar, banco } = await cenario()
  banco.config(USER, { agente_pausado: true })
  const l = banco.novoLead()
  const w = await chamar('POST', '/leads', { corpo: { empresa: 'X', whatsapp: '19999997777' } })
  igual(w.status, 503)
  igual(w.corpo.erro.codigo, 'agente_pausado')
  igual((await chamar('PATCH', `/leads/${l.id}`, { corpo: { segmento: 'x' } })).status, 503)
  igual((await chamar('POST', `/leads/${l.id}/respondeu`)).status, 503)
  igual((await chamar('POST', '/acoes-pendentes', { corpo: { tipo: 'outro', justificativa: 'x' } })).status, 503)
  igual((await chamar('GET', '/leads')).status, 200)
  igual((await chamar('GET', '/fila/hoje')).status, 200)
  igual((await chamar('POST', '/mensagens/preparar', { corpo: { lead_id: l.id, template_chave: 'abordagem' } })).status, 200)
})

Deno.test('estágio: perdido exige motivo; ganho vira ação pendente; ator = agente', async () => {
  const { chamar, banco } = await cenario()
  const l = banco.novoLead({ estagio: 'negociacao' })
  igual((await chamar('POST', `/leads/${l.id}/estagio`, { corpo: { estagio: 'perdido' } })).status, 422)
  const g = await chamar('POST', `/leads/${l.id}/estagio`, { corpo: { estagio: 'ganho' } })
  igual(g.status, 202)
  igual(banco.leads[0]!.estagio, 'negociacao')
  igual(banco.acoes[0]!.tipo, 'mudar_estagio')
  const p = await chamar('POST', `/leads/${l.id}/estagio`, { corpo: { estagio: 'perdido', motivo_perda: 'Sem interesse' } })
  igual(p.status, 200)
  const mud = banco.interacoesL.find((i) => i.tipo === 'mudanca_estagio')!
  igual(mud.ator, 'agente')
})

Deno.test('respondeu e fila de hoje', async () => {
  const { chamar, banco } = await cenario()
  const l = banco.novoLead({ estagio: 'abordado', tentativas_sem_resposta: 1, ultimo_contato_em: new Date(Date.now() - 86400_000).toISOString() })
  banco.novoLead({ empresa: 'Novo' })
  const fila1 = await chamar('GET', '/fila/hoje')
  igual(fila1.corpo.novos.length, 1)
  igual(fila1.corpo.novos[0].acao_sugerida, 'Abordar')
  igual(fila1.corpo.novos[0].mensagem_sugerida, 'Olá, Marina! Vi a Novo em Campinas. Richard | AgilizeWeb')
  const r = await chamar('POST', `/leads/${l.id}/respondeu`, { corpo: { conteudo: 'Pode mandar' } })
  igual(r.status, 200)
  igual(r.corpo.lead.estagio, 'respondeu')
  igual(r.corpo.lead.tentativas_sem_resposta, 0)
  const fila2 = await chamar('GET', '/fila/hoje')
  igual(fila2.corpo.responderam.length, 1)
})

Deno.test('limite de 60 requisições por minuto → 429 com Retry-After', async () => {
  const { chamar, banco } = await cenario()
  const chaveId = banco.chaves[0]!.id
  for (let i = 0; i < 60; i++) await banco.registrarLog({ user_id: USER, chave_id: chaveId, metodo: 'GET', rota: '/leads', status_http: 200, duracao_ms: 1, resumo: null })
  const r = await chamar('GET', '/leads')
  igual(r.status, 429)
  igual(r.corpo.erro.codigo, 'limite_requisicoes')
  igual(r.headers.get('retry-after'), '60')
})

Deno.test('limite diário de mensagens do agente → 429 limite_diario', async () => {
  const { chamar, banco } = await cenario()
  banco.config(USER, { meta_diaria: 2 })
  for (let i = 0; i < 2; i++) {
    const l = banco.novoLead()
    igual((await chamar('POST', '/mensagens/enviar', { corpo: { lead_id: l.id, texto: 'oi' } })).status, 202)
  }
  const r = await chamar('POST', '/mensagens/enviar', { corpo: { lead_id: banco.novoLead().id, texto: 'oi' } })
  igual(r.status, 429)
  igual(r.corpo.erro.codigo, 'limite_diario')
})

Deno.test('rotas: inexistente 404, DELETE 405, OPTIONS bloqueado (CORS fechado), toda chamada vai para o log', async () => {
  const { chamar, banco } = await cenario()
  const l = banco.novoLead()
  igual((await chamar('GET', '/nada')).status, 404)
  igual((await chamar('DELETE', `/leads/${l.id}`)).corpo.erro.codigo, 'metodo_nao_permitido')
  const o = await chamar('OPTIONS', '/leads')
  igual(o.status, 403)
  igual(o.headers.get('access-control-allow-origin'), null)
  await chamar('GET', '/leads')
  verdade(banco.logs.some((x) => x.rota === '/leads' && x.status_http === 200), 'log gravado')
})

Deno.test('paginação por cursor', async () => {
  const { chamar, banco } = await cenario()
  for (let i = 0; i < 5; i++) banco.novoLead({ empresa: `L${i}`, updated_at: new Date(Date.now() - i * 1000).toISOString() })
  const p1 = await chamar('GET', '/leads?limite=2')
  igual(p1.corpo.dados.map((l: { empresa: string }) => l.empresa), ['L0', 'L1'])
  const p2 = await chamar('GET', `/leads?limite=2&cursor=${p1.corpo.proximo_cursor}`)
  igual(p2.corpo.dados.map((l: { empresa: string }) => l.empresa), ['L2', 'L3'])
  const p3 = await chamar('GET', `/leads?limite=2&cursor=${p2.corpo.proximo_cursor}`)
  igual(p3.corpo.proximo_cursor, null)
  igual((await chamar('GET', '/leads?cursor=lixo')).status, 422)
})

Deno.test('vendas e métricas: escopos, período e paginação', async () => {
  const { chamar, banco } = await cenario({ escopos: ['leitura'] })
  const l = banco.novoLead()
  const t = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
  for (const [d, status] of [[1, 'pago'], [2, 'aguardando'], [40, 'pago']] as const) {
    banco.vendasL.push({ id: crypto.randomUUID(), user_id: USER, lead_id: l.id, itens: [], valor_total: 549.9, forma_pagamento: 'Pix', status, manutencao_mensal: false, valor_mensal: 0, fechada_em: t(d), created_at: t(d), updated_at: t(d) })
  }
  const todas = await chamar('GET', '/vendas')
  igual(todas.status, 200)
  igual(todas.corpo.dados.length, 3)
  igual(typeof todas.corpo.dados[0].valor_total, 'number')
  igual((await chamar('GET', `/vendas?de=${encodeURIComponent(t(10))}&status=pago`)).corpo.dados.length, 1)
  igual((await chamar('GET', '/vendas?status=xpto')).status, 422)
  igual((await chamar('GET', `/vendas?de=${encodeURIComponent(t(1))}&ate=${encodeURIComponent(t(5))}`)).status, 422)
  // métricas exigem o escopo relatorios
  igual((await chamar('GET', '/metricas/resumo')).corpo.erro.codigo, 'escopo_insuficiente')
  const comRel = await banco.criarChave(['relatorios'])
  const m = await chamar('GET', '/metricas/resumo', { chave: comRel })
  igual(m.status, 200)
  igual(m.corpo.receita_periodo.paga, 1099.8)
})
