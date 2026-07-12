-- ═════════════════════════════════════════════════════════════════
-- NOTINHA — Fix Ellora (cliente 3d6d048a-05be-4ab4-93a1-ca104f9ce759)
-- Situação: pagamento_status=ativo, codigo_ativacao=null, ativado=false.
-- EXECUTAR SOMENTE APÓS aprovação e deploy das funções novas.
--
-- Passo 1 — gerar codigo_ativacao (mesma lógica do garantirCodigo():
-- "NT" + 6 caracteres do alfabeto A-Z0-9; coluna é UNIQUE — colisão é
-- astronomicamente improvável, mas se der erro de unicidade, rodar de novo).
-- ═════════════════════════════════════════════════════════════════
UPDATE public.clientes
SET codigo_ativacao = 'NT' || (
  SELECT string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 1 + floor(random() * 36)::int, 1), '')
  FROM generate_series(1, 6)
)
WHERE id = '3d6d048a-05be-4ab4-93a1-ca104f9ce759'
  AND codigo_ativacao IS NULL
RETURNING id, nome, email, codigo_ativacao;

-- Passo 2 — disparar o BV manualmente (após o passo 1), via disparo manual
-- da emails-recuperacao (autentica com CRON_TOKEN; ela repassa ao
-- enviar-boasvindas com o WEBHOOK_TOKEN interno do runtime):
--
--   select net.http_post(
--     url := 'https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/emails-recuperacao',
--     headers := jsonb_build_object(
--       'x-cron-token', '<CRON_TOKEN: valor real em config_privada, chave CRON_TOKEN>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{"bv_cliente_id":"3d6d048a-05be-4ab4-93a1-ca104f9ce759"}'::jsonb
--   );
--
-- Conferência (BV enviado + flag setada):
--   SELECT tipo, status, enviado_em FROM emails_log
--    WHERE cliente_id = '3d6d048a-05be-4ab4-93a1-ca104f9ce759';
--   SELECT codigo_ativacao, email_boasvindas_enviado FROM clientes
--    WHERE id = '3d6d048a-05be-4ab4-93a1-ca104f9ce759';
