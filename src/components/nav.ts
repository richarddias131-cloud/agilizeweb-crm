import type { IconName } from './Icon'

export type ItemNav = { to: string; rotulo: string; icone: IconName; atalho?: string }

export const NAV_PRINCIPAL: ItemNav[] = [
  { to: '/', rotulo: 'Hoje', icone: 'hoje', atalho: 'H' },
  { to: '/leads', rotulo: 'Leads', icone: 'leads' },
  { to: '/funil', rotulo: 'Funil', icone: 'funil', atalho: 'F' },
  { to: '/vendas', rotulo: 'Vendas', icone: 'vendas' },
  { to: '/painel', rotulo: 'Painel', icone: 'painel' },
  { to: '/importar', rotulo: 'Importar', icone: 'importar' },
]

export const NAV_CONFIG: ItemNav = { to: '/config', rotulo: 'Configurações', icone: 'config' }

/** Barra inferior do celular: 5 itens. */
export const NAV_MOBILE: ItemNav[] = [
  { to: '/', rotulo: 'Hoje', icone: 'hoje' },
  { to: '/leads', rotulo: 'Leads', icone: 'leads' },
  { to: '/funil', rotulo: 'Funil', icone: 'funil' },
  { to: '/vendas', rotulo: 'Vendas', icone: 'vendas' },
  { to: '/mais', rotulo: 'Mais', icone: 'mais' },
]
