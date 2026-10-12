# SETUP — o que você precisa fazer

Passo a passo para colocar o CRM no ar. Faça na ordem. Cada fase nova pode acrescentar passos aqui. Eles ficam marcados com a fase em que passam a valer.

---

## Parte 1 — Supabase (banco e login)

1. Entre em https://supabase.com e crie uma conta (pode usar o GitHub).
2. Clique em **New project**. Nome: `agilizeweb-crm`. Região: **South America (São Paulo)**. Crie uma senha forte para o banco e guarde num gerenciador de senhas.
3. Espere o projeto terminar de criar (1–2 minutos).
4. Vá em **Authentication → Sign In / Providers**:
   - Deixe **Email** ligado.
   - Desligue **Allow new users to sign up**. Só você vai usar, e assim ninguém cria conta.
   - Desligue **Confirm email** (opcional, facilita criar seu usuário).
5. Vá em **Authentication → Users → Add user → Create new user**. Coloque seu e-mail e uma senha. Marque **Auto Confirm User**.
6. Vá em **Authentication → URL Configuration** e em **Site URL** coloque:
   `https://richarddias131-cloud.github.io/agilizeweb-crm/`
7. Vá em **Project Settings → API** (ou **Data API / API Keys**) e copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public key** (a chave pública, começa com `eyJ...` ou `sb_publishable_...`)

   **Nunca** use a `service_role` / `secret` no front nem no GitHub Pages.

## Parte 2 — Banco de dados *(vale a partir da Fase 2)*

8. No Supabase, abra **SQL Editor → New query**.
9. Abra cada arquivo da pasta `supabase/migrations/` deste repositório, em ordem de nome, cole o conteúdo e clique em **Run**.
10. Depois rode o `supabase/seed.sql` do mesmo jeito. Ele cadastra o catálogo de serviços, os templates e a configuração inicial **para o seu usuário** (por isso o passo 5 vem antes).

## Parte 3 — GitHub (deploy automático)

11. No repositório `agilizeweb-crm` no GitHub, vá em **Settings → Secrets and variables → Actions → New repository secret** e crie:
    - `VITE_SUPABASE_URL` = o Project URL do passo 7
    - `VITE_SUPABASE_ANON_KEY` = a anon key do passo 7
12. Vá em **Settings → Pages** e em **Source** escolha **GitHub Actions**.
13. Vá em **Actions**, abra o workflow **Deploy no GitHub Pages** e clique em **Run workflow** (ou faça qualquer push na `main`).
14. Quando ficar verde, abra https://richarddias131-cloud.github.io/agilizeweb-crm/ e entre com o e-mail e a senha do passo 5.

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
19. Abra o endereço que aparecer (ex.: `http://localhost:5173/agilizeweb-crm/`).

## Parte 6 — API do Grok Bot *(vale a partir da Fase 4)*

Os passos para publicar a Edge Function, gerar a chave do Grok e conectar o agente entram aqui na Fase 4.
