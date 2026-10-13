# API do CRM CRESBI

API REST para o **Grok Bot** (ou qualquer agente/automação, como o n8n) operar o CRM com segurança. Ela roda numa Edge Function do Supabase e aplica todas as regras no servidor: escopos, opt-out, prospecção fria, limites e "Pausar agente".

- **Base:** `https://<projeto>.supabase.co/functions/v1/api/v1`
- **Especificação:** `GET /openapi.json` (o mesmo conteúdo está em [`docs/openapi.yaml`](openapi.yaml))
- **Ferramentas prontas para o Grok:** [`docs/grok-tools.json`](grok-tools.json)
- **Prompt do agente:** [`docs/AGENTE.md`](AGENTE.md)
- **Teste de fumaça:** `bash scripts/testar-api.sh`

Nos exemplos abaixo:

```bash
export CRB_API="https://SEU-PROJETO.supabase.co/functions/v1/api/v1"
export CRB_CHAVE="crb_..."
```

---

## Convenções

| Tema | Regra |
|---|---|
| Autenticação | `Authorization: Bearer crb_<chave>`. A chave é criada em **Configurações → API e agente** e aparece uma única vez. Revogar corta o acesso na hora. |
| Escopos | `leitura` (consultar), `escrita` (criar/editar), `envio` (WhatsApp direto pelo wa-bridge), `relatorios` (métricas). O Grok começa com `leitura + escrita + relatorios`. |
| Formato | JSON com campos em português, iguais aos do banco. Datas ISO 8601 com fuso. Valores como número (`549.9`), nunca texto formatado. |
| Paginação | `?limite=50&cursor=...` → `{ "dados": [...], "proximo_cursor": "..." }`. `proximo_cursor: null` = acabou. |
| Idempotência | Todo `POST` aceita `Idempotency-Key`. A mesma chave em 24 h devolve a mesma resposta (header `Idempotent-Replayed: true`) sem duplicar nada. Use um UUID por operação e repita a chave em caso de timeout. |
| Limite | 60 requisições/min por chave → `429 limite_requisicoes` com `Retry-After`. |
| CORS | Fechado. A API é para servidor, não para navegador. |
| Auditoria | Toda escrita grava `ator = agente` e o nome da chave. Toda chamada vai para o registro (30 dias). |
| Exclusão | Não existe `DELETE`. Use `POST /leads/{id}/arquivar`. |

### Erros

Sempre neste formato, com o status HTTP correto:

```json
{ "erro": { "codigo": "lead_opt_out", "mensagem": "Este lead pediu para não receber mensagens (opt-out)...", "detalhes": { "lead_id": "..." } } }
```

| Status | Código | O que fazer |
|---|---|---|
| 400 | `json_invalido` | Corrija o JSON do corpo. |
| 401 | `nao_autenticado`, `chave_invalida` | Envie a chave; se foi revogada ou expirou, peça uma nova ao Richard. |
| 403 | `escopo_insuficiente` | A chave não tem o escopo (`detalhes.escopo_necessario`). Não tente de novo. |
| 403 | `lead_opt_out` | Nunca mais envie nem prepare mensagens para este lead. |
| 403 | `cors_bloqueado` | Chame de um servidor, não do navegador. |
| 404 | `lead_nao_encontrado`, `rota_nao_encontrada`… | Confira o id ou a rota. |
| 405 | `metodo_nao_permitido` | Não existe DELETE; use arquivar. |
| 409 | `whatsapp_duplicado` | O número já pertence a outro lead (`detalhes.lead_id`). |
| 422 | `dados_invalidos` | Veja `detalhes.campos` e corrija campo a campo. |
| 429 | `limite_requisicoes`, `limite_diario` | Espere `Retry-After` segundos (diário: retome amanhã). |
| 503 | `agente_pausado` | O Richard pausou o agente. Só leituras funcionam. Tente mais tarde. |
| 500 | `erro_interno` | Tente de novo em instantes (com a mesma `Idempotency-Key`). |

---

## Endpoints

### Sistema

