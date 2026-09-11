-- Explicit user reminders have their own queue, independent of the daily insight digest.
alter table public.inteligencia_entregas add column classe text not null default 'resumo' check(classe in ('resumo','lembrete'));
alter table public.inteligencia_entregas add column chave_lembrete text;
alter table public.inteligencia_entregas add column tentativas integer not null default 1;
alter table public.inteligencia_entregas drop constraint inteligencia_entregas_cliente_id_dia_key;
create unique index inteligencia_resumo_por_dia on public.inteligencia_entregas(cliente_id,dia) where classe='resumo';
create unique index inteligencia_lembrete_unico on public.inteligencia_entregas(cliente_id,chave_lembrete) where chave_lembrete is not null;

create function public.inteligencia_criar_lembrete_piloto(p_cliente_id uuid,p_wam_id text,p_descricao text,p_quando_local timestamp)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; due timestamptz; item public.lembretes; k text; was_present boolean;
begin
  c:=public.inteligencia_contexto_piloto(p_cliente_id);
  if c is null or not (c->>'comandos_habilitados')::boolean then return jsonb_build_object('status','desabilitado'); end if;
  if not exists(select 1 from public.webhook_events where wam_id=p_wam_id and telefone=c->>'telefone'
      and meta_verificado and payload->'msg'->>'type'='text') then return jsonb_build_object('status','evento_invalido'); end if;
  due:=p_quando_local at time zone 'America/Sao_Paulo';
  if due is null or due<=now() or due>now()+interval '366 days' then return jsonb_build_object('status','horario_invalido'); end if;
  if length(btrim(p_descricao)) not between 3 and 300 then return jsonb_build_object('status','descricao_invalida'); end if;
  k:='usuario:'||md5(public.inteligencia_norm_text(p_descricao)||':'||extract(epoch from due)::text);
  perform pg_advisory_xact_lock(hashtext('lembrete:'||p_cliente_id::text||k));
  select * into item from public.lembretes where cliente_id=p_cliente_id and chave_dedupe=k;
  was_present:=found;
  if not was_present then
    if (select count(*) from public.lembretes where cliente_id=p_cliente_id and status='ativo' and origem='usuario')>=50 then
      return jsonb_build_object('status','limite');
    end if;
    insert into public.lembretes(cliente_id,tipo,descricao,devido_em,canal,envio_externo_habilitado,origem,status,chave_dedupe)
    values(p_cliente_id,'geral',btrim(p_descricao),due,'whatsapp',true,'usuario','ativo',k) returning * into item;
  end if;
  return jsonb_build_object('id',item.id,'descricao',item.descricao,'devido_em',item.devido_em,'existente',was_present,'status',item.status);
end $$;

create function public.inteligencia_preparar_lembrete_piloto(p_reservar boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; l public.lembretes; e public.inteligencia_entregas; items jsonb; k text; cid uuid;
begin
  if not pg_try_advisory_xact_lock(hashtext('notinha_piloto_lembrete')) then return jsonb_build_object('status','ocupado'); end if;
  c:=public.inteligencia_contexto_piloto();
  if c is null then return jsonb_build_object('status','desabilitado'); end if;
  cid:=(c->>'cliente_id')::uuid;
  select x.* into l from public.lembretes x
  where x.cliente_id=cid and x.status='ativo' and x.envio_externo_habilitado and x.origem='usuario'
    and x.devido_em<=now() and x.recorrencia is null
    and not exists(select 1 from public.inteligencia_entregas d
      where d.cliente_id=cid and d.chave_lembrete=x.id::text||':'||extract(epoch from x.devido_em)::text
      and (d.status in ('reservado','incerto','aceito') or d.tentativas>=3 or d.atualizado_em>now()-interval '5 minutes'))
  order by x.devido_em,x.id limit 1 for update skip locked;
  if not found then return jsonb_build_object('status','sem_lembretes'); end if;
  k:=l.id::text||':'||extract(epoch from l.devido_em)::text;
  items:=jsonb_build_array(jsonb_build_object('origem','lembrete','id',l.id,'titulo',l.descricao,
    'dados',jsonb_build_object('devido_em',l.devido_em),'versao',md5(l.devido_em::text)));
  if p_reservar then
    insert into public.inteligencia_entregas(cliente_id,classe,chave_lembrete,itens)
    values(cid,'lembrete',k,items)
    on conflict(cliente_id,chave_lembrete) where chave_lembrete is not null do update
      set status='reservado',tentativas=public.inteligencia_entregas.tentativas+1,atualizado_em=now()
      where public.inteligencia_entregas.status='falhou' and public.inteligencia_entregas.tentativas<3
    returning * into e;
    if not found then return jsonb_build_object('status','ocupado'); end if;
  end if;
  return jsonb_build_object('status','pronto','contexto',c,'itens',items,'entrega_id',e.id,'classe','lembrete');
end $$;

create function public.inteligencia_concluir_lembrete_entregue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.classe='lembrete' and new.status='aceito' and old.status<>'aceito' then
    update public.lembretes set status='concluido',concluido_em=now(),atualizado_em=now()
    where cliente_id=new.cliente_id and id::text=new.itens->0->>'id' and status='ativo';
  end if;
  return new;
end $$;
create trigger inteligencia_lembrete_entregue after update on public.inteligencia_entregas
for each row execute function public.inteligencia_concluir_lembrete_entregue();
revoke execute on function public.inteligencia_criar_lembrete_piloto(uuid,text,text,timestamp),
public.inteligencia_preparar_lembrete_piloto(boolean),public.inteligencia_concluir_lembrete_entregue() from public,anon,authenticated;
grant execute on function public.inteligencia_criar_lembrete_piloto(uuid,text,text,timestamp),
public.inteligencia_preparar_lembrete_piloto(boolean),public.inteligencia_concluir_lembrete_entregue() to service_role;

