import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PageHeader } from '../components/PageHeader'
import { Erro, Skeleton } from '../components/Estados'
import { useDados } from '../hooks/useDados'
import { obterMetricas, type MetricasResumo } from '../services/metricas'
import { ESTAGIO_ROTULO } from '../../shared/dominio.ts'
import { moeda, numero } from '../lib/formato'

const PERIODOS = [
  { id: 'mes', rotulo: 'Este mês', de: () => startOfMonth(new Date()) },
  { id: '30', rotulo: '30 dias', de: () => startOfDay(subDays(new Date(), 29)) },
  { id: '90', rotulo: '90 dias', de: () => startOfDay(subDays(new Date(), 89)) },
] as const

const pct = (v: number) => `${Math.round(v * 100)}%`

export function Painel() {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['id']>('mes')
  const def = PERIODOS.find((p) => p.id === periodo)!
  const { dados: m, carregando, erro, recarregar } = useDados(`painel:${periodo}`, () => obterMetricas(def.de()))
  const { dados: m14 } = useDados('painel:14d', () => obterMetricas(startOfDay(subDays(new Date(), 13))))

  return (
    <div className="page">
      <PageHeader
        eyebrow="05 / Painel"
        titulo="Painel"
        acoes={
          <div className="segmented segmented-texto" role="radiogroup" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={periodo === p.id} onClick={() => setPeriodo(p.id)}>
                {p.rotulo}
              </button>
            ))}
          </div>
        }
      />

      {erro && !m ? (
        <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
      ) : carregando || !m ? (
        <Skeleton linhas={4} altura={80} />
      ) : (
        <>
          <div className="indicadores">
            <Indicador rotulo="Receita do mês" valor={moeda(m.receita_mes.paga)} detalhe={`${moeda(m.receita_mes.aguardando)} aguardando`} destaque />
            <Indicador rotulo="Receita recorrente" valor={`${moeda(m.receita_recorrente.mensal)}`} detalhe={`por mês · ${m.receita_recorrente.manutencoes_ativas} manutenções`} />
            <Indicador
              rotulo="Taxa de resposta"
              valor={pct(m.taxa_resposta.taxa)}
              detalhe={`${m.taxa_resposta.responderam} de ${m.taxa_resposta.abordados} abordados no período`}
            />
            <Indicador
              rotulo="Abordagens no período"
              valor={numero(m.abordagens_por_dia.reduce((t, d) => t + d.quantidade, 0))}
              detalhe={`${moeda(m.receita_periodo.paga)} recebidos no período`}
            />
          </div>

          <GraficoDias dados={m14?.abordagens_por_dia ?? null} />

          <div className="painel-grade">
            <BarrasHorizontais
              titulo="Funil por estágio"
              itens={m.funil.map((f) => ({
                rotulo: ESTAGIO_ROTULO[f.estagio],
                valor: f.quantidade,
                texto: `${numero(f.quantidade)}${f.valor_estimado ? ` · ${moeda(f.valor_estimado)}` : ''}`,
              }))}
              vazio="Nenhum lead ainda."
              acao={<Link to="/funil" className="ulink">Abrir o funil</Link>}
            />
            <BarrasHorizontais
              titulo="Segmentos que mais respondem"
              itens={m.segmentos.slice(0, 6).map((s) => ({ rotulo: s.segmento, valor: s.taxa, max: 1, texto: `${pct(s.taxa)} · ${s.responderam} de ${s.abordados}` }))}
              vazio="Assim que você abordar leads de segmentos diferentes, a comparação aparece aqui."
            />
            <BarrasHorizontais
              titulo="Motivos de perda"
              itens={m.motivos_perda.slice(0, 5).map((x) => ({ rotulo: x.motivo, valor: x.quantidade, texto: numero(x.quantidade) }))}
              vazio="Nenhum lead perdido no período."
            />
          </div>
        </>
      )}
    </div>
  )
}

function Indicador({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={`card indicador ${destaque ? 'indicador-destaque' : ''}`}>
      <span className="label">{rotulo}</span>
      <span className="indicador-valor num">{valor}</span>
      {detalhe && <span className="muted" style={{ fontSize: '.8rem' }}>{detalhe}</span>}
    </div>
  )
}

