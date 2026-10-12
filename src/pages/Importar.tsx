import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Icon } from '../components/Icon'
import { useToast } from '../context/ToastContext'
import { baixarCsv, importarLeads, lerCsv, whatsappsExistentes, type CsvLido } from '../services/importacao'
import {
  CAMPOS_IMPORTACAO,
  prepararImportacao,
  sugerirMapeamento,
  tagDaCampanha,
  type CampoImportacao,
  type Mapeamento,
  type ResultadoImportacao,
} from '../../shared/importacao.ts'
import { formatarTelefone, normalizarTelefone } from '../../shared/phone.ts'
import { numero } from '../lib/formato'

type Etapa = 'arquivo' | 'mapear' | 'importando' | 'pronto'

export function Importar() {
  const toast = useToast()
  const [etapa, setEtapa] = useState<Etapa>('arquivo')
  const [csv, setCsv] = useState<CsvLido | null>(null)
  const [mapa, setMapa] = useState<Mapeamento>({})
  const [tag, setTag] = useState('')
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 })
  const [resultado, setResultado] = useState<{ r: ResultadoImportacao; importados: number } | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function abrirArquivo(f: File | undefined) {
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) return toast('Escolha um arquivo .csv (no Excel/Planilhas: Arquivo → Baixar → CSV).', { tipo: 'erro' })
    try {
      const lido = await lerCsv(f)
      if (!lido.linhas.length) return toast('O arquivo não tem linhas de dados.', { tipo: 'erro' })
      setCsv(lido)
      setMapa(sugerirMapeamento(lido.colunas))
      setTag(tagDaCampanha(lido.nome))
      setEtapa('mapear')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.', { tipo: 'erro' })
    }
  }

  const previa = useMemo(() => (csv ? prepararImportacao(csv.linhas.slice(0, 10), mapa, new Set(), { tag }) : null), [csv, mapa, tag])
  const faltaObrigatorio = !mapa.empresa && !mapa.link_google ? 'empresa' : !mapa.whatsapp ? 'whatsapp' : null

  async function importar() {
    if (!csv) return
    setEtapa('importando')
    setProgresso({ feitos: 0, total: csv.linhas.length })
    try {
      const existentes = await whatsappsExistentes()
      const r = prepararImportacao(csv.linhas, mapa, existentes, { tag: tag.trim() || null })
      setProgresso({ feitos: 0, total: r.validos.length })
      const importados = Math.min(await importarLeads(r.validos, (feitos) => setProgresso({ feitos, total: r.validos.length })), r.validos.length)
      // Alguém cadastrou o mesmo número enquanto importava: conta como duplicado.
      const corrida = r.validos.length - importados
      setResultado({ r, importados })
      if (corrida > 0) toast(`${corrida} número(s) já tinham sido cadastrados durante a importação.`)
      setEtapa('pronto')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'A importação falhou.', { tipo: 'erro' })
      setEtapa('mapear')
    }
  }

  function recomecar() {
    setCsv(null)
    setMapa({})
    setResultado(null)
    setEtapa('arquivo')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    void abrirArquivo(e.dataTransfer.files[0])
  }

  return (
    <div className="page">
      <PageHeader eyebrow="06 / Importar" titulo="Importar CSV">
        <p className="muted">Traga suas listas de prospecção. Duplicados (pelo WhatsApp) são descartados automaticamente.</p>
      </PageHeader>

      <ol className="passos" aria-label="Etapas">
        {(['Arquivo', 'Colunas', 'Resultado'] as const).map((p, i) => {
          const ativo = (etapa === 'arquivo' && i === 0) || (etapa === 'mapear' && i === 1) || ((etapa === 'importando' || etapa === 'pronto') && i === 2)
          return (
            <li key={p} className={ativo ? 'passo-ativo' : ''} aria-current={ativo ? 'step' : undefined}>
              <span className="mono">0{i + 1}</span> {p}
            </li>
          )
        })}
      </ol>

      {etapa === 'arquivo' && (
        <div
          className={`card card-lg zona-arquivo ${arrastando ? 'zona-arquivo-ativa' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={onDrop}
        >
          <Icon name="importar" size={32} />
          <p>Arraste o arquivo CSV para cá ou</p>
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
            Escolher arquivo <span className="arrow">→</span>
          </button>
          <input ref={input} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => void abrirArquivo(e.target.files?.[0])} />
          <p className="hint">A primeira linha precisa ter os nomes das colunas. Separador vírgula ou ponto e vírgula.</p>
        </div>
      )}

      {etapa === 'mapear' && csv && previa && (
        <>
          <section className="card card-pad secao-config">
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="bloco-titulo">Ligue as colunas</h2>
              <p className="muted" style={{ fontSize: '.9rem' }}>
                <b className="num">{numero(csv.linhas.length)}</b> linhas em <b>{csv.nome}</b>. Sugerimos as colunas pelo nome; ajuste se precisar.
              </p>
            </div>
            <div className="mapeamento">
              {CAMPOS_IMPORTACAO.map((c) => (
                <div key={c.campo} className="field">
                  <label htmlFor={`map-${c.campo}`}>
                    {c.rotulo}
                    {c.obrigatorio ? ' *' : ''}
                  </label>
                  <select
                    id={`map-${c.campo}`}
                    className="select"
                    value={mapa[c.campo] ?? ''}
                    onChange={(e) => setMapa((m) => ({ ...m, [c.campo as CampoImportacao]: e.target.value || undefined }))}
                  >
                    <option value="">— não importar —</option>
                    {csv.colunas.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="field" style={{ maxWidth: 420 }}>
              <label htmlFor="imp-tag">Tag da campanha</label>
              <input id="imp-tag" className="input" value={tag} onChange={(e) => setTag(e.target.value)} />
              <span className="hint">Vai em todos os leads importados, para você saber de qual lista vieram.</span>
            </div>
          </section>

          <section className="card bloco-fila">
            <header className="card-cabecalho">
              <h2 className="bloco-titulo">Prévia das 10 primeiras linhas</h2>
              <span className="muted num" style={{ fontSize: '.85rem' }}>
                {previa.validos.length} ok · {previa.duplicados.length} {previa.duplicados.length === 1 ? 'repetida' : 'repetidas'} · {previa.invalidos.length} com problema
              </span>
            </header>
            <div className="tabela-rolagem" style={{ border: 0, borderTop: '1px solid var(--rule)', borderRadius: 0 }}>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Empresa</th>
                    <th>WhatsApp</th>
                    <th>Cidade</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {csv.linhas.slice(0, 10).map((l, i) => {
                    const empresa = mapa.empresa ? String(l[mapa.empresa] ?? '') : ''
                    const tel = mapa.whatsapp ? String(l[mapa.whatsapp] ?? '') : ''
                    const n = normalizarTelefone(tel)
                    const problema = [...previa.invalidos, ...previa.duplicados].find((x) => x.linha === i + 1)
                    return (
                      <tr key={i}>
                        <td className="mono num muted">{i + 1}</td>
                        <td>{empresa || <span className="muted">—</span>}</td>
                        <td className="num">{n.ok ? formatarTelefone(n.numero) : <span className="hint-error">{tel || '—'}</span>}</td>
                        <td>{mapa.cidade ? String(l[mapa.cidade] ?? '') : ''}</td>
                        <td>{problema ? <span className="badge badge-danger">{problema.motivo}</span> : <span className="badge badge-em">ok</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="row wrap" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="ulink" onClick={recomecar}>
              Escolher outro arquivo
            </button>
            <div className="row">
              {faltaObrigatorio && <span className="hint-error">Escolha a coluna de {faltaObrigatorio === 'empresa' ? 'Empresa' : 'WhatsApp'}.</span>}
              <button type="button" className="btn btn-primary" disabled={!!faltaObrigatorio} onClick={() => void importar()}>
                Importar {numero(csv.linhas.length)} linhas <span className="arrow">→</span>
              </button>
            </div>
          </div>
        </>
      )}

      {etapa === 'importando' && (
        <div className="card card-lg empty">
          <span className="badge">Importando</span>
          <p className="num">
            {numero(progresso.feitos)} de {numero(progresso.total)}
          </p>
          <div className="progress" style={{ width: '100%', maxWidth: 420 }}>
            <span style={{ width: `${progresso.total ? (progresso.feitos / progresso.total) * 100 : 5}%` }} />
          </div>
        </div>
      )}

      {etapa === 'pronto' && resultado && (
        <section className="card card-lg card-pad stack">
          <span className="badge badge-em" style={{ justifySelf: 'start' }}>
            Importação concluída
          </span>
          <h2 className="resultado-importacao num">
            {numero(resultado.importados)} importados, {numero(resultado.r.duplicados.length + (resultado.r.validos.length - resultado.importados))} duplicados,{' '}
            {numero(resultado.r.invalidos.length)} {resultado.r.invalidos.length === 1 ? 'inválido' : 'inválidos'}
          </h2>
          {tag && (
            <p className="muted">
              Todos com a tag <span className="badge">{tag}</span>
            </p>
          )}
          {resultado.r.invalidos.length + resultado.r.duplicados.length > 0 && (
            <details className="detalhes-rejeitados">
              <summary>Ver linhas não importadas</summary>
              <ul className="rows" role="list">
                {[...resultado.r.invalidos, ...resultado.r.duplicados]
                  .sort((a, b) => a.linha - b.linha)
                  .slice(0, 200)
                  .map((x) => (
                    <li key={`${x.linha}-${x.motivo}`} className="rejeitado">
                      <span className="mono num muted">linha {x.linha}</span>
                      <span>{x.empresa || '—'}</span>
                      <span className="muted">{x.whatsapp || 'sem telefone'}</span>
                      <span className="badge">{x.motivo}</span>
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  baixarCsv(
                    'linhas-nao-importadas.csv',
                    [...resultado.r.invalidos, ...resultado.r.duplicados].map((x) => ({ linha: x.linha, empresa: x.empresa, whatsapp: x.whatsapp, motivo: x.motivo })),
                  )
                }
              >
                Baixar lista em CSV
              </button>
            </details>
          )}
          <div className="row wrap">
            <Link to={tag ? `/leads?tag=${encodeURIComponent(tag)}` : '/leads'} className="btn btn-primary">
              Ver leads importados <span className="arrow">→</span>
            </Link>
            <Link to="/" className="ulink">
              Começar a abordar
            </Link>
            <button type="button" className="ulink" onClick={recomecar}>
              Importar outro arquivo
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
