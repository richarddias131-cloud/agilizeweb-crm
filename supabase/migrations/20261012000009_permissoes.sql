-- =============================================================================
-- Segurança: funções SECURITY DEFINER só para quem precisa.
-- Funções de trigger não são chamáveis por ninguém via API; testar_webhook só
-- por usuários logados (ela confere que o webhook é do próprio usuário).
-- =============================================================================
revoke execute on function public.webhook_leads() from public, anon, authenticated;
revoke execute on function public.webhook_interacoes() from public, anon, authenticated;
revoke execute on function public.webhook_acoes() from public, anon, authenticated;
revoke execute on function public.webhook_vendas() from public, anon, authenticated;
revoke execute on function public.testar_webhook(uuid) from public, anon;
grant execute on function public.testar_webhook(uuid) to authenticated;
