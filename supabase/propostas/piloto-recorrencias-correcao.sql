-- Exclude grocery purchases from bill/subscription inference.
CREATE OR REPLACE FUNCTION public.detectar_recorrencias_cliente_v2(p_cliente_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
begin
  with base0 as (
    select
      nf.cliente_id,
      case
        when nullif(regexp_replace(coalesce(nf.cnpj_estabelecimento,''), '\D','','g'),'') is not null
          then 'cnpj:' || regexp_replace(nf.cnpj_estabelecimento, '\D','','g')
        else 'est:' || public.inteligencia_norm_text(nf.estabelecimento)
      end as chave,
      nf.estabelecimento,
      nullif(regexp_replace(coalesce(nf.cnpj_estabelecimento,''), '\D','','g'),'') as cnpj,
      coalesce(nf.categoria,'Outros') as categoria,
      nf.valor_total,
      nf.data_compra,
      nf.criado_em
    from public.notas_fiscais nf
    where nf.cliente_id = p_cliente_id
      and public.inteligencia_norm_text(coalesce(nf.categoria,'')) not in ('mercado','supermercado','supermercados')
      and nf.data_compra is not null
      and nf.valor_total is not null and nf.valor_total > 0
      and nf.data_compra >= current_date - 240
      and nullif(public.inteligencia_norm_text(nf.estabelecimento),'') is not null
  ), base as (
    select b0.*,
           lag(data_compra) over (partition by chave order by data_compra, criado_em) as data_anterior
    from base0 b0
  ), agg as (
    select
      chave,
      (array_agg(estabelecimento order by data_compra desc, criado_em desc))[1] as estabelecimento,
      max(cnpj) as cnpj,
      (array_agg(categoria order by data_compra desc, criado_em desc))[1] as categoria,
      round(avg(valor_total),2) as valor_medio,
      round(case when avg(valor_total) > 0 then coalesce(stddev_samp(valor_total),0) / avg(valor_total) * 100 else 0 end,2) as variacao_valor_pct,
      round(avg((data_compra - data_anterior)::numeric) filter (where data_anterior is not null),2) as intervalo_medio_dias,
      count(*)::int as ocorrencias,
      max(data_compra) as ultima_ocorrencia
    from base
    group by chave
    having count(*) >= 3
       and count(*) filter (where data_anterior is not null) >= 2
  ), prepared as (
    select a.*,
      case
        when intervalo_medio_dias between 5 and 9 then 'semanal'
        when intervalo_medio_dias between 12 and 18 then 'quinzenal'
        when intervalo_medio_dias between 25 and 35 then 'mensal'
        when intervalo_medio_dias between 50 and 70 then 'bimestral'
        else 'outro'
      end as cadencia,
      least(0.99::numeric,
        0.45::numeric
        + case when intervalo_medio_dias between 5 and 9 or intervalo_medio_dias between 12 and 18 or intervalo_medio_dias between 25 and 35 or intervalo_medio_dias between 50 and 70 then 0.20 else 0.05 end
        + case when variacao_valor_pct <= 10 then 0.20 when variacao_valor_pct <= 20 then 0.10 else 0 end
        + case when ocorrencias >= 5 then 0.15 when ocorrencias >= 4 then 0.10 else 0.05 end
      ) as confianca
    from agg a
    where intervalo_medio_dias between 4 and 90
  ), up as (
    insert into public.recorrencias_detectadas (
      cliente_id, chave, estabelecimento, cnpj, categoria, cadencia,
      valor_medio, variacao_valor_pct, intervalo_medio_dias, ocorrencias,
      ultima_ocorrencia, proxima_prevista, confianca, atualizado_em
    )
    select
      p_cliente_id, chave, estabelecimento, cnpj, categoria, cadencia,
      valor_medio, variacao_valor_pct, intervalo_medio_dias, ocorrencias,
      ultima_ocorrencia,
      ultima_ocorrencia + greatest(1, round(intervalo_medio_dias)::int),
      confianca, now()
    from prepared
    on conflict (cliente_id, chave) do update set
      estabelecimento = excluded.estabelecimento,
      cnpj = excluded.cnpj,
      categoria = excluded.categoria,
      cadencia = excluded.cadencia,
      valor_medio = excluded.valor_medio,
      variacao_valor_pct = excluded.variacao_valor_pct,
      intervalo_medio_dias = excluded.intervalo_medio_dias,
      ocorrencias = excluded.ocorrencias,
      ultima_ocorrencia = excluded.ultima_ocorrencia,
      proxima_prevista = excluded.proxima_prevista,
      confianca = excluded.confianca,
      atualizado_em = now()
    returning 1
  )
  select count(*) into v_count from up;

  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.gerar_inteligencia_cliente_v2(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec integer := 0;
  v_anom integer := 0;
  v_recur integer := 0;
  v_missing integer := 0;
  v_price integer := 0;
begin
  if not exists (
    select 1 from public.inteligencia_config c
    where c.cliente_id = p_cliente_id and c.habilitado
  ) then
    return jsonb_build_object('status','desabilitado');
  end if;

  v_rec := public.detectar_recorrencias_cliente_v2(p_cliente_id);

  update public.inteligencia_insights
     set valido_ate = least(coalesce(valido_ate, now()), now())
   where cliente_id = p_cliente_id
     and tipo in ('anomalia_categoria','recorrencia_mensal','recorrencia_atrasada','aumento_preco_produto')
     and descartado_em is null and resolvido_em is null;

  with atual as (
    select coalesce(nf.categoria,'Outros') as categoria,
           count(*)::int as qtd,
           sum(nf.valor_total) as total
    from public.notas_fiscais nf
    where nf.cliente_id = p_cliente_id
      and nf.data_compra >= current_date - 29
      and nf.data_compra <= current_date
      and nf.valor_total > 0
    group by 1
  ), anterior as (
    select coalesce(nf.categoria,'Outros') as categoria,
           count(*)::int as qtd,
           sum(nf.valor_total) as total
    from public.notas_fiscais nf
    where nf.cliente_id = p_cliente_id
      and nf.data_compra >= current_date - 59
      and nf.data_compra < current_date - 29
      and nf.valor_total > 0
    group by 1
  ), candidatos as (
    select a.categoria, a.qtd as qtd_atual, b.qtd as qtd_anterior,
           round(a.total,2) as total_atual, round(b.total,2) as total_anterior,
           round((a.total-b.total)/nullif(b.total,0)*100,1) as variacao_pct
    from atual a join anterior b using (categoria)
    where a.qtd >= 2 and b.qtd >= 2
      and b.total > 0
      and a.total >= b.total * 1.30
      and (a.total - b.total) >= 50
  ), up as (
    insert into public.inteligencia_insights
      (cliente_id,tipo,chave,prioridade,confianca,titulo,dados,detectado_em,valido_ate)
    select p_cliente_id, 'anomalia_categoria',
           'anomalia_categoria:' || public.inteligencia_norm_text(categoria),
           least(90, 55 + least(35, greatest(0, variacao_pct::int / 3)))::smallint,
           0.90,
           'Seu gasto em ' || categoria || ' aumentou',
           jsonb_build_object('categoria',categoria,'total_atual',total_atual,'total_anterior',total_anterior,'variacao_pct',variacao_pct,'janela_dias',30),
           now(), now() + interval '14 days'
    from candidatos
    on conflict (cliente_id,chave) do update set
      prioridade=excluded.prioridade, confianca=excluded.confianca, titulo=excluded.titulo,
      dados=excluded.dados, detectado_em=now(), valido_ate=excluded.valido_ate
    returning 1
  ) select count(*) into v_anom from up;

  with candidatos as (
    select r.*
    from public.recorrencias_detectadas r
    where r.cliente_id = p_cliente_id
      and r.status in ('candidata','confirmada')
      and r.cadencia = 'mensal'
      and r.confianca >= 0.80
      and coalesce(r.variacao_valor_pct,100) <= 12
  ), up as (
    insert into public.inteligencia_insights
      (cliente_id,tipo,chave,prioridade,confianca,titulo,dados,detectado_em,valido_ate)
    select p_cliente_id, 'recorrencia_mensal', 'recorrencia:' || chave,
           70, confianca,
           'Possível cobrança mensal recorrente',
           jsonb_build_object('recorrencia_id',id,'estabelecimento',estabelecimento,'categoria',categoria,'valor_medio',valor_medio,'ocorrencias',ocorrencias,'proxima_prevista',proxima_prevista,'cadencia',cadencia),
           now(), now() + interval '30 days'
    from candidatos
    on conflict (cliente_id,chave) do update set
      prioridade=excluded.prioridade, confianca=excluded.confianca, titulo=excluded.titulo,
      dados=excluded.dados, detectado_em=now(), valido_ate=excluded.valido_ate
    returning 1
  ) select count(*) into v_recur from up;

  with candidatos as (
    select r.*
    from public.recorrencias_detectadas r
    where r.cliente_id = p_cliente_id
      and r.status = 'confirmada'
      and r.confianca >= 0.75
      and r.proxima_prevista between current_date - 14 and current_date - 2
      and r.ultima_ocorrencia < r.proxima_prevista
  ), up as (
    insert into public.inteligencia_insights
      (cliente_id,tipo,chave,prioridade,confianca,titulo,dados,detectado_em,valido_ate)
    select p_cliente_id, 'recorrencia_atrasada', 'recorrencia_atrasada:' || chave,
           85, confianca,
           'Uma despesa recorrente pode estar pendente',
           jsonb_build_object('recorrencia_id',id,'estabelecimento',estabelecimento,'valor_medio',valor_medio,'prevista_para',proxima_prevista,'dias_atraso',(current_date-proxima_prevista)),
           now(), now() + interval '7 days'
    from candidatos
    on conflict (cliente_id,chave) do update set
      prioridade=excluded.prioridade, confianca=excluded.confianca, titulo=excluded.titulo,
      dados=excluded.dados, detectado_em=now(), valido_ate=excluded.valido_ate
    returning 1
  ) select count(*) into v_missing from up;

  with ranked as (
    select i.ean, i.descricao, i.valor_unitario, nf.estabelecimento, nf.data_compra, nf.criado_em,
           row_number() over (partition by i.ean order by nf.data_compra desc, nf.criado_em desc) as rn
    from public.itens i
    join public.notas_fiscais nf on nf.id=i.nf_id
    where nf.cliente_id=p_cliente_id
      and i.ean is not null and length(regexp_replace(i.ean,'\D','','g')) between 8 and 14
      and i.valor_unitario is not null and i.valor_unitario > 0
      and nf.data_compra >= current_date - 180
  ), agg as (
    select ean,
      (array_agg(descricao order by rn))[1] as descricao,
      (array_agg(estabelecimento order by rn))[1] as estabelecimento,
      max(valor_unitario) filter (where rn=1) as preco_atual,
      avg(valor_unitario) filter (where rn>1) as preco_anterior_medio,
      count(*) filter (where rn>1) as historico
    from ranked
    group by ean
    having count(*) filter (where rn>1) >= 2
  ), candidatos as (
    select *, round((preco_atual-preco_anterior_medio)/nullif(preco_anterior_medio,0)*100,1) as variacao_pct
    from agg
    where preco_anterior_medio > 0
      and preco_atual >= preco_anterior_medio * 1.10
      and preco_atual - preco_anterior_medio >= 1
  ), up as (
    insert into public.inteligencia_insights
      (cliente_id,tipo,chave,prioridade,confianca,titulo,dados,detectado_em,valido_ate)
    select p_cliente_id, 'aumento_preco_produto', 'aumento_preco:' || ean,
           least(90,60+least(30,variacao_pct::int))::smallint, 0.95,
           'Um produto que você compra ficou mais caro',
           jsonb_build_object('ean',ean,'descricao',descricao,'estabelecimento',estabelecimento,'preco_atual',round(preco_atual,2),'preco_anterior_medio',round(preco_anterior_medio,2),'variacao_pct',variacao_pct,'historico',historico),
           now(), now() + interval '14 days'
    from candidatos
    on conflict (cliente_id,chave) do update set
      prioridade=excluded.prioridade, confianca=excluded.confianca, titulo=excluded.titulo,
      dados=excluded.dados, detectado_em=now(), valido_ate=excluded.valido_ate
    returning 1
  ) select count(*) into v_price from up;

  return jsonb_build_object(
    'status','ok','recorrencias_atualizadas',v_rec,'anomalias',v_anom,
    'recorrencias_mensais',v_recur,'recorrencias_atrasadas',v_missing,'aumentos_preco',v_price
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.simular_posso_gastar_v2(p_cliente_id uuid, p_valor numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ini date := date_trunc('month',current_date)::date;
  v_fim date := (date_trunc('month',current_date)+interval '1 month')::date;
  v_renda numeric := 0;
  v_gasto numeric := 0;
  v_previsto numeric := 0;
  v_qtd_rec integer := 0;
  v_saldo numeric := 0;
  v_depois numeric := 0;
  v_status text;
  v_confianca text;
begin
  if p_valor is null or p_valor < 0 then
    return jsonb_build_object('status','valor_invalido');
  end if;

  select coalesce(sum(e.valor),0) into v_renda
  from public.entradas e
  where e.cliente_id=p_cliente_id and e.data_entrada>=v_ini and e.data_entrada<v_fim;

  select coalesce(sum(nf.valor_total),0) into v_gasto
  from public.notas_fiscais nf
  where nf.cliente_id=p_cliente_id and nf.data_compra>=v_ini and nf.data_compra<v_fim;

  select coalesce(sum(r.valor_medio),0), count(*)::int into v_previsto,v_qtd_rec
  from public.recorrencias_detectadas r
  where r.cliente_id=p_cliente_id
    and r.status = 'confirmada' and r.confianca>=0.75
    and r.proxima_prevista>=current_date and r.proxima_prevista<v_fim;

  v_saldo := v_renda-v_gasto-v_previsto;
  v_depois := v_saldo-p_valor;
  v_confianca := case when v_renda<=0 then 'baixa' when v_qtd_rec>=2 then 'media' else 'baixa' end;
  v_status := case
    when v_renda<=0 then 'sem_renda_registrada'
    when v_depois<0 then 'saldo_projetado_negativo'
    when v_saldo>0 and v_depois < v_saldo*0.15 then 'margem_baixa'
    else 'dentro_do_fluxo_registrado'
  end;

  return jsonb_build_object(
    'status',v_status,'valor_simulado',round(p_valor,2),'renda_mes',round(v_renda,2),
    'gasto_ate_agora',round(v_gasto,2),'recorrencias_previstas',round(v_previsto,2),
    'qtd_recorrencias_previstas',v_qtd_rec,'saldo_projetado_antes',round(v_saldo,2),
    'saldo_projetado_depois',round(v_depois,2),'confianca',v_confianca,
    'aviso','Estimativa baseada apenas nos dados registrados no Notinha.'
  );
end;
$function$
;
