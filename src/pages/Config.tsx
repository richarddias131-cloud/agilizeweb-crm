import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Erro, Skeleton } from '../components/Estados'
import { ThemeToggle } from '../components/ThemeToggle'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { obterConfig, salvarConfig, type Config as ConfigT } from '../services/config'
import { listarTemplates, salvarTemplate, type Template } from '../services/templates'
import { listarServicos, salvarServico, type Servico } from '../services/servicos'
import { ESTAGIOS, ESTAGIO_ROTULO, ehEstagio } from '../../shared/dominio.ts'
import { VARIAVEIS, VARIAVEL_DESCRICAO, renderizarTemplate } from '../../shared/template.ts'
import { normalizarTelefone, formatarTelefone } from '../../shared/phone.ts'
import { BRAND } from '../config/brand'
import { precoCatalogo } from '../lib/formato'
import { ConfigApi } from './ConfigApi'

const ABAS = [
  { id: 'geral', rotulo: 'Geral' },
  { id: 'templates', rotulo: 'Templates' },
  { id: 'catalogo', rotulo: 'Catálogo' },
  { id: 'api', rotulo: 'API e agente' },
] as const
type Aba = (typeof ABAS)[number]['id']

export function Config() {
  const [params, setParams] = useSearchParams()
  const aba = (ABAS.find((a) => a.id === params.get('aba'))?.id ?? 'geral') as Aba

  return (
    <div className="page">
      <PageHeader eyebrow="07 / Ajustes" titulo="Configurações" />
      <div className="abas" role="tablist" aria-label="Seções">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            className="aba"
            onClick={() => setParams({ aba: a.id }, { replace: true })}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'geral' && <AbaGeral />}
        {aba === 'templates' && <AbaTemplates />}
        {aba === 'catalogo' && <AbaCatalogo />}
        {aba === 'api' && <ConfigApi />}
      </div>
    </div>
  )
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <section className="card card-pad secao-config">
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="bloco-titulo">{titulo}</h2>
        {descricao && <p className="muted" style={{ fontSize: '.9rem' }}>{descricao}</p>}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------- Geral -------------------------------- */

function AbaGeral() {
  const { dados: config, erro, recarregar } = useDados('config', obterConfig)
  if (erro && !config) return <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
  if (!config) return <Skeleton linhas={4} />
  return <FormGeral config={config} />
}