type ItemBarra = { rotulo: string; valor: number; texto: string; max?: number }

/** Barras horizontais no estilo da barra do kit do site (trilho --soft, preenchimento --em), com o valor sempre visível. */
function BarrasHorizontais({ titulo, itens, vazio, acao }: { titulo: string; itens: ItemBarra[]; vazio: string; acao?: ReactNode }) {
  const max = Math.max(...itens.map((i) => i.max ?? i.valor), 0)
  const temDados = itens.some((i) => i.valor > 0)
  return (
    <section className="card card-pad grafico" aria-label={titulo}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="bloco-titulo">{titulo}</h2>
        {acao}
      </header>
      {!temDados ? (
        <p className="muted">{vazio}</p>
      ) : (
        <ul className="barras-h" role="list">
          {itens.map((i) => (
            <li key={i.rotulo} className="barra-h" title={`${i.rotulo}: ${i.texto}`}>
              <div className="barra-h-topo">
                <span>{i.rotulo}</span>
                <span className="num barra-h-valor">{i.texto}</span>
              </div>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${max ? Math.max((i.valor / max) * 100, i.valor > 0 ? 2 : 0) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Abordagens por dia (14 dias): uma série, barras finas, tooltip por barra, hoje e o máximo rotulados, tabela opcional. */
function GraficoDias({ dados }: { dados: MetricasResumo['abordagens_por_dia'] | null }) {
  const [tabela, setTabela] = useState(false)
  const [ativo, setAtivo] = useState<number | null>(null)
  if (!dados) return <Skeleton linhas={1} altura={200} />
  const max = Math.max(...dados.map((d) => d.quantidade), 1)
  const iMax = dados.findIndex((d) => d.quantidade === max && max > 0)
  const total = dados.reduce((t, d) => t + d.quantidade, 0)
  const rotulo = (d: string) => format(parseISO(d), "EEE, d 'de' MMM", { locale: ptBR })

  return (
    <section className="card card-pad grafico" aria-label="Abordagens nos últimos 14 dias">
      <header className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="bloco-titulo">Abordagens nos últimos 14 dias</h2>
          <span className="muted num" style={{ fontSize: '.85rem' }}>
            {numero(total)} no total · média {numero(Math.round((total / dados.length) * 10) / 10)} por dia
          </span>
        </div>
        <button type="button" className="ulink" aria-pressed={tabela} onClick={() => setTabela((t) => !t)}>
          {tabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </header>
      {tabela ? (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Abordagens</th>
              </tr>
            </thead>
            <tbody>
              {[...dados].reverse().map((d) => (
                <tr key={d.dia}>
                  <td>{rotulo(d.dia)}</td>
                  <td className="num">{d.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="colunas-dias" role="img" aria-label={`Abordagens por dia, de ${rotulo(dados[0]!.dia)} a hoje. Total ${total}.`} onMouseLeave={() => setAtivo(null)}>
          {dados.map((d, i) => {
            const hoje = i === dados.length - 1
            const mostrarValor = (hoje || i === iMax) && d.quantidade > 0
            return (
              <div
                key={d.dia}
                className={`coluna-dia ${ativo === i ? 'ativa' : ''} ${hoje ? 'hoje' : ''}`}
                onMouseEnter={() => setAtivo(i)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                tabIndex={0}
                aria-label={`${rotulo(d.dia)}: ${d.quantidade} abordagens`}
              >
                <div className="coluna-dia-area">
                  {mostrarValor && <span className="coluna-dia-valor num">{d.quantidade}</span>}
                  <span className="coluna-dia-barra" style={{ height: `${(d.quantidade / max) * 100}%` }} />
                  {ativo === i && (
                    <span className="tooltip-grafico" role="tooltip">
                      <span className="muted">{rotulo(d.dia)}</span>
                      <span>
                        <b className="num">{d.quantidade}</b> {d.quantidade === 1 ? 'abordagem' : 'abordagens'}
                      </span>
                    </span>
                  )}
                </div>
                <span className="coluna-dia-rotulo mono">{hoje ? 'hoje' : format(parseISO(d.dia), 'dd')}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
