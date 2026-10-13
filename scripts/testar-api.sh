#!/usr/bin/env bash
# Teste de fumaça da API do CRM.
# Uso:
#   export CRB_API="https://SEU-PROJETO.supabase.co/functions/v1/api/v1"
#   export CRB_CHAVE="crb_..."          # escopos leitura + escrita
#   bash scripts/testar-api.sh
# Cria um lead de teste, prepara mensagem, registra interação, consulta a fila e arquiva o lead.
set -euo pipefail

: "${CRB_API:?Defina CRB_API (ex.: https://abcd.supabase.co/functions/v1/api/v1)}"
: "${CRB_CHAVE:?Defina CRB_CHAVE (crb_...)}"
command -v jq >/dev/null || { echo "Instale o jq (https://jqlang.github.io/jq/)"; exit 1; }

verde() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
falha() { printf '\033[31m✗ %s\033[0m\n%s\n' "$1" "$2"; exit 1; }

chamar() { # metodo rota [json]
  local metodo=$1 rota=$2 corpo=${3:-}
  local args=(-sS -w '\n%{http_code}' -X "$metodo" "$CRB_API$rota" -H "Authorization: Bearer $CRB_CHAVE" -H 'Content-Type: application/json')
  [[ $metodo == POST ]] && args+=(-H "Idempotency-Key: teste-$(date +%s%N)")
  [[ -n $corpo ]] && args+=(-d "$corpo")
  curl "${args[@]}"
}

esperar() { # resposta status_esperado descricao
  local corpo status
  corpo=$(sed '$d' <<<"$1"); status=$(tail -n1 <<<"$1")
  [[ $status == "$2" ]] || falha "$3 (esperava $2, veio $status)" "$corpo"
  verde "$3"
  RESP=$corpo
}

esperar "$(curl -sS -w '\n%{http_code}' "$CRB_API/health")" 200 "GET /health"

TEL="1999$(date +%s | tail -c 8)"
esperar "$(chamar POST /leads "{\"empresa\":\"Lead de Teste (apagar)\",\"whatsapp\":\"$TEL\",\"cidade\":\"Campinas\",\"contato_nome\":\"Teste\",\"tags\":[\"teste-api\"]}")" 201 "POST /leads cria lead de teste"
LEAD=$(jq -r .lead.id <<<"$RESP")

esperar "$(chamar POST /mensagens/preparar "{\"lead_id\":\"$LEAD\",\"template_chave\":\"abordagem\"}")" 200 "POST /mensagens/preparar"
echo "   → $(jq -r .texto <<<"$RESP" | cut -c1-90)…"

esperar "$(chamar POST "/leads/$LEAD/interacoes" '{"tipo":"nota","conteudo":"Teste de fumaça da API."}')" 201 "POST /leads/{id}/interacoes"
esperar "$(chamar GET /fila/hoje)" 200 "GET /fila/hoje"
echo "   → $(jq '.novos | length' <<<"$RESP") novos, $(jq '.responderam | length' <<<"$RESP") responderam, $(jq '.para_aprovar | length' <<<"$RESP") para aprovar"

esperar "$(chamar GET "/leads/$LEAD")" 200 "GET /leads/{id}"
esperar "$(chamar POST "/leads/$LEAD/arquivar")" 200 "POST /leads/{id}/arquivar"
[[ $(jq -r .arquivado <<<"$RESP") == true ]] || falha "lead não ficou arquivado" "$RESP"

esperar "$(curl -sS -w '\n%{http_code}' "$CRB_API/leads")" 401 "sem chave → 401"

echo
verde "API funcionando. O lead de teste ficou arquivado (tag teste-api)."