```bash
curl "$CRB_API/health"
curl "$CRB_API/openapi.json"
```

### Leads

**Listar** (escopo `leitura`). Filtros: `estagio`, `cidade`, `segmento`, `tag`, `busca`, `sem_contato_ha_dias`, `atualizado_desde`, `incluir_arquivados`.

```bash
curl "$CRB_API/leads?estagio=novo&cidade=Campinas&limite=20" -H "Authorization: Bearer $CRB_CHAVE"
curl "$CRB_API/leads?sem_contato_ha_dias=7&cursor=eyJ1cGRh..." -H "Authorization: Bearer $CRB_CHAVE"
```

**Lead completo** com as últimas 20 interações e as tarefas abertas:

```bash
curl "$CRB_API/leads/3f1c...-uuid" -H "Authorization: Bearer $CRB_CHAVE"
# → { "lead": {...}, "interacoes": [...], "tarefas": [...] }
```

**Buscar pelo WhatsApp** (qualquer formato; o servidor normaliza):

```bash
curl "$CRB_API/leads/por-whatsapp/(19)%2099999-9999" -H "Authorization: Bearer $CRB_CHAVE"
```

**Criar ou atualizar (upsert pelo WhatsApp)** (escopo `escrita`). Obrigatórios: `empresa` e `whatsapp`. Se o número já existir, atualiza só os campos enviados e responde `criado: false`.

```bash
curl -X POST "$CRB_API/leads" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6b1d0f2e-7f3a-4c51-9d3b-1a2b3c4d5e6f" \
  -d '{"empresa":"Ótica Visão","whatsapp":"(19) 99999-9999","cidade":"Campinas","uf":"SP","segmento":"Ótica","link_google":"https://maps.google.com/...","nota_auditoria":62}'
# 201 → { "criado": true, "lead": {...} }   |   200 → { "criado": false, "lead": {...} }
```

**Criar vários de uma vez** (até 500; mesmo relatório da importação CSV):

```bash
curl -X POST "$CRB_API/leads/lote" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 9a1b...-uuid" \
  -d '{"tag":"oticas-campinas-out","leads":[{"empresa":"Ótica A","whatsapp":"19999990001","cidade":"Campinas"},{"empresa":"Ótica B","whatsapp":"(19) 3333-4444"}]}'
# → { "importados": 2, "duplicados": 0, "invalidos": 0, "ids": [...], "detalhes": { "duplicados": [], "invalidos": [] } }
```

**Editar** (enriquecer). Não muda estágio nem arquiva. `opt_out` só pode virar `true`:

```bash
curl -X PATCH "$CRB_API/leads/<id>" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"instagram":"@oticavisao","tags":["campinas-out"],"proxima_acao":"Enviar auditoria","proxima_acao_em":"2026-10-14T09:00:00-03:00"}'
```

**Mudar estágio.** `perdido` exige `motivo_perda`. `ganho` não é aplicado: vira ação pendente (`202`).

```bash
curl -X POST "$CRB_API/leads/<id>/estagio" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"estagio":"perdido","motivo_perda":"Já tem fornecedor"}'
```

**Arquivar:**

```bash
curl -X POST "$CRB_API/leads/<id>/arquivar" -H "Authorization: Bearer $CRB_CHAVE"
```

**Registrar interação.** Tipos: `nota`, `ligacao`, `auditoria`, `proposta`, `whatsapp_enviado` (aplica a cadência, como o "Enviei"), `whatsapp_recebido` (mesmo efeito do "Respondeu").

```bash
curl -X POST "$CRB_API/leads/<id>/interacoes" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"tipo":"nota","conteudo":"Perfil sem fotos, sem horário e com 3 avaliações. Concorrentes têm 4,8."}'
```

**Respondeu.** Estágio vai para `respondeu`, as tentativas zeram, os follow-ups são cancelados e é criada a tarefa "Responder {empresa}":

```bash
curl -X POST "$CRB_API/leads/<id>/respondeu" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"conteudo":"Pode mandar a auditoria!"}'
```

### Fila do dia

