-- ═════════════════════════════════════════════════════════════════
-- PROPOSTA (aguardando aprovação do Yoseff — NÃO aplicada)
-- Tarefa 5: arquitetura de indicação em leads_interesse
-- Tarefa 2: trigger que chama a Edge Function enviar-lista-espera
-- Ordem de aplicação: este SQL PRIMEIRO, depois deploy da função,
-- e só então o merge do site na main (o form passa a enviar
-- indicado_por — coluna precisa existir antes).
-- ═════════════════════════════════════════════════════════════════

-- ── Tarefa 5.1 — colunas ──
alter table public.leads_interesse
  add column codigo_indicacao text;

alter table public.leads_interesse
  add column indicado_por text;

-- ── Tarefa 5.2 — gerador: 6 chars, maiúsculas+dígitos, sem ambíguos (0/O/1/I/L) ──
create or replace function public.gerar_codigo_indicacao()
returns text language plpgsql as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  cod text;
  tentativas int := 0;
begin
  loop
    cod := '';
    for i in 1..6 loop
      cod := cod || substr(alfabeto, floor(random()*length(alfabeto))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.leads_interesse where codigo_indicacao = cod);
    tentativas := tentativas + 1;
    if tentativas > 20 then
      raise exception 'nao foi possivel gerar codigo_indicacao unico';
    end if;
  end loop;
  return cod;
end $$;

-- ── Tarefa 5.3 — backfill dos leads existentes ──
update public.leads_interesse
set codigo_indicacao = public.gerar_codigo_indicacao()
where codigo_indicacao is null;

-- ── Tarefa 5.4 — daqui pra frente, obrigatório e único ──
alter table public.leads_interesse
  alter column codigo_indicacao set not null,
  alter column codigo_indicacao set default public.gerar_codigo_indicacao(),
  add constraint leads_interesse_codigo_indicacao_key unique (codigo_indicacao);

create index if not exists idx_leads_indicado_por
  on public.leads_interesse (indicado_por);

-- ── Tarefa 5.5 — view de atribuição (validação do indicado_por na leitura) ──
-- security_invoker + sem grants pra anon/authenticated (padrão da v_ativacao)
create or replace view public.v_indicacoes
with (security_invoker = on) as
select
  i.codigo_indicacao as codigo_indicador,
  i.nome             as indicador_nome,
  i.email            as indicador_email,
  l.id               as indicado_id,
  l.nome             as indicado_nome,
  l.email            as indicado_email,
  l.criado_em        as indicado_em
from public.leads_interesse l
join public.leads_interesse i on i.codigo_indicacao = l.indicado_por
where l.indicado_por is not null;

revoke all on public.v_indicacoes from anon, authenticated;

-- ── Tarefa 2 — segundo trigger: e-mail de confirmação ──
-- NÃO substitui o novo_lead_para_zoho (Apps Script segue alimentando o CRM).
-- <WEBHOOK_TOKEN>: substituir pelo valor do secret na hora de aplicar.
-- Dívida técnica registrada: token fica visível na definição do trigger.
CREATE TRIGGER novo_lead_email
AFTER INSERT ON public.leads_interesse
FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
  'https://xpzjwlhrlebdpcybxaxu.supabase.co/functions/v1/enviar-lista-espera',
  'POST',
  '{"Content-type":"application/json","x-webhook-token":"<WEBHOOK_TOKEN>"}',
  '{}',
  '5000');
