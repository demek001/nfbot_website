-- Restricted pilot. Configuration/recipient is provisioned separately, never in source control.
create table public.inteligencia_piloto (
  singleton boolean primary key default true check(singleton),
  cliente_id uuid not null unique references public.clientes(id),
  telefone text not null,
  habilitado boolean not null default false,
  global_habilitado boolean not null default false check(not global_habilitado),
  comandos_habilitados boolean not null default false,
  ultimo_inbound_em timestamptz,
  whatsapp_gratis_ate timestamptz not null default '2026-10-01T00:00:00Z',
  criado_em timestamptz not null default now()
);
create table public.inteligencia_entregas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  status text not null default 'reservado' check(status in ('reservado','aceito','falhou','incerto')),
  canal text check(canal in ('email','whatsapp')),
  itens jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  codigo text,
  unique(cliente_id,dia)
);
alter table public.inteligencia_piloto enable row level security;
alter table public.inteligencia_entregas enable row level security;
revoke all on public.inteligencia_piloto,public.inteligencia_entregas from public,anon,authenticated;
grant all on public.inteligencia_piloto,public.inteligencia_entregas to service_role;
alter table public.webhook_events add column meta_verificado boolean not null default false;

create function public.inteligencia_registrar_janela_piloto() returns trigger
language plpgsql security invoker set search_path='' as $$
declare t timestamptz;
begin
  if new.meta_verificado and new.payload->'msg'->>'from'=new.telefone
     and new.payload->'value'->'metadata'->>'phone_number_id' =
       (select v from public.config_privada where k='WHATSAPP_PHONE_NUMBER_ID')
     and new.payload->'msg'->>'timestamp' ~ '^[0-9]{10}$' then
    t:=to_timestamp((new.payload->'msg'->>'timestamp')::double precision);
    if t<=now() then
      update public.inteligencia_piloto set ultimo_inbound_em=greatest(ultimo_inbound_em,t)
      where telefone=new.telefone;
    end if;
  end if;
  return new;
end $$;
create trigger inteligencia_janela_piloto after insert on public.webhook_events
for each row execute function public.inteligencia_registrar_janela_piloto();

create function public.inteligencia_contexto_piloto(p_cliente_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$
select jsonb_build_object('cliente_id',c.id,'telefone',c.telefone,'email',c.email,
 'ultimo_inbound_em',p.ultimo_inbound_em,'whatsapp_gratis_ate',p.whatsapp_gratis_ate,
 'comandos_habilitados',p.comandos_habilitados,
 'email_verificado',lower(c.email)=lower(c.google_email) and c.drive_conectado_em is not null,
 'phone_number_id',(select v from public.config_privada where k='WHATSAPP_PHONE_NUMBER_ID'))
from public.inteligencia_piloto p join public.clientes c on c.id=p.cliente_id
join public.inteligencia_config ic on ic.cliente_id=c.id
where (p_cliente_id is null or c.id=p_cliente_id) and p.habilitado
and c.telefone=p.telefone and c.ativado and c.aceitou_termos
and c.cancelado_em is null and not coalesce(c.anonimizado,false)
and c.pagamento_status in ('ativo','cortesia')
and (c.pagamento_status<>'cortesia' or c.cortesia_ate is null or c.cortesia_ate>now())
and ic.habilitado and ic.proativo_habilitado and ic.ai_mode='free_only';
$$;

create function public.inteligencia_preparar_piloto(p_reservar boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c jsonb; itens jsonb; entrega uuid; cid uuid;
begin
  if not pg_try_advisory_xact_lock(hashtext('notinha_piloto_entrega')) then return jsonb_build_object('status','ocupado'); end if;
  c:=public.inteligencia_contexto_piloto();
  if c is null then return jsonb_build_object('status','desabilitado'); end if;
  cid:=(c->>'cliente_id')::uuid;
  perform public.gerar_inteligencia_cliente_v2(cid);
  perform public.sincronizar_lembretes_recorrencias_v2(cid);
  -- A lost provider response is quarantined, never automatically resent.
  if exists(select 1 from public.inteligencia_entregas where cliente_id=cid
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
    union all
    select 'lembrete',l.id,l.descricao,jsonb_build_object('devido_em',l.devido_em),md5(l.devido_em::text)
    from public.lembretes l where l.cliente_id=cid and l.status='ativo'
      and l.envio_externo_habilitado and l.devido_em<=now()
      and not exists(select 1 from public.inteligencia_entregas e,
        jsonb_array_elements(e.itens) z where e.cliente_id=cid and e.status='aceito'
        and z->>'id'=l.id::text and z->>'versao'=md5(l.devido_em::text))
    limit 5
  ) x;
  if jsonb_array_length(itens)=0 then return jsonb_build_object('status','sem_alertas'); end if;
  if p_reservar then
    insert into public.inteligencia_entregas(cliente_id,itens) values(cid,itens) returning id into entrega;
  end if;
  return jsonb_build_object('status','pronto','contexto',c,'itens',itens,'entrega_id',entrega);
end $$;

revoke execute on function public.inteligencia_registrar_janela_piloto(),
public.inteligencia_contexto_piloto(uuid),public.inteligencia_preparar_piloto(boolean) from public,anon,authenticated;
grant execute on function public.inteligencia_registrar_janela_piloto(),
public.inteligencia_contexto_piloto(uuid),public.inteligencia_preparar_piloto(boolean) to service_role;