A mesma fila da tela **Hoje**, montada pelas mesmas regras: para aprovar, responderam, follow-ups vencidos e de hoje, leads novos até a meta e tarefas. Cada item traz `acao_sugerida`, `template` e `mensagem_sugerida` já renderizada.

```bash
curl "$CRB_API/fila/hoje" -H "Authorization: Bearer $CRB_CHAVE"
```

### Templates e serviços

```bash
curl "$CRB_API/templates" -H "Authorization: Bearer $CRB_CHAVE"
curl "$CRB_API/servicos"  -H "Authorization: Bearer $CRB_CHAVE"   # o agente nunca altera preços
```

### Mensagens

**Preparar** (escopo `leitura`, não envia nada). Use `template_id`, `template_chave` (`abordagem`, `followup1`, `followup2`, `ultima`, `auditoria`, `proposta_kit`, `pos_venda`) ou `texto` livre com variáveis:

```bash
curl -X POST "$CRB_API/mensagens/preparar" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"lead_id":"<id>","template_chave":"abordagem"}'
# → { "texto": "Olá, Marina! ...", "faltando": [], "link_wa_me": "...", "link_whatsapp_web": "...", "prospeccao_fria": true }
```

**Enviar** (escopo `escrita`). Só envia direto pelo wa-bridge se **todas** as condições valerem: a chave tem `envio`, o lead já respondeu antes, o Richard ligou "permitir envio direto após resposta" e o bridge está online. Caso contrário, cria uma **ação pendente** e responde `202` com o `motivo` (`prospeccao_fria`, `sem_escopo_envio`, `envio_direto_desligado`, `bridge_offline`).

```bash
curl -X POST "$CRB_API/mensagens/enviar" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 0d5e...-uuid" \
  -d '{"lead_id":"<id>","template_chave":"abordagem","justificativa":"Perfil sem fotos; concorrentes com nota 4,8."}'
# 202 → { "enviado": false, "motivo": "prospeccao_fria", "acao_pendente": { "id": "...", "status": "pendente" } }
```

### Aprovação

**Propor uma ação** (o Richard aprova em 1 toque na tela Hoje). `justificativa` é obrigatória.

```bash
curl -X POST "$CRB_API/acoes-pendentes" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"tipo":"mudar_estagio","lead_id":"<id>","payload":{"estagio":"perdido","motivo_perda":"Sem interesse"},"justificativa":"Respondeu que não quer contratar agora."}'
```

| `tipo` | `payload` |
|---|---|
| `enviar_mensagem` | `{ "texto": "...", "template_id": "..." }` |
| `mudar_estagio` | `{ "estagio": "...", "motivo_perda": "..." }` |
| `criar_venda` | `{ "itens": [{ "servico_id": "...", "qtd": 1 }], "forma_pagamento": "pix" }` |
| `outro` | livre (`lead_id` opcional) |

**Status da proposta** (`pendente`, `aprovada`, `rejeitada`, `expirada`; expira em 48 h):

```bash
curl "$CRB_API/acoes-pendentes/<id>" -H "Authorization: Bearer $CRB_CHAVE"
```

### Tarefas

```bash
curl "$CRB_API/tarefas?abertas=true" -H "Authorization: Bearer $CRB_CHAVE"
curl -X POST "$CRB_API/tarefas" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"titulo":"Ligar para confirmar orçamento","vence_em":"2026-10-13T10:00:00-03:00","lead_id":"<id>"}'
curl -X PATCH "$CRB_API/tarefas/<id>" -H "Authorization: Bearer $CRB_CHAVE" -H "Content-Type: application/json" \
  -d '{"concluida":true}'
```

### Eventos (sincronização)

Tudo o que mudou desde um momento: leads criados ou alterados, interações, propostas decididas e vendas. Guarde `proximo_desde` e use na próxima chamada.

```bash
curl "$CRB_API/eventos?desde=2026-10-12T08:00:00-03:00" -H "Authorization: Bearer $CRB_CHAVE"
# → { "dados": [{ "tipo": "interacao", "ocorreu_em": "...", "lead_id": "...", "dados": {...} }], "proximo_desde": "...", "tem_mais": false }
```

