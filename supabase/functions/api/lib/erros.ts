// Erros da API no formato { erro: { codigo, mensagem, detalhes } }.
// Mensagens escritas para um agente entender o que corrigir.

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes: Record<string, unknown> = {},
    readonly cabecalhos: Record<string, string> = {},
  ) {
    super(mensagem)
  }
}

export const erros = {
  naoAutenticado: () =>
    new ErroApi(401, 'nao_autenticado', 'Envie o header Authorization: Bearer crb_<sua_chave>.'),
  chaveInvalida: () =>
    new ErroApi(401, 'chave_invalida', 'Chave de API inválida, revogada ou expirada. Peça uma nova chave ao Richard em Configurações → API e agente.'),
  semEscopo: (escopo: string) =>
    new ErroApi(403, 'escopo_insuficiente', `Esta ação exige o escopo "${escopo}", que a sua chave não tem.`, { escopo_necessario: escopo }),
  pausado: () =>
    new ErroApi(503, 'agente_pausado', 'O Richard pausou o agente. Escritas estão bloqueadas; leituras continuam liberadas. Tente mais tarde.'),
  limite: (segundos: number) =>
    new ErroApi(429, 'limite_requisicoes', `Limite de 60 requisições por minuto atingido. Aguarde ${segundos} s.`, { retry_after: segundos }, { 'Retry-After': String(segundos) }),
  limiteDiario: (limite: number) =>
    new ErroApi(429, 'limite_diario', `Limite diário de ${limite} mensagens atingido. Retome amanhã.`, { limite }, { 'Retry-After': '3600' }),
  rotaNaoEncontrada: (metodo: string, rota: string) =>
    new ErroApi(404, 'rota_nao_encontrada', `Rota ${metodo} ${rota} não existe. Consulte GET /openapi.json.`),
  metodoNaoPermitido: () =>
    new ErroApi(405, 'metodo_nao_permitido', 'Método não permitido nesta rota. Não existe DELETE: use POST /leads/{id}/arquivar.'),
  leadNaoEncontrado: (id: string) =>
    new ErroApi(404, 'lead_nao_encontrado', `Nenhum lead com id ${id}. Confira o id ou busque por GET /leads?busca=... ou GET /leads/por-whatsapp/{numero}.`, { lead_id: id }),
  naoEncontrado: (oque: string, id: string) =>
    new ErroApi(404, `${oque}_nao_encontrado`, `Nenhum registro (${oque}) com id ${id}.`, { id }),
  optOut: (leadId: string) =>
    new ErroApi(403, 'lead_opt_out', 'Este lead pediu para não receber mensagens (opt-out). Nunca envie nem prepare mensagens para ele.', { lead_id: leadId }),
  jsonInvalido: () => new ErroApi(400, 'json_invalido', 'O corpo da requisição precisa ser um JSON válido.'),
  validacao: (campos: Record<string, string>) =>
    new ErroApi(422, 'dados_invalidos', 'Alguns campos estão inválidos. Veja "detalhes.campos" e corrija.', { campos }),
  conflito: (codigo: string, mensagem: string, detalhes: Record<string, unknown> = {}) => new ErroApi(409, codigo, mensagem, detalhes),
  interno: () => new ErroApi(500, 'erro_interno', 'Erro inesperado no servidor. Tente de novo em instantes; se persistir, avise o Richard.'),
}
