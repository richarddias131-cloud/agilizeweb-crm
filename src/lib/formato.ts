import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numFmt = new Intl.NumberFormat('pt-BR')

export function moeda(v: number | null | undefined): string {
  return moedaFmt.format(v ?? 0)
}

export function numero(v: number | null | undefined): string {
  return numFmt.format(v ?? 0)
}

/** "há 3 dias", "há 2 horas". */
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  return `há ${formatDistanceToNowStrict(new Date(iso), { locale: ptBR })}`
}

/** "hoje 14:30", "ontem", "amanhã 09:00", "12/10". */
export function quando(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isToday(d)) return `hoje ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `ontem ${format(d, 'HH:mm')}`
  if (isTomorrow(d)) return `amanhã ${format(d, 'HH:mm')}`
  const dias = differenceInCalendarDays(d, new Date())
  if (dias > 0 && dias < 7) return format(d, "EEEE HH:mm", { locale: ptBR })
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'dd/MM HH:mm' : 'dd/MM/yyyy', { locale: ptBR })
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}
