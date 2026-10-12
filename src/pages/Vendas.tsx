import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PageHeader } from '../components/PageHeader'
import { Erro, Skeleton } from '../components/Estados'
import { Icon } from '../components/Icon'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { atualizarVenda, listarManutencoesAtivas, listarVendas, type VendaComLead, type ItemVenda } from '../services/vendas'
import { moeda, quando } from '../lib/formato'

function rotuloMes(d: Date): string {
  const t = format(d, "MMMM 'de' yyyy", { locale: ptBR })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const STATUS_ROTULO = { aguardando: 'Aguardando', pago: 'Pago', cancelado: 'Cancelado' } as const

export function Vendas() {
  const toast = useToast()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const de = mes.toISOString()
  const ate = addMonths(mes, 1).toISOString()
  const { dados: vendas, carregando, erro, recarregar, mutar } = useDados(`vendas:mes:${de}`, () => listarVendas(de, ate))
  const { dados: manutencoes } = useDados('vendas:manutencoes', listarManutencoesAtivas)
  const ehMesAtual = mes.getTime() === startOfMonth(new Date()).getTime()

  const totais = useMemo(() => {
    const v = vendas ?? []
    return {
      pago: v.filter((x) => x.status === 'pago').reduce((t, x) => t + Number(x.valor_total), 0),
      aguardando: v.filter((x) => x.status === 'aguardando').reduce((t, x) => t + Number(x.valor_total), 0),
      quantidade: v.filter((x) => x.status !== 'cancelado').length,
    }
  }, [vendas])
  const recorrente = (manutencoes ?? []).reduce((t, x) => t + Number(x.valor_mensal), 0)

  async function mudarStatus(v: VendaComLead, status: 'aguardando' | 'pago' | 'cancelado') {
    if (status === 'cancelado' && !window.confirm('Cancelar esta venda? Ela sai da receita.')) return
    const anterior = v.status
    mutar((lista) => (lista ?? []).map((x) => (x.id === v.id ? { ...x, status } : x)))
    try {
      await atualizarVenda(v.id, { status }, v.lead_id)
      toast(status === 'pago' ? 'Pagamento confirmado.' : status === 'cancelado' ? 'Venda cancelada.' : 'Marcada como aguardando.', {
        desfazer: () => atualizarVenda(v.id, { status: anterior as 'pago' }, v.lead_id),
      })
    } catch (e) {
      mutar((lista) => (lista ?? []).map((x) => (x.id === v.id ? { ...x, status: anterior } : x)))
      toast(e instanceof Error ? e.message : 'Não foi possível atualizar.', { tipo: 'erro' })
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="04 / Vendas"
        titulo="Vendas"
        acoes={
          <div className="seletor-mes" role="group" aria-label="Mês">
            <button type="button" className="btn-icon" aria-label="Mês anterior" onClick={() => setMes((m) => addMonths(m, -1))}>
              <Icon name="voltar" size={18} />
            </button>
            <span className="seletor-mes-rotulo">{rotuloMes(mes)}</span>
            <button type="button" className="btn-icon" aria-label="Próximo mês" disabled={ehMesAtual} onClick={() => setMes((m) => addMonths(m, 1))}>
              <Icon name="seta" size={18} />
            </button>
          </div>
        }
      />

      <div className="indicadores">
        <Indicador rotulo="Recebido no mês" valor={moeda(totais.pago)} destaque />
        <Indicador rotulo="Aguardando pagamento" valor={moeda(totais.aguardando)} />
        <Indicador rotulo="Vendas no mês" valor={String(totais.quantidade)} />
        <Indicador rotulo="Receita recorrente" valor={`${moeda(recorrente)}/mês`} detalhe={`${manutencoes?.length ?? 0} manutenções ativas`} />
      </div>

      <section className="card bloco-fila" aria-label="Vendas do mês">
        <header className="card-cabecalho">
          <h2 className="bloco-titulo">Vendas de {format(mes, 'MMMM', { locale: ptBR })}</h2>
        </header>
        {erro && !vendas ? (
          <div style={{ padding: 16 }}>
            <Erro texto={erro} tentarDeNovo={() => void recarregar()} />
          </div>
        ) : carregando ? (
          <Skeleton linhas={3} />
        ) : !vendas?.length ? (
          <div className="bloco-vazio">
            <p className="muted">
              {ehMesAtual ? 'Nenhuma venda neste mês ainda. Leads em proposta e negociação estão no Funil.' : 'Nenhuma venda neste mês.'}
            </p>
            {ehMesAtual && (
              <Link to="/funil" className="ulink">
                Abrir o funil
              </Link>
            )}
          </div>
        ) : (
          <ul className="rows" role="list">
            {vendas.map((v) => (
              <LinhaVenda key={v.id} venda={v} mudarStatus={mudarStatus} />
            ))}
          </ul>
        )}
      </section>

      <section className="card bloco-fila" aria-label="Manutenções ativas">
        <header className="card-cabecalho">
          <h2 className="bloco-titulo">Manutenções ativas</h2>
          <span className="badge num">{manutencoes?.length ?? 0}</span>
        </header>
        {!manutencoes ? (
          <Skeleton linhas={2} />
        ) : !manutencoes.length ? (
          <div className="bloco-vazio">
            <p className="muted">Nenhuma manutenção mensal ativa. Ofereça a manutenção ao vender cardápio digital ou site.</p>
          </div>
        ) : (
          <ul className="rows" role="list">
            {manutencoes.map((m) => (
              <li key={m.id} className="item-fila">
                <div className="item-fila-info">
                  {m.lead ? (
                    <Link to={`/leads/${m.lead.id}`} className="item-fila-empresa">
                      {m.lead.empresa}
                    </Link>
                  ) : (
                    <span className="item-fila-empresa">Lead removido</span>
                  )}
                  <span className="muted item-fila-sub">desde {format(new Date(m.fechada_em), 'MM/yyyy')}</span>
                </div>
                <span className="num">{moeda(Number(m.valor_mensal))}/mês</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!window.confirm('Encerrar esta manutenção mensal?')) return
                    void atualizarVenda(m.id, { manutencao_mensal: false }, m.lead_id).then(() => toast('Manutenção encerrada.'))
                  }}
                >
                  Encerrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
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

function LinhaVenda({ venda: v, mudarStatus }: { venda: VendaComLead; mudarStatus: (v: VendaComLead, s: 'aguardando' | 'pago' | 'cancelado') => void }) {
  const itens = (Array.isArray(v.itens) ? v.itens : []) as unknown as ItemVenda[]
  return (
    <li className={`item-fila linha-venda ${v.status === 'cancelado' ? 'venda-cancelada' : ''}`}>
      <div className="item-fila-info">
        {v.lead ? (
          <Link to={`/leads/${v.lead.id}`} className="item-fila-empresa">
            {v.lead.empresa}
          </Link>
        ) : (
          <span className="item-fila-empresa">Lead removido</span>
        )}
        <span className="muted item-fila-sub">
          {itens.map((i) => (i.qtd > 1 ? `${i.qtd}× ${i.nome}` : i.nome)).join(' + ')}
          {v.forma_pagamento ? ` · ${v.forma_pagamento}` : ''} · {quando(v.fechada_em)}
        </span>
      </div>
      <span className="num linha-venda-valor">{moeda(Number(v.valor_total))}</span>
      <select
        className="select select-mover"
        aria-label="Status do pagamento"
        value={v.status}
        onChange={(e) => mudarStatus(v, e.target.value as 'pago')}
      >
        {Object.entries(STATUS_ROTULO).map(([k, r]) => (
          <option key={k} value={k}>
            {r}
          </option>
        ))}
      </select>
    </li>
  )
}
