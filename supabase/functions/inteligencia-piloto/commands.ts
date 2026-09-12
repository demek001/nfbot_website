import { descreverInsight } from './policy.ts';
import { interpretarLembrete, querLembrete } from './reminders.ts';
type Rpc = (name:string, body:unknown)=>Promise<any>;
export async function comandoPiloto(cliente:any,texto:string,rpc:Rpc,send:(s:string)=>Promise<any>,evento?:{wam_id:string;timestamp:string}):Promise<boolean> {
  const t=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const lembrete=querLembrete(texto);
  if(!lembrete && !/^(inteligencia|assinaturas|recorrencias|meus lembretes|pausar alertas|posso gastar(?:\s.*)?)\??$/.test(t)) return false;
  const c=await rpc('inteligencia_contexto_piloto',{p_cliente_id:cliente.id});
  if(!c?.comandos_habilitados || c.telefone!==cliente.telefone) return false;
  if(lembrete){
    const parsed=interpretarLembrete(texto,new Date(Number(evento?.timestamp)*1000));
    if(!parsed||!evento?.wam_id){await send('Para cadastrar, informe o compromisso, o dia e o horário. Exemplo: me lembre amanhã às 10h de cortar o cabelo. Uso o horário de São Paulo.');return true;}
    const r=await rpc('inteligencia_criar_lembrete_piloto',{p_cliente_id:cliente.id,p_wam_id:evento.wam_id,p_descricao:parsed.descricao,p_quando_local:parsed.quando_local});
    if(!r?.id){await send(r?.status==='horario_invalido'?'Esse horário já passou ou está muito distante. Informe uma data futura, dentro de um ano.':'Não consegui salvar o lembrete. Tente novamente.');return true;}
    const data=new Date(r.devido_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
    await send(`⏰ Lembrete ${r.existente?'já cadastrado':'cadastrado'}: ${r.descricao}\n${data} (horário de São Paulo).\nAviso no horário, pelo WhatsApp se estiver na janela gratuita; caso contrário, por e-mail.\nPara consultar: meus lembretes.`);return true;
  }
  if(t==='pausar alertas') {
    const ok=await rpc('inteligencia_pausar_piloto',{p_cliente_id:cliente.id});
    await send(ok?'Alertas do piloto pausados. Suas notas continuam sendo registradas.':'Não consegui pausar agora. Tente novamente.');return true;
  }
  const refresh=await rpc('gerar_inteligencia_cliente_v2',{p_cliente_id:cliente.id});
  if(!refresh || refresh.status!=='ok') {await send('Não consegui atualizar a análise agora. Tente novamente.');return true;}
  const brl=(n:any)=>Number(n??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  if(t.replace(/\?$/,'')==='inteligencia') {
    const rows=await rpc('listar_inteligencia_cliente_v2',{p_cliente_id:cliente.id,p_limit:5});
    await send(Array.isArray(rows)?(rows.length?`💡 Seus insights\n\n${rows.map(descreverInsight).join('\n\n')}`:'Ainda não encontrei padrões suficientes. Continue enviando suas notas.'):'Não consegui consultar os insights.');
  } else if(/^(assinaturas|recorrencias)\??$/.test(t)) {
    const r=await rpc('resumo_recorrencias_mensais_v2',{p_cliente_id:cliente.id});
    await send(r?`Possíveis recorrências mensais: ${r.qtd}\nTotal estimado: ${brl(r.total_mensal_estimado)}\n${(r.itens??[]).slice(0,10).map((i:any)=>`${i.estabelecimento}: ${brl(i.valor_medio)} (${i.status})`).join('\n')}\nSão padrões detectados, não assinaturas confirmadas.`:'Não consegui consultar as recorrências.');
  } else if(/^meus lembretes/.test(t)) {
    const r=await rpc('listar_lembretes_cliente_v2',{p_cliente_id:cliente.id,p_limit:10});
    await send(Array.isArray(r)?(r.length?r.map((i:any)=>`${i.descricao} — ${new Date(i.devido_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})}`).join('\n')+'\nHorário de São Paulo.':'Você ainda não tem lembretes cadastrados.'):'Não consegui consultar seus lembretes.');
  } else {
    const m=t.match(/^posso gastar\s+(?:r\$\s*)?(\d+(?:\.\d{3})*(?:,\d{1,2})?|\d+\.\d{1,2})\??$/);
    if(!m) {await send('Use: posso gastar 500 ou posso gastar 1.500,50');return true;}
    const raw=m[1]; const valor=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/\.(?=\d{3}(?:\.|$))/g,''));
    if(!Number.isFinite(valor)||valor<0||valor>1e8){await send('Informe um valor válido.');return true;}
    const r=await rpc('simular_posso_gastar_v2',{p_cliente_id:cliente.id,p_valor:valor});
    await send(!r?'Não consegui calcular agora.':r.status==='sem_renda_registrada'?'Ainda não tenho sua renda registrada neste mês para estimar quanto você pode gastar.':`Após gastar ${brl(valor)}, seu saldo projetado seria ${brl(r.saldo_projetado_depois)}.\nInclui ${brl(r.recorrencias_previstas)} em recorrências previstas.\nEstimativa baseada apenas nos dados registrados; confiança ${r.confianca}.`);
  }
  return true;
}

