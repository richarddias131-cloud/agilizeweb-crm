// Edge Function "api" — API do CRM para o Grok Bot e outras automações.
// Deploy: supabase functions deploy api --no-verify-jwt
import { criarApp } from './app.ts'
import { BancoSupabase } from './banco_supabase.ts'
import { VERSAO_API } from './openapi.ts'

const url = Deno.env.get('SUPABASE_URL')
const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !chaveServico) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos (o Supabase define automaticamente).')

const banco = new BancoSupabase(url, chaveServico)

Deno.serve(
  criarApp({
    banco,
    agora: () => new Date(),
    versao: VERSAO_API,
    // O wa-bridge (Fase 7) ainda não existe: todo envio vira ação pendente.
    bridgeOnline: async () => false,
  }),
)
