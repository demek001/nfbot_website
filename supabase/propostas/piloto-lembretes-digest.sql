CREATE OR REPLACE FUNCTION public.inteligencia_preparar_piloto(p_reservar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c jsonb; itens jsonb; entrega uuid; cid uuid;
begin
  if not pg_try_advisory_xact_lock(hashtext('notinha_piloto_entrega')) then return jsonb_build_object('status','ocupado'); end if;
  c:=public.inteligencia_contexto_piloto();
  if c is null then return jsonb_build_object('status','desabilitado'); end if;
  cid:=(c->>'cliente_id')::uuid;
  perform public.gerar_inteligencia_cliente_v2(cid);
  perform public.sincronizar_lembretes_recorrencias_v2(cid);
  -- A lost provider response is quarantined, never automatically resent.
  if exists(select 1 from public.inteligencia_entregas where cliente_id=cid and classe='resumo'
    and (dia=(now() at time zone 'America/Sao_Paulo')::date or status in ('reservado','incerto'))) then
    return jsonb_build_object('status','limite_ou_reconciliacao');
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into itens from (
    select 'insight' as origem,i.id,i.titulo,i.dados,
      md5(i.dados::text) as versao
    from public.inteligencia_insights i
    where i.cliente_id=cid and i.descartado_em is null and i.resolvido_em is null
      and i.visto_em is null and (i.valido_ate is null or i.valido_ate>now())
      and not exists(select 1 from public.inteligencia_entregas e,
        jsonb_array_elements(e.itens) z where e.cliente_id=cid and e.status='aceito'
        and z->>'id'=i.id::text and z->>'versao'=md5(i.dados::text))
    limit 5
  ) x;
  if jsonb_array_length(itens)=0 then return jsonb_build_object('status','sem_alertas'); end if;
  if p_reservar then
    insert into public.inteligencia_entregas(cliente_id,itens) values(cid,itens) returning id into entrega;
  end if;
  return jsonb_build_object('status','pronto','contexto',c,'itens',itens,'entrega_id',entrega);
end $function$


