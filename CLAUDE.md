# CLAUDE.md — CRM CRESBI

CRM interno da CRESBI (um usuário: Richard) + API para o agente Grok Bot.
Prioridade nº 1: **toda ação do dia a dia em 1 ou 2 toques**. Rápido > bonito.

## Comandos
- `npm run dev` — servidor local (precisa de `.env.local` com as chaves do Supabase)
- `npm run build` — typecheck + build de produção (rode antes de todo commit)
- `npm test` — testes (Vitest) de `src/` e `shared/`
- `npm run sync:shared` — copia `shared/` para `supabase/functions/api/_shared/` (obrigatório após mudar `shared/` ou `database.types.ts`)
- `npm run docs:api` — gera `docs/openapi.yaml` e `docs/grok-tools.json` a partir de `supabase/functions/api/openapi.ts`
- API (Deno): `cd supabase/functions/api && deno test tests/ && deno check index.ts`
- `npm test` falha se a cópia do `shared/` ou as docs geradas estiverem desatualizadas.

## API para agentes (supabase/functions/api, chaves `crb_`)
- `app.ts`: pipeline (rota → chave crb_ por hash SHA-256 → limite 60/min via api_log → escopo → pausa → idempotência → handler → log).
- `rotas/*.ts`: endpoints. `lib/negocio.ts`: regras (opt-out, prospecção fria, limite diário). Toda regra do agente é aplicada no servidor.
- Acesso a dados só pela interface `Banco` (`lib/tipos.ts`): `banco_supabase.ts` (produção, service_role filtrando user_id) e `tests/banco_memoria.ts` (testes).
- Novo endpoint = rota em `rotas/` + operação em `openapi.ts` (com `ferramenta` se o Grok usar) + teste + `npm run docs:api` + seção em `docs/API.md`.

## Stack
Vite + React + TypeScript estrito, CSS puro com variáveis (sem Tailwind), `HashRouter`,
Supabase (Postgres + Auth + Realtime), PWA (vite-plugin-pwa), deploy no GitHub Pages
(`base: '/cresbi-crm/'`). Libs permitidas: `@supabase/supabase-js`, `react-router-dom`,
`@dnd-kit/core`, `date-fns` (locale pt-BR), `papaparse`, `vite-plugin-pwa`.
**Não adicionar dependências sem perguntar ao Richard.**

## Estrutura
- `src/config/brand.ts` — nome, WhatsApp, assinatura. Nunca escrever "CRESBI" solto no código de UI.
- `src/services/` — única camada que fala com o Supabase (um arquivo por entidade). Componentes nunca importam `lib/supabase`.
- `shared/` — regras de negócio usadas pelo front **e** pela Edge Function (telefone, templates, cadência, fila, opt-out). TS puro, sem dependências, imports com extensão `.ts`.
- `supabase/migrations/` — SQL versionado; `supabase/seed.sql` — catálogo, templates, config.
- `docs/` — API.md, openapi.yaml, grok-tools.json, AGENTE.md.

## Regras de negócio (onde ficam)
- **Fila Hoje:** `fila_hoje()` (SQL) entrega os candidatos; `shared/fila.ts` decide ação e template. Tela e `GET /fila/hoje` usam os dois.
- **Cadência:** `shared/cadencia.ts` (`aposEnvio`, `deveEncerrar`). O resultado vai para a RPC `registrar_envio`.
- **Ações rápidas:** RPCs `registrar_envio`, `marcar_respondeu`, `mudar_estagio` devolvem um *marco* (o `now()` da transação). `desfazer_acao(lead, marco, retrato)` reverte exatamente o que foi gravado (usado pelo toast "Desfazer").
- **Ator:** as RPCs recebem `p_ator`/`p_ator_nome` (richard | agente | bridge). A interação de mudança de estágio é gravada por trigger.
- **Importação em lote:** `shared/importacao.ts` (CSV da tela e `POST /leads/lote`).
- **Métricas:** função SQL `metricas_resumo` (Painel e `GET /metricas/resumo`).
- **Webhooks:** triggers no banco → `webhook_entregas` → `pg_net` (HMAC-SHA256); job `pg_cron` "agz-webhooks" reenvia (1/5/15 min) e desativa após 10 falhas.
- **Tipos do banco:** `src/lib/database.types.ts`, no formato do `supabase gen types`. Atualize quando mudar uma migration.

## Identidade visual CRESBI "Ouro champanhe · Tech" (seguir à risca)
- Tokens em `src/styles/tokens.css` (nomes da marca: `--ground`, `--surface`, `--gold`… e aliases antigos `--bg`, `--card`, `--em`…). **Escuro é o padrão**; claro opcional (escuro/claro/sistema, `localStorage` `agz-tema`).
- Ouro (`--gold`) **só** em botão primário, foco, indicadores, tags e detalhes. Nunca fundo de área grande. Texto sobre ouro usa `--on-gold`.
- Fontes: Geist e Geist Mono (auto-hospedadas em `public/fonts/`). Títulos peso 600 com letter-spacing negativo.
- Rótulos: classe `.eyebrow` (overline mono 11px, maiúsculas, 0.08em, ouro). Números: `.num` (tabular-nums). Dinheiro: `Intl.NumberFormat('pt-BR')`.
- Raios: 4px em botões e campos (`--radius-sm`), 8px em cards (`--radius`). Pílula só em status.
- Botões: `.btn.btn-primary` (ouro, `<span className="arrow">→</span>`), `.ulink` (link em ouro), `.btn.btn-ghost` (contorno).
- Cards: `.card` / `.card-lg` em `--surface`, borda `--line`, sem sombra. Divisões: `.rows`. Fundo com grade técnica de 40px.
- Badges: `.badge` (neutra), `.badge-em` (ouro), `.badge-ok`, `.badge-danger`.
- Logo: `src/components/Logo.tsx` (símbolo facetado + "CRESBI" + "CRM").
- Animações 150–250 ms, sempre respeitando `prefers-reduced-motion` (já tratado em tokens.css).
- Mobile first: funcionar a 375px, alvos de toque ≥ 44px, `env(safe-area-inset-*)`.

## Tom de voz CRESBI
Português do Brasil, preciso, técnico e sóbrio. "Você" para o cliente, "nós" para a CRESBI. CRESBI sempre em caixa alta.
Sem ponto de exclamação, sem emoji, sem jargão. **Nunca usar a palavra "simples"** nem termos que rebaixem a marca.
Estados vazios: uma frase útil + botão da próxima ação.

## Catálogo
5 frentes: Sistemas sob medida, Sites, Presença digital, Dados e BI (Cresbi Analyzer), Automações. Preço 0 = "valor por proposta" (`precoCatalogo()` em `src/lib/formato.ts`; o valor é digitado na venda).

## Padrões de código
- TypeScript estrito, sem `any`. Tipos do banco em `src/lib/database.types.ts`.
- Atualização otimista nas ações rápidas, com desfazer por 5 s (toast).
- Toda tela tem estados de carregando (skeleton), vazio e erro, com mensagens em português.
- Acessibilidade: navegação por teclado, `aria-label` em botões só de ícone, contraste AA.
- Commits em português: `feat:`, `fix:`, `chore:`.