### Webhooks (CRM → agente)

Cadastrados pelo Richard em **Configurações → API e agente → Webhooks** (URL `https`, eventos e segredo). Eventos: `lead.criado`, `lead.respondeu`, `lead.estagio_alterado`, `mensagem.recebida`, `acao.aprovada`, `acao.rejeitada` e `venda.criada` (mais `teste`, pelo botão "Enviar teste").

```http
POST https://seu-servidor/webhook
Content-Type: application/json
X-Cresbi-Evento: lead.respondeu
X-Cresbi-Entrega: 5f0c...-uuid
X-Cresbi-Assinatura: sha256=9b1e...

{"dados": {"lead_id": "...", "empresa": "Ótica Visão", "estagio": "respondeu", ...}, "evento": "lead.respondeu", "ocorreu_em": "2026-10-12T14:03:11.52-03:00"}
```

- **Assinatura:** HMAC-SHA256 do corpo **exatamente como recebido** (bytes crus), com o segredo do webhook, em hexadecimal. Compare em tempo constante. Exemplo em Node:
  ```js
  const esperado = 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(corpoCru).digest('hex')
  const ok = crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(req.headers['x-cresbi-assinatura']))
  ```
- **Resposta:** devolva qualquer `2xx` em até 8 s. O processamento pesado vai depois.
- **Novas tentativas:** até 3, após 1, 5 e 15 minutos. Use `X-Cresbi-Entrega` para ignorar repetidas.
- **Desativação:** depois de 10 falhas seguidas o webhook é desligado e aparece um aviso nas Configurações.

### Vendas e métricas

**Vendas por período e status** (escopo `leitura`). O agente consulta vendas mas não as registra; para isso, ele propõe `criar_venda`.

```bash
curl "$CRB_API/vendas?de=2026-10-01T00:00:00-03:00&status=pago" -H "Authorization: Bearer $CRB_CHAVE"
```

**Resumo de métricas** (escopo `relatorios`). O padrão é do início do mês até agora.

```bash
curl "$CRB_API/metricas/resumo?de=2026-10-01T00:00:00-03:00&ate=2026-10-13T00:00:00-03:00" -H "Authorization: Bearer $CRB_CHAVE"
```

Resposta: `funil` (retrato atual por estágio, com quantidade e valor estimado), `taxa_resposta` (abordados no período e quantos responderam), `abordagens_por_dia`, `receita_periodo`, `receita_mes`, `receita_recorrente` (manutenções ativas), `motivos_perda` e `segmentos` (taxa de resposta por segmento). É a mesma função SQL que alimenta o Painel.

---

## Regras de segurança (aplicadas no servidor)

1. **Opt-out é definitivo pela API.** Nada de preparar, enviar ou propor mensagem (`403 lead_opt_out`), e `opt_out` nunca volta a `false` pela API.
2. **Prospecção fria nunca sai direto.** A primeira mensagem para quem nunca respondeu sempre vira proposta.
3. **Limite diário.** Propostas de mensagem + envios do agente ≤ meta diária (e ≤ limite do bridge) → senão `429 limite_diario`.
4. **Sem preço, sem venda paga, sem apagar.** O agente lê o catálogo, propõe vendas e arquiva, mas não altera preços, não registra venda nem exclui.
5. **Pausar agente.** Com o interruptor ligado, toda escrita responde `503 agente_pausado`.

## Desenvolvimento

```bash
cd supabase/functions/api
deno test tests/          # testes (banco em memória, sem rede)
deno check index.ts       # typecheck
supabase functions serve api --no-verify-jwt   # local, com o Supabase CLI
```

- Regras de negócio compartilhadas com o front ficam em `shared/` (raiz). Depois de alterar, rode `npm run sync:shared`.
- A especificação fica em `supabase/functions/api/openapi.ts`. Depois de alterar, rode `npm run docs:api`.
- O teste `npm test` falha se a cópia do `shared/` ou a documentação gerada estiverem desatualizadas.