function FormGeral({ config }: { config: ConfigT }) {
  const toast = useToast()
  const [f, setF] = useState({
    whatsapp_modo: config.whatsapp_modo,
    whatsapp_proprio: config.whatsapp_proprio ?? BRAND.whatsapp,
    assinatura: config.assinatura ?? BRAND.assinatura,
    meta_diaria: String(config.meta_diaria),
    c1: String(config.cadencia_dias[0] ?? 2),
    c2: String(config.cadencia_dias[1] ?? 3),
    c3: String(config.cadencia_dias[2] ?? 5),
    encerrar_apos_dias: String(config.encerrar_apos_dias),
    reativar_apos_dias: String(config.reativar_apos_dias),
  })
  const [salvando, setSalvando] = useState(false)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const int = (v: string, min = 0, max = 365) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= min && n <= max ? n : null
  }

  async function salvar() {
    const meta = int(f.meta_diaria, 0, 500)
    const dias = [int(f.c1, 1), int(f.c2, 1), int(f.c3, 1)]
    const encerrar = int(f.encerrar_apos_dias, 1)
    const reativar = int(f.reativar_apos_dias, 1, 730)
    if (meta === null) return toast('Meta diária: use um número de 0 a 500.', { tipo: 'erro' })
    if (dias.some((d) => d === null) || encerrar === null || reativar === null)
      return toast('Cadência: use números inteiros de dias (mínimo 1).', { tipo: 'erro' })
    let tel: string | null = null
    if (f.whatsapp_proprio.trim()) {
      const r = normalizarTelefone(f.whatsapp_proprio)
      if (!r.ok) return toast(`Seu WhatsApp: ${r.erro}`, { tipo: 'erro' })
      tel = r.numero
    }
    setSalvando(true)
    try {
      await salvarConfig(config.id, {
        whatsapp_modo: f.whatsapp_modo,
        whatsapp_proprio: tel,
        assinatura: f.assinatura.trim() || null,
        meta_diaria: meta,
        cadencia_dias: dias as number[],
        encerrar_apos_dias: encerrar,
        reativar_apos_dias: reativar,
      })
      toast('Configurações salvas.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tipo: 'erro' })
    } finally {
      setSalvando(false)
    }
  }

  const MODOS = [
    { v: 'auto', r: 'Automático', d: 'App no celular, WhatsApp Web no computador' },
    { v: 'web', r: 'WhatsApp Web', d: 'Sempre na mesma aba do navegador' },
    { v: 'app', r: 'App', d: 'Sempre abre o aplicativo (wa.me)' },
    { v: 'perguntar', r: 'Perguntar', d: 'Escolho na hora de enviar' },
  ]

  return (
    <div className="stack">
      <Secao titulo="WhatsApp" descricao="Como o CRM abre o WhatsApp quando você toca em Enviar.">
        <div className="opcoes" role="radiogroup" aria-label="Modo de abertura">
          {MODOS.map((m) => (
            <button key={m.v} type="button" role="radio" aria-checked={f.whatsapp_modo === m.v} className="opcao" onClick={() => set('whatsapp_modo')(m.v)}>
              {m.r}
              <span className="muted" style={{ fontSize: '.78rem' }}>{m.d}</span>
            </button>
          ))}
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cfg-wa">Seu WhatsApp (da agência)</label>
            <input id="cfg-wa" className="input num" inputMode="tel" value={formatarTelefone(f.whatsapp_proprio) || f.whatsapp_proprio} onChange={(e) => set('whatsapp_proprio')(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cfg-ass">Assinatura das mensagens</label>
            <input id="cfg-ass" className="input" value={f.assinatura} onChange={(e) => set('assinatura')(e.target.value)} />
            <span className="hint">Entra no lugar de {'{{assinatura}}'}.</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Ritmo" descricao="Meta diária de abordagens e intervalos da cadência automática de follow-up.">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cfg-meta">Meta diária de abordagens</label>
            <input id="cfg-meta" className="input num" inputMode="numeric" value={f.meta_diaria} onChange={(e) => set('meta_diaria')(e.target.value)} />
          </div>
        </div>
        <div className="cadencia-linha">
          <CampoDias id="c1" rotulo="Abordagem → Follow-up 1" valor={f.c1} aoMudar={set('c1')} />
          <CampoDias id="c2" rotulo="Follow-up 1 → Follow-up 2" valor={f.c2} aoMudar={set('c2')} />
          <CampoDias id="c3" rotulo="Follow-up 2 → Última" valor={f.c3} aoMudar={set('c3')} />
          <CampoDias id="enc" rotulo="Última → Sem resposta" valor={f.encerrar_apos_dias} aoMudar={set('encerrar_apos_dias')} />
          <CampoDias id="reat" rotulo="Tarefa Reativar em" valor={f.reativar_apos_dias} aoMudar={set('reativar_apos_dias')} />
        </div>
        <p className="hint">Qualquer resposta do lead interrompe a cadência.</p>
      </Secao>

      <Secao titulo="Tema">
        <ThemeToggle />
      </Secao>

      <div className="barra-salvar">
        <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar alterações'} <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}

function CampoDias({ id, rotulo, valor, aoMudar }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={`cfg-${id}`}>{rotulo}</label>
      <div className="input-sufixo">
        <input id={`cfg-${id}`} className="input num" inputMode="numeric" value={valor} onChange={(e) => aoMudar(e.target.value)} />
        <span className="muted">dias</span>
      </div>
    </div>
  )
}

/* ------------------------------ Templates ------------------------------ */

const LEAD_EXEMPLO = {
  contato_nome: 'Marina Souza',
  empresa: 'Ótica Visão',
  cidade: 'Campinas',
  segmento: 'Ótica',
  nota_auditoria: 62,
  servico: { nome: 'Kit Comércio no Mapa', preco: 549.9 },
}

function AbaTemplates() {
  const { dados: templates, erro, recarregar } = useDados('templates', listarTemplates)
  const { dados: config } = useDados('config', obterConfig)
  const [selecionado, setSelecionado] = useState<string | 'novo' | null>(null)

  if (erro && !templates) return <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
  if (!templates) return <Skeleton linhas={4} />

  const atual = selecionado === 'novo' ? null : templates.find((t) => t.id === (selecionado ?? templates[0]?.id)) ?? null
  const chaveEditor = selecionado === 'novo' ? 'novo' : atual?.id ?? 'novo'

  return (
    <div className="templates-layout">
      <div className="card templates-lista">
        <ul className="rows" role="listbox" aria-label="Templates">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={atual?.id === t.id && selecionado !== 'novo'}
                className="template-item"
                onClick={() => setSelecionado(t.id)}
              >
                <span>{t.nome}</span>
                {!t.ativo && <span className="badge">Inativo</span>}
                {t.chave && <span className="badge">Padrão</span>}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ padding: 12 }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSelecionado('novo')}>
            Novo template
          </button>
        </div>
      </div>
      <EditorTemplate
        key={chaveEditor}
        template={selecionado === 'novo' ? null : atual}
        assinatura={config?.assinatura || BRAND.assinatura}
        proximaOrdem={templates.length + 1}
        aoSalvar={(t) => setSelecionado(t.id)}
      />
    </div>
  )
}

function EditorTemplate({
  template,
  assinatura,
  proximaOrdem,
  aoSalvar,
}: {
  template: Template | null
  assinatura: string
  proximaOrdem: number
  aoSalvar: (t: Template) => void
}) {
  const toast = useToast()
  const [nome, setNome] = useState(template?.nome ?? '')
  const [estagio, setEstagio] = useState<string>(template?.estagio_alvo ?? '')
  const [corpo, setCorpo] = useState(template?.corpo ?? '')
  const [ativo, setAtivo] = useState(template?.ativo ?? true)
  const [salvando, setSalvando] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const previa = useMemo(() => renderizarTemplate(corpo, { ...LEAD_EXEMPLO, assinatura }), [corpo, assinatura])

  function inserir(v: string) {
    const el = ref.current
    const token = `{{${v}}}`
    if (!el) return setCorpo((c) => c + token)
    const ini = el.selectionStart ?? corpo.length
    const fim = el.selectionEnd ?? corpo.length
    const novo = corpo.slice(0, ini) + token + corpo.slice(fim)
    setCorpo(novo)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(ini + token.length, ini + token.length)
    })
  }

  async function salvar() {
    if (!nome.trim() || !corpo.trim()) return toast('Dê um nome e escreva a mensagem.', { tipo: 'erro' })
    setSalvando(true)
    try {
      const t = await salvarTemplate(template?.id ?? null, {
        nome: nome.trim(),
        corpo: corpo.trim(),
        estagio_alvo: ehEstagio(estagio) ? estagio : null,
        ativo,
        ...(template ? {} : { ordem: proximaOrdem }),
      })
      toast('Template salvo.')
      aoSalvar(t)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tipo: 'erro' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="card card-pad stack editor-template">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="tpl-nome">Nome</label>
          <input id="tpl-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tpl-estagio">Estágio indicado</label>
          <select id="tpl-estagio" className="select" value={estagio} onChange={(e) => setEstagio(e.target.value)}>
            <option value="">Qualquer</option>
            {ESTAGIOS.map((e) => (
              <option key={e} value={e}>
                {ESTAGIO_ROTULO[e]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {template?.chave && (
        <p className="hint">Template padrão: o CRM sugere este texto automaticamente na etapa certa. Edite à vontade; a sugestão continua funcionando.</p>
      )}
      <div className="field">
        <label htmlFor="tpl-corpo">Mensagem</label>
        <textarea id="tpl-corpo" ref={ref} className="textarea mensagem-texto" value={corpo} onChange={(e) => setCorpo(e.target.value)} />
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">Variáveis (toque para inserir)</span>
        <div className="chips chips-wrap">
          {VARIAVEIS.map((v) => (
            <button key={v} type="button" className="chip mono" title={VARIAVEL_DESCRICAO[v]} onClick={() => inserir(v)}>
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>
      <div className="previa">
        <span className="label">Prévia com um lead de exemplo</span>
        <p className="previa-balao">{previa.texto || <span className="muted">A prévia aparece aqui.</span>}</p>
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <label className="toggle">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <span>Ativo</span>
        </label>
        <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar template'} <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ Catálogo ------------------------------ */

function AbaCatalogo() {
  const { dados: servicos, erro, recarregar } = useDados('servicos', listarServicos)
  const [novo, setNovo] = useState(false)
  if (erro && !servicos) return <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
  if (!servicos) return <Skeleton linhas={6} />
  return (
    <div className="stack">
      <p className="muted">Preços usados nas vendas e na variável {'{{preco}}'}. O agente só consulta, nunca altera.</p>
      <div className="card rows">
        {servicos.map((s) => (
          <LinhaServico key={s.id} servico={s} />
        ))}
        {novo && <LinhaServico servico={null} proximaOrdem={servicos.length + 1} aoCriar={() => setNovo(false)} />}
      </div>
      {!novo && (
        <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setNovo(true)}>
          Adicionar serviço
        </button>
      )}
    </div>
  )
}

function LinhaServico({ servico, proximaOrdem, aoCriar }: { servico: Servico | null; proximaOrdem?: number; aoCriar?: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    nome: servico?.nome ?? '',
    preco: servico ? Number(servico.preco).toFixed(2).replace('.', ',') : '',
    recorrente: servico?.recorrente ?? false,
    preco_mensal: servico?.preco_mensal ? Number(servico.preco_mensal).toFixed(2).replace('.', ',') : '',
    ativo: servico?.ativo ?? true,
  })
  const [sujo, setSujo] = useState(!servico)
  useEffect(() => setSujo(!servico), [servico])
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }))
    setSujo(true)
  }
  const num = (v: string) => {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    return v.trim() && Number.isFinite(n) && n >= 0 ? n : null
  }

  async function salvar() {
    const preco = num(f.preco)
    const mensal = f.recorrente ? num(f.preco_mensal) : null
    if (!f.nome.trim() || preco === null) return toast('Informe nome e preço válidos.', { tipo: 'erro' })
    try {
      await salvarServico(servico?.id ?? null, {
        nome: f.nome.trim(),
        preco,
        recorrente: f.recorrente,
        preco_mensal: mensal,
        ativo: f.ativo,
        ...(servico ? {} : { ordem: proximaOrdem ?? 99 }),
      })
      setSujo(false)
      toast('Serviço salvo.')
      aoCriar?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tipo: 'erro' })
    }
  }

  return (
    <div className="linha-servico">
      <input className="input" aria-label="Nome do serviço" placeholder="Nome do serviço" value={f.nome} onChange={(e) => set('nome', e.target.value)} />
      <div className="input-sufixo">
        <span className="muted">R$</span>
        <input className="input num" aria-label="Preço" inputMode="decimal" value={f.preco} onChange={(e) => set('preco', e.target.value)} />
      </div>
      <label className="toggle">
        <input type="checkbox" checked={f.recorrente} onChange={(e) => set('recorrente', e.target.checked)} />
        <span>Manutenção mensal</span>
      </label>
      {f.recorrente ? (
        <div className="input-sufixo">
          <span className="muted">R$</span>
          <input className="input num" aria-label="Preço mensal" inputMode="decimal" value={f.preco_mensal} onChange={(e) => set('preco_mensal', e.target.value)} />
          <span className="muted">/mês</span>
        </div>
      ) : (
        <span className="muted num" style={{ fontSize: '.85rem' }}>{servico ? `Pagamento único · ${precoCatalogo(servico.preco)}` : ''}</span>
      )}
      <label className="toggle">
        <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
        <span>Ativo</span>
      </label>
      <button type="button" className="btn btn-primary btn-sm" disabled={!sujo} onClick={() => void salvar()}>
        Salvar
      </button>
    </div>
  )
}
