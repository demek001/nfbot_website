-- Already applied to production. No recipient or credential values belong here.
create function public.inteligencia_pausar_piloto(p_cliente_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.inteligencia_piloto set habilitado=false where cliente_id=p_cliente_id;
  if not found then return false; end if;
  update public.inteligencia_config set proativo_habilitado=false where cliente_id=p_cliente_id;
  return true;
end $$;
revoke execute on function public.inteligencia_pausar_piloto(uuid) from public,anon,authenticated;
grant execute on function public.inteligencia_pausar_piloto(uuid) to service_role;

-- Use the actual project endpoint in private deployment provisioning.
-- cron: notinha-piloto-alertas-15min, */15 * * * *.
-- Calls inteligencia-piloto with {"acao":"enviar"} and the existing
-- x-worker-secret obtained server-side from config_privada; never a literal secret.
-- The cron query must have WHERE EXISTS (SELECT 1 FROM inteligencia_piloto WHERE habilitado).

