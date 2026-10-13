# SETUP — o que você precisa fazer

Passo a passo para colocar o CRM no ar. Faça na ordem. Cada fase nova pode acrescentar passos aqui. Eles ficam marcados com a fase em que passam a valer.

---

## Parte 1 — Supabase (banco e login)

1. Entre em https://supabase.com e crie uma conta (pode usar o GitHub).
2. Clique em **New project**. Nome: `cresbi-crm`. Região: **South America (São Paulo)**. Crie uma senha forte para o banco e guarde num gerenciador de senhas.
3. Espere o projeto terminar de criar (1–2 minutos).
4. Vá em **Authentication → Sign In / Providers**:
   - Deixe **Email** ligado.
   - Desligue **Allow new users to sign up**. Só você vai usar, e assim ninguém cria conta.
   - Desligue **Confirm email** (opcional, facilita criar seu usuário).
5. Vá em **Authentication → Users → Add user → Create new user**. Coloque seu e-mail e uma senha. Marque **Auto Confirm User**.
6. Vá em **Authentication → URL Configuration** e em **Site URL** coloque:
   `https://richarddias131-cloud.github.io/cresbi-crm/`
7. Vá em **Project Settings → API** (ou **Data API / API Keys**) e copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public key** (a chave pública, começa com `eyJ...` ou `sb_publishable_...`)

   **Nunca** use a `service_role` / `secret` no front nem no GitHub Pages.

## Parte 2 — Banco de dados *(vale a partir da Fase 2)*

8. No Supabase, abra **SQL Editor → New query**.
9. Abra cada arquivo da pasta `supabase/migrations/` deste repositório, em ordem de nome, cole o conteúdo e clique em **Run**.
10. Depois rode o `supabase/seed.sql` do mesmo jeito. Ele cadastra o catálogo de serviços, os templates e a configuração inicial **para o seu usuário** (por isso o passo 5 vem antes).

## Parte 3 — GitHub (deploy automático)

11. No repositório `cresbi-crm` no GitHub, vá em **Settings → Secrets and variables → Actions → New repository secret** e crie:
    - `VITE_SUPABASE_URL` = o Project URL do passo 7
    - `VITE_SUPABASE_ANON_KEY` = a anon key do passo 7
12. Vá em **Settings → Pages** e em **Source** escolha **GitHub Actions**.
13. Vá em **Actions**, abra o workflow **Deploy no GitHub Pages** e clique em **Run workflow** (ou faça qualquer push na `main`).
14. Quando ficar verde, abra https://richarddias131-cloud.github.io/cresbi-crm/ e entre com o e-mail e a senha do passo 5.

## Parte 4 — Instalar como app (PWA)

15. **Celular (Android/Chrome):** abra a URL → menu ⋮ → **Instalar app**. **iPhone (Safari):** botão compartilhar → **Adicionar à Tela de Início**.
16. **Desktop (Chrome/Edge):** ícone de instalar na barra de endereço → **Instalar**.

## Parte 5 — Rodar no seu computador (opcional)

17. Instale o Node.js 22 ou mais novo.
18. No terminal, dentro da pasta do projeto:
    ```bash
    npm install
    cp .env.example .env.local   # edite e cole a URL e a anon key
    npm run dev
    ```
19. Abra o endereço que aparecer (ex.: `http://localhost:5173/cresbi-crm/`).

## Parte 6 — API do Grok Bot *(vale a partir da Fase 4)*

### Publicar a API (Edge Function)

Escolha **um** dos caminhos.

**Caminho A — pelo GitHub (automático a cada mudança):**

20. No Supabase, clique na sua foto (canto superior direito) → **Account preferences → Access Tokens → Generate new token**. Dê o nome `github-actions` e copie o token.
21. No GitHub, em **Settings → Secrets and variables → Actions**, crie:
    - `SUPABASE_ACCESS_TOKEN` = o token do passo 20
    - `SUPABASE_PROJECT_REF` = o código do projeto (o trecho `abcd1234` de `https://abcd1234.supabase.co`)
22. Vá em **Actions → Deploy da API (Edge Function) → Run workflow**. Quando ficar verde, a API está no ar.

**Caminho B — pelo seu computador:**

20. No terminal, dentro da pasta do projeto:
    ```bash
    npx supabase login
    npx supabase link --project-ref SEU_PROJECT_REF
    npx supabase functions deploy api --no-verify-jwt
    ```

23. Confira abrindo no navegador: `https://SEU_PROJECT_REF.supabase.co/functions/v1/api/v1/health`. Deve aparecer `{"status":"ok",...}`.

> O `--no-verify-jwt` é obrigatório: o agente entra com a chave própria (`crb_...`), não com o login do Supabase. A função usa a `service_role` só por dentro. Ela nunca sai do Supabase e não vai para o agente.

### Gerar a chave do Grok

24. No CRM, abra **Configurações → API e agente → Nova chave**. Nome: `Grok Bot`. Escopos: `leitura`, `escrita` e `relatorios` (deixe `envio` desligado por enquanto).
25. Copie a chave (`crb_...`) **na hora**: ela aparece uma única vez. Guarde no gerenciador de senhas.
26. (Opcional) Teste tudo de uma vez no terminal (precisa do `jq`):
    ```bash
    export CRB_API="https://SEU_PROJECT_REF.supabase.co/functions/v1/api/v1"
    export CRB_CHAVE="crb_..."
    bash scripts/testar-api.sh
    ```
    O script cria um lead de teste, prepara uma mensagem, registra uma nota, lê a fila e arquiva o lead.

### Conectar o Grok Bot

27. No Grok Bot (ou na plataforma onde ele roda), cole como **prompt de sistema** o bloco de texto do arquivo `docs/AGENTE.md`.
28. Cadastre as ferramentas (function calling) com o conteúdo de `docs/grok-tools.json`. São 23 ferramentas, uma por ação. Em cada uma, o campo `x-http` diz qual rota da API chamar.
29. Configure o executor das ferramentas com a base da API, o header `Authorization: Bearer crb_...` e um `Idempotency-Key` (UUID) em cada `POST`. Os detalhes estão no topo do `docs/AGENTE.md`. Se preferir n8n ou Postman, importe o `docs/openapi.yaml`.
30. Peça ao Grok: "Leia a fila de hoje e me diga o que tem". As chamadas aparecem em **Configurações → API e agente → Registro do agente**, e as propostas dele aparecem no topo da tela **Hoje**, em "Para aprovar".

31. (Opcional) **Webhooks:** se o Grok (ou o n8n) tiver um endereço para receber avisos, cadastre em **Configurações → API e agente → Webhooks**, escolha os eventos e use **Enviar teste**. Os webhooks usam as extensões `pg_net` e `pg_cron`, que a migration `20261012000007_webhooks.sql` liga sozinha. Se ela der erro de permissão, ative as duas em **Database → Extensions** no Supabase e rode a migration de novo.

**Botão de emergência:** em **Configurações → API e agente**, o interruptor **Pausar agente** bloqueia na hora todas as escritas do Grok.
