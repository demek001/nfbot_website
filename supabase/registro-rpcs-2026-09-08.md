# Restrição de EXECUTE das RPCs internas — 08/09/2026

Aplicado em notinha-prod, projeto xpzjwlhrlebdpcybxaxu, às 19:47 UTC (16:47 Brasília).
Migration registrada: 20260908194738_restrict_seven_internal_rpc_execute_to_service_role.

## Escopo e evidência anterior
As sete funções abaixo estavam em public, SECURITY DEFINER, proprietário postgres.
Todas tinham ACL {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}.
As assinaturas foram consultadas diretamente em pg_proc antes da alteração.

- `public.buscar_lancamentos(uuid,text,text,integer)`
- `public.categorias_do_cliente(uuid,integer)`
- `public.comparar_preco_produto(uuid,text)`
- `public.insights_semana(uuid)`
- `public.maiores_gastos_mes(uuid,date,integer)`
- `public.produtos_do_cliente(uuid,integer)`
- `public.painel_rate_falha(text)`

O código implantado de processar-fila v45 usa SUPABASE_SERVICE_ROLE_KEY em apikey e Authorization através de sbHeaders/sbRpc para as seis RPCs financeiras.
painel-cliente v7 cria seu cliente com SUPABASE_SERVICE_ROLE_KEY e persistSession:false e chama painel_rate_falha.
Nenhuma Edge Function foi alterada ou reimplantada.

## Alteração aplicada
GRANT para service_role antes de REVOKE de PUBLIC, anon e authenticated, dentro de BEGIN/COMMIT, com lock_timeout de 3 segundos e statement_timeout de 15 segundos.
Uma asserção interna verifica todos os acessos antes do COMMIT.
Somente permissões das sete funções e registro da migration foram alterados.

```sql
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
GRANT EXECUTE ON FUNCTION public.buscar_lancamentos(uuid,text,text,integer),
public.categorias_do_cliente(uuid,integer),
public.comparar_preco_produto(uuid,text),
public.insights_semana(uuid),
public.maiores_gastos_mes(uuid,date,integer),
public.produtos_do_cliente(uuid,integer),
public.painel_rate_falha(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.buscar_lancamentos(uuid,text,text,integer),
public.categorias_do_cliente(uuid,integer),
public.comparar_preco_produto(uuid,text),
public.insights_semana(uuid),
public.maiores_gastos_mes(uuid,date,integer),
public.produtos_do_cliente(uuid,integer),
public.painel_rate_falha(text) FROM PUBLIC, anon, authenticated;
DO $check$
DECLARE s text; f oid;
BEGIN
FOREACH s IN ARRAY ARRAY['public.buscar_lancamentos(uuid,text,text,integer)','public.categorias_do_cliente(uuid,integer)','public.comparar_preco_produto(uuid,text)','public.insights_semana(uuid)','public.maiores_gastos_mes(uuid,date,integer)','public.produtos_do_cliente(uuid,integer)','public.painel_rate_falha(text)'] LOOP
f:=s::regprocedure::oid;
IF NOT has_function_privilege('service_role',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
RAISE EXCEPTION 'Unexpected ACL for %',s;
END IF;
END LOOP;
END $check$;
COMMIT;
```

## Validação
- ACL final de cada função: {postgres=X/postgres,service_role=X/postgres}.
- has_function_privilege: service_role=true, anon=false, authenticated=false nas sete.
- MD5 de pg_get_functiondef idêntico antes/depois em todas: lógica, assinatura e configuração preservadas.
- Testes SQL com SET LOCAL ROLE service_role passaram antes/depois nas seis consultas, usando UUID nulo sintático (00000000-0000-0000-0000-000000000000), parâmetros dos consumidores e sem retornar dados pessoais: cinco conjuntos vazios e um resultado de insights.
- painel_rate_falha executou com service_role; incremento confirmado e ROLLBACK. Zero registros de teste restantes.
- Quatorze chamadas sob anon/authenticated (sete por papel) falharam com insufficient_privilege, como esperado.
- Security Advisor: 7 alertas anon + 7 authenticated removidos. Permaneceram os mesmos 23 avisos INFO de RLS sem policies e 7 WARN fora do escopo (4 search_path, 2 extensões em public, 1 proteção de senhas).
- Cron: quatro jobs ativos; drenar-fila-notinha teve 30 execuções bem-sucedidas nos 30 minutos anteriores. Execução posterior às 19:48 UTC também succeeded.
- Fila webhook_events: 481 concluídos, nenhum pendente antes; zero eventos não concluídos depois.

Limites: testes das RPCs no banco sob o papel usado pelos consumidores, com inspeção do código implantado. Não foi realizado fluxo ponta a ponta por WhatsApp/Drive nem chamada HTTP autenticada das Edge Functions. Cron succeeded confirma a execução SQL do job, não a conclusão de todos os serviços externos. Não havia mensagens novas para observar processamento real durante a janela.

## Operação e reversão
Não reabrir acesso público como reversão automática: isso restaura a exposição. Se houver erro, conferir papel efetivo do consumidor e grants desta assinatura; service_role e postgres continuam autorizados.
O estado anterior está registrado acima para recuperação controlada, caso explicitamente necessária.
Funções recriadas no futuro devem manter as restrições de EXECUTE.

Referências: [Advisor de acesso anônimo](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [Advisor de acesso autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Este arquivo é apenas documentação em branch separada; não adiciona migration executável nem altera a branch de produção.
