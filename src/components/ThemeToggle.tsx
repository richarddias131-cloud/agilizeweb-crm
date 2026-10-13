import { useTheme, type Tema } from '../context/ThemeContext'
import { Icon, type IconName } from './Icon'

const OPCOES: { valor: Tema; rotulo: string; icone: IconName }[] = [
  { valor: 'dark', rotulo: 'Tema escuro', icone: 'lua' },
  { valor: 'light', rotulo: 'Tema claro', icone: 'sol' },
  { valor: 'system', rotulo: 'Tema do sistema', icone: 'sistema' },
]

export function ThemeToggle() {
  const { tema, setTema } = useTheme()
  return (
    <div className="segmented" role="radiogroup" aria-label="Tema">
      {OPCOES.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={tema === o.valor}
          aria-label={o.rotulo}
          title={o.rotulo}
          onClick={() => setTema(o.valor)}
        >
          <Icon name={o.icone} size={16} />
        </button>
      ))}
    </div>
  )
}
