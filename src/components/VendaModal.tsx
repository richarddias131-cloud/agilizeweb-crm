import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useToast } from '../context/ToastContext'
import { useDados } from '../hooks/useDados'
import { listarServicos } from '../services/servicos'
import { registrarVenda, type ItemVenda } from '../services/vendas'
import { moeda, precoCatalogo } from '../lib/formato'

/** "1.234,56" → 1234.56; texto vazio ou inválido → NaN. */
function paraNumero(t: string): number {
  const limpo = t.trim().replace(/\./g, '').replace(',', '.')
  return limpo ? Number(limpo) : NaN
}

const FORMAS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Dinheiro', 'Transferência']

type Props = {
  aberto: boolean
  lead: { id: string; empresa: string; servico_interesse?: string | null } | null
  aoFechar: () => void
  aoSalvar?: () => void
}

/** Registro da venda ao marcar "ganho": serviços do catálogo, total, pagamento, status e manutenção. */
export function VendaModal({ aberto, lead, aoFechar, aoSalvar }: Props) {
  const toast = useToast()
  const { dados: servicos } = useDados('servicos', listarServicos)
  const [qtd, setQtd] = useState<Record<string, number>>({})
  // Preço digitado por item (texto pt-BR). Sem valor, vale o preço do catálogo.
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [forma, setForma] = useState('Pix')
  const [status, setStatus] = useState<'aguardando' | 'pago'>('aguardando')
  const [manutencao, setManutencao] = useState(false)
  const [mensal, setMensal] = useState('')
  const [mensalEditado, setMensalEditado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const ativos = useMemo(() => (servicos ?? []).filter((s) => s.ativo), [servicos])

  useEffect(() => {
    if (!aberto) return
    setQtd(lead?.servico_interesse ? { [lead.servico_interesse]: 1 } : {})
    setPrecos({})
    setForma('Pix')
    setStatus('aguardando')
    setManutencao(false)
    setMensal('')
    setMensalEditado(false)
  }, [aberto, lead?.id, lead?.servico_interesse])

  const itens: ItemVenda[] = ativos
    .filter((s) => (qtd[s.id] ?? 0) > 0)
    .map((s) => ({ servico_id: s.id, nome: s.nome, qtd: qtd[s.id]!, preco: precoDe(s.id, Number(s.preco)) }))
  const total = itens.reduce((t, i) => t + i.qtd * (Number.isFinite(i.preco) ? i.preco : 0), 0)
  const semPreco = itens.filter((i) => !Number.isFinite(i.preco) || i.preco <= 0)
  const sugestaoMensal = ativos.filter((s) => (qtd[s.id] ?? 0) > 0 && s.recorrente).reduce((t, s) => t + Number(s.preco_mensal ?? 0), 0)

  // Ao escolher um serviço com manutenção, já sugere a manutenção mensal.
  useEffect(() => {
    if (mensalEditado) return
    setManutencao(sugestaoMensal > 0)
    setMensal(sugestaoMensal ? sugestaoMensal.toFixed(2).replace('.', ',') : '')
  }, [sugestaoMensal, mensalEditado])

  function precoDe(id: string, catalogo: number): number {
    const t = precos[id]
    return t === undefined ? catalogo : paraNumero(t)
  }

  const alternar = (id: string) => setQtd((q) => ({ ...q, [id]: q[id] ? 0 : 1 }))
  const mudarQtd = (id: string, d: number) => setQtd((q) => ({ ...q, [id]: Math.max(1, Math.min(99, (q[id] ?? 1) + d)) }))

  async function salvar() {
    if (!lead) return
    if (!itens.length) return toast('Escolha ao menos um serviço.', { tipo: 'erro' })
    if (semPreco.length) return toast(`Informe o valor de ${semPreco[0]!.nome}.`, { tipo: 'erro' })
    const valorMensal = paraNumero(mensal)
    if (manutencao && (!Number.isFinite(valorMensal) || valorMensal <= 0)) return toast('Informe o valor da manutenção mensal.', { tipo: 'erro' })
    setSalvando(true)
    try {
      await registrarVenda({ leadId: lead.id, itens, forma, status, manutencao, valorMensal: manutencao ? valorMensal : 0 })
      toast(`Venda de ${moeda(total)} registrada. ${lead.empresa} agora é cliente.`)
      aoSalvar?.()
      aoFechar()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível registrar a venda.', { tipo: 'erro' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      eyebrow="Ganho"
      titulo={lead ? `Venda para ${lead.empresa}` : 'Registrar venda'}
      largura="larga"
      rodape={
        <>
          <span className="venda-total">
            <span className="label">Total</span> <b className="num">{moeda(total)}</b>
          </span>
          <button type="button" className="btn btn-primary" disabled={salvando || !itens.length} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Registrar venda'} <span className="arrow">→</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="card rows venda-servicos" role="group" aria-label="Serviços">
          {ativos.map((s) => {
            const n = qtd[s.id] ?? 0
            return (
              <div key={s.id} className={`venda-servico ${n ? 'marcado' : ''}`}>
                <label className="toggle venda-servico-nome">
                  <input type="checkbox" checked={n > 0} onChange={() => alternar(s.id)} />
                  <span className="stack" style={{ gap: 0 }}>
                    <span>{s.nome}</span>
                    <span className="muted num" style={{ fontSize: '.82rem' }}>
                      {precoCatalogo(Number(s.preco))}
                      {s.recorrente && s.preco_mensal ? ` + manutenção opcional ${moeda(Number(s.preco_mensal))}/mês` : ''}
                    </span>
                  </span>
                </label>
                {n > 0 && (
                  <div className="input-sufixo venda-preco">
                    <span className="muted">R$</span>
                    <input
                      className="input num"
                      aria-label={`Valor de ${s.nome}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-invalid={precoDe(s.id, Number(s.preco)) > 0 ? undefined : true}
                      value={precos[s.id] ?? (Number(s.preco) > 0 ? Number(s.preco).toFixed(2).replace('.', ',') : '')}
                      onChange={(e) => setPrecos((p) => ({ ...p, [s.id]: e.target.value }))}
                    />
                  </div>
                )}
                {n > 0 && (
                  <div className="qtd" aria-label={`Quantidade de ${s.nome}`}>
                    <button type="button" className="btn-icon" aria-label="Menos" onClick={() => mudarQtd(s.id, -1)}>
                      −
                    </button>
                    <span className="num">{n}</span>
                    <button type="button" className="btn-icon" aria-label="Mais" onClick={() => mudarQtd(s.id, 1)}>
                      +
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Forma de pagamento</span>
          <div className="chips chips-wrap" role="radiogroup" aria-label="Forma de pagamento">
            {FORMAS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={forma === f} className="chip" onClick={() => setForma(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Status</span>
            <div className="segmented segmented-texto" role="radiogroup" aria-label="Status do pagamento" style={{ justifySelf: 'start' }}>
              <button type="button" role="radio" aria-checked={status === 'aguardando'} onClick={() => setStatus('aguardando')}>
                Aguardando
              </button>
              <button type="button" role="radio" aria-checked={status === 'pago'} onClick={() => setStatus('pago')}>
                Pago
              </button>
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={manutencao}
                onChange={(e) => {
                  setManutencao(e.target.checked)
                  setMensalEditado(true)
                }}
              />
              <span>Manutenção mensal</span>
            </label>
            {manutencao && (
              <div className="input-sufixo">
                <span className="muted">R$</span>
                <input
                  className="input num"
                  aria-label="Valor mensal"
                  inputMode="decimal"
                  value={mensal}
                  onChange={(e) => {
                    setMensal(e.target.value)
                    setMensalEditado(true)
                  }}
                />
                <span className="muted">/mês</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
