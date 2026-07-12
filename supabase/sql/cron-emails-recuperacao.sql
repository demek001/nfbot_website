-- ═════════════════════════════════════════════════════════════════
-- NOTINHA — pg_cron: emails-recuperacao diário (12h UTC = 9h BRT)
-- EXECUTAR SOMENTE APÓS o deploy aprovado da função emails-recuperacao.
-- Token: mesmo valor de config_privada.CRON_TOKEN (a função valida).
-- Padrão idêntico ao job existente drenar-fila-notinha (pg_net).
-- ═════════════════════════════════════════════════════════════════
select cron.schedule(
  'emails-recuperacao-diario',
  '0 12 * * *',
  $job$
  select net.http_post(
    url := 'https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/emails-recuperacao',
    headers := jsonb_build_object(
      'x-cron-token', '<CRON_TOKEN: valor real em config_privada, chave CRON_TOKEN>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $job$
);
