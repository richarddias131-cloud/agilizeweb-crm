import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { MOTIVOS_PERDA } from '../../shared/dominio.ts'

type Props = { aberto: boolean; aoFechar: () => void; aoConfirmar: (motivo: string) => void; empresa?: string }

export function MotivoPerdaModal({ aberto, aoFechar, aoConfirmar, empresa }: Props) {
  const [motivo, setMotivo] = useState<string>('')
  const [outro, setOutro] = useState('')

  useEffect(() => {
    if (aberto) {
      setMotivo('')
      setOutro('')
    }
  }, [aberto])

  const final = motivo === 'Outro' ? outro.trim() : motivo
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      eyebrow="Perdido"
      titulo={empresa ? `Por que perdemos ${empresa}?` : 'Por que perdemos?'}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!final} onClick={() => aoConfirmar(final)}>
            Marcar como perdido <span className="arrow">→</span>
          </button>
        </>
      }
    >
      <div className="opcoes" role="radiogroup" aria-label="Motivo da perda">
        {MOTIVOS_PERDA.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={motivo === m}
            className="opcao"
            onClick={() => setMotivo(m)}
            onDoubleClick={() => m !== 'Outro' && aoConfirmar(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {motivo === 'Outro' && (
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="motivo-outro">Qual?</label>
          <input id="motivo-outro" className="input" autoFocus value={outro} onChange={(e) => setOutro(e.target.value)} />
        </div>
      )}
    </Modal>
  )
}
