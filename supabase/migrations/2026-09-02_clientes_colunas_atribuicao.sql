-- Colunas de atribuição em public.clientes (aplicado em 2026-09-02).
-- Todas nullable, sem DEFAULT: em Postgres 11+ é alteração só de metadado,
-- instantânea, sem reescrita da tabela.
-- lock_timeout evita que o ALTER (ACCESS EXCLUSIVE) entre na fila atrás de
-- uma transação longa e bloqueie as leituras do bot.

SET lock_timeout = '3s';

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS gclid        text,
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS criado_via   text;

-- Recarrega o cache de schema do PostgREST para a API REST enxergar as colunas.
NOTIFY pgrst, 'reload schema';
