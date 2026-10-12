import type { Rota } from '../app.ts'
import { rotasLeads } from './leads.ts'
import { rotasFila } from './fila.ts'
import { rotasMensagens } from './mensagens.ts'
import { rotasAcoes } from './acoes.ts'
import { rotasTarefas } from './tarefas.ts'
import { rotasCatalogo } from './catalogo.ts'
import { rotasVendas } from './vendas.ts'
import { rotasSincronizacao } from './sincronizacao.ts'

// Ordem importa: rotas fixas antes das com parâmetro (/leads/por-whatsapp antes de /leads/:id).
export const ROTAS: Rota[] = [...rotasSincronizacao, ...rotasLeads, ...rotasFila, ...rotasMensagens, ...rotasAcoes, ...rotasTarefas, ...rotasCatalogo, ...rotasVendas]
